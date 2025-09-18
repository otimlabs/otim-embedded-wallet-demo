import { baseSepolia, sepolia } from "viem/chains";

export const CHAIN_CONFIG = {
  "base-sepolia": {
    chain: baseSepolia,
    rpc: "https://sepolia.base.org",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  "sepolia": {
    chain: sepolia,
    rpc: "https://1rpc.io/sepolia",
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
} as const;

export type SupportedChain = keyof typeof CHAIN_CONFIG;
