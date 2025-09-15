import { ethers } from "hardhat";
import * as fs from "fs";

// ===== Helpers =====
const U = (x: string, d = 18) => ethers.parseUnits(x, d);

async function main() {
  // ---- Env / Network ----
  const RPC = process.env.RPC_BSC_TESTNET || "https://data-seed-prebsc-1-s1.binance.org:8545";
  const PK  = process.env.DEPLOYER_KEY!;
  if (!PK) throw new Error("DEPLOYER_KEY missing in env");

  // addresses/testnet.json is the single source of truth
  const p = JSON.parse(fs.readFileSync("addresses/testnet.json", "utf8"));

  const provider = new ethers.JsonRpcProvider(RPC);
  const admin    = new ethers.Wallet(PK, provider);

  // ---- Contracts ----
  const USDT = await ethers.getContractAt("MockUSDT",        p.usdt, admin);
  const REG  = await ethers.getContractAt("PartnerRegistry", p.reg,  admin);
  const TREE = await ethers.getContractAt("PartnerTree",     p.tree, admin);
  const SALE = await ethers.getContractAt("NBLSaleV5",       p.sale, admin);
  const POOL = await ethers.getContractAt("PoolVault",       p.pool, admin);

  // ---- Ephemeral actors ----
  const A = ethers.Wallet.createRandom().connect(provider); // Partner A (L1)
  const B = ethers.Wallet.createRandom().connect(provider); // Partner B (L2)
  const C = ethers.Wallet.createRandom().connect(provider); // Buyer C

  console.log("Partner A:", A.address);
  console.log("Partner B:", B.address);
  console.log("Buyer   C:", C.address);

  // ---- Gas funding (minimal but safe) ----
  async function fundGas(to: string, targetEther = "0.003") {
    const target = ethers.parseEther(targetEther);
    const bal    = await provider.getBalance(admin.address);
    // keep tiny buffer so admin can still submit own txs
    const buffer = ethers.parseEther("0.002");
    const send   = bal > target + buffer ? target : ethers.parseEther("0.001");
    await (await admin.sendTransaction({ to, value: send })).wait();
  }
  await fundGas(A.address);
  await fundGas(B.address);
  await fundGas(C.address);

  // ---- Seed test USDT for buys (MockUSDT minted to admin) ----
  const seed = U("200", 18);
  await (await USDT.transfer(A.address, seed)).wait();
  await (await USDT.transfer(B.address, seed)).wait();
  await (await USDT.transfer(C.address, seed)).wait();

  // ---- KYC enable (admin role holds REG.ADMIN_ROLE) ----
  await (await REG.setKYC(A.address, true)).wait();
  await (await REG.setKYC(B.address, true)).wait();
  await (await REG.setKYC(C.address, true)).wait();

  // ---- Epoch (id=1) init + bind to sale ----
  const now = Math.floor(Date.now() / 1000);
  try { await (await POOL.initEpoch(1, now - 60, now + 30 * 24 * 3600)).wait(); } catch { /* already exists */ }
  await (await SALE.setEpoch(1)).wait();

  // ---- A/B eligibility buy using on-chain minUSDT (fix for "bounds") ----
  const min = await SALE.minUSDT(); // raw USDT (MockUSDT=18d)
  const A_USDT = USDT.connect(A);
  const B_USDT = USDT.connect(B);
  await (await A_USDT.approve(p.sale, min)).wait();
  await (await B_USDT.approve(p.sale, min)).wait();
  await (await SALE.connect(A).buy(min, A.address)).wait(); // makes A 'ELIGIBLE' (10+ NBL depending on phase price)
  await (await SALE.connect(B).buy(min, B.address)).wait(); // makes B 'ELIGIBLE'

  // ---- Partner Program onboarding: apply -> approve (supports both names) ----
  async function applyPartner(user: typeof A) {
    const r = REG.connect(user) as any;
    try {
      if (typeof r.applyAsPartner === "function") {
        await (await r.applyAsPartner()).wait();
        return;
      }
    } catch { /* fallthrough to apply() */ }
    await (await r.apply()).wait();
  }
  await applyPartner(A);
  await applyPartner(B);
  await (await REG.approve(A.address, true)).wait();
  await (await REG.approve(B.address, true)).wait();

  // ---- Partner Tree bind (C -> A -> B) ----
  try { await (await TREE.bindReferrer(A.address, B.address)).wait(); } catch { /* already bound */ }
  try { await (await TREE.bindReferrer(C.address, A.address)).wait(); } catch { /* already bound */ }

  // ---- Buyer C purchase (100 USDT) → Partner Income + Pool accrue ----
  const C_USDT = USDT.connect(C);
  const buyAmt = U("100", 18);
  await (await C_USDT.approve(p.sale, buyAmt)).wait();

  const treasury = await SALE.treasury();
  const balA0 = await USDT.balanceOf(A.address);
  const balB0 = await USDT.balanceOf(B.address);
  const balT0 = await USDT.balanceOf(treasury);

  await (await SALE.connect(C).buy(buyAmt, C.address)).wait();

  const balA1 = await USDT.balanceOf(A.address);
  const balB1 = await USDT.balanceOf(B.address);
  const balT1 = await USDT.balanceOf(treasury);

  console.log("ΔA (expected ~8% of 100):", (balA1 - balA0).toString());
  console.log("ΔB (expected ~1% of 100):", (balB1 - balB0).toString());
  console.log("ΔTreasury               :", (balT1 - balT0).toString());

  // ---- Pool seal (VIP:Elite = 2:3) + claim ----
  const poolBal = await USDT.balanceOf(p.pool);
  console.log("Pool balance before seal:", poolBal.toString());
  const vipAmt   = (poolBal * 2n) / 5n;      // 40%
  const eliteAmt = poolBal - vipAmt;         // 60%

  const abi = ethers.AbiCoder.defaultAbiCoder();
  const vipLeaf   = ethers.keccak256(abi.encode(["address", "uint256"], [A.address, vipAmt]));
  const eliteLeaf = ethers.keccak256(abi.encode(["address", "uint256"], [B.address, eliteAmt]));

  // seal epoch with single-leaf roots → empty proof valid (leaf == root)
  await (await POOL.sealEpoch(1, vipLeaf, eliteLeaf)).wait();

  const balA2_0 = await USDT.balanceOf(A.address);
  const balB2_0 = await USDT.balanceOf(B.address);
  await (await POOL.connect(A).claimVIP(1, vipAmt, [])).wait();
  await (await POOL.connect(B).claimElite(1, eliteAmt, [])).wait();
  const balA2_1 = await USDT.balanceOf(A.address);
  const balB2_1 = await USDT.balanceOf(B.address);

  console.log("VIP claim to A (Δ):   ", (balA2_1 - balA2_0).toString());
  console.log("Elite claim to B (Δ): ", (balB2_1 - balB2_0).toString());

  // ---- Save ephemeral addresses (for audit/debug)
  fs.writeFileSync(
    "addresses/partner-smoke.json",
    JSON.stringify({ A: A.address, B: B.address, C: C.address }, null, 2)
  );

  console.log("Partner network smoke completed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
