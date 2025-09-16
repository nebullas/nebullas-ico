// scripts/smoke_kyc_buy.ts
import { ethers } from "hardhat";
import fs from "fs";

const ERC20_ABI = [
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function transfer(address,uint256) returns(bool)",
  "function approve(address,uint256) returns(bool)"
];
const SALE_ABI = [
  "function buy(uint256 amt, address expectedBuyer) external",
  "function setEpoch(uint256 id) external",
  "function currentEpochId() view returns(uint256)"
];
const REG_ABI = [
  "function setKYC(address u,bool ok) external",
  "function approve(address u,bool ok) external",
  "function stateOf(address) view returns(uint8)"
];
const TREE_ABI = [
  "function bindReferrer(address user,address ref) external",
  "function referrerOf(address) view returns(address)"
];
const NBL_ABI = [
  "function balanceOf(address) view returns(uint256)"
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;

  // 1) addresses/testnet.json लोड
  const addrs = JSON.parse(fs.readFileSync("addresses/testnet.json","utf8"));
  const USDT = new ethers.Contract(addrs.USDT, ERC20_ABI, deployer);
  const SALE = new ethers.Contract(addrs.SALE, SALE_ABI, deployer);
  const REG  = new ethers.Contract(addrs.REC ?? addrs.REG ?? addrs.REGISTRY ?? addrs.REG, REG_ABI, deployer);
  const TREE = new ethers.Contract(addrs.TREE, TREE_ABI, deployer);
  const NBL  = new ethers.Contract(addrs.NBL,  NBL_ABI, deployer);

  // 2) 3 नये अकाउंट (ephemeral)
  const partnerA = ethers.Wallet.createRandom().connect(provider);
  const partnerB = ethers.Wallet.createRandom().connect(provider);
  const buyerC   = ethers.Wallet.createRandom().connect(provider);

  console.log("Partner A:", partnerA.address);
  console.log("Partner B:", partnerB.address);
  console.log("Buyer   C:", buyerC.address);

  // 3) गैस ट्रांसफ़र (बहुत छोटा)
  const tip = ethers.parseEther("0.0012");
  for (const w of [partnerA, partnerB, buyerC]) {
    await (await deployer.sendTransaction({ to: w.address, value: tip })).wait();
  }

  // 4) USDT decimals + Buyer को mUSDT
  const ud = await USDT.decimals();
  const toUSDT = (n: string) => ethers.parseUnits(n, ud);
  await (await USDT.transfer(buyerC.address, toUSDT("500"))).wait();

  // 5) KYC + Approval (admin‑only via deployer)
  for (const w of [partnerA.address, partnerB.address, buyerC.address]) {
    await (await REG.setKYC(w, true)).wait();
  }
  // केवल पार्टनर्स को approve
  await (await REG.approve(partnerA.address, true)).wait();
  await (await REG.approve(partnerB.address, true)).wait();

  // 6) Partner Tree bind (B → A, C → B)
  await (await TREE.bindReferrer(partnerB.address, partnerA.address)).wait();
  await (await TREE.bindReferrer(buyerC.address,   partnerB.address)).wait();

  // 7) Epoch id set (pool accrual visibility)
  try { await (await SALE.setEpoch(1)).wait(); } catch {}

  // 8) Buyer: approve + buy (200 USDT)
  const buyerUSDT = USDT.connect(buyerC);
  const buyerSALE = SALE.connect(buyerC);
  await (await buyerUSDT.approve(SALE.target as string, toUSDT("200"))).wait();
  await (await buyerSALE.buy(toUSDT("200"), buyerC.address)).wait();

  // 9) परिणाम लॉग
  const nblBuyer = await NBL.balanceOf(buyerC.address);
  const usdtA = await USDT.balanceOf(partnerA.address);
  const usdtB = await USDT.balanceOf(partnerB.address);

  console.log("✅ Buyer NBL:", ethers.formatUnits(nblBuyer, 18));
  console.log("✅ PartnerA USDT:", ethers.formatUnits(usdtA, ud));
  console.log("✅ PartnerB USDT:", ethers.formatUnits(usdtB, ud));
  console.log("DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
