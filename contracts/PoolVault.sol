// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title PoolVault
/// @notice Accrues 2% USDT per sale into monthly epochs; VIP/Elite Merkle claims
/// @dev VIP:Elite split done off-chain; this vault only holds funds & verifies proofs
contract PoolVault is AccessControl {
    /// -----------------------------------------------------------------------
    /// Roles
    /// -----------------------------------------------------------------------
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// -----------------------------------------------------------------------
    /// Immutables
    /// -----------------------------------------------------------------------
    IERC20 public immutable USDT;

    /// -----------------------------------------------------------------------
    /// Types & Storage
    /// -----------------------------------------------------------------------
    struct Epoch {
        uint256 start;
        uint256 end;
        uint256 total;       // Total USDT accrued to this epoch
        bytes32 vipRoot;     // Merkle root for VIP distribution
        bytes32 eliteRoot;   // Merkle root for Elite distribution
        bool    isSealed;    // Renamed from `sealed` to avoid reserved keyword
    }

    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => bool)) public claimedVIP;
    mapping(uint256 => mapping(address => bool)) public claimedElite;

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------
    event Accrued(uint256 indexed epochId, uint256 amount);
    event Sealed(uint256 indexed epochId, bytes32 vipRoot, bytes32 eliteRoot);
    event Claimed(uint256 indexed epochId, address indexed user, uint256 amount, bool elite);

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------
    constructor(address admin, IERC20 usdt) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        USDT = usdt;
    }

    /// -----------------------------------------------------------------------
    /// Admin actions
    /// -----------------------------------------------------------------------

    /// @notice Initialize an epoch [id] with time window [start, end]
    function initEpoch(uint256 id, uint256 start, uint256 end)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(epochs[id].end == 0, "exists");
        require(end > start, "range");
        epochs[id] = Epoch({
            start: start,
            end: end,
            total: 0,
            vipRoot: 0,
            eliteRoot: 0,
            isSealed: false
        });
    }

    /// @notice Increase epoch’s USDT balance accounting (transfer is done by Sale)
    function accrue(uint256 id, uint256 amount)
        external
        onlyRole(ADMIN_ROLE)
    {
        epochs[id].total += amount;
        emit Accrued(id, amount);
    }

    /// @notice Finalize epoch with VIP/Elite Merkle roots (one-way)
    function sealEpoch(uint256 id, bytes32 vip, bytes32 elite)
        external
        onlyRole(ADMIN_ROLE)
    {
        Epoch storage x = epochs[id];
        require(!x.isSealed && x.end > 0, "bad");
        x.vipRoot = vip;
        x.eliteRoot = elite;
        x.isSealed = true;
        emit Sealed(id, vip, elite);
    }

    /// -----------------------------------------------------------------------
    /// Claims
    /// -----------------------------------------------------------------------

    /// @notice VIP claim using Merkle proof of (user, amount)
    function claimVIP(uint256 id, uint256 amount, bytes32[] calldata proof) external {
        Epoch memory e = epochs[id];
        require(e.isSealed, "!sealed");
        require(!claimedVIP[id][msg.sender], "claimed");
        bytes32 leaf = keccak256(abi.encode(msg.sender, amount));
        require(MerkleProof.verify(proof, e.vipRoot, leaf), "proof");
        claimedVIP[id][msg.sender] = true;
        require(USDT.transfer(msg.sender, amount), "xfer");
        emit Claimed(id, msg.sender, amount, false);
    }

    /// @notice Elite claim using Merkle proof of (user, amount)
    function claimElite(uint256 id, uint256 amount, bytes32[] calldata proof) external {
        Epoch memory e = epochs[id];
        require(e.isSealed, "!sealed");
        require(!claimedElite[id][msg.sender], "claimed");
        bytes32 leaf = keccak256(abi.encode(msg.sender, amount));
        require(MerkleProof.verify(proof, e.eliteRoot, leaf), "proof");
        claimedElite[id][msg.sender] = true;
        require(USDT.transfer(msg.sender, amount), "xfer");
        emit Claimed(id, msg.sender, amount, true);
    }

    /// @notice Admin can emergency sweep (e.g., after epoch reconciliation)
    function sweep(address to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(USDT.transfer(to, amount), "xfer");
    }
}
