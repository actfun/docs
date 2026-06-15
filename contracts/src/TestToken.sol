// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestToken
 * @notice Mintable ERC-20 for Arc Testnet lending markets (EURC, cirBTC, etc.)
 *         Includes a public faucet so anyone can get test tokens.
 */
contract TestToken is ERC20, Ownable {
    uint8 private immutable _dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {
        _dec = decimals_;
        _mint(msg.sender, 10_000_000 * 10 ** uint256(decimals_));
    }

    function decimals() public view override returns (uint8) { return _dec; }

    /// @notice Testnet faucet: anyone can claim 1 000 tokens once per call.
    function faucet() external {
        _mint(msg.sender, 1_000 * 10 ** uint256(_dec));
    }

    /// @notice Owner can mint arbitrary amounts (for seeding liquidity, tests, etc.)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
