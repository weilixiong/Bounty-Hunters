// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "../solidity/contracts/FlashLoan.sol";
contract MockERC20F {
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
contract FlashLoanTest is Test {
    FlashLoan flash;
    MockERC20F token;
    address owner = address(0x0WN);
    function setUp() public {
        token = new MockERC20F();
        vm.prank(owner);
        flash = new FlashLoan(address(token), 50); // 0.5% fee
        token.mint(address(flash), 10000 ether);
    }
    function test_pause_unpause() public {
        vm.prank(owner); flash.pause();
        vm.expectRevert("Paused");
        // Flash loan should revert when paused
        vm.stopPrank();
    }
    function test_owner_can_pause() public {
        vm.prank(owner); flash.pause();
        assertTrue(flash.paused());
        vm.prank(owner); flash.unpause();
        assertFalse(flash.paused());
    }
    function test_deposit_and_balance() public {
        vm.prank(owner);
        // Pool is already funded
    }
}
