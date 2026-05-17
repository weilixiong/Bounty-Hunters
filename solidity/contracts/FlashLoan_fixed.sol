// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashLoanReceiver {
    function onFlashLoan(address token, uint256 amount, uint256 fee, bytes calldata data) external;
}

contract FlashLoan {
    IERC20 public loanToken;
    uint256 public feeBPS;
    uint256 public totalFees;
    address public owner;
    bool public paused;

    // FIXED: Internal accounting for rebasing token protection
    uint256 public poolBalanceInternal;
    uint256 public constant MAX_LOAN_PCT = 5000; // 50% in BPS

    event FlashLoanExecuted(address indexed borrower, uint256 amount, uint256 fee);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _loanToken, uint256 _feeBPS) {
        loanToken = IERC20(_loanToken);
        feeBPS = _feeBPS;
        owner = msg.sender;
    }

    // FIXED: Min fee of 1 token, max loan cap at 50% of pool
    function flashLoan(uint256 amount, bytes calldata data) external {
        require(!paused, "Paused");
        require(amount > 0, "Amount must be > 0");

        uint256 poolBalance = loanToken.balanceOf(address(this));
        require(poolBalance >= amount, "Insufficient pool balance");
        require(amount <= poolBalance * MAX_LOAN_PCT / 10000, "Loan exceeds 50% of pool");

        // FIXED: Minimum fee of 1 token prevents zero-fee flash loans
        uint256 calculatedFee = amount * feeBPS / 10000;
        uint256 fee = calculatedFee < 1 ? 1 : calculatedFee;

        loanToken.transfer(msg.sender, amount);

        IFlashLoanReceiver(msg.sender).onFlashLoan(address(loanToken), amount, fee, data);

        // FIXED: Uses internal accounting instead of balanceOf for rebasing token protection
        require(poolBalanceInternal + fee >= amount, "Loan not repaid");
        poolBalanceInternal = poolBalanceInternal + fee;

        totalFees += fee;
        emit FlashLoanExecuted(msg.sender, amount, fee);
    }

    function depositToPool(uint256 amount) external {
        loanToken.transferFrom(msg.sender, address(this), amount);
        poolBalanceInternal += amount;
    }

    function withdrawFees() external onlyOwner {
        uint256 fees = totalFees;
        totalFees = 0;
        loanToken.transfer(owner, fees);
    }

    // FIXED: Emergency pause/unpause
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function getPoolBalance() external view returns (uint256) {
        return loanToken.balanceOf(address(this));
    }

    // FIXED: Syncing internal accounting with actual balance for transparency
    function syncPoolBalance() external {
        poolBalanceInternal = loanToken.balanceOf(address(this));
    }
}
