// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArcLend
 * @notice Aave-inspired lending pool for Arc Testnet.
 *
 * Two assets:
 *  - Collateral : Arc native USDC (18-dec, msg.value)
 *  - Lend/Borrow: ERC-20 USDC   (6-dec, 0x3600…)
 *
 * 1 Arc native USDC (1e18 wei) == 1 ERC-20 USDC (1e6 units) — same dollar value,
 * different interfaces.  No external oracle required.
 *
 * Mechanics (mirrors Aave V2):
 *  - supply()          — deposit ERC-20 USDC, earn variable yield
 *  - withdraw()        — redeem ERC-20 USDC + accrued interest
 *  - depositCollateral — send native USDC, used as collateral only
 *  - withdrawCollateral— reclaim native USDC (if HF stays ≥ 1.0)
 *  - borrow()          — borrow ERC-20 USDC up to 80 % LTV of collateral
 *  - repay()           — repay debt + accrued interest
 *  - liquidate()       — close up to 50 % of an unhealthy position
 */
contract ArcLend is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable USDC; // 6-dec ERC-20 at 0x3600…

    // ─── Ray math (1e27 = 1.0) ────────────────────────────────────────────────
    uint256 private constant RAY = 1e27;

    // ─── Interest-rate model ──────────────────────────────────────────────────
    // At 0 % util  → borrow rate = BASE (2 %)
    // At 80 % util → borrow rate = BASE + SLOPE1 (10 %)
    // At 100 % util → borrow rate = BASE + SLOPE1 + SLOPE2 (110 %)
    uint256 public constant BASE_RATE      = 0.02e27; // 2 %
    uint256 public constant OPTIMAL_UTIL   = 0.80e27; // 80 %
    uint256 public constant SLOPE1         = 0.08e27; // +8 pp up to optimal
    uint256 public constant SLOPE2         = 1.00e27; // +100 pp above optimal
    uint256 public constant RESERVE_FACTOR = 0.10e27; // 10 % of interest → protocol

    // ─── Risk parameters ─────────────────────────────────────────────────────
    uint256 public constant LTV           = 0.80e27; // 80 % max borrow / collateral
    uint256 public constant LIQ_THRESHOLD = 0.85e27; // liquidation when HF < 1
    uint256 public constant LIQ_BONUS     = 0.05e27; // 5 % bonus to liquidator

    uint256 private constant SECONDS_PER_YEAR = 365 days;

    // ─── Global state ─────────────────────────────────────────────────────────
    uint256 public totalScaledSupply;   // sum of (deposit / liquidityIndex)
    uint256 public totalScaledBorrow;   // sum of (borrow  / borrowIndex)
    uint256 public liquidityIndex;      // cumulative supply interest index
    uint256 public borrowIndex;         // cumulative borrow interest index
    uint256 public lastUpdateTimestamp;
    uint256 public reserveBalance;      // protocol-owned ERC-20 USDC (6-dec)

    // ─── Per-user state ───────────────────────────────────────────────────────
    struct Account {
        uint256 scaledSupply;     // user supply / liquidityIndex at deposit time
        uint256 scaledBorrow;     // user borrow  / borrowIndex at borrow time
        uint256 collateralNative; // Arc native USDC held as collateral (18-dec wei)
    }
    mapping(address => Account) public accounts;

    // ─── Events ───────────────────────────────────────────────────────────────
    event Supply(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event CollateralDeposited(address indexed user, uint256 nativeAmount);
    event CollateralWithdrawn(address indexed user, uint256 nativeAmount);
    event Borrow(address indexed user, uint256 amount);
    event Repay(address indexed user, uint256 amount);
    event Liquidated(
        address indexed liquidator,
        address indexed borrower,
        uint256 debtRepaid,
        uint256 collateralSeized
    );
    event ReservesWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    constructor(address _usdc) Ownable(msg.sender) {
        USDC = IERC20(_usdc);
        liquidityIndex = RAY;
        borrowIndex    = RAY;
        lastUpdateTimestamp = block.timestamp;
    }

    // ─── Pure / view helpers ──────────────────────────────────────────────────

    /// @dev Utilisation = totalBorrows / totalSupply  (RAY-scaled)
    function utilizationRate() public view returns (uint256) {
        uint256 totalSup  = (totalScaledSupply * liquidityIndex) / RAY;
        if (totalSup == 0) return 0;
        uint256 borrows = (totalScaledBorrow * borrowIndex) / RAY;
        return (borrows * RAY) / totalSup;
    }

    /// @dev Variable borrow rate given a utilisation ratio (RAY per second would
    ///      be tiny; here we store the annual rate and scale per second on accrual)
    function getBorrowRate(uint256 util) public pure returns (uint256) {
        if (util <= OPTIMAL_UTIL) {
            return BASE_RATE + (util * SLOPE1) / OPTIMAL_UTIL;
        }
        uint256 excess = ((util - OPTIMAL_UTIL) * RAY) / (RAY - OPTIMAL_UTIL);
        return BASE_RATE + SLOPE1 + (excess * SLOPE2) / RAY;
    }

    /// @dev Effective supply rate = borrowRate × util × (1 − reserveFactor)
    function getSupplyRate(uint256 util, uint256 bRate) public pure returns (uint256) {
        return (((bRate * util) / RAY) * (RAY - RESERVE_FACTOR)) / RAY;
    }

    /// @dev Projected liquidity index at current block (without writing state)
    function currentLiquidityIndex() public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdateTimestamp;
        if (elapsed == 0) return liquidityIndex;
        uint256 util  = utilizationRate();
        uint256 sRate = getSupplyRate(util, getBorrowRate(util));
        return (liquidityIndex * (RAY + (sRate * elapsed) / SECONDS_PER_YEAR)) / RAY;
    }

    /// @dev Projected borrow index at current block (without writing state)
    function currentBorrowIndex() public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdateTimestamp;
        if (elapsed == 0) return borrowIndex;
        uint256 bRate = getBorrowRate(utilizationRate());
        return (borrowIndex * (RAY + (bRate * elapsed) / SECONDS_PER_YEAR)) / RAY;
    }

    /// @notice ERC-20 USDC supply balance of `user` including accrued interest
    function supplyBalance(address user) public view returns (uint256) {
        return (accounts[user].scaledSupply * currentLiquidityIndex()) / RAY;
    }

    /// @notice ERC-20 USDC borrow balance of `user` including accrued interest
    function borrowBalance(address user) public view returns (uint256) {
        return (accounts[user].scaledBorrow * currentBorrowIndex()) / RAY;
    }

    /// @notice Collateral value in ERC-20 USDC 6-dec units
    ///         (1e18 native wei → 1e6 usdc; divide by 1e12)
    function collateralValue(address user) public view returns (uint256) {
        return accounts[user].collateralNative / 1e12;
    }

    /**
     * @notice Health factor (RAY = 1.0).
     *         HF = collateralValue × LIQ_THRESHOLD / borrowBalance
     *         < RAY → position is liquidatable
     */
    function healthFactor(address user) public view returns (uint256) {
        uint256 debt = borrowBalance(user);
        if (debt == 0) return type(uint256).max;
        return (collateralValue(user) * LIQ_THRESHOLD) / debt;
    }

    // ─── Interest accrual (internal) ─────────────────────────────────────────

    function _accrueInterest() internal {
        uint256 elapsed = block.timestamp - lastUpdateTimestamp;
        if (elapsed == 0) return;

        uint256 util  = utilizationRate();
        uint256 bRate = getBorrowRate(util);
        uint256 sRate = getSupplyRate(util, bRate);

        uint256 newBorrowIndex    = (borrowIndex    * (RAY + (bRate * elapsed) / SECONDS_PER_YEAR)) / RAY;
        uint256 newLiquidityIndex = (liquidityIndex * (RAY + (sRate * elapsed) / SECONDS_PER_YEAR)) / RAY;

        // Reserve: diff in borrow index × total borrows × reserveFactor
        uint256 totalBorrowNow = (totalScaledBorrow * borrowIndex) / RAY;
        uint256 interestGen    = (totalBorrowNow * (newBorrowIndex - borrowIndex)) / borrowIndex;
        reserveBalance += (interestGen * RESERVE_FACTOR) / RAY;

        borrowIndex    = newBorrowIndex;
        liquidityIndex = newLiquidityIndex;
        lastUpdateTimestamp = block.timestamp;
    }

    // ─── Core operations ─────────────────────────────────────────────────────

    /**
     * @notice Supply ERC-20 USDC to earn variable yield.
     * @param amount  Amount in 6-dec ERC-20 USDC units.
     */
    function supply(uint256 amount) external nonReentrant {
        require(amount > 0, "ArcLend: zero amount");
        _accrueInterest();
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        uint256 scaled = (amount * RAY) / liquidityIndex;
        accounts[msg.sender].scaledSupply += scaled;
        totalScaledSupply += scaled;
        emit Supply(msg.sender, amount);
    }

    /**
     * @notice Withdraw previously supplied ERC-20 USDC + accrued interest.
     * @param amount  Amount in 6-dec units.  Pass type(uint256).max to withdraw all.
     */
    function withdraw(uint256 amount) external nonReentrant {
        _accrueInterest();
        uint256 balance = (accounts[msg.sender].scaledSupply * liquidityIndex) / RAY;
        if (amount > balance) amount = balance;
        require(amount > 0, "ArcLend: nothing to withdraw");

        uint256 scaled = (amount * RAY) / liquidityIndex;
        if (scaled > accounts[msg.sender].scaledSupply) scaled = accounts[msg.sender].scaledSupply;
        accounts[msg.sender].scaledSupply -= scaled;
        totalScaledSupply -= scaled;

        uint256 available = USDC.balanceOf(address(this)) - reserveBalance;
        require(amount <= available, "ArcLend: insufficient liquidity");

        USDC.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    /**
     * @notice Deposit Arc native USDC as collateral (payable).
     */
    function depositCollateral() external payable nonReentrant {
        require(msg.value > 0, "ArcLend: zero collateral");
        accounts[msg.sender].collateralNative += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw Arc native USDC collateral.
     * @param nativeAmount  Amount in 18-dec wei.
     */
    function withdrawCollateral(uint256 nativeAmount) external nonReentrant {
        require(nativeAmount > 0, "ArcLend: zero amount");
        require(accounts[msg.sender].collateralNative >= nativeAmount, "ArcLend: insufficient collateral");

        uint256 debt = borrowBalance(msg.sender);
        if (debt > 0) {
            uint256 newColNative = accounts[msg.sender].collateralNative - nativeAmount;
            uint256 newColVal    = newColNative / 1e12;
            // HF after withdrawal must stay ≥ 1.0
            require(newColVal * LIQ_THRESHOLD >= debt * RAY, "ArcLend: HF would drop below 1");
        }

        accounts[msg.sender].collateralNative -= nativeAmount;
        (bool ok,) = msg.sender.call{value: nativeAmount}("");
        require(ok, "ArcLend: transfer failed");
        emit CollateralWithdrawn(msg.sender, nativeAmount);
    }

    /**
     * @notice Borrow ERC-20 USDC against posted native collateral.
     * @param amount  6-dec USDC units.
     */
    function borrow(uint256 amount) external nonReentrant {
        require(amount > 0, "ArcLend: zero amount");
        _accrueInterest();

        uint256 colVal     = collateralValue(msg.sender);
        uint256 maxBorrow  = (colVal * LTV) / RAY;
        uint256 currentDebt = borrowBalance(msg.sender);
        require(currentDebt + amount <= maxBorrow, "ArcLend: exceeds LTV");

        uint256 available = USDC.balanceOf(address(this)) - reserveBalance;
        require(amount <= available, "ArcLend: insufficient liquidity");

        uint256 scaled = (amount * RAY) / borrowIndex;
        accounts[msg.sender].scaledBorrow += scaled;
        totalScaledBorrow += scaled;

        USDC.safeTransfer(msg.sender, amount);
        emit Borrow(msg.sender, amount);
    }

    /**
     * @notice Repay ERC-20 USDC debt.
     * @param amount  6-dec units.  Pass type(uint256).max to repay full debt.
     */
    function repay(uint256 amount) external nonReentrant {
        _accrueInterest();
        uint256 debt = borrowBalance(msg.sender);
        require(debt > 0, "ArcLend: no debt to repay");
        if (amount > debt) amount = debt;
        require(amount > 0, "ArcLend: zero amount");

        USDC.safeTransferFrom(msg.sender, address(this), amount);

        uint256 scaled = (amount * RAY) / borrowIndex;
        if (scaled > accounts[msg.sender].scaledBorrow) scaled = accounts[msg.sender].scaledBorrow;
        accounts[msg.sender].scaledBorrow -= scaled;
        totalScaledBorrow -= scaled;

        emit Repay(msg.sender, amount);
    }

    /**
     * @notice Liquidate up to 50 % of an unhealthy borrower's debt.
     *         Caller repays debt, receives collateral + 5 % bonus.
     */
    function liquidate(address borrower) external nonReentrant {
        _accrueInterest();
        uint256 debt = borrowBalance(borrower);
        require(debt > 0, "ArcLend: no debt");

        uint256 colVal = collateralValue(borrower);
        require(colVal * LIQ_THRESHOLD < debt * RAY, "ArcLend: position is healthy");

        uint256 repayAmount = debt / 2; // close up to 50 %

        USDC.safeTransferFrom(msg.sender, address(this), repayAmount);

        uint256 scaled = (repayAmount * RAY) / borrowIndex;
        if (scaled > accounts[borrower].scaledBorrow) scaled = accounts[borrower].scaledBorrow;
        accounts[borrower].scaledBorrow -= scaled;
        totalScaledBorrow -= scaled;

        // Seize collateral proportional to debt repaid + liquidation bonus
        uint256 seizeNative = (repayAmount * 1e12 * (RAY + LIQ_BONUS)) / RAY;
        if (seizeNative > accounts[borrower].collateralNative) {
            seizeNative = accounts[borrower].collateralNative;
        }
        accounts[borrower].collateralNative -= seizeNative;

        (bool ok,) = msg.sender.call{value: seizeNative}("");
        require(ok, "ArcLend: collateral send failed");

        emit Liquidated(msg.sender, borrower, repayAmount, seizeNative);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Withdraw protocol reserves (owner only)
    function withdrawReserves(address to, uint256 amount) external onlyOwner {
        require(amount <= reserveBalance, "ArcLend: exceeds reserves");
        reserveBalance -= amount;
        USDC.safeTransfer(to, amount);
        emit ReservesWithdrawn(to, amount);
    }

    // ─── Aggregate view for UI ────────────────────────────────────────────────

    function getProtocolStats() external view returns (
        uint256 _totalSupply,
        uint256 _totalBorrows,
        uint256 _utilization,   // RAY-scaled
        uint256 _supplyAPY,     // RAY-scaled annual rate
        uint256 _borrowAPY,     // RAY-scaled annual rate
        uint256 _liquidityIndex,
        uint256 _borrowIndex,
        uint256 _reserveBalance
    ) {
        uint256 lIdx = currentLiquidityIndex();
        uint256 bIdx = currentBorrowIndex();
        _totalSupply  = (totalScaledSupply * lIdx) / RAY;
        _totalBorrows = (totalScaledBorrow  * bIdx) / RAY;
        uint256 util  = _totalSupply == 0 ? 0 : (_totalBorrows * RAY) / _totalSupply;
        uint256 bRate = getBorrowRate(util);
        _utilization     = util;
        _borrowAPY       = bRate;
        _supplyAPY       = getSupplyRate(util, bRate);
        _liquidityIndex  = lIdx;
        _borrowIndex     = bIdx;
        _reserveBalance  = reserveBalance;
    }

    function getUserStats(address user) external view returns (
        uint256 _supplyBalance,    // 6-dec ERC-20 USDC
        uint256 _borrowBalance,    // 6-dec ERC-20 USDC
        uint256 _collateralNative, // 18-dec wei
        uint256 _collateralValue,  // 6-dec ERC-20 USDC
        uint256 _healthFactor,     // RAY = 1.0; max = type(uint256).max when no debt
        uint256 _availableToBorrow // 6-dec ERC-20 USDC
    ) {
        _supplyBalance    = supplyBalance(user);
        _borrowBalance    = borrowBalance(user);
        _collateralNative = accounts[user].collateralNative;
        _collateralValue  = collateralValue(user);
        _healthFactor     = healthFactor(user);
        uint256 maxBorrow = (_collateralValue * LTV) / RAY;
        _availableToBorrow = maxBorrow > _borrowBalance ? maxBorrow - _borrowBalance : 0;
    }

    receive() external payable {}
}
