// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TokenVesting {
    using Math for uint256;

    IERC20 public token;
    address public beneficiary;
    address public owner;

    uint256 public totalAllocation;
    uint256 public start;
    uint256 public cliff;
    uint256 public duration;
    uint256 public claimed;
    bool public revoked;

    event TokensClaimed(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary, uint256 unvested);

    constructor(
        address _token,
        address _beneficiary,
        uint256 _totalAllocation,
        uint256 _start,
        uint256 _cliffDuration,
        uint256 _vestingDuration
    ) {
        token = IERC20(_token);
        beneficiary = _beneficiary;
        owner = msg.sender;
        totalAllocation = _totalAllocation;
        start = _start;
        cliff = _start + _cliffDuration;
        duration = _vestingDuration;
    }

    // FIXED: Pre-divide to avoid overflow + remainder handling
    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < cliff) return 0;
        if (block.timestamp >= start + duration) return totalAllocation;

        uint256 elapsed = block.timestamp - start;
        // Pre-divide to avoid overflow with large allocations
        // Remainder handling ensures total claimed = totalAllocation at vesting end
        uint256 base = totalAllocation / duration;
        uint256 remainder = totalAllocation % duration;
        return elapsed * base + (elapsed * remainder) / duration;
    }

    function claimable() public view returns (uint256) {
        return vestedAmount() - claimed;
    }

    function claim() external {
        require(msg.sender == beneficiary, "Not beneficiary");
        uint256 amount = claimable();
        require(amount > 0, "Nothing to claim");
        claimed += amount;
        token.transfer(beneficiary, amount);
        emit TokensClaimed(beneficiary, amount);
    }

    // FIXED: During cliff period, unvested = totalAllocation - claimed (not totalAllocation - vested)
    function revoke() external {
        require(msg.sender == owner, "Not owner");
        require(!revoked, "Already revoked");
        revoked = true;

        uint256 vested = vestedAmount();
        uint256 unvested;

        if (block.timestamp < cliff) {
            // During cliff, vested is 0 but user may have claimed nothing
            unvested = totalAllocation - claimed;
        } else {
            // After cliff, unvested is allocation minus what's already vested
            // If user claimed less than vested, send the difference
            unvested = totalAllocation - vested;
        }

        if (vested > claimed) {
            token.transfer(beneficiary, vested - claimed);
        }
        token.transfer(owner, unvested);
        emit VestingRevoked(beneficiary, unvested);
    }

    function getVestingProgress() external view returns (uint256 vested, uint256 remaining, uint256 percentageBPS) {
        vested = vestedAmount();
        remaining = totalAllocation - vested;
        percentageBPS = totalAllocation > 0 ? vested * 10000 / totalAllocation : 0;
    }
}
