import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const RPC = process.env.RPC_BSC_TESTNET || "https://data-seed-prebsc-1-s1.binance.org:8545";
  const pk  = process.env.DEPLOYER_KEY!;
  const p   = JSON.parse(fs.readFileSync("addresses/testnet.json","utf8"));

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(pk, provider);

  const USDT = await ethers.getContractAt("MockUSDT", p.usdt, wallet);
  const REG  = await ethers.getContractAt("PartnerRegistry", p.reg, wallet);
  const SALE = await ethers.getContractAt("NBLSaleV5", p.sale, wallet);
  const POOL = await ethers.getContractAt("PoolVault", p.pool, wallet);

  console.log("Buyer/Deployer:", wallet.address);

  // 1) Epoch init (id=1) + bind to sale
  const now = Math.floor(Date.now()/1000);
  try { await (await POOL.initEpoch(1, now, now + 30*24*3600)).wait(); } catch {}
  await (await SALE.setEpoch(1)).wait();

  // 2) KYC enable
  await (await REG.setKYC(wallet.address, true)).wait();

  // 3) Approve USDT + Buy (100 USDT @ 18d Mock decimals)
  const amt = ethers.parseUnits("100", 18);
  await (await USDT.approve(p.sale, amt)).wait();
  await (await SALE.buy(amt, wallet.address)).wait();

  console.log("Smoke OK: KYC+BUY complete");
}
main().catch((e)=>{ console.error(e); process.exit(1); });
