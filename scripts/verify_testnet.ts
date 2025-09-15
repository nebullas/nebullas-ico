import { run, ethers } from "hardhat";
import * as fs from "fs";

async function verify(addr: string, args: any[] = []) {
  try {
    await run("verify:verify", { address: addr, constructorArguments: args });
    console.log("✓ verified:", addr);
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg.includes("Already Verified")) {
      console.log("✓ already verified:", addr);
    } else {
      console.error("✗ verify failed:", addr, msg);
      throw e;
    }
  }
}

async function main() {
  const p = JSON.parse(fs.readFileSync("addresses/testnet.json", "utf8"));

  // Constructor args — deploy_testnet.ts के अनुसार
  const cap   = ethers.parseUnits("10000000000", 18); // 10B
  const bonus = cap / 10n;                            // 10% bonus pool
  const [deployer] = await (ethers as any).getSigners();

  // NBLToken(admin, cap, bonusCap)
  await verify(p.nbl,  [deployer.address, cap, bonus]);

  // PartnerRegistry(admin)
  await verify(p.reg,  [deployer.address]);

  // PartnerTree(admin)
  await verify(p.tree, [deployer.address]);

  // PoolVault(admin, usdt)
  await verify(p.pool, [deployer.address, p.usdt]);

  // NBLSaleV5(
  //   admin, nbl, usdt, reg, tree, pool, treasury,
  //   usdtDecimals, mode(0=INSTANT), min, max, permit2
  // )
  const usdtDecimals = 18;
  const mode         = 0;
  const min          = ethers.parseUnits("50", usdtDecimals);
  const max          = ethers.parseUnits("10000", usdtDecimals);
  const treasury     = process.env.TREASURY || deployer.address;
  const permit2      = "0x0000000000000000000000000000000000000000";

  await verify(p.sale, [
    deployer.address, p.nbl, p.usdt, p.reg, p.tree, p.pool,
    treasury, usdtDecimals, mode, min, max, permit2
  ]);
}

main().catch((e) => { console.error(e); process.exit(1); });
