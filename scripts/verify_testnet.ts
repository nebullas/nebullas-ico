import { ethers, run } from "hardhat";
import { readFileSync } from "fs";

async function main() {
  const a = JSON.parse(readFileSync("addresses/testnet.json","utf8"));

  const admin  = a.ADMIN || "0xE77F94010Fb3B01431E18015A1c9A56F74e79998";
  const cap    = ethers.parseUnits("10000000000",18);
  const bonus  = cap / 10n;
  const dec    = 18;
  const min    = ethers.parseUnits("50", dec);
  const max    = ethers.parseUnits("10000", dec);
  const permit = "0x0000000000000000000000000000000000000000";
  const treas  = "0x05A5bc620D55708776c8B52f38A3F5bf0b9DC420";

  const items = [
    { address: a.NBL,  constructorArguments: [admin, cap, bonus] },
    { address: a.REG,  constructorArguments: [admin] },
    { address: a.TREE, constructorArguments: [admin] },
    { address: a.POOL, constructorArguments: [admin, a.USDT] },
    { address: a.SALE, constructorArguments: [admin, a.NBL, a.USDT, a.REG, a.TREE, a.POOL, treas, dec, 0, min, max, permit] },
  ];

  for (const it of items) {
    if (!it.address) continue;
    try { await run("verify:verify", it as any); console.log("✓", it.address); }
    catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("Already Verified")) { console.log("✓ already", it.address); }
      else { console.warn("…skip", it.address, msg); }
    }
  }
  console.log("✅ Verification completed.");
}
main().catch(e => { console.error(e); process.exit(1); });
