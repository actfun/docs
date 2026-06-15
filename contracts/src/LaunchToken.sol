// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LaunchToken — ERC-20 created by the ACTFUN Launchpad
/// @notice Owner is always the TokenLauncher contract (the only one that can mint)
contract LaunchToken is ERC20, Ownable {
    uint256 public immutable maxSupply;
    string public imageUri;

    constructor(
        string memory name,
        string memory symbol,
        uint256 _maxSupply,
        string memory _imageUri
    ) ERC20(name, symbol) Ownable(msg.sender) {
        maxSupply = _maxSupply;
        imageUri = _imageUri;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= maxSupply, "LaunchToken: max supply reached");
        _mint(to, amount);
    }

    /// @notice Burns `amount` tokens from `from`. Only callable by the owner (TokenLauncher).
    ///         Used by claimRefund() to unwind a miner's position before returning their fee.
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
