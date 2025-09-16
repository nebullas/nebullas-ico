import { ethers } from "hardhat";
import fs from "fs";

type Phase = { start: number; end: number; price: bigint; cap: bigint; sold: bigint };

async function main() {
  const addrs = JSON.parse(fs.readFileSync("addresses/testnet.json","utf8"));
  const SALE = await ethers.getContractAt("NBLSaleV5", addrs.SALE);

  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const day = 24 * 3600;

  const mk = (offsetDays: number, lenDays: number, price: string, cap: string): Phase => ({
    start: now + offsetDays * day,
    end:   now + (offsetDays + lenDays) * day,
    price: ethers.parseUnits(price, 18),           // price in 18d
    cap:   ethers.parseUnits(cap, 18),             // tokens cap (18d)
    sold:  0n
  });

  // try setPhase(0..2); if not exist, addPhase instead
  let exists = true;
  try { await SALE.phases(0); } catch { exists = false; }

  const p0 = mk(0, 3, "1",   "50000000");
  const p1 = mk(3, 3, "2.5", "100000000");
  const p2 = mk(6, 3, "5",   "300000000");

  if (exists) {
    console.log("Updating existing phases to now…");
    await (await SALE.setPhase(0, p0)).wait();
    await (await SALE.setPhase(1, p1)).wait();
    await (await SALE.setPhase(2, p2)).wait();
  } else {
    console.log("No phases found; adding fresh…");
    await (await SALE.addPhase(p0)).wait();
    await (await SALE.addPhase(p1)).wait();
    await (await SALE.addPhase(p2)).wait();
  }
  console.log("✓ phases aligned to now.");
}

main().catch((e)=>{ console.error(e); process.exit(1); });
