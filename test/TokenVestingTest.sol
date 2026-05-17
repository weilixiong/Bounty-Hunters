// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "../solidity/contracts/TokenVesting.sol";
contract MockERC20V {
    string public name; string public symbol; uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    function mint(address t, uint256 a) external { balanceOf[t] += a; }
    function transfer(address t, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[t] += a; return true; }
}
contract TokenVestingTest is Test {
    TokenVesting vesting;
    MockERC20V token;
    address beneficiary = address(0xBENE);
    address owner = address(0x0WN);
    function setUp() public {
        token = new MockERC20V();
        vm.prank(owner);
        vesting = new TokenVesting(address(token), beneficiary, 1000000 ether, block.timestamp, 30 days, 365 days);
        token.mint(address(vesting), 1000000 ether);
    }
    function test_cliff_no_vesting() public {
        assertEq(vesting.vestedAmount(), 0);
    }
    function test_full_vesting_after_duration() public {
        vm.warp(block.timestamp + 400 days);
        assertEq(vesting.vestedAmount(), 1000000 ether);
    }
    function test_partial_vesting() public {
        vm.warp(block.timestamp + 200 days);
        uint256 vested = vesting.vestedAmount();
        assertGt(vested, 0);
        assertLt(vested, 1000000 ether);
    }
    function test_overflow_resistant() public {
        // Very large allocation — original formula would overflow
        TokenVesting largeVesting;
        vm.prank(owner);
        largeVesting = new TokenVesting(address(token), beneficiary, type(uint256).max / 1000, block.timestamp, 1 days, 365 days);
        vm.warp(block.timestamp + 200 days);
        uint256 vested = largeVesting.vestedAmount();
        assertGt(vested, 0);
    }
    function test_revoke_during_cliff() public {
        vm.prank(beneficiary); vesting.claim();
        vm.prank(owner); vesting.revoke();
        assertTrue(vesting.revoked());
    }
}
