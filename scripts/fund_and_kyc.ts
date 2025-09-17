// scripts/fund_and_kyc.ts
import { ethers } from "hardhat";
import fs from "fs";

const ERC20_ABI = [
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function transfer(address,uint256) returns(bool)"
];
const REG_ABI = [
  "function setKYC(address,bool) external",
  "function kycPassed(address) view returns(bool)"
];

async function main() {
  const to = process.env.FUND_TO as `0x${string}`;
  if (!to) throw new Error("FUND_TO is required");

  const usdtAmountStr = process.env.USDT_AMOUNT || "500"; // default 500 mUSDT
  const gasTipStr = process.env.GAS_TIP || "0.002";       // default 0.002 tBNB

  const addrs = JSON.parse(fs.readFileSync("addresses/testnet.json","utf8"));
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("FUND_TO:", to);

  // 1) small gas tip
  const tip = ethers.parseEther(gasTipStr);
  await (await deployer.sendTransaction({ to, value: tip })).wait();
  console.log("✓ sent tBNB tip:", gasTipStr);

  // 2) KYC mark
  const REG = new ethers.Contract(addrs.REG, REG_ABI, deployer);
  await (await REG.setKYC(to, true)).wait();
  console.log("✓ KYC marked true");

  // 3) transfer mUSDT
  const USDT = new ethers.Contract(addrs.USDT, ERC20_ABI, deployer);
  const dec: number = await USDT.decimals();
  const amt = ethers.parseUnits(usdtAmountStr, dec);
  await (await USDT.transfer(to, amt)).wait();
  console.log(`✓ transferred ${usdtAmountStr} USDT (dec=${dec}) to`, to);

  const bal: bigint = await USDT.balanceOf(to);
  console.log("USDT balance of buyer:", ethers.formatUnits(bal, dec));
}

main().catch((e)=>{ console.error(e); process.exit(1); });
