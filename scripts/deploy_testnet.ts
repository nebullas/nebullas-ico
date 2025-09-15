import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv"; dotenv.config();

async function main(){
  const [deployer] = await ethers.getSigners(); console.log("Deployer:", deployer.address);
  const USDT_DEC = Number(process.env.USDT_DECIMALS_TESTNET || "18");
  let usdtAddr = process.env.USDT_ADDRESS_TESTNET;
  if(!usdtAddr || usdtAddr===""){
    const Mock = await (await ethers.getContractFactory("MockUSDT")).deploy(USDT_DEC);
    await Mock.waitForDeployment(); usdtAddr = Mock.target as string; console.log("MockUSDT:", usdtAddr);
  }
  const cap = ethers.parseUnits("10000000000",18); const bonus = cap/10n;
  const NBL = await (await ethers.getContractFactory("NBLToken")).deploy(deployer.address, cap, bonus); await NBL.waitForDeployment();
  const REG = await (await ethers.getContractFactory("PartnerRegistry")).deploy(deployer.address); await REG.waitForDeployment();
  const TREE= await (await ethers.getContractFactory("PartnerTree")).deploy(deployer.address); await TREE.waitForDeployment();
  const POOL= await (await ethers.getContractFactory("PoolVault")).deploy(deployer.address, usdtAddr!); await POOL.waitForDeployment();

  const min = ethers.parseUnits("50",USDT_DEC); const max = ethers.parseUnits("10000",USDT_DEC);
  const permit2 = process.env.PERMIT2 && process.env.PERMIT2!=="" ? process.env.PERMIT2 : "0x0000000000000000000000000000000000000000";
  const SALE= await (await ethers.getContractFactory("NBLSaleV5")).deploy(
    deployer.address, NBL.target as string, usdtAddr!, REG.target as string, TREE.target as string, POOL.target as string,
    process.env.TREASURY || deployer.address, USDT_DEC, 0, min, max, permit2 as `0x${string}`
  ); await SALE.waitForDeployment();

  await (await NBL.grantRole(await NBL.MINTER_ROLE(), SALE.target)).wait();
  await (await NBL.grantRole(await NBL.PAUSER_ROLE(), process.env.GUARDIAN || deployer.address)).wait();
  await (await POOL.grantRole(await POOL.ADMIN_ROLE(), SALE.target)).wait();
  await (await REG.grantRole(await REG.ADMIN_ROLE(), SALE.target)).wait();

  const now=(await ethers.provider.getBlock("latest"))!.timestamp;
  const add=(o:number,d:number,p:string,c:string)=>({start:now+o,end:now+o+d*24*3600,price:ethers.parseUnits(p,18),cap:ethers.parseUnits(c,18),sold:0});
  await (await SALE.addPhase(add(0,3,"1","50000000"))).wait();
  await (await SALE.addPhase(add(3*24*3600,3,"2.5","100000000"))).wait();
  await (await SALE.addPhase(add(6*24*3600,3,"5","300000000"))).wait();

  console.log("USDT:", usdtAddr);
  console.log("NBL:", NBL.target);
  console.log("REG:", REG.target);
  console.log("TREE:", TREE.target);
  console.log("POOL:", POOL.target);
  console.log("SALE:", SALE.target);

  // 🔽 Snapshot → addresses/testnet.json
  const snapshot = {
    network: "bscTestnet",
    USDT: usdtAddr!,
    NBL:  NBL.target as string,
    REG:  REG.target as string,
    TREE: TREE.target as string,
    POOL: POOL.target as string,
    SALE: SALE.target as string,
    USDT_DECIMALS: USDT_DEC,
    ADMIN: deployer.address,
    TREASURY: process.env.TREASURY || deployer.address
  };
  fs.mkdirSync(path.join(process.cwd(),"addresses"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(),"addresses","testnet.json"), JSON.stringify(snapshot,null,2));
  console.log("addresses/testnet.json written.");
}
main().catch((e)=>{ console.error(e); process.exit(1); });
