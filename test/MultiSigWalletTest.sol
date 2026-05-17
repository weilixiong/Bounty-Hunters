// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "../solidity/contracts/MultiSigWallet.sol";
contract MultiSigWalletTest is Test {
    MultiSigWallet wallet;
    address[] owners;
    address alice = address(0xA);
    address bob = address(0xB);
    address charlie = address(0xC);
    function setUp() public {
        owners = [alice, bob, charlie];
        wallet = new MultiSigWallet(owners, 2);
    }
    function test_submit_transaction() public {
        vm.prank(alice);
        uint256 txId = wallet.submitTransaction(address(0x123), 0, "");
        assertEq(txId, 0);
    }
    function test_zero_address_rejected() public {
        vm.prank(alice);
        vm.expectRevert("Zero-address target");
        wallet.submitTransaction(address(0), 0, "");
    }
    function test_confirm_and_execute() public {
        vm.prank(alice); uint256 txId = wallet.submitTransaction(address(0x123), 0, "");
        vm.prank(alice); wallet.confirmTransaction(txId);
        vm.prank(bob); wallet.confirmTransaction(txId);
        vm.prank(alice); wallet.executeTransaction(txId);
    }
    function test_not_enough_confirmations() public {
        vm.prank(alice); uint256 txId = wallet.submitTransaction(address(0x123), 0, "");
        vm.prank(alice); wallet.confirmTransaction(txId);
        vm.prank(alice);
        vm.expectRevert("Not enough confirmations at block");
        wallet.executeTransaction(txId);
    }
    function test_revoke_prevention() public {
        vm.prank(alice); uint256 txId = wallet.submitTransaction(address(0x123), 0, "");
        vm.prank(alice); wallet.confirmTransaction(txId);
        vm.prank(bob); wallet.confirmTransaction(txId);
        vm.prank(bob); wallet.revokeConfirmation(txId);
        assertEq(wallet.getConfirmationCount(txId), 1);
    }
    function test_isConfirmedAtBlock() public {
        vm.prank(alice); uint256 txId = wallet.submitTransaction(address(0x123), 0, "");
        vm.prank(alice); wallet.confirmTransaction(txId);
        uint256 bNum = block.number;
        assertTrue(wallet.isConfirmedAtBlock(txId, bNum));
    }
}
