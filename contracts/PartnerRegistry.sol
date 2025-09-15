// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PartnerRegistry
/// @notice In-house KYC + Partner state machine for Nebullas Partner Program
/// @dev States: NOT_ELIGIBLE → ELIGIBLE → PENDING → APPROVED/REJECTED → SUSPENDED
///      Eligibility rule: KYC passed AND cumulativePurchasedNBL >= 10 NBL (18d)
contract PartnerRegistry is AccessControl {
    /// -----------------------------------------------------------------------
    /// Roles
    /// -----------------------------------------------------------------------
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// -----------------------------------------------------------------------
    /// Types & Storage
    /// -----------------------------------------------------------------------
    enum State { NOT_ELIGIBLE, ELIGIBLE, PENDING, APPROVED, REJECTED, SUSPENDED }

    /// @notice KYC flag (off-chain reviewed, on-chain toggled)
    mapping(address => bool) public kycPassed;

    /// @notice Current state of a wallet in the Partner Program
    mapping(address => State) public stateOf;

    /// @notice Sum of purchased NBL in 18 decimals (tracked by Sale contract)
    mapping(address => uint256) public cumulativePurchasedNBL;

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------
    event KYCUpdated(address indexed user, bool ok);
    event StateChanged(address indexed user, State prev, State next);

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// -----------------------------------------------------------------------
    /// Admin (KYC + Purchase Notes)
    /// -----------------------------------------------------------------------

    /// @notice Admin sets KYC; flips state to ELIGIBLE if thresholds met
    function setKYC(address user, bool ok) external onlyRole(ADMIN_ROLE) {
        kycPassed[user] = ok;
        emit KYCUpdated(user, ok);
        _flip(user);
    }

    /// @notice Sale contract (granted ADMIN_ROLE) notes token purchases (18d)
    function notePurchase(address user, uint256 nblAmount18)
        external
        onlyRole(ADMIN_ROLE)
    {
        cumulativePurchasedNBL[user] += nblAmount18;
        _flip(user);
    }

    /// @dev Internal state flipper to ELIGIBLE once both conditions met
    function _flip(address user) internal {
        if (
            stateOf[user] == State.NOT_ELIGIBLE &&
            kycPassed[user] &&
            cumulativePurchasedNBL[user] >= 10 ether /* 10 NBL, 18d */
        ) {
            stateOf[user] = State.ELIGIBLE;
            emit StateChanged(user, State.NOT_ELIGIBLE, State.ELIGIBLE);
        }
    }

    /// -----------------------------------------------------------------------
    /// User entry & Admin moderation
    /// -----------------------------------------------------------------------

    /// @notice User applies to become a Partner (renamed to avoid reserved keyword)
    function applyAsPartner() external {
        require(kycPassed[msg.sender], "KYC");
        State s = stateOf[msg.sender];
        require(s == State.ELIGIBLE || s == State.REJECTED, "not eligible");
        stateOf[msg.sender] = State.PENDING;
        emit StateChanged(msg.sender, s, State.PENDING);
    }

    /// @notice Admin approves or rejects a pending application
    function approve(address user, bool ok) external onlyRole(ADMIN_ROLE) {
        State prev = stateOf[user];
        stateOf[user] = ok ? State.APPROVED : State.REJECTED;
        emit StateChanged(user, prev, stateOf[user]);
    }

    /// @notice Admin can suspend/unsuspend an approved Partner
    function suspend(address user, bool s) external onlyRole(ADMIN_ROLE) {
        State prev = stateOf[user];
        stateOf[user] = s ? State.SUSPENDED : State.APPROVED;
        emit StateChanged(user, prev, stateOf[user]);
    }
}
