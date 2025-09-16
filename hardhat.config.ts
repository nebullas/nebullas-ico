// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || process.env.BSCSCAN_KEY || "";

const config: HardhatUserConfig = {
  solidity: { version: "0.8.26", settings: { optimizer: { enabled: true, runs: 800 } } },
  networks: {
    bscTestnet: {
      url: process.env.RPC_BSC_TESTNET || "",
      chainId: 97,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    bsc: {
      url: process.env.RPC_BSC || "",
      chainId: 56,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },
  // Etherscan v2 (multichain) key as a single string works for all networks
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      { network: "bscTestnet", chainId: 97, urls: { apiURL: "https://api.etherscan.io/v2/api", browserURL: "https://testnet.bscscan.com" } },
      { network: "bsc",       chainId: 56, urls: { apiURL: "https://api.etherscan.io/v2/api", browserURL: "https://bscscan.com" } },
    ],
  },
};
export default config;
