import { config } from "dotenv";
import { TurnkeyClient } from "@turnkey/http";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { createWalletClient, createPublicClient, http } from "viem";
import { createAccount } from "@turnkey/viem";
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
const ORGANIZATION_ID = process.env.TURNKEY_ORGANIZATION_ID;
const API_PUBLIC_KEY = process.env.TURNKEY_API_PUBLIC_KEY;
const API_PRIVATE_KEY = process.env.TURNKEY_API_PRIVATE_KEY;
const CREATE_NEW_WALLET = process.env.CREATE_NEW_WALLET === 'true';

// Validation
if (!CHAIN_NAME) throw new Error("CHAIN_NAME environment variable is required");
if (!ORGANIZATION_ID || !API_PUBLIC_KEY || !API_PRIVATE_KEY) {
  throw new Error("Missing required Turnkey environment variables");
}

// Chain configuration
const chainConfig = CHAIN_CONFIG[CHAIN_NAME];
if (!chainConfig) throw new Error(`Unsupported chain: ${CHAIN_NAME}`);

const { chain: CHAIN, rpc: RPC_URL, usdcAddress: USDC_CONTRACT_ADDRESS } = chainConfig;

async function main() {
  try {
    // ===== STEP 1: Initialize Turnkey HTTP Client =====
    // Create Turnkey client with API key authentication
    const httpClient = new TurnkeyClient(
      { baseUrl: "https://api.turnkey.com" },
      new ApiKeyStamper({ 
        apiPublicKey: API_PUBLIC_KEY!, 
        apiPrivateKey: API_PRIVATE_KEY! 
      })
    );

    // ===== STEP 2: Wallet Management =====
    // Get existing wallets or create new one based on CREATE_NEW_WALLET flag
    const wallets = await httpClient.getWallets({ 
      organizationId: ORGANIZATION_ID! 
    });
    
    let walletId: string;
    let accountAddress: string;

    if (wallets.wallets && wallets.wallets.length > 0 && !CREATE_NEW_WALLET) {
      // Use existing wallet (first one found)
      const wallet = wallets.wallets[0];
      walletId = wallet.walletId;
      
      // Get Ethereum account from existing wallet
      const accounts = await httpClient.getWalletAccounts({ 
        organizationId: ORGANIZATION_ID!, 
        walletId 
      });
      
      const ethAccount = accounts.accounts?.find(
        (acc: any) => acc.addressFormat === "ADDRESS_FORMAT_ETHEREUM"
      );
      
      if (!ethAccount) throw new Error("No Ethereum account found");
      accountAddress = ethAccount.address;
    } else {
      // Create new wallet with Ethereum account
      const createWalletResponse = await httpClient.createWallet({
        organizationId: ORGANIZATION_ID!,
        type: "ACTIVITY_TYPE_CREATE_WALLET",
        timestampMs: Date.now().toString(),
        parameters: {
          walletName: `Demo Wallet ${new Date().toISOString()}`,
          accounts: [{
            curve: "CURVE_SECP256K1",
            pathFormat: "PATH_FORMAT_BIP32",
            path: "m/44'/60'/0'/0/0",
            addressFormat: "ADDRESS_FORMAT_ETHEREUM"
          }],
          mnemonicLength: 24,
        },
      });

      // Poll for wallet creation completion
      let activity = await httpClient.getActivity({ 
        organizationId: ORGANIZATION_ID!, 
        activityId: createWalletResponse.activity.id 
      });
      
      while (activity.activity.status === "ACTIVITY_STATUS_PENDING" || 
             activity.activity.status === "ACTIVITY_STATUS_CREATED") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        activity = await httpClient.getActivity({ 
          organizationId: ORGANIZATION_ID!, 
          activityId: createWalletResponse.activity.id 
        });
      }

      if (activity.activity.status !== "ACTIVITY_STATUS_COMPLETED") {
        throw new Error(`Wallet creation failed: ${activity.activity.status}`);
      }

      // Extract wallet ID and account address from created wallet
      walletId = activity.activity.result?.createWalletResult?.walletId || "";
      
      const accounts = await httpClient.getWalletAccounts({ 
        organizationId: ORGANIZATION_ID!, 
        walletId 
      });
      
      if (!accounts.accounts || accounts.accounts.length === 0) {
        throw new Error("No accounts found in created wallet");
      }
      
      accountAddress = accounts.accounts[0].address;
    }

    // ===== STEP 3: Setup Viem with Turnkey Account =====
    // Create Turnkey account for Viem integration
    const turnkeyAccount = await createAccount({ 
      client: httpClient as any, 
      organizationId: ORGANIZATION_ID!, 
      signWith: accountAddress, 
      ethereumAddress: accountAddress 
    });
    
    // Create Viem wallet and public clients
    const walletClient = createWalletClient({ 
      account: turnkeyAccount, 
      chain: CHAIN, 
      transport: http(RPC_URL) 
    });
    
    const publicClient = createPublicClient({ 
      chain: CHAIN, 
      transport: http(RPC_URL) 
    });

    // ===== STEP 4: Initialize Otim Client =====
    // Create Otim client with Turnkey-powered wallet
    const otimClient = createOtimClient({ walletClient });
    
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
        address: turnkeyAccount.address 
      });
      
      if (!turnkeyAccount.signAuthorization) {
        throw new Error("signAuthorization method not available");
      }
      
      // Sign delegation authorization with Turnkey
      const authorization = await turnkeyAccount.signAuthorization({ 
        contractAddress: config.otimDelegateAddress as `0x${string}`, 
        chainId: CHAIN.id, 
        nonce 
      });
      
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

        // Override Viem's signTypedData to use Turnkey's signRawPayload
        const originalSignTypedData = walletClient.account.signTypedData;
        walletClient.account.signTypedData = async (args: any) => {
          // Hash the EIP-712 typed data for Turnkey signing
          const { hashTypedData } = await import('viem');
          const messageHash = hashTypedData(args);
          
          // Sign the hashed payload using Turnkey's signRawPayload
          const result = await httpClient.signRawPayload({
            organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
            type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
            timestampMs: Date.now().toString(),
            parameters: {
              signWith: accountAddress,
              payload: messageHash,
              encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
              hashFunction: "HASH_FUNCTION_NO_OP",
            },
          });

          // Poll for signing activity completion
          let activity = await httpClient.getActivity({
            organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
            activityId: result.activity.id,
          });

          while (activity.activity.status === "ACTIVITY_STATUS_PENDING" || activity.activity.status === "ACTIVITY_STATUS_CREATED") {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            activity = await httpClient.getActivity({
              organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
              activityId: result.activity.id,
            });
          }

          // Verify signing was successful and extract signature
          if (activity.activity.status !== "ACTIVITY_STATUS_COMPLETED") {
            throw new Error(`Signing failed: ${activity.activity.status}`);
          }

          const sigResult = activity.activity.result?.signRawPayloadResult;
          if (sigResult?.r && sigResult?.s && sigResult?.v) {
            return `0x${sigResult.r}${sigResult.s}${sigResult.v}`;
          }
          return "0x";
        };

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

          // Activate the transfer instruction using Turnkey-signed EIP-712
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
          
        } catch (error) {
          console.log(`\nTransfer activation failed: ${(error as any).message}`);
        } finally {
          // Restore original signTypedData method
          walletClient.account.signTypedData = originalSignTypedData;
        }
      }
    }

  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main().catch(() => process.exit(1));