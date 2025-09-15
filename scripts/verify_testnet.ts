import { ethers, run } from "hardhat";
import { readFileSync } from "fs";

function envOr<T>(v: T | undefined, fb: T): T {
  return (v !== undefined && v !== null && (v as any) !== "") ? v : fb;
}

async function main() {
  const addrs = JSON.parse(readFileSync("addresses/testnet.json", "utf8"));

  // Admin address: prefer JSON.ADMIN, else DEPLOYER_ADDR env, else SALE deployer fallback (your known)
  const admin =
    addrs.ADMIN ||
    process.env.DEPLOYER_ADDR ||
    "0xE77F94010Fb3B01431E18015A1c9A56F74e79998";

  const cap   = ethers.parseUnits("10000000000", 18); // 10B
  const bonus = cap / 10n;                            // 10%

  const usdtDec = Number(envOr(process.env.USDT_DECIMALS_TESTNET, "18"));
  const min     = ethers.parseUnits("50", usdtDec);
  const max     = ethers.parseUnits("10000", usdtDec);
  const permit2 = "0x0000000000000000000000000000000000000000";
  const treasury = envOr(process.env.TREASURY, "0x05A5bc620D55708776c8B52f38A3F5bf0b9DC420");

  const queue = [
    { address: addrs.NBL,  constructorArguments: [admin, cap, bonus] },
    { address: addrs.REG,  constructorArguments: [admin] },
    { address: addrs.TREE, constructorArguments: [admin] },
    { address: addrs.POOL, constructorArguments: [admin, addrs.USDT] },
    {
      address: addrs.SALE,
      constructorArguments: [
        admin, addrs.NBL, addrs.USDT, addrs.REG, addrs.TREE, addrs.POOL,
        treasury, usdtDec, 0 /* Mode.INSTANT */, min, max, permit2
      ],
    },
  ];

  for (const item of queue) {
    if (!item.address) { console.log(`skip empty address item`); continue; }
    console.log(`Verifying ${item.address} ...`);
    try {
      await run("verify:verify", item as any);
      console.log(`✓ verified: ${item.address}`);
    } catch (e: any) {
      const msg = e?.message || `${e}`;
      if (msg.includes("Already Verified")) {
        console.log(`✓ already verified: ${item.address}`);
      } else {
        console.error(`✗ verify failed for ${item.address}:`, msg);
        // Do not throw — continue with others so that partial verify succeeds
      }
    }
  }
  console.log("✅ Verification completed (Sourcify first, Etherscan if key present).");
}

main().catch((e) => { console.error(e); process.exit(1); });
