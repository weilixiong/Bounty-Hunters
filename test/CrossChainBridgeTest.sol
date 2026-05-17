// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "../solidity/contracts/CrossChainBridge.sol";
contract MockERC20B { 
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
contract CrossChainBridgeTest is Test {
    CrossChainBridge bridge;
    MockERC20B token;
    address validator = address(0xVA1);
    address user = address(0xU53R);
    function setUp() public {
        token = new MockERC20B();
        bridge = new CrossChainBridge(address(token), validator);
        token.mint(address(bridge), 10000 ether);
    }
    function test_initiate_transfer() public {
        token.mint(user, 1000 ether);
        vm.prank(user); token.approve(address(bridge), 100 ether);
        vm.prank(user); bridge.initiateTransfer(100 ether, 1);
    }
    function test_get_pool_balance() public {
        assertEq(bridge.getPoolBalance(), 10000 ether);
    }
}
