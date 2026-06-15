// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PredictionMarket.sol";

/**
 * @title PredictionFactory
 * @notice Deploys and tracks PredictionMarket instances.
 *         The factory owner is the resolver for all markets.
 */
contract PredictionFactory {
    address public immutable usdc;
    address public owner;

    address[] private _markets;

    event MarketCreated(
        address indexed market,
        string  question,
        string  category,
        uint256 expiry
    );
    event OwnershipTransferred(address indexed previous, address indexed next);

    constructor(address _usdc) {
        usdc  = _usdc;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── Market management ─────────────────────────────────────────────────────

    function createMarket(
        string calldata question,
        string calldata category,
        uint256         expiry
    ) external onlyOwner returns (address) {
        require(expiry > block.timestamp, "Expiry must be in the future");
        PredictionMarket market = new PredictionMarket(
            usdc,
            owner,
            question,
            category,
            expiry
        );
        address addr = address(market);
        _markets.push(addr);
        emit MarketCreated(addr, question, category, expiry);
        return addr;
    }

    function resolveMarket(address market, uint8 outcome) external onlyOwner {
        PredictionMarket(market).resolve(outcome);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getMarkets() external view returns (address[] memory) {
        return _markets;
    }

    function getMarketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 index) external view returns (address) {
        return _markets[index];
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
