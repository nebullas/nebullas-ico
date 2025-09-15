import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

// Etherscan multi-chain key (Etherscan/BscScan — v1/v2 दोनों endpoints पर चलेगा)
const ETHERSCAN_KEY =
  process.env.ETHERSCAN_API_KEY ||
  process.env.BSCSCAN_KEY ||
  "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 800 } }
  },
  networks: {
    bscTestnet: {
      url: process.env.RPC_BSC_TESTNET || "https://bsc-testnet.drpc.org",
      chainId: 97,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : []
    },
    bsc: {
      url: process.env.RPC_BSC || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : []
    }
  },
  etherscan: {
    apiKey: {
      bsc: ETHERSCAN_KEY,
      bscTestnet: ETHERSCAN_KEY
    },
    customChains: [
      {
        network: "bsc",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com"
        }
      },
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com"
        }
      }
    ]
  }
};

export default config;
