// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
contract PoolVault is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    IERC20 public immutable USDT;
    struct Epoch { uint256 start; uint256 end; uint256 total; bytes32 vipRoot; bytes32 eliteRoot; bool sealed; }
    mapping(uint256=>Epoch) public epochs;
    mapping(uint256=>mapping(address=>bool)) public claimedVIP;
    mapping(uint256=>mapping(address=>bool)) public claimedElite;
    event Accrued(uint256 indexed epochId,uint256 amount);
    event Sealed(uint256 indexed epochId,bytes32 vipRoot,bytes32 eliteRoot);
    event Claimed(uint256 indexed epochId,address indexed user,uint256 amount,bool elite);
    constructor(address admin,IERC20 usdt){ _grantRole(DEFAULT_ADMIN_ROLE,admin); _grantRole(ADMIN_ROLE,admin); USDT=usdt; }
    function initEpoch(uint256 id,uint256 s,uint256 e) external onlyRole(ADMIN_ROLE){ require(epochs[id].end==0,"exists"); require(e>s,"range"); epochs[id]=Epoch(s,e,0,0,0,false); }
    function accrue(uint256 id,uint256 amt) external onlyRole(ADMIN_ROLE){ epochs[id].total+=amt; emit Accrued(id,amt); }
    function sealEpoch(uint256 id,bytes32 vip,bytes32 elite) external onlyRole(ADMIN_ROLE){ Epoch storage x=epochs[id]; require(!x.sealed&&x.end>0,"bad"); x.vipRoot=vip; x.eliteRoot=elite; x.sealed=true; emit Sealed(id,vip,elite); }
    function claimVIP(uint256 id,uint256 amt,bytes32[] calldata p) external { Epoch memory e=epochs[id]; require(e.sealed,"!sealed"); require(!claimedVIP[id][msg.sender],"claimed"); bytes32 leaf=keccak256(abi.encode(msg.sender,amt)); require(MerkleProof.verify(p,e.vipRoot,leaf),"proof"); claimedVIP[id][msg.sender]=true; require(USDT.transfer(msg.sender,amt),"xfer"); emit Claimed(id,msg.sender,amt,false); }
    function claimElite(uint256 id,uint256 amt,bytes32[] calldata p) external { Epoch memory e=epochs[id]; require(e.sealed,"!sealed"); require(!claimedElite[id][msg.sender],"claimed"); bytes32 leaf=keccak256(abi.encode(msg.sender,amt)); require(MerkleProof.verify(p,e.eliteRoot,leaf),"proof"); claimedElite[id][msg.sender]=true; require(USDT.transfer(msg.sender,amt),"xfer"); emit Claimed(id,msg.sender,amt,true); }
    function sweep(address to,uint256 amt) external onlyRole(ADMIN_ROLE){ require(USDT.transfer(to,amt),"xfer"); }
}
