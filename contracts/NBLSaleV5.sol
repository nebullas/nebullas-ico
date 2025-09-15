// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {NBLToken} from "./NBLToken.sol";
import {PartnerRegistry} from "./PartnerRegistry.sol";
import {PartnerTree} from "./PartnerTree.sol";
import {PoolVault} from "./PoolVault.sol";

interface ISignatureTransfer {
    struct TokenPermissions { address token; uint256 amount; }
    struct PermitTransferFrom { TokenPermissions permitted; uint256 nonce; uint256 deadline; }
    struct SignatureTransferDetails { address to; uint256 requestedAmount; }
    function permitTransferFrom(
        PermitTransferFrom calldata,
        SignatureTransferDetails calldata,
        address owner,
        bytes calldata signature
    ) external;
}

contract NBLSaleV5 is AccessControl, ReentrancyGuard, Pausable {
    // ---------------------------------------------------------------------
    // Roles & Types
    // ---------------------------------------------------------------------
    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    enum Mode { INSTANT, ESCROW }

    struct Phase {
        uint64  start;   // epoch seconds
        uint64  end;     // epoch seconds
        uint128 price;   // 18d USDT-per-NBL (normalized)
        uint256 cap;     // NBL cap (18d)
        uint256 sold;    // NBL sold (18d)
    }

    // ---------------------------------------------------------------------
    // Events (non-conflicting with OZ Pausable)
    // ---------------------------------------------------------------------
    event Purchase(address indexed buyer, uint256 usdtIn, uint256 nblOut, uint8 phaseId, Mode mode);
    event PartnerPayout(address indexed to, uint256 usdtAmount, uint8 fromLevel, uint8 assignedLevel);
    event PoolAccrued(uint256 indexed epochId, uint256 amount);
    event PendingAdded(address indexed to, uint256 usdtAmount);
    event Refunded(address indexed user, uint256 usdtAmount);

    // ---------------------------------------------------------------------
    // Immutables / Storage
    // ---------------------------------------------------------------------
    NBLToken public immutable NBL;
    IERC20   public immutable USDT;
    PartnerRegistry public immutable REG;
    PartnerTree     public immutable TREE;
    PoolVault       public immutable POOL;

    address  public treasury;
    uint8    public usdtDecimals;
    Mode     public mode;
    uint256  public currentEpochId;

    Phase[]  public phases;
    uint256  public minUSDT;
    uint256  public maxUSDT;

    uint256  public softCapUSDT;
    bool     public softCapEnabled;
    bool     public saleClosed;

    mapping(address => uint256) public contributed;   // raw USDT (native decimals)
    uint256  public totalContrib;

    mapping(address => uint256) public pendingPartner; // USDT (raw) in ESCROW mode
    uint256  public pendingTreasury;                   // USDT (raw)
    uint256  public pendingPool;                       // USDT (raw)

    uint16 public constant POOL_BPS = 200; // 2%
    uint16[6] public levelBps = [800, 100, 100, 100, 100, 100]; // 8%,1%,...,1%
    ISignatureTransfer public PERMIT2; // optional

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------
    constructor(
        address admin,
        NBLToken nbl,
        IERC20 usdt,
        PartnerRegistry reg,
        PartnerTree tree,
        PoolVault pool,
        address treasury_,
        uint8 usdtDecimals_,
        Mode mode_,
        uint256 min_,
        uint256 max_,
        ISignatureTransfer permit2_
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);

        NBL = nbl; USDT = usdt; REG = reg; TREE = tree; POOL = pool;
        treasury = treasury_;
        PERMIT2  = permit2_;

        // auto-detect USDT decimals if metadata present
        usdtDecimals = usdtDecimals_;
        try IERC20Metadata(address(usdt)).decimals() returns (uint8 d) { usdtDecimals = d; } catch {}

        mode = mode_;
        minUSDT = min_;
        maxUSDT = max_;
    }

    // ---------------------------------------------------------------------
    // Admin / Guardian
    // ---------------------------------------------------------------------
    function setEpoch(uint256 id) external onlyRole(ADMIN_ROLE) { currentEpochId = id; }
    function setTreasury(address t) external onlyRole(ADMIN_ROLE) { treasury = t; }
    function setMode(Mode m) external onlyRole(ADMIN_ROLE) { mode = m; }
    function setPermit2(ISignatureTransfer p) external onlyRole(ADMIN_ROLE) { PERMIT2 = p; }

    function addPhase(Phase calldata p) external onlyRole(ADMIN_ROLE) { phases.push(p); }
    function setPhase(uint8 i, Phase calldata p) external onlyRole(ADMIN_ROLE) { phases[i] = p; }

    function enableSoftCap(uint256 capUSDT) external onlyRole(ADMIN_ROLE) {
        softCapEnabled = true; softCapUSDT = capUSDT; mode = Mode.ESCROW;
    }

    function closeSale() external onlyRole(ADMIN_ROLE) { saleClosed = true; }

    // Guardian pause controls (OZ Pausable auto‑emits events)
    function pause()  external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------
    function activePhase() public view returns (int8 idx) {
        uint256 t = block.timestamp;
        for (uint8 i = 0; i < phases.length; i++) {
            if (t >= phases[i].start && t < phases[i].end) return int8(i);
        }
        return -1;
    }

    // ---------------------------------------------------------------------
    // Buy (Approve+Buy / Permit2)
    // ---------------------------------------------------------------------
    function buy(uint256 amt, address expectedBuyer)
        external
        nonReentrant
        whenNotPaused
    {
        _pre(expectedBuyer, amt);
        require(USDT.transferFrom(msg.sender, address(this), amt), "xferFrom");
        _post(expectedBuyer, amt);
    }

    function buyWithPermit2(
        ISignatureTransfer.PermitTransferFrom calldata p,
        ISignatureTransfer.SignatureTransferDetails calldata d,
        address owner,
        bytes calldata sig,
        address expectedBuyer
    )
        external
        nonReentrant
        whenNotPaused
    {
        require(owner == expectedBuyer, "owner!=buyer");
        _pre(expectedBuyer, d.requestedAmount);
        PERMIT2.permitTransferFrom(p, d, owner, sig);
        _post(expectedBuyer, d.requestedAmount);
    }

    function _pre(address buyer, uint256 amt) internal view {
        require(buyer == msg.sender, "spoof");
        require(!saleClosed, "closed");
        require(amt >= minUSDT && amt <= maxUSDT, "bounds");
        require(REG.kycPassed(buyer), "KYC");
        require(activePhase() >= 0, "no phase");
    }

    function _post(address buyer, uint256 amt) internal {
        int8 ph = activePhase();
        Phase storage P = phases[uint8(ph)];

        // normalize USDT to 18d, then price is 18d USDT-per-NBL
        uint256 norm = usdtDecimals == 18 ? amt : amt * (10 ** (18 - usdtDecimals));
        uint256 tokens = (norm * 1e18) / P.price;

        require(tokens > 0, "tiny");
        require(P.sold + tokens <= P.cap, "cap");
        P.sold += tokens;

        // mint buyer & record eligibility
        NBL.mint(buyer, tokens);
        REG.notePurchase(buyer, tokens);

        contributed[buyer] += amt;
        totalContrib += amt;

        _split(amt, buyer);
        _bonus(buyer, tokens);

        emit Purchase(buyer, amt, tokens, uint8(ph), mode);
    }

    // ---------------------------------------------------------------------
    // Split (2% pool, 13% partners w/ compression, rest treasury)
    // ---------------------------------------------------------------------
    function _split(uint256 amount, address buyer) internal {
        address[6] memory ups = TREE.uplines(buyer);

        // 2% Planet Pool
        uint256 poolShare = (amount * POOL_BPS) / 10000;

        // level amounts (8%,1%,1%,1%,1%,1%)
        uint256[6] memory levelAmt;
        uint256 partnerTotal;
        for (uint8 i = 0; i < 6; i++) {
            levelAmt[i] = (amount * levelBps[i]) / 10000;
            partnerTotal += levelAmt[i];
        }

        uint256 treShare = amount - poolShare - partnerTotal;

        // dynamic compression
        uint256[6] memory assign;
        bool[6] memory has;
        for (uint8 k = 0; k < 6; k++) { has[k] = (ups[k] != address(0)); }

        for (uint8 i = 0; i < 6; i++) {
            uint256 a = levelAmt[i];
            if (a == 0) continue;
            bool given = false;
            for (uint8 j = i; j < 6; j++) {
                if (!has[j]) continue;
                if (REG.stateOf(ups[j]) == PartnerRegistry.State.APPROVED) {
                    assign[j] += a;
                    given = true;
                    emit PartnerPayout(ups[j], a, i + 1, j + 1);
                    break;
                }
            }
            if (!given) { treShare += a; } // compression remainder → Treasury
        }

        if (mode == Mode.INSTANT) {
            if (poolShare > 0) {
                require(USDT.transfer(address(POOL), poolShare), "pool");
                POOL.accrue(currentEpochId, poolShare);
                emit PoolAccrued(currentEpochId, poolShare);
            }
            for (uint8 j = 0; j < 6; j++) {
                uint256 a2 = assign[j];
                if (a2 > 0) require(USDT.transfer(ups[j], a2), "partner");
            }
            require(USDT.transfer(treasury, treShare), "treasury");
        } else {
            if (poolShare > 0) { pendingPool += poolShare; emit PendingAdded(address(POOL), poolShare); }
            pendingTreasury += treShare;
            for (uint8 j2 = 0; j2 < 6; j2++) {
                uint256 ap = assign[j2];
                if (ap > 0) { pendingPartner[ups[j2]] += ap; emit PendingAdded(ups[j2], ap); }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Token bonus from supply-side pool (L1 5%, L2–L6 1%)
    // ---------------------------------------------------------------------
    function _bonus(address buyer, uint256 buyerTokens) internal {
        address[6] memory ups = TREE.uplines(buyer);
        uint16[6] memory b = [uint16(500), 100, 100, 100, 100, 100];
        for (uint8 i = 0; i < 6; i++) {
            address u = ups[i];
            if (u == address(0)) break;
            if (REG.stateOf(u) == PartnerRegistry.State.APPROVED) {
                uint256 m = (buyerTokens * b[i]) / 10000;
                if (m > 0) NBL.mintBonus(u, m);
            }
        }
    }

    // ---------------------------------------------------------------------
    // Claims (ESCROW mode)
    // ---------------------------------------------------------------------
    function claimPartner() external nonReentrant {
        uint256 a = pendingPartner[msg.sender];
        require(a > 0, "none");
        pendingPartner[msg.sender] = 0;
        require(USDT.transfer(msg.sender, a), "xfer");
    }

    function claimTreasury() external nonReentrant onlyRole(ADMIN_ROLE) {
        uint256 a = pendingTreasury;
        require(a > 0, "none");
        pendingTreasury = 0;
        require(USDT.transfer(treasury, a), "xfer");
    }

    function claimPool() external nonReentrant onlyRole(ADMIN_ROLE) {
        uint256 a = pendingPool;
        require(a > 0, "none");
        pendingPool = 0;
        require(USDT.transfer(address(POOL), a), "xfer");
        POOL.accrue(currentEpochId, a);
        emit PoolAccrued(currentEpochId, a);
    }

    // ---------------------------------------------------------------------
    // Refunds (if soft-cap not met)
    // ---------------------------------------------------------------------
    function refund() external nonReentrant {
        require(mode == Mode.ESCROW && softCapEnabled, "no refunds");
        require(saleClosed, "not closed");
        require(totalContrib < softCapUSDT, "softcap met");
        uint256 a = contributed[msg.sender];
        require(a > 0, "zero");
        contributed[msg.sender] = 0;
        require(USDT.transfer(msg.sender, a), "xfer");
        emit Refunded(msg.sender, a);
    }
}
