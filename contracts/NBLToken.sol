// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
contract NBLToken is ERC20, ERC20Permit, ERC20Burnable, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant CAP_ADMIN_ROLE= keccak256("CAP_ADMIN_ROLE");
    uint256 public immutable CAP; uint256 public bonusCap; uint256 public bonusMinted;
    constructor(address admin, uint256 cap, uint256 bonusCap_) ERC20("Nebullas","NBL") ERC20Permit("Nebullas") {
        require(cap>0,"cap=0"); CAP=cap; bonusCap=bonusCap_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin); _grantRole(MINTER_ROLE, admin); _grantRole(PAUSER_ROLE, admin); _grantRole(CAP_ADMIN_ROLE, admin);
    }
    function pause() external onlyRole(PAUSER_ROLE){ _pause(); } function unpause() external onlyRole(PAUSER_ROLE){ _unpause(); }
    function mint(address to,uint256 amt) external onlyRole(MINTER_ROLE) whenNotPaused { require(totalSupply()+amt<=CAP,"cap exceeded"); _mint(to,amt); }
    function mintBonus(address to,uint256 amt) external onlyRole(MINTER_ROLE) whenNotPaused { require(bonusMinted+amt<=bonusCap,"bonus cap exceeded"); bonusMinted+=amt; _mint(to,amt); }
    function reduceBonusCap(uint256 x) external onlyRole(CAP_ADMIN_ROLE){ require(x<=bonusCap && x>=bonusMinted,"bounds"); bonusCap=x; }
    function _update(address f,address t,uint256 v) internal override whenNotPaused { super._update(f,t,v); }
}
