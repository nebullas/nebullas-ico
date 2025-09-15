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
      url: process.env.RPC_BSC_TESTNET || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    bsc: {
      url: process.env.RPC_BSC || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },

  /**
   * ✅ New‑style Verify config:
   *  - Etherscan V2 (single key works across supported chains incl. BSC)
   *  - Sourcify fallback (no API key needed)
   */
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
    sourcify: {
      enabled: true,
    },
  },
};

export default config;
