// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LaunchToken.sol";

/// @dev WUSDC — wrapped native USDC (acts as WETH in UNITFLOW V3)
interface IWUSDC {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @dev Minimal ERC-20 for token approvals
interface IERC20Min {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @dev Uniswap V2 Factory (minimal)
interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/// @dev Uniswap V2 Pair (minimal)
interface IUniswapV2Pair {
    function mint(address to) external returns (uint liquidity);
    function initialize(address token0, address token1) external;
}

/// @dev StableSwap Pool (minimal)
interface IStableSwapPool {
    function addLiquidity(uint256 amount0, uint256 amount1, address to) external returns (uint256 liquidity);
}

/// @dev StableSwap Factory (minimal)
interface IStableSwapFactory {
    function createPool(address tokenA, address tokenB) external returns (address pool);
}

/// @dev Synthra V3 NonfungiblePositionManager (subset we use) — Uniswap V3 fork
interface ISynthraPositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    function mint(MintParams calldata params)
        external
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24  fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);
}

/// @dev UNITFLOW V3 NonfungiblePositionManager (subset we use)
interface IUnitFlowV3PositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    function mint(MintParams calldata params)
        external
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24  fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);
}

/// @title TokenLauncher — Mining + UNITFLOW V3 AMM for each ACTFUN Launchpad token
/// @notice Phase 1: community mines tokens by writing funny posts (paying a small USDC fee).
///         Phase 2: once mineableSupply is exhausted, contract auto-graduates and seeds a
///         UNITFLOW V3 full-range liquidity pool (TOKEN/WUSDC, fee=3000). The LP NFT is
///         held by this contract forever (no one can remove liquidity).
contract TokenLauncher {

    // ─── UNITFLOW V3 constants ────────────────────────────────────────────────
    address public constant WUSDC_ADDRESS    = 0x911b4000D3422F482F4062a913885f7b035382Df;
    address public constant POSITION_MANAGER = 0x77c39eB310BE31e60068CE29855F83359bf85fc4;
    uint24  public constant POOL_FEE         = 3000;
    int24   public constant TICK_LOWER       = -887220;
    int24   public constant TICK_UPPER       =  887220;

    // ─── Uniswap V2 constants ─────────────────────────────────────────────────
    address public constant UNISWAP_V2_FACTORY = 0xB56B00C38EF85633A789644415A16b4C8ea12EF8;
    address public constant UNISWAP_V2_ROUTER = 0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18;

    // ─── StableSwap (Curve-like) constants ─────────────────────────────────────
    address public constant STABLESWAP_FACTORY = 0x3714f242fe169AB5EB0D763Cf79AEAcA5F727E7b;

    // ─── Synthra V3 constants ───────────────────────────────────────────────────
    address public constant SYNTHRA_POSITION_MANAGER = 0xbe59000F37677D96115F397c91834dcB72dFc279;
    uint24  public constant SYNTHRA_FEE           = 3000;
    int24   public constant SYNTHRA_TICK_LOWER     = -887220;
    int24   public constant SYNTHRA_TICK_UPPER     =  887220;

    // ─── AMM selection flags (creator picks which AMMs to seed at graduation) ───
    uint8 public constant AMM_UNITFLOW_V3 = 1; // bit 0
    uint8 public constant AMM_UNISWAP_V2  = 2; // bit 1
    uint8 public constant AMM_STABLESWAP  = 4; // bit 2
    uint8 public constant AMM_SYNTHRA     = 8; // bit 3

    // ─── Token reference ─────────────────────────────────────────────────────
    LaunchToken public immutable token;

    // ─── Creation metadata ───────────────────────────────────────────────────
    address public immutable creator;
    uint256 public immutable createdAt;

    // ─── Mining params ───────────────────────────────────────────────────────
    uint256 public immutable mineAmount;
    uint256 public immutable cooldownSeconds;
    uint256 public immutable dailyMax;
    uint256 public immutable feePerMine;
    uint256 public immutable mineableSupply;
    uint256 public immutable lpReserve;

    // ─── Refund window ───────────────────────────────────────────────────────
    uint256 public immutable refundWindowSeconds;

    // ─── AMM selection (bitmask of AMM_* flags, set by creator at launch) ──────
    uint8 public immutable ammFlags;

    // ─── Mining state ────────────────────────────────────────────────────────
    uint256 public totalMined;
    mapping(address => uint256) public lastMineTime;
    mapping(address => uint256) public dailyMined;
    mapping(address => uint256) public dailyWindowStart;
    uint256 public totalMiners;
    mapping(address => bool)    public hasMined;

    // ─── Refund tracking ─────────────────────────────────────────────────────
    mapping(address => uint256) public feePaid;
    /// @dev Tracks exactly how many tokens each address has mined (used by claimRefund
    ///      to burn the miner's position before returning their fee — prevents free-token exploit).
    mapping(address => uint256) public tokensMined;

    // ─── Graduation state ────────────────────────────────────────────────────
    bool    public graduated;
    address public poolAddress;     // UNITFLOW V3 pool address
    address public v2PairAddress;     // Uniswap V2 pair address
    address public stablePoolAddress; // StableSwap pool address
    address public synthraPoolAddress; // Synthra V3 pool address

    // ─── Events ──────────────────────────────────────────────────────────────
    event ActedFun(
        address indexed user,
        string  funnyPost,
        uint256 amount,
        uint256 timestamp
    );
    event TokenGraduated(
        address indexed token,
        uint256 tokenSeeded,
        uint256 arcSeeded,
        uint256 timestamp
    );
    event ArcRefundClaimed(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    // ─────────────────────────────────────────────────────────────────────────
    constructor(
        address _token,
        address _creator,
        uint256 _mineAmount,
        uint256 _cooldownSeconds,
        uint256 _dailyMax,
        uint256 _feePerMine,
        uint256 _refundWindowSeconds,
        uint8   _ammFlags
    ) {
        require(_ammFlags != 0 && _ammFlags <= 15, "TokenLauncher: invalid ammFlags");
        token               = LaunchToken(_token);
        creator             = _creator;
        createdAt           = block.timestamp;
        mineAmount          = _mineAmount;
        cooldownSeconds     = _cooldownSeconds;
        dailyMax            = _dailyMax;
        feePerMine          = _feePerMine;
        refundWindowSeconds = _refundWindowSeconds;
        ammFlags            = _ammFlags;

        uint256 maxSupply  = LaunchToken(_token).maxSupply();
        uint256 raw95      = (maxSupply * 95) / 100;
        mineableSupply     = (raw95 / _mineAmount) * _mineAmount;
        lpReserve          = maxSupply - mineableSupply;
    }

    // ────────────────────────────────────────────────────────────────────────
    //  PHASE 1 — MINING
    // ────────────────────────────────────────────────────────────────────────

    /// @notice Mine tokens by writing something funny. Requires USDC fee.
    function mine(string calldata funnyPost) external payable {
        require(!graduated, "Token has graduated - swap on UNITFLOW V3!");
        require(msg.value >= feePerMine, "TokenLauncher: USDC fee required");
        require(
            totalMined + mineAmount <= mineableSupply,
            "TokenLauncher: mining complete"
        );

        address user = msg.sender;
        require(
            block.timestamp >= lastMineTime[user] + cooldownSeconds,
            "TokenLauncher: cooldown not over"
        );

        if (block.timestamp >= dailyWindowStart[user] + 24 hours) {
            dailyWindowStart[user] = block.timestamp;
            dailyMined[user]       = 0;
        }
        require(
            dailyMined[user] + mineAmount <= dailyMax,
            "TokenLauncher: daily limit reached"
        );

        lastMineTime[user]  = block.timestamp;
        dailyMined[user]   += mineAmount;
        totalMined         += mineAmount;
        feePaid[user]      += msg.value;
        tokensMined[user]  += mineAmount;

        if (!hasMined[user]) {
            hasMined[user] = true;
            totalMiners++;
        }

        token.mint(user, mineAmount);
        emit ActedFun(user, funnyPost, mineAmount, block.timestamp);

        if (totalMined >= mineableSupply) {
            _graduate();
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    //  REFUND — Only within the creator-set refund window, before graduation
    // ────────────────────────────────────────────────────────────────────────

    function refundDeadline() external view returns (uint256) {
        return createdAt + refundWindowSeconds;
    }

    function refundWindowOpen() public view returns (bool) {
        return !graduated && block.timestamp <= createdAt + refundWindowSeconds;
    }

    function claimRefund() external {
        require(!graduated, "TokenLauncher: token has graduated, no refunds");
        require(
            block.timestamp > createdAt + refundWindowSeconds,
            "TokenLauncher: mining window still open"
        );
        uint256 amount = feePaid[msg.sender];
        require(amount > 0, "TokenLauncher: nothing to refund");

        uint256 tokens = tokensMined[msg.sender];

        // ── Effects (CEI) ────────────────────────────────────────────────────
        // Zero out both tracking slots before any external interaction so
        // re-entrancy on the ARC transfer cannot double-claim.
        feePaid[msg.sender]    = 0;
        tokensMined[msg.sender] = 0;
        // Restore the mining supply allocation so the slots can be re-mined
        // by honest participants after the refund window closes.
        totalMined -= tokens;

        // ── Interactions ─────────────────────────────────────────────────────
        // Burn the miner's tokens before returning their fee. If the caller no
        // longer holds the tokens (e.g. transferred them away), this reverts —
        // they cannot collect a refund on tokens they have already moved out.
        token.burn(msg.sender, tokens);

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "TokenLauncher: refund transfer failed");

        emit ArcRefundClaimed(msg.sender, amount, block.timestamp);
    }

    function claimableRefund(address user) external view returns (uint256) {
        if (graduated) return 0;
        if (block.timestamp <= createdAt + refundWindowSeconds) return 0; // window still open — wait for it to expire
        return feePaid[user];
    }

    // ────────────────────────────────────────────────────────────────────────
    //  GRADUATION — seed UNITFLOW V3 full-range pool
    // ────────────────────────────────────────────────────────────────────────

    function _graduate() internal {
        graduated = true;

        uint256 arcBalance = address(this).balance;

        // Mint LP reserve tokens to this contract
        token.mint(address(this), lpReserve);

        // Wrap all accumulated USDC → WUSDC
        IWUSDC(WUSDC_ADDRESS).deposit{value: arcBalance}();

        address tokenAddr = address(token);

        // Distribute the LP reserve + accumulated fees evenly across ONLY the
        // AMMs the creator selected at launch (`ammFlags`). The contract holds
        // exactly `lpReserve` tokens and `arcBalance` WUSDC in total. Each
        // selected AMM gets an even share computed as `left / remaining`, so the
        // LAST seeded AMM naturally absorbs any rounding remainder — no dust is
        // ever left behind and the full balance is always consumed.
        uint8   remaining = _ammCount();
        uint256 tokenLeft = lpReserve;
        uint256 arcLeft   = arcBalance;

        if (ammFlags & AMM_UNITFLOW_V3 != 0) {
            uint256 t = tokenLeft / remaining;
            uint256 a = arcLeft / remaining;
            tokenLeft -= t; arcLeft -= a; remaining--;
            _seedUnitFlowV3(tokenAddr, t, a);
        }
        if (ammFlags & AMM_UNISWAP_V2 != 0) {
            uint256 t = tokenLeft / remaining;
            uint256 a = arcLeft / remaining;
            tokenLeft -= t; arcLeft -= a; remaining--;
            _seedUniswapV2(tokenAddr, t, a);
        }
        if (ammFlags & AMM_STABLESWAP != 0) {
            uint256 t = tokenLeft / remaining;
            uint256 a = arcLeft / remaining;
            tokenLeft -= t; arcLeft -= a; remaining--;
            _seedStableSwap(tokenAddr, t, a);
        }
        if (ammFlags & AMM_SYNTHRA != 0) {
            uint256 t = tokenLeft / remaining;
            uint256 a = arcLeft / remaining;
            tokenLeft -= t; arcLeft -= a; remaining--;
            _seedSynthra(tokenAddr, t, a);
        }

        emit TokenGraduated(tokenAddr, lpReserve, arcBalance, block.timestamp);
    }

    /// @dev Number of AMMs selected in `ammFlags` (1..4).
    function _ammCount() internal view returns (uint8 c) {
        if (ammFlags & AMM_UNITFLOW_V3 != 0) c++;
        if (ammFlags & AMM_UNISWAP_V2  != 0) c++;
        if (ammFlags & AMM_STABLESWAP  != 0) c++;
        if (ammFlags & AMM_SYNTHRA     != 0) c++;
    }

    /// @dev Seeds a Uniswap V2 pool with `tokenAmt` token + `arcAmt` WUSDC.
    function _seedUniswapV2(address tokenAddr, uint256 tokenAmt, uint256 arcAmt) internal {
        address v2Pair = IUniswapV2Factory(UNISWAP_V2_FACTORY).createPair(tokenAddr, WUSDC_ADDRESS);
        v2PairAddress = v2Pair;
        IERC20Min(tokenAddr).transfer(v2Pair, tokenAmt);
        IWUSDC(WUSDC_ADDRESS).transfer(v2Pair, arcAmt);
        IUniswapV2Pair(v2Pair).mint(address(this));
    }

    /// @dev Seeds a per-token StableSwap (Curve-like) pool with `tokenAmt` + `arcAmt`.
    ///      The pool sorts token0/token1 by address and pulls amount0 of token0,
    ///      amount1 of token1 — so amounts MUST be passed in sorted order, not
    ///      (token, WUSDC) order. Otherwise, when tokenAddr > WUSDC, the pool tries
    ///      to pull `tokenAmt` of WUSDC (which this contract does not hold) and the
    ///      whole graduation reverts.
    function _seedStableSwap(address tokenAddr, uint256 tokenAmt, uint256 arcAmt) internal {
        address stablePool = IStableSwapFactory(STABLESWAP_FACTORY).createPool(tokenAddr, WUSDC_ADDRESS);
        stablePoolAddress = stablePool;
        IERC20Min(tokenAddr).approve(stablePool, tokenAmt);
        IWUSDC(WUSDC_ADDRESS).approve(stablePool, arcAmt);
        (uint256 sAmt0, uint256 sAmt1) = tokenAddr < WUSDC_ADDRESS
            ? (tokenAmt, arcAmt)
            : (arcAmt, tokenAmt);
        IStableSwapPool(stablePool).addLiquidity(sAmt0, sAmt1, address(this));
    }

    /// @dev Seeds a UNITFLOW V3 full-range pool with `tokenAmt` token + `arcAmt` WUSDC.
    ///      The LP NFT stays in this contract forever (no one can pull liquidity).
    function _seedUnitFlowV3(address tokenAddr, uint256 tokenAmt, uint256 arcAmt) internal {
        bool tokenIsToken0 = tokenAddr < WUSDC_ADDRESS;

        (address t0, address t1) = tokenIsToken0
            ? (tokenAddr,     WUSDC_ADDRESS)
            : (WUSDC_ADDRESS, tokenAddr);

        (uint256 a0, uint256 a1) = tokenIsToken0
            ? (tokenAmt, arcAmt)
            : (arcAmt,   tokenAmt);

        // Approve PositionManager for this pool's portion only
        IERC20Min(tokenAddr).approve(POSITION_MANAGER, tokenAmt);
        IWUSDC(WUSDC_ADDRESS).approve(POSITION_MANAGER, arcAmt);

        // Compute initial sqrtPriceX96 from seed ratio
        uint160 sqrtPx96 = _toSqrtPriceX96(a0, a1);

        // Create + initialize pool if it doesn't exist yet
        address pool = IUnitFlowV3PositionManager(POSITION_MANAGER)
            .createAndInitializePoolIfNecessary(t0, t1, POOL_FEE, sqrtPx96);
        poolAddress = pool;

        // Mint full-range liquidity — LP NFT stays in this contract forever
        IUnitFlowV3PositionManager(POSITION_MANAGER).mint(
            IUnitFlowV3PositionManager.MintParams({
                token0:         t0,
                token1:         t1,
                fee:            POOL_FEE,
                tickLower:      TICK_LOWER,
                tickUpper:      TICK_UPPER,
                amount0Desired: a0,
                amount1Desired: a1,
                amount0Min:     0,
                amount1Min:     0,
                recipient:      address(this),   // lock LP NFT here forever
                deadline:       block.timestamp + 300
            })
        );
    }

    /// @dev Seeds a Synthra V3 full-range pool with `tokenAmt` token + `arcAmt` WUSDC.
    ///      Same pattern as UNITFLOW V3 but uses the Synthra PositionManager.
    function _seedSynthra(address tokenAddr, uint256 tokenAmt, uint256 arcAmt) internal {
        bool tokenIsToken0 = tokenAddr < WUSDC_ADDRESS;

        (address t0, address t1) = tokenIsToken0
            ? (tokenAddr,     WUSDC_ADDRESS)
            : (WUSDC_ADDRESS, tokenAddr);

        (uint256 a0, uint256 a1) = tokenIsToken0
            ? (tokenAmt, arcAmt)
            : (arcAmt,   tokenAmt);

        IERC20Min(tokenAddr).approve(SYNTHRA_POSITION_MANAGER, tokenAmt);
        IWUSDC(WUSDC_ADDRESS).approve(SYNTHRA_POSITION_MANAGER, arcAmt);

        uint160 sqrtPx96 = _toSqrtPriceX96(a0, a1);

        address pool = ISynthraPositionManager(SYNTHRA_POSITION_MANAGER)
            .createAndInitializePoolIfNecessary(t0, t1, SYNTHRA_FEE, sqrtPx96);
        synthraPoolAddress = pool;

        ISynthraPositionManager(SYNTHRA_POSITION_MANAGER).mint(
            ISynthraPositionManager.MintParams({
                token0:         t0,
                token1:         t1,
                fee:            SYNTHRA_FEE,
                tickLower:      SYNTHRA_TICK_LOWER,
                tickUpper:      SYNTHRA_TICK_UPPER,
                amount0Desired: a0,
                amount1Desired: a1,
                amount0Min:     0,
                amount1Min:     0,
                recipient:      address(this),
                deadline:       block.timestamp + 300
            })
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    //  VIEWS
    // ────────────────────────────────────────────────────────────────────────

    function getTimeUntilNextMine(address user) external view returns (uint256) {
        uint256 next = lastMineTime[user] + cooldownSeconds;
        return block.timestamp >= next ? 0 : next - block.timestamp;
    }

    function getRemainingDailyAllowance(address user) external view returns (uint256) {
        if (block.timestamp >= dailyWindowStart[user] + 24 hours) return dailyMax;
        return dailyMax - dailyMined[user];
    }

    function getMiningProgress() external view returns (uint256 mined, uint256 total) {
        return (totalMined, mineableSupply);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  INTERNAL — sqrtPriceX96 helper
    // ────────────────────────────────────────────────────────────────────────

    /// @dev Computes sqrt(a1/a0) * 2^96 for initializing a V3 pool.
    ///      Uses: sqrtPriceX96 = sqrt(a1 * 2^96 / a0) * 2^48
    ///      Safe when a1 < 2^160 (i.e. token amounts < ~1.46e48 wei — well within range).
    function _toSqrtPriceX96(uint256 a0, uint256 a1) internal pure returns (uint160) {
        if (a0 == 0 || a1 == 0) return uint160(1 << 96); // 1:1 fallback
        // priceQ96 = a1 * 2^96 / a0  (fits uint256 for token amounts up to ~1e30)
        uint256 priceQ96 = (a1 << 96) / a0;
        // sqrtPriceX96 = sqrt(priceQ96) * 2^48
        return uint160(_sqrt(priceQ96) << 48);
    }

    /// @dev Babylonian integer square root.
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x >> 1) + 1;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) >> 1;
        }
    }
}
