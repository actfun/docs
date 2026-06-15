// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LaunchToken.sol";
import "./TokenLauncher.sol";

/// @title LaunchpadFactory — ACTFUN Launchpad: deploy mine-to-launch tokens on Arc testnet
/// @notice Anyone can create a new minable token. Once mined out, it auto-graduates by
///         seeding a full-range UNITFLOW V3 liquidity pool with the LP reserve + all accumulated fees.
contract LaunchpadFactory {
    // ─── Structs ─────────────────────────────────────────────────────────────
    struct TokenRecord {
        address tokenAddress;
        address launcherAddress;
        string  name;
        string  symbol;
        string  imageUri;
        address creator;
        uint256 createdAt;
        uint256 maxSupply;
        uint256 mineAmount;
        uint256 cooldownSeconds;
        uint256 dailyMax;
        uint256 feePerMine;
        uint256 refundWindowSeconds;
    }

    // ─── State ───────────────────────────────────────────────────────────────
    TokenRecord[] public tokens;
    mapping(address => address) public launcherByToken;   // token → launcher
    mapping(address => bool)    public isLauncher;

    uint256 public creationFee; // USDC required to deploy a token (anti-spam)
    address public feeRecipient;
    address public owner;

    // ─── Events ──────────────────────────────────────────────────────────────
    event TokenCreated(
        address indexed tokenAddress,
        address indexed launcherAddress,
        address indexed creator,
        string  name,
        string  symbol,
        string  imageUri,
        uint256 maxSupply,
        uint256 feePerMine
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "LaunchpadFactory: not owner");
        _;
    }

    constructor(uint256 _creationFee, address _feeRecipient) {
        owner = msg.sender;
        creationFee = _creationFee;
        feeRecipient = _feeRecipient;
    }

    // ─── Token creation ──────────────────────────────────────────────────────

    /// @notice Deploy a new minable token.
    /// @param name                 Token name (e.g. "DogeFun")
    /// @param symbol               Token symbol (e.g. "DOGEFUN")
    /// @param imageUri             Image URL or emoji representing the token
    /// @param maxSupply            Total supply cap (18 decimals, e.g. 1_000_000 * 1e18)
    /// @param mineAmount           Tokens minted per mine call (18 decimals)
    /// @param cooldown             Per-wallet cooldown in seconds
    /// @param dailyMax             Per-wallet 24h cap in tokens (18 decimals)
    /// @param feePerMine           USDC (wei) required per mine call (goes into LP pool)
    /// @param refundWindowSeconds  Seconds after deployment during which miners can claim refunds
    /// @param ammFlags             Bitmask of AMMs to seed on graduation: 1=UNITFLOW V3, 2=Uniswap V2, 4=StableSwap, 8=Synthra V3 (any non-empty mix)
    function createToken(
        string  calldata name,
        string  calldata symbol,
        string  calldata imageUri,
        uint256 maxSupply,
        uint256 mineAmount,
        uint256 cooldown,
        uint256 dailyMax,
        uint256 feePerMine,
        uint256 refundWindowSeconds,
        uint8   ammFlags
    ) external payable returns (address tokenAddr, address launcherAddr) {
        require(msg.value >= creationFee, "LaunchpadFactory: creation fee required");
        require(maxSupply > 0, "LaunchpadFactory: maxSupply must be > 0");
        require(mineAmount > 0 && mineAmount <= maxSupply, "LaunchpadFactory: invalid mineAmount");
        require(cooldown > 0, "LaunchpadFactory: cooldown must be > 0");
        require(dailyMax >= mineAmount, "LaunchpadFactory: dailyMax < mineAmount");
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "LaunchpadFactory: empty name/symbol");
        require(refundWindowSeconds > 0, "LaunchpadFactory: refund window must be > 0");
        require(ammFlags != 0 && ammFlags <= 15, "LaunchpadFactory: invalid ammFlags");

        // Collect creation fee
        if (msg.value > 0 && feeRecipient != address(0)) {
            (bool ok, ) = payable(feeRecipient).call{value: msg.value}("");
            require(ok, "LaunchpadFactory: fee transfer failed");
        }

        // Deploy token
        LaunchToken newToken = new LaunchToken(name, symbol, maxSupply, imageUri);
        tokenAddr = address(newToken);

        // Deploy launcher (miner + AMM)
        TokenLauncher launcher = new TokenLauncher(
            tokenAddr,
            msg.sender,
            mineAmount,
            cooldown,
            dailyMax,
            feePerMine,
            refundWindowSeconds,
            ammFlags
        );
        launcherAddr = address(launcher);

        // Transfer token ownership to launcher (only it can mint)
        newToken.transferOwnership(launcherAddr);

        // Register
        launcherByToken[tokenAddr] = launcherAddr;
        isLauncher[launcherAddr] = true;

        tokens.push(TokenRecord({
            tokenAddress:        tokenAddr,
            launcherAddress:     launcherAddr,
            name:                name,
            symbol:              symbol,
            imageUri:            imageUri,
            creator:             msg.sender,
            createdAt:           block.timestamp,
            maxSupply:           maxSupply,
            mineAmount:          mineAmount,
            cooldownSeconds:     cooldown,
            dailyMax:            dailyMax,
            feePerMine:          feePerMine,
            refundWindowSeconds: refundWindowSeconds
        }));

        emit TokenCreated(
            tokenAddr,
            launcherAddr,
            msg.sender,
            name,
            symbol,
            imageUri,
            maxSupply,
            feePerMine
        );
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getTokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /// @notice Returns up to `count` tokens starting at index `from` (newest first)
    function getTokens(uint256 from, uint256 count)
        external
        view
        returns (TokenRecord[] memory result)
    {
        uint256 total = tokens.length;
        if (from >= total) return result;
        uint256 end = from + count > total ? total : from + count;
        result = new TokenRecord[](end - from);
        for (uint256 i = from; i < end; i++) {
            // Return newest first
            result[i - from] = tokens[total - 1 - i];
        }
    }

    function getToken(uint256 index) external view returns (TokenRecord memory) {
        require(index < tokens.length, "LaunchpadFactory: out of bounds");
        return tokens[index];
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setCreationFee(uint256 fee) external onlyOwner {
        creationFee = fee;
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        feeRecipient = recipient;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
