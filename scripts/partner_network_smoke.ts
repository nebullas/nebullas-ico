import { ethers } from "hardhat";
import * as fs from "fs";

const dec = 18n;
const U = (x: string) => ethers.parseUnits(x, Number(dec));

async function main() {
  const RPC = process.env.RPC_BSC_TESTNET || "https://data-seed-prebsc-1-s1.binance.org:8545";
  const PK  = process.env.DEPLOYER_KEY!;
  const p   = JSON.parse(fs.readFileSync("addresses/testnet.json","utf8"));

  const provider = new ethers.JsonRpcProvider(RPC);
  const admin    = new ethers.Wallet(PK, provider);

  const USDT = await ethers.getContractAt("MockUSDT", p.usdt, admin);
  const REG  = await ethers.getContractAt("PartnerRegistry", p.reg, admin);
  const TREE = await ethers.getContractAt("PartnerTree", p.tree, admin);
  const SALE = await ethers.getContractAt("NBLSaleV5",    p.sale, admin);
  const POOL = await ethers.getContractAt("PoolVault",    p.pool, admin);

  // --- 1) तीन नए अकाउंट (testnet‑only, ephemeral)
  const A = ethers.Wallet.createRandom().connect(provider); // Partner A (L1)
  const B = ethers.Wallet.createRandom().connect(provider); // Partner B (L2)
  const C = ethers.Wallet.createRandom().connect(provider); // Buyer C
  console.log("Partner A:", A.address);
  console.log("Partner B:", B.address);
  console.log("Buyer   C:", C.address);

  // --- 2) गैस + USDT फंडिंग
  const gas = ethers.parseEther("0.02");
  await (await admin.sendTransaction({to: A.address, value: gas})).wait();
  await (await admin.sendTransaction({to: B.address, value: gas})).wait();
  await (await admin.sendTransaction({to: C.address, value: gas})).wait();
  const seed = U("200");
  await (await USDT.transfer(A.address, seed)).wait();
  await (await USDT.transfer(B.address, seed)).wait();
  await (await USDT.transfer(C.address, seed)).wait();

  // --- 3) KYC enable
  await (await REG.setKYC(A.address, true)).wait();
  await (await REG.setKYC(B.address, true)).wait();
  await (await REG.setKYC(C.address, true)).wait();

  // --- 4) A/B 10 NBL खरीदें ताकि eligibility पूरी हो
  const A_USDT = USDT.connect(A);
  const B_USDT = USDT.connect(B);
  const C_USDT = USDT.connect(C);

  const ten = U("10"); // 10 USDT  (MockUSDT has 18 decimals)
  await (await A_USDT.approve(p.sale, ten)).wait();
  await (await B_USDT.approve(p.sale, ten)).wait();
  await (await SALE.connect(A).buy(ten, A.address)).wait();
  await (await SALE.connect(B).buy(ten, B.address)).wait();

  // --- 5) Partner Program onboarding
  await (await REG.connect(A).applyAsPartner()).wait();
  await (await REG.connect(B).applyAsPartner()).wait();
  await (await REG.approve(A.address, true)).wait();
  await (await REG.approve(B.address, true)).wait();

  // --- 6) Partner Tree bind: C -> A -> B
  await (await TREE.bindReferrer(A.address, B.address)).wait();
  await (await TREE.bindReferrer(C.address, A.address)).wait();

  // --- 7) Buyer C की खरीद (100 USDT) → Partner Income split + Pool accrue
  const buyAmt = U("100");
  await (await C_USDT.approve(p.sale, buyAmt)).wait();

  // balances pre
  const treAddr = await SALE.treasury();
  const balA0 = await USDT.balanceOf(A.address);
  const balB0 = await USDT.balanceOf(B.address);
  const balT0 = await USDT.balanceOf(treAddr);

  await (await SALE.connect(C).buy(buyAmt, C.address)).wait();

  // balances post
  const balA1 = await USDT.balanceOf(A.address);
  const balB1 = await USDT.balanceOf(B.address);
  const balT1 = await USDT.balanceOf(treAddr);
  const balPoolBeforeSeal = await USDT.balanceOf(p.pool);

  console.log("ΔA (expected ~8% of 100):", (balA1 - balA0).toString());
  console.log("ΔB (expected ~1% of 100):", (balB1 - balB0).toString());
  console.log("ΔTreasury               :", (balT1 - balT0).toString());
  console.log("Pool balance before seal:", balPoolBeforeSeal.toString());

  // --- 8) Pool epoch seal (VIP:Elite = 2:3) + claims (single-leaf Merkle trees)
  // Ensure epoch 1 exists/bound
  const now = Math.floor(Date.now()/1000);
  try { await (await POOL.initEpoch(1, now-60, now + 30*24*3600)).wait(); } catch {}
  await (await SALE.setEpoch(1)).wait();

  // VIP share = 40%, Elite = 60% (2:3)
  const vipAmt   = (balPoolBeforeSeal * 2n) / 5n;
  const eliteAmt = balPoolBeforeSeal - vipAmt;

  const abi  = ethers.AbiCoder.defaultAbiCoder();
  const vipLeaf   = ethers.keccak256(abi.encode(["address","uint256"], [A.address, vipAmt]));
  const eliteLeaf = ethers.keccak256(abi.encode(["address","uint256"], [B.address, eliteAmt]));

  // Seal
  await (await POOL.sealEpoch(1, vipLeaf, eliteLeaf)).wait();

  // Claims (proof = [])
  const balA2_0 = await USDT.balanceOf(A.address);
  const balB2_0 = await USDT.balanceOf(B.address);
  await (await POOL.connect(A).claimVIP(1, vipAmt, [])).wait();
  await (await POOL.connect(B).claimElite(1, eliteAmt, [])).wait();
  const balA2_1 = await USDT.balanceOf(A.address);
  const balB2_1 = await USDT.balanceOf(B.address);

  console.log("VIP claim to A (Δ):   ", (balA2_1 - balA2_0).toString());
  console.log("Elite claim to B (Δ): ", (balB2_1 - balB2_0).toString());

  // Save ephemeral addresses for audit
  fs.writeFileSync("addresses/partner-smoke.json", JSON.stringify({A: A.address, B: B.address, C: C.address}, null, 2));
  console.log("Partner network smoke completed.");
}

main().catch((e)=>{ console.error(e); process.exit(1); });
