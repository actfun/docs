// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
    function approve(address spender, uint value) external returns (bool);
    function balanceOf(address owner) external view returns (uint);
    function decimals() external view returns (uint8);
}

/// @title StableSwapPool — Curve-like AMM for 2 correlated assets
/// @notice Implements the StableSwap invariant for low-slippage swaps.
///         Optimized for tokens trading at roughly 1:1 ratio (e.g. stablecoins).
///         For ACTFUN, used as an alternative AMM alongside Uniswap V2/V3.
contract StableSwapPool {
    uint256 public constant A = 85;           // Amplification coefficient (tuned for moderate correlation)
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

    function _getD(uint256 x0, uint256 x1) internal pure returns (uint256) {
        uint256 s = x0 + x1;
        if (s == 0) return 0;
        uint256 d = s;
        uint256 ann = A * 2;
        for (uint256 i = 0; i < 255; i++) {
            uint256 dPrev = d;
            uint256 d2 = (d * d) / (x0 * 2);
            d2 = (d2 * d) / (x1 * 2);
            d = ((ann * s + d2 * 2) * d) / ((ann - 1) * d + 3 * d2);
            if (d > dPrev) {
                if (d - dPrev <= 1) break;
            } else {
                if (dPrev - d <= 1) break;
            }
        }
        return d;
    }

    function _getY(uint256 x, uint256 d) internal pure returns (uint256) {
        uint256 c = (d * d) / (x * 2);
        c = (c * d) / (A * 2);
        uint256 b = x + (d / (A * 2));
        uint256 y = d;
        for (uint256 i = 0; i < 255; i++) {
            uint256 yPrev = y;
            y = (y * y + c) / (2 * y + b - d);
            if (y > yPrev) {
                if (y - yPrev <= 1) break;
            } else {
                if (yPrev - y <= 1) break;
            }
        }
        return y;
    }

    function getAmountOut(uint256 amountIn, bool zeroForOne) public view returns (uint256) {
        uint256 x = zeroForOne ? reserve0 : reserve1;
        uint256 y = zeroForOne ? reserve1 : reserve0;
        uint256 d = _getD(x, y);
        uint256 xNew = x + amountIn;
        uint256 yNew = _getY(xNew, d);
        uint256 amountOut = y - yNew - 1;
        uint256 fee = (amountOut * FEE) / FEE_DENOMINATOR;
        return amountOut - fee;
    }

    function swap(uint256 amountIn, bool zeroForOne, address to) external returns (uint256 amountOut) {
        require(amountIn > 0, "amountIn=0");
        require(to != address(0), "to=0");
        amountOut = getAmountOut(amountIn, zeroForOne);
        require(amountOut > 0, "amountOut=0");

        if (zeroForOne) {
            IERC20(token0).transferFrom(msg.sender, address(this), amountIn);
            reserve0 += amountIn;
            reserve1 -= amountOut;
            IERC20(token1).transfer(to, amountOut);
        } else {
            IERC20(token1).transferFrom(msg.sender, address(this), amountIn);
            reserve1 += amountIn;
            reserve0 -= amountOut;
            IERC20(token0).transfer(to, amountOut);
        }
        emit Swap(msg.sender, amountIn, amountOut, zeroForOne);
    }

    function addLiquidity(uint256 amount0, uint256 amount1, address to) external returns (uint256 liquidity) {
        require(amount0 > 0 && amount1 > 0, "amount=0");
        IERC20(token0).transferFrom(msg.sender, address(this), amount0);
        IERC20(token1).transferFrom(msg.sender, address(this), amount1);

        if (totalSupply == 0) {
            liquidity = _getD(amount0, amount1);
        } else {
            uint256 d0 = _getD(reserve0, reserve1);
            uint256 d1 = _getD(reserve0 + amount0, reserve1 + amount1);
            liquidity = (d1 - d0) * totalSupply / d0;
        }

        require(liquidity > 0, "liquidity=0");
        reserve0 += amount0;
        reserve1 += amount1;
        _mint(to, liquidity);
        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    function removeLiquidity(uint256 liquidity, address to) external returns (uint256 amount0, uint256 amount1) {
        require(liquidity > 0, "liquidity=0");
        uint256 d0 = _getD(reserve0, reserve1);
        amount0 = liquidity * reserve0 / totalSupply;
        amount1 = liquidity * reserve1 / totalSupply;
        _burn(msg.sender, liquidity);
        reserve0 -= amount0;
        reserve1 -= amount1;
        IERC20(token0).transfer(to, amount0);
        IERC20(token1).transfer(to, amount1);
        emit Burn(msg.sender, amount0, amount1, liquidity);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    function _approve(address owner, address spender, uint256 value) internal {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= value;
        }
        _transfer(from, to, value);
        return true;
    }
}
