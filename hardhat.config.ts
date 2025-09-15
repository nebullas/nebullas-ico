import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || "";

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
  // ✅ Sourcify-first (no API key needed), Etherscan fallback (V2 single key) — logs में इसी की ज़रूरत दिखी
  // Sourcify disabled होने के कारण पहले skip संदेश आ रहा था; अब enable है। :contentReference[oaicite:3]{index=3}
  verify: {
    etherscan: {
      apiKey: ETHERSCAN_KEY,
      customChains: [
        { network: "bsc",        chainId: 56, urls: { apiURL: "https://api.bscscan.com/api",        browserURL: "https://bscscan.com" } },
        { network: "bscTestnet", chainId: 97, urls: { apiURL: "https://api-testnet.bscscan.com/api", browserURL: "https://testnet.bscscan.com" } },
      ],
    },
    sourcify: { enabled: true },
  },
};

export default config;
