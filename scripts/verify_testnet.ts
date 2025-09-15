import { ethers, run } from "hardhat";
import { readFileSync } from "fs";

async function main() {
  const addrs = JSON.parse(readFileSync("addresses/testnet.json", "utf8"));

  // Deployer = admin used at deployment time (same signer on GH Actions)
  const [deployer] = await ethers.getSigners();
  const admin = await deployer.getAddress();

  const cap   = ethers.parseUnits("10000000000", 18);
  const bonus = cap / 10n;

  const usdtDec = Number(process.env.USDT_DECIMALS_TESTNET || "18");
  const min = ethers.parseUnits("50", usdtDec);
  const max = ethers.parseUnits("10000", usdtDec);
  const permit2 = "0x0000000000000000000000000000000000000000";
  const treasury = process.env.TREASURY || admin;

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
    console.log(`Verifying ${item.address} ...`);
    try {
      await run("verify:verify", item as any);
    } catch (e: any) {
      const msg = e?.message || `${e}`;
      if (msg.includes("Already Verified")) {
        console.log(`Already verified: ${item.address}`);
      } else {
        console.error(e);
        throw e;
      }
    }
  }

  console.log("✅ Verification completed (where possible).");
}

main().catch((e) => { console.error(e); process.exit(1); });
