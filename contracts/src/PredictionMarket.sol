// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PredictionMarket
 * @notice Parimutuel binary prediction market.
 *         Users deposit USDC into YES or NO sides.
 *         On resolution winners split the entire pool
 *         proportionally to their deposits.
 *
 *         Sell fee (1 %) stays in the pool to reward holders.
 */
contract PredictionMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20  public immutable usdc;
    address public immutable resolver;

    string  public question;
    string  public category;
    uint256 public expiry;

    uint256 public yesPool;
    uint256 public noPool;

    mapping(address => uint256) public yesBalance;
    mapping(address => uint256) public noBalance;

    uint8  public outcome;   // 0=open  1=YES  2=NO
    bool   public resolved;

    uint256 public constant SELL_FEE_BPS = 100; // 1 %

    event PositionBought(address indexed user, bool isYes, uint256 usdcIn);
    event PositionSold  (address indexed user, bool isYes, uint256 usdcOut);
    event MarketResolved(uint8 outcome);
    event WinningsClaimed(address indexed user, uint256 usdcOut);

    constructor(
        address _usdc,
        address _resolver,
        string memory _question,
        string memory _category,
        uint256 _expiry
    ) {
        usdc     = IERC20(_usdc);
        resolver = _resolver;
        question = _question;
        category = _category;
        expiry   = _expiry;
    }

    // ── Trading ───────────────────────────────────────────────────────────────

    function buyYes(uint256 usdcAmount) external nonReentrant {
        require(!resolved,       "Market resolved");
        require(usdcAmount > 0,  "Zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        yesBalance[msg.sender] += usdcAmount;
        yesPool                += usdcAmount;
        emit PositionBought(msg.sender, true, usdcAmount);
    }

    function buyNo(uint256 usdcAmount) external nonReentrant {
        require(!resolved,       "Market resolved");
        require(usdcAmount > 0,  "Zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        noBalance[msg.sender]  += usdcAmount;
        noPool                 += usdcAmount;
        emit PositionBought(msg.sender, false, usdcAmount);
    }

    function sellYes(uint256 usdcAmount) external nonReentrant {
        require(!resolved,                         "Market resolved");
        require(yesBalance[msg.sender] >= usdcAmount, "Insufficient YES");
        uint256 fee = (usdcAmount * SELL_FEE_BPS) / 10_000;
        uint256 out = usdcAmount - fee;
        yesBalance[msg.sender] -= usdcAmount;
        yesPool                -= out; // fee stays in pool
        usdc.safeTransfer(msg.sender, out);
        emit PositionSold(msg.sender, true, out);
    }

    function sellNo(uint256 usdcAmount) external nonReentrant {
        require(!resolved,                        "Market resolved");
        require(noBalance[msg.sender] >= usdcAmount, "Insufficient NO");
        uint256 fee = (usdcAmount * SELL_FEE_BPS) / 10_000;
        uint256 out = usdcAmount - fee;
        noBalance[msg.sender]  -= usdcAmount;
        noPool                 -= out;
        usdc.safeTransfer(msg.sender, out);
        emit PositionSold(msg.sender, false, out);
    }

    // ── Resolution & Claim ────────────────────────────────────────────────────

    function resolve(uint8 _outcome) external {
        require(msg.sender == resolver,            "Not resolver");
        require(!resolved,                         "Already resolved");
        require(_outcome == 1 || _outcome == 2,   "Invalid outcome (1=YES 2=NO)");
        outcome  = _outcome;
        resolved = true;
        emit MarketResolved(_outcome);
    }

    function claimWinnings() external nonReentrant {
        require(resolved, "Not resolved");
        uint256 totalPool = yesPool + noPool;
        uint256 payout;

        if (outcome == 1) {
            uint256 stake = yesBalance[msg.sender];
            require(stake > 0, "No YES position");
            require(yesPool > 0, "Empty YES pool");
            payout = (stake * totalPool) / yesPool;
            yesBalance[msg.sender] = 0;
        } else {
            uint256 stake = noBalance[msg.sender];
            require(stake > 0, "No NO position");
            require(noPool > 0, "Empty NO pool");
            payout = (stake * totalPool) / noPool;
            noBalance[msg.sender] = 0;
        }

        usdc.safeTransfer(msg.sender, payout);
        emit WinningsClaimed(msg.sender, payout);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @return bps  YES probability in basis points (10000 = 100 %)
    function yesProb() external view returns (uint256 bps) {
        uint256 total = yesPool + noPool;
        if (total == 0) return 5000;
        return (yesPool * 10_000) / total;
    }

    function totalVolume() external view returns (uint256) {
        return yesPool + noPool;
    }
}
