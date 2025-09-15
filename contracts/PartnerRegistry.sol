// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
contract PartnerRegistry is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    enum State { NOT_ELIGIBLE, ELIGIBLE, PENDING, APPROVED, REJECTED, SUSPENDED }
    mapping(address=>bool)  public kycPassed;
    mapping(address=>State) public stateOf;
    mapping(address=>uint256) public cumulativePurchasedNBL; // 18d
    event KYCUpdated(address indexed u,bool ok); event StateChanged(address indexed u, State prev, State next);
    constructor(address admin){ _grantRole(DEFAULT_ADMIN_ROLE,admin); _grantRole(ADMIN_ROLE,admin); }
    function setKYC(address u,bool ok) external onlyRole(ADMIN_ROLE){ kycPassed[u]=ok; emit KYCUpdated(u,ok); _flip(u); }
    function notePurchase(address u,uint256 nbl) external onlyRole(ADMIN_ROLE){ cumulativePurchasedNBL[u]+=nbl; _flip(u); }
    function _flip(address u) internal { if(stateOf[u]==State.NOT_ELIGIBLE && kycPassed[u] && cumulativePurchasedNBL[u]>=10 ether){ stateOf[u]=State.ELIGIBLE; emit StateChanged(u,State.NOT_ELIGIBLE,State.ELIGIBLE);} }
    function applyAsPartner() external {
    require(kycPassed[msg.sender], "KYC");
    State s = stateOf[msg.sender];
    require(s == State.ELIGIBLE || s == State.REJECTED, "not eligible");
    stateOf[msg.sender] = State.PENDING;
    emit StateChanged(msg.sender, s, State.PENDING);
}

    function approve(address u,bool ok) external onlyRole(ADMIN_ROLE){ State p=stateOf[u]; stateOf[u]= ok? State.APPROVED:State.REJECTED; emit StateChanged(u,p,stateOf[u]); }
    function suspend(address u,bool s) external onlyRole(ADMIN_ROLE){ State p=stateOf[u]; stateOf[u]= s? State.SUSPENDED:State.APPROVED; emit StateChanged(u,p,stateOf[u]); }
}
