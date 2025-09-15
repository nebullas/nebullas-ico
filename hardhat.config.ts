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
  // ✅ यही फॉर्मेट plugin को चाहिए (लॉग में यही निर्देश है)
  // etherscan.apiKey.bscTestnet / bsc + Sourcify enable
  etherscan: {
    apiKey: {
      bscTestnet: process.env.ETHERSCAN_API_KEY || "",
      bsc:        process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [
      { network: "bscTestnet", chainId: 97, urls: { apiURL: "https://api-testnet.bscscan.com/api", browserURL: "https://testnet.bscscan.com" } },
      { network: "bsc",        chainId: 56, urls: { apiURL: "https://api.bscscan.com/api",        browserURL: "https://bscscan.com" } },
    ],
  },
  sourcify: { enabled: true }, // लॉग के निर्देशानुसार
};

export default config;
