import { run, ethers } from "hardhat";
import fs from "fs";
import path from "path";

type AddrMap = {
  USDT: string;
  NBL: string;
  REG: string;
  TREE: string;
  POOL: string;
  SALE: string;
};

async function main() {
  const p = path.join(__dirname, "..", "addresses", "testnet.json");
  const A: AddrMap = JSON.parse(fs.readFileSync(p, "utf8"));

  const admin = process.env.GUARDIAN || (await ethers.getSigners())[0].address;
  const cap = ethers.parseUnits("10000000000", 18); // 10B
  const bonus = cap / 10n; // 10% bonus pool

  const verify = async (address: string, contract: string, args: any[] = []) => {
    try {
      await run("verify:verify", { address, constructorArguments: args, contract });
      console.log(`✓ Verified ${contract} @ ${address}`);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/Already Verified/i.test(msg)) {
        console.log(`✓ Already verified ${contract} @ ${address}`);
      } else {
        console.warn(`⚠️  Verify failed for ${contract} @ ${address}: ${msg}`);
      }
    }
  };

  await verify(A.NBL,  "contracts/NBLToken.sol:NBLToken", [admin, cap, bonus]);
  await verify(A.REG,  "contracts/PartnerRegistry.sol:PartnerRegistry", [admin]);
  await verify(A.TREE, "contracts/PartnerTree.sol:PartnerTree", [admin]);
  await verify(A.POOL, "contracts/PoolVault.sol:PoolVault", [admin, A.USDT]);

  // NBLSaleV5 args: admin, nbl, usdt, reg, tree, pool, treasury, usdtDecimals, mode(0), min, max, permit2
  const usdtDec = Number(process.env.USDT_DECIMALS_TESTNET || "18");
  const min = ethers.parseUnits("50", usdtDec);
  const max = ethers.parseUnits("10000", usdtDec);
  const treasury = process.env.TREASURY!;
  const permit2 = "0x0000000000000000000000000000000000000000";

  await verify(A.SALE, "contracts/NBLSaleV5.sol:NBLSaleV5",
    [admin, A.NBL, A.USDT, A.REG, A.TREE, A.POOL, treasury, usdtDec, 0, min, max, permit2]
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
