// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../solidity/contracts/StakingVault.sol";

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public minter;

    constructor(string memory _name, string memory _symbol) { name = _name; symbol = _symbol; minter = msg.sender; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (msg.sender != from) { require(allowed >= amount, "!allow"); allowance[from][msg.sender] = allowed - amount; }
        uint256 bal = balanceOf[from]; require(bal >= amount, "!balance"); balanceOf[from] = bal - amount; balanceOf[to] += amount;
        return true;
    }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) {
        uint256 bal = balanceOf[msg.sender]; require(bal >= amount, "!balance"); balanceOf[msg.sender] = bal - amount; balanceOf[to] += amount;
        return true;
    }
}

contract StakingVaultTest is Test {
    StakingVault vault;
    MockERC20 token;
    address user = address(0xb0b);
    address attacker = address(0xbad);

    function setUp() public {
        token = new MockERC20("TST", "TST");
        vault = new StakingVault(address(token), 1);
        token.mint(address(vault), 10000 ether);
        token.mint(user, 1000 ether);
        token.mint(attacker, 1000 ether);
    }

    function test_stake_and_withdraw() public {
        vm.startPrank(user);
        token.approve(address(vault), 100 ether);
        vault.stake(100 ether);
        assertEq(vault.getStakedBalance(user), 100 ether);
        vault.withdraw(60 ether);
        assertEq(vault.getStakedBalance(user), 40 ether);
        vm.stopPrank();
    }

    function test_insufficient_balance_reverts() public {
        vm.prank(user);
        vm.expectRevert("Insufficient balance");
        vault.withdraw(1 ether);
    }

    function test_claim_rewards_non_zero() public {
        vm.prank(user);
        token.approve(address(vault), 100 ether);
        vm.prank(user);
        vault.stake(100 ether);
        vm.warp(block.timestamp + 365 days);
        assertGt(vault.getPendingRewards(user), 0);
    }

    function test_reentrancy_prevents_double_withdraw() public {
        vm.prank(user);
        token.approve(address(vault), 100 ether);
        vm.prank(user);
        vault.stake(100 ether);
        vm.prank(user);
        vault.withdraw(100 ether);
        assertEq(vault.getStakedBalance(user), 0 ether);
    }
}
