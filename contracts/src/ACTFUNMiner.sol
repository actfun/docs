// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ACTFUN.sol";

contract ACTFUNMiner {
    ACTFUN public immutable token;

    uint256 public constant MINE_AMOUNT = 1_000 * 10 ** 18;        // exactly 1,000 $ACTFUN per mine
    uint256 public constant COOLDOWN_SECONDS = 3 * 60;             // 3 minutes
    uint256 public constant DAILY_MAX = 10_000 * 10 ** 18;        // 10,000 per 24h
    uint256 public constant DAILY_WINDOW = 24 * 60 * 60;           // 24 hours

    mapping(address => uint256) public lastMineTime;
    mapping(address => uint256) public dailyMined;
    mapping(address => uint256) public dailyWindowStart;

    event ActedFun(address indexed user, string funnyPost, uint256 amount, uint256 timestamp);

    constructor(address _tokenAddress) {
        token = ACTFUN(_tokenAddress);
    }

    function actFun(string calldata funnyPost) external {
        address user = msg.sender;

        // 1. Cooldown check (3 minutes)
        if (block.timestamp < lastMineTime[user] + COOLDOWN_SECONDS) {
            revert("ACTFUNMiner: 3-minute cooldown not over");
        }

        // 2. 24-hour rolling window reset + daily cap check
        if (block.timestamp >= dailyWindowStart[user] + DAILY_WINDOW) {
            dailyWindowStart[user] = block.timestamp;
            dailyMined[user] = 0;
        }

        if (dailyMined[user] + MINE_AMOUNT > DAILY_MAX) {
            revert("ACTFUNMiner: Daily 10k limit reached for this wallet");
        }

        // 3. Mint
        token.mint(user, MINE_AMOUNT);

        // 4. Update limits
        lastMineTime[user] = block.timestamp;
        dailyMined[user] += MINE_AMOUNT;

        // 5. Emit event
        emit ActedFun(user, funnyPost, MINE_AMOUNT, block.timestamp);
    }

    function getTimeUntilNextMine(address user) external view returns (uint256) {
        uint256 nextPossible = lastMineTime[user] + COOLDOWN_SECONDS;
        return block.timestamp >= nextPossible ? 0 : nextPossible - block.timestamp;
    }

    function getRemainingDailyAllowance(address user) external view returns (uint256) {
        if (block.timestamp >= dailyWindowStart[user] + DAILY_WINDOW) {
            return DAILY_MAX;
        }
        return DAILY_MAX - dailyMined[user];
    }
}
