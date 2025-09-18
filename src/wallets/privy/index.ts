import { config } from "dotenv";
import { PrivyClient } from "@privy-io/server-auth";
import { createWalletClient, createPublicClient, http } from "viem";
import { createOtimClient, createRlpEncodedAuthorization } from "@otim/sdk";
import { parseUnits } from "viem";
import { checkUSDCBalance } from '../../utils/balance';
import { askQuestion } from '../../utils/input';
import { monitorTransferBalances } from '../../utils/monitor';
import { CHAIN_CONFIG, type SupportedChain } from '../../utils/constants';

config();

// ===== Configuration =====
// Environment variables
const CHAIN_NAME = process.env.CHAIN_NAME as SupportedChain;
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const CREATE_NEW_WALLET = process.env.CREATE_NEW_WALLET === 'true';

// Validation
if (!CHAIN_NAME) throw new Error("CHAIN_NAME environment variable is required");
if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  throw new Error("Missing required Privy environment variables");
}

// Chain configuration
const chainConfig = CHAIN_CONFIG[CHAIN_NAME];
if (!chainConfig) throw new Error(`Unsupported chain: ${CHAIN_NAME}`);

const { chain: CHAIN, rpc: RPC_URL, usdcAddress: USDC_CONTRACT_ADDRESS } = chainConfig;

async function main() {
  try {
    // ===== STEP 1: Initialize Privy Client =====
    // Create Privy client with app credentials following the setup guide
    const privyClient = new PrivyClient(PRIVY_APP_ID!, PRIVY_APP_SECRET!);

    // ===== STEP 2: Wallet Management =====
    // Get existing wallets or create new one based on CREATE_NEW_WALLET flag
    
    let accountAddress: string;
    let walletId: string;
    
    if (!CREATE_NEW_WALLET) {
      // Try to get existing wallets (Privy doesn't have a direct getWallets method, so we'll create a new one for now)
      // Note: Privy's server SDK doesn't expose a way to list existing wallets
      // In a real implementation, you might store wallet IDs in a database
      console.log("CREATE_NEW_WALLET is false, but Privy server SDK doesn't support listing existing wallets");
      console.log("Creating a new wallet instead...");
    }
    
    try {
      // Create a wallet using the walletApi as shown in the quickstart
      const { id, address, chainType } = await privyClient.walletApi.createWallet({
        chainType: 'ethereum'
      });
      
      walletId = id;
      accountAddress = address;
      
      console.log(`Created embedded wallet: ${accountAddress}`);
      console.log(`Wallet ID: ${walletId}`);
      console.log(`Chain Type: ${chainType}`);
      
    } catch (error) {
      console.error("Failed to create wallet:", error);
      throw error;
    }

    // ===== STEP 3: Setup Viem with Privy Account =====
    // Create Viem clients for blockchain interaction
    const walletClient = createWalletClient({
      account: accountAddress as `0x${string}`,
      chain: CHAIN,
      transport: http(RPC_URL)
    });
    
    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(RPC_URL)
    });

    // ===== STEP 4: Initialize Otim Client =====
    // Create a clean wallet client for Otim (without overridden methods)
    const cleanWalletClient = createWalletClient({
      account: accountAddress as `0x${string}`,
      chain: CHAIN,
      transport: http(RPC_URL)
    });

    // Override the clean wallet client methods to use Privy's walletApi for signing
    cleanWalletClient.signMessage = async (args: any) => {
      const { signature } = await privyClient.walletApi.ethereum.signMessage({
        walletId,
        message: args.message
      });
      return signature as `0x${string}`;
    };

    cleanWalletClient.signTypedData = async (args: any) => {
      // Recursively convert all BigInt values to hex strings for Privy's API
      const sanitizeBigInts = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'bigint') return `0x${obj.toString(16)}`;
        if (Array.isArray(obj)) return obj.map(sanitizeBigInts);
        if (typeof obj === 'object') {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeBigInts(value);
          }
          return sanitized;
        }
        return obj;
      };
      
      const sanitizedTypedData = sanitizeBigInts({
        domain: args.domain,
        types: args.types,
        primaryType: args.primaryType,
        message: args.message
      });
      
      const { signature } = await privyClient.walletApi.ethereum.signTypedData({
        walletId,
        typedData: sanitizedTypedData
      });
      return signature as `0x${string}`;
    };

    // Create Otim client with clean wallet client
    const otimClient = createOtimClient({ walletClient: cleanWalletClient });
    
    // Login to Otim using SIWE (Sign-In with Ethereum)
    const loginResponse = await otimClient.auth.login({
      domain: "otim.com", 
      uri: "https://app.otim.com", 
      address: accountAddress as `0x${string}`, 
      chainId: CHAIN.id
    });
    
    // Set authorization header for subsequent Otim API calls
    await otimClient.auth.setAuthorizationHeader(loginResponse.authorization);

    // ===== STEP 5: Otim Delegation =====
    // Check if wallet is already delegated to Otim
    const status = await otimClient.delegation.getDelegationStatus({ 
      address: accountAddress as `0x${string}`, 
      chainId: CHAIN.id 
    });
    
    if (!(status.delegationStatus === "Delegated" || status.delegationStatus === "Pending")) {
      // Get Otim delegate contract address
      const config = await otimClient.config.getDelegateAddress({ 
        chainId: CHAIN.id 
      });
      
      // Get current nonce for authorization
      const nonce = await publicClient.getTransactionCount({ 
        address: accountAddress as `0x${string}` 
      });
      
      // Sign delegation authorization using Privy's EIP-7702 authorization method
      const authResponse = await privyClient.walletApi.ethereum.sign7702Authorization({
        walletId,
        contract: config.otimDelegateAddress as `0x${string}`,
        chainId: CHAIN.id,
        nonce
      });
      
      // Convert Privy's response to the format expected by Otim
      // The address should be the contract address (delegate contract), not the wallet address
      const authorization = {
        address: config.otimDelegateAddress as `0x${string}`,
        chainId: CHAIN.id,
        nonce,
        r: authResponse.r,
        s: authResponse.s,
        yParity: authResponse.yParity
      };
      
      // Encode authorization and delegate to Otim
      const rlpAuthorization = createRlpEncodedAuthorization(authorization);
      
      await otimClient.delegation.delegate({ 
        address: accountAddress as `0x${string}`, 
        signedAuthorization: rlpAuthorization 
      });
    }

    // ===== STEP 6: Check USDC Balance =====
    // Wait for USDC balance to be available for transfers
    const usdcBalance = await checkUSDCBalance(
      publicClient, 
      accountAddress as `0x${string}`, 
      USDC_CONTRACT_ADDRESS
    );

    // ===== STEP 7: Otim Transfer Instructions =====
    // Only proceed if we have sufficient balance
    if (usdcBalance > 0) {
      const recipientAddress = await askQuestion("\nEnter recipient address: ");
      
      if (recipientAddress && recipientAddress.length === 42 && recipientAddress.startsWith('0x')) {
        // Validate sufficient balance for transfers
        if (usdcBalance < 1) {
          console.log(`Insufficient balance for transfers. Need at least 1 USDC, have ${usdcBalance} USDC`);
          return;
        }

        try {
          // Get fee estimate from Otim for optimal gas pricing
          const feeEstimate = await otimClient.config.getMaxPriorityFeeEstimate({
            chainId: walletClient.chain.id,
          });
          const priorityFee = BigInt(feeEstimate.normalMaxPriorityFeeEstimate);
          
          // Build Otim transfer instruction (0.5 USDC every 20 seconds)
          const transferBuild = await otimClient.instruction.build.transfer({
            target: recipientAddress as `0x${string}`,
            value: parseUnits("0.5", 6),
            token: USDC_CONTRACT_ADDRESS as `0x${string}`,
            schedule: {
              startAt: 0,
              startBy: 0,
              interval: 20,
              timeout: 10,
            },
            fee: {
              token: USDC_CONTRACT_ADDRESS as `0x${string}`,
              maxPriorityFeePerGas: priorityFee,
            },
          });

          // Activate the transfer instruction using Privy-signed EIP-712
          try {
            const result = await transferBuild.activate({
              nickname: `USDC transfers to ${recipientAddress}`,
            });
            
            console.log(`\nActivated instruction: ${result.instructionId}`);
            console.log(`Transferring 0.5 USDC every 20 seconds`);
            console.log(`Monitoring balances... (Press Ctrl+C to stop)`);
            
            // ===== STEP 8: Real-time Balance Monitoring =====
            // Start monitoring transfer balances
            await monitorTransferBalances(
              publicClient,
              accountAddress as `0x${string}`,
              recipientAddress as `0x${string}`,
              USDC_CONTRACT_ADDRESS,
              usdcBalance
            );
            
          } catch (activateError) {
            console.error("Transfer activation error details:", activateError);
            throw activateError;
          }
          
        } catch (error) {
          console.log(`\nTransfer activation failed: ${(error as any).message}`);
        }
      }
    }

  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main().catch(() => process.exit(1));
