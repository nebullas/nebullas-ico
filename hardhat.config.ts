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
  etherscan: {
    // NOTE: Hardhat-verify picks per-network key. We coalesce to one env var.
    apiKey: {
      bsc:       process.env.ETHERSCAN_API_KEY || process.env.BSCSCAN_KEY || "",
      bscTestnet:process.env.ETHERSCAN_API_KEY || process.env.BSCSCAN_KEY || "",
      // (Optionally add mainnet/sepolia keys here if needed)
    },
    // customChains can be added if you point to non-default explorers.
  },
};

export default config;
