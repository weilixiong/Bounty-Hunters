// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "../solidity/contracts/LiquidityPool.sol";
contract MockERC20L is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address t, uint256 a) external { _mint(t, a); }
}
contract LiquidityPoolTest is Test {
    LiquidityPool pool;
    MockERC20L tokenA; MockERC20L tokenB;
    address user = address(0x1);
    function setUp() public {
        tokenA = new MockERC20L("A", "A"); tokenB = new MockERC20L("B", "B");
        pool = new LiquidityPool(address(tokenA), address(tokenB));
        tokenA.mint(user, 10000 ether); tokenB.mint(user, 10000 ether);
    }
    function test_first_deposit_locks_minimum() public {
        vm.startPrank(user);
        tokenA.approve(address(pool), 1000 ether);
        tokenB.approve(address(pool), 1000 ether);
        pool.addLiquidity(100 ether, 100 ether);
        // MINIMUM_LIQUIDITY = 1000 should be locked at address(0)
        assertEq(pool.balanceOf(address(0)), 1000);
        vm.stopPrank();
    }
    function test_add_and_remove() public {
        vm.startPrank(user);
        tokenA.approve(address(pool), 2000 ether);
        tokenB.approve(address(pool), 2000 ether);
        pool.addLiquidity(100 ether, 100 ether);
        uint256 lpBalance = pool.balanceOf(user);
        assertGt(lpBalance, 0);
        pool.removeLiquidity(lpBalance);
        assertEq(pool.balanceOf(user), 0);
        vm.stopPrank();
    }
    function test_sync_updates_reserves() public {
        vm.startPrank(user);
        tokenA.approve(address(pool), 1000 ether);
        tokenB.approve(address(pool), 1000 ether);
        pool.addLiquidity(100 ether, 100 ether);
        pool.sync();  // Should not revert
        vm.stopPrank();
    }
}
