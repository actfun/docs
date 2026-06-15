// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStableSwapPool {
    function initialize(address _token0, address _token1) external;
}

/// @title StableSwapFactory — deploys a new StableSwapPool per token pair
/// @notice Each token graduation gets its own Curve-like pool.
contract StableSwapFactory {
    mapping(address => mapping(address => address)) public getPool;
    address[] public allPools;

    event PoolCreated(address indexed token0, address indexed token1, address pool, uint256 index);

    /// @notice Deploy a new StableSwapPool for (tokenA, tokenB)
    /// @return pool The newly created pool address
    function createPool(address tokenA, address tokenB) external returns (address pool) {
        require(tokenA != tokenB, "StableSwapFactory: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "StableSwapFactory: ZERO_ADDRESS");
        require(getPool[token0][token1] == address(0), "StableSwapFactory: POOL_EXISTS");

        // Deploy new pool via minimal proxy (CREATE2 would be better, but CREATE is simpler)
        pool = address(new StableSwapPool());
        IStableSwapPool(pool).initialize(token0, token1);

        getPool[token0][token1] = pool;
        getPool[token1][token0] = pool;
        allPools.push(pool);

        emit PoolCreated(token0, token1, pool, allPools.length - 1);
    }

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }
}

/// @dev Minimal clone of StableSwapPool for the factory.
///      The actual implementation is the same as StableSwapPool.sol.
///      For production, you'd use a proxy pattern (Clones/Minimal Proxy).
contract StableSwapPool {
    uint256 public constant A = 85;           // Amplification coefficient
    uint256 public constant N_COINS = 2;      // 2-asset pool
    uint256 public constant A_PRECISION = 100;// Curve A precision factor
    uint256 public constant FEE = 4;          // 0.04% swap fee (4 basis points)
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant PRECISION = 10**18;

    address public token0;
    address public token1;
    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Swap(address indexed sender, uint256 amountIn, uint256 amountOut, bool zeroForOne);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);

    function initialize(address _token0, address _token1) external {
        require(token0 == address(0) && token1 == address(0), "Already initialized");
        token0 = _token0;
        token1 = _token1;
    }

    /// @dev StableSwap invariant D, solved via Newton's method (Curve reference,
    ///      N_COINS=2 with A_PRECISION). Symmetric in (x0,x1).
    function _getD(uint256 x0, uint256 x1) internal pure returns (uint256) {
        uint256 s = x0 + x1;
        if (s == 0) return 0;
        uint256 d = s;
        uint256 ann = A * N_COINS * A_PRECISION;
        for (uint256 i = 0; i < 255; i++) {
            uint256 dP = d;
            dP = (dP * d) / (x0 * N_COINS);
            dP = (dP * d) / (x1 * N_COINS);
            uint256 dPrev = d;
            d = (((ann * s) / A_PRECISION + dP * N_COINS) * d)
                / (((ann - A_PRECISION) * d) / A_PRECISION + (N_COINS + 1) * dP);
            if ((d > dPrev ? d - dPrev : dPrev - d) <= 1) break;
        }
        return d;
    }

    /// @dev Given the new input-side balance `x` and invariant `d`, solve for the
    ///      output-side balance `y` (Curve reference get_y, N_COINS=2). Pure: works
    ///      for both swap directions because `_getD` is symmetric.
    function _getY(uint256 x, uint256 d) internal pure returns (uint256) {
        uint256 ann = A * N_COINS * A_PRECISION;
        uint256 c = d;
        c = (c * d) / (x * N_COINS);
        c = (c * d * A_PRECISION) / (ann * N_COINS);
        uint256 b = x + (d * A_PRECISION) / ann;
        uint256 y = d;
        for (uint256 i = 0; i < 255; i++) {
            uint256 yPrev = y;
            y = (y * y + c) / (2 * y + b - d);
            if ((y > yPrev ? y - yPrev : yPrev - y) <= 1) break;
        }
        return y;
    }

    function addLiquidity(uint256 amount0, uint256 amount1, address to) external returns (uint256 liquidity) {
        require(token0 != address(0), "Not initialized");
        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 _reserve0 = reserve0;
        uint256 _reserve1 = reserve1;
        uint256 amount0Optimal;
        uint256 amount1Optimal;
        if (_reserve0 == 0 && _reserve1 == 0) {
            amount0Optimal = amount0;
            amount1Optimal = amount1;
        } else {
            amount1Optimal = (amount0 * _reserve1) / _reserve0;
            if (amount1Optimal <= amount1) {
                amount0Optimal = amount0;
            } else {
                amount0Optimal = (amount1 * _reserve0) / _reserve1;
                amount1Optimal = amount1;
            }
        }
        require(IERC20(token0).transferFrom(msg.sender, address(this), amount0Optimal), "Transfer failed");
        require(IERC20(token1).transferFrom(msg.sender, address(this), amount1Optimal), "Transfer failed");
        uint256 d0 = _getD(_reserve0, _reserve1);
        reserve0 = bal0 + amount0Optimal;
        reserve1 = bal1 + amount1Optimal;
        uint256 d1 = _getD(reserve0, reserve1);
        if (totalSupply == 0) {
            liquidity = d1;
        } else {
            liquidity = ((d1 - d0) * totalSupply) / d0;
        }
        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY");
        totalSupply += liquidity;
        balanceOf[to] += liquidity;
        emit Mint(msg.sender, amount0Optimal, amount1Optimal, liquidity);
    }

    function getAmountOut(uint256 amountIn, bool zeroForOne) external view returns (uint256 amountOut) {
        uint256 x = zeroForOne ? reserve0 : reserve1;
        uint256 y = zeroForOne ? reserve1 : reserve0;
        uint256 d = _getD(x, y);
        uint256 xNew = x + amountIn;
        uint256 yNew = _getY(xNew, d);
        amountOut = y - yNew;
        uint256 fee = (amountOut * FEE) / FEE_DENOMINATOR;
        amountOut -= fee;
    }

    function swap(uint256 amountIn, bool zeroForOne, address to) external returns (uint256 amountOut) {
        require(amountIn > 0, "INSUFFICIENT_INPUT");
        (address inToken, address outToken) = zeroForOne ? (token0, token1) : (token1, token0);
        require(IERC20(inToken).transferFrom(msg.sender, address(this), amountIn), "Transfer failed");
        uint256 x = zeroForOne ? reserve0 : reserve1;
        uint256 y = zeroForOne ? reserve1 : reserve0;
        uint256 d = _getD(x, y);
        uint256 xNew = x + amountIn;
        uint256 yNew = _getY(xNew, d);
        uint256 gross = y - yNew;
        uint256 fee = (gross * FEE) / FEE_DENOMINATOR;
        amountOut = gross - fee;
        require(amountOut > 0, "INSUFFICIENT_OUTPUT");
        // Output reserve drops by the NET amount sent out; the fee stays in the
        // pool (so output reserve = y - amountOut = yNew + fee). The input
        // reserve becomes xNew (input + amountIn).
        if (zeroForOne) {
            reserve0 = xNew;
            reserve1 = y - amountOut;
        } else {
            reserve1 = xNew;
            reserve0 = y - amountOut;
        }
        require(IERC20(outToken).transfer(to, amountOut), "Transfer failed");
        emit Swap(msg.sender, amountIn, amountOut, zeroForOne);
    }
}

interface IERC20 {
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
    function balanceOf(address owner) external view returns (uint);
}
