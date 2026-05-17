// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../solidity/contracts/SimpleSwap.sol";

contract MockERC20Simple {
    string public name; string public symbol; uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address t, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[t] += a; return true;
    }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

contract SimpleSwapTest is Test {
    SimpleSwap swap;
    MockERC20Simple tokenA;
    MockERC20Simple tokenB;
    address user = address(0xU53R);

    function setUp() public {
        swap = new SimpleSwap();
        tokenA = new MockERC20Simple(); tokenA.mint(address(swap), 100 ether);
        tokenB = new MockERC20Simple(); tokenB.mint(address(swap), 100 ether);
        tokenA.mint(user, 100 ether);
    }

    function test_expired_deadline_reverts() public {
        vm.prank(user);
        tokenA.approve(address(swap), 10 ether);
        vm.prank(user);
        vm.warp(block.timestamp + 1000);
        vm.expectRevert("Swap expired");
        swap.swap(address(tokenA), address(tokenB), 10 ether, 1, block.timestamp - 1);
    }

    function test_valid_swap_succeeds() public {
        vm.prank(user);
        tokenA.approve(address(swap), 10 ether);
        vm.prank(user);
        swap.swap(address(tokenA), address(tokenB), 10 ether, 0, block.timestamp + 100);
        // Should not revert
    }

    function test_zero_amount_reverts() public {
        vm.prank(user);
        vm.expectRevert("Amount must be > 0");
        swap.swap(address(tokenA), address(tokenB), 0, 0, block.timestamp + 100);
    }
}
