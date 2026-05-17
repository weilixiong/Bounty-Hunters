// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../solidity/contracts/GovernanceToken.sol";

contract GovernanceTokenTest is Test {
    GovernanceToken token;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address attacker = address(0xBAD);

    function setUp() public {
        token = new GovernanceToken();
        token.mint(alice, 1000 ether);
    }

    function test_delegate_with_msg_sender() public {
        vm.prank(alice);
        token.delegateVote(bob);
        assertEq(token.getDelegates(alice), bob);
    }

    function test_only_msg_sender_can_delegate() public {
        vm.prank(attacker);
        vm.expectRevert("Not authorized");
        token.delegateVote(bob);  // Should revert since attacker has no tokens from msg.sender perspective
    }
}
