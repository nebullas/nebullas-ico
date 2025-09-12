// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockUSDT is ERC20 { uint8 private immutable _d; constructor(uint8 d) ERC20("MockUSDT","mUSDT"){ _d=d; _mint(msg.sender, 1_000_000_000 * (10**d)); } function decimals() public view override returns(uint8){ return _d; } }
