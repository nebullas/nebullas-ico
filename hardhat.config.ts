import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 800 } },
  },
  networks: {
    bscTestnet: {
      url: process.env.RPC_BSC_TESTNET || "https://bsc-testnet.publicnode.com",
      chainId: 97,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    bsc: {
      url: process.env.RPC_BSC || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },
  // BscScan key न हो तो भी OK (verify step skip हो जाएगा)
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_KEY || "",
      bsc: process.env.BSCSCAN_KEY || "",
    },
  },
};

export default config;
