// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
contract PartnerTree is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    mapping(address=>address) public referrerOf;
    event ReferrerBound(address indexed user,address indexed referrer);
    constructor(address admin){ _grantRole(DEFAULT_ADMIN_ROLE,admin); _grantRole(ADMIN_ROLE,admin); }
    function bindReferrer(address user,address ref) external onlyRole(ADMIN_ROLE){
        require(user!=address(0)&&ref!=address(0),"zero"); require(ref!=user,"self"); require(referrerOf[user]==address(0),"locked");
        address cur=ref; for(uint256 i=0;i<6;i++){ if(cur==address(0)) break; require(cur!=user,"cycle"); cur=referrerOf[cur]; }
        referrerOf[user]=ref; emit ReferrerBound(user,ref);
    }
    function uplines(address u) external view returns(address[6] memory ch){ address cur=referrerOf[u]; for(uint8 i=0;i<6;i++){ ch[i]=cur; if(cur==address(0)) break; cur=referrerOf[cur]; } }
}
