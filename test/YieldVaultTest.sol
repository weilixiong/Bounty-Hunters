// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "../solidity/contracts/YieldVault.sol";
contract MockERC20Y { 
    string public name; string public symbol; uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address t, uint256 a) external { balanceOf[t] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
    function transfer(address t, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[t] += a; return true; }
}
contract YieldVaultTest is Test {
    YieldVault vault;
    MockERC20Y stakingToken; MockERC20Y rewardToken;
    address user = address(0x1); address distributor = address(0xD15);
    function setUp() public {
        stakingToken = new MockERC20Y(); rewardToken = new MockERC20Y();
        vault = new YieldVault(address(stakingToken), address(rewardToken));
        stakingToken.mint(user, 1000 ether);
        rewardToken.mint(address(vault), 10000 ether);
    }
    function test_deposit_and_earn() public {
        vm.prank(user); stakingToken.approve(address(vault), 100 ether);
        vm.prank(user); vault.deposit(100 ether);
        assertEq(vault.balanceOf(user), 100 ether);
    }
    function test_phantom_reward_prevented_after_period() public {
        vm.prank(user); stakingToken.approve(address(vault), 100 ether);
        vm.prank(user); vault.deposit(100 ether);
        vm.warp(block.timestamp + 365 days);
        uint256 earned = vault.earned(user);
        // Without the fix, this would be huge (phantom reward)
        // With fix, should be 0 since periodFinish is 0
        assertEq(earned, 0);
    }
    function test_withdraw() public {
        vm.prank(user); stakingToken.approve(address(vault), 100 ether);
        vm.prank(user); vault.deposit(100 ether);
        vm.prank(user); vault.withdraw(50 ether);
        assertEq(vault.balanceOf(user), 50 ether);
    }
}
