import { config } from "dotenv";
import { TurnkeyClient } from "@turnkey/http";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { createWalletClient, createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { createAccount } from "@turnkey/viem";
import { createOtimClient, createRlpEncodedAuthorization } from "@otim/sdk";

// Load environment variables
config();

// Configuration - Environment variables required
const ORGANIZATION_ID = process.env.TURNKEY_ORGANIZATION_ID;
const API_PUBLIC_KEY = process.env.TURNKEY_API_PUBLIC_KEY;
const API_PRIVATE_KEY = process.env.TURNKEY_API_PRIVATE_KEY;
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

// Validate required environment variables
if (!ORGANIZATION_ID) {
  throw new Error("TURNKEY_ORGANIZATION_ID environment variable is required");
}
if (!API_PUBLIC_KEY) {
  throw new Error("TURNKEY_API_PUBLIC_KEY environment variable is required");
}
if (!API_PRIVATE_KEY) {
  throw new Error("TURNKEY_API_PRIVATE_KEY environment variable is required");
}

// TypeScript knows these are not undefined after validation
const orgId = ORGANIZATION_ID!;
const publicKey = API_PUBLIC_KEY!;
const privateKey = API_PRIVATE_KEY!;

async function main() {
  console.log("🚀 Turnkey Embedded Wallet Demo");

  try {
    // Step 1: Create Turnkey HTTP client
    const httpClient = new TurnkeyClient(
      {
        baseUrl: "https://api.turnkey.com",
      },
      new ApiKeyStamper({
        apiPublicKey: publicKey,
        apiPrivateKey: privateKey,
      }),
    );

    // Step 2: Check for existing wallets
    const wallets = await httpClient.getWallets({
      organizationId: orgId,
    });

    let walletId: string;
    let accountAddress: string;

    if (wallets.wallets && wallets.wallets.length > 0) {
      // Use existing wallet
      const wallet = wallets.wallets[0];
      walletId = wallet.walletId;
      console.log(`✅ Using existing wallet: ${wallet.walletName}`);

      const accounts = await httpClient.getWalletAccounts({
        organizationId: orgId,
        walletId: wallet.walletId,
      });

      if (accounts.accounts && accounts.accounts.length > 0) {
        const ethAccount = accounts.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM');
        if (ethAccount) {
          accountAddress = ethAccount.address;
        } else {
          throw new Error('No Ethereum account found in existing wallet');
        }
      } else {
        throw new Error('No accounts found in existing wallet');
      }
    } else {
      // Create new wallet
      console.log("🆕 Creating new wallet...");
      
      const createWalletResponse = await httpClient.createWallet({
        organizationId: orgId,
        type: "ACTIVITY_TYPE_CREATE_WALLET",
        timestampMs: Date.now().toString(),
        parameters: {
          walletName: "Demo Wallet",
          accounts: [
            {
              curve: "CURVE_SECP256K1",
              pathFormat: "PATH_FORMAT_BIP32",
              path: "m/44'/60'/0'/0/0",
              addressFormat: "ADDRESS_FORMAT_ETHEREUM",
            },
          ],
          mnemonicLength: 24,
        },
      });

      // Poll for activity completion
      let activity = await httpClient.getActivity({
        organizationId: orgId,
        activityId: createWalletResponse.activity.id,
      });

      while (activity.activity.status === "ACTIVITY_STATUS_PENDING" || activity.activity.status === "ACTIVITY_STATUS_CREATED") {
        await new Promise(resolve => setTimeout(resolve, 2000));
        activity = await httpClient.getActivity({
          organizationId: orgId,
          activityId: createWalletResponse.activity.id,
        });
      }

      if (activity.activity.status !== "ACTIVITY_STATUS_COMPLETED") {
        throw new Error(`Wallet creation failed: ${activity.activity.status}`);
      }

      walletId = activity.activity.result?.createWalletResult?.walletId || "";

      // Get the account address from the created wallet
      const accounts = await httpClient.getWalletAccounts({
        organizationId: orgId,
        walletId,
      });

      if (accounts.accounts && accounts.accounts.length > 0) {
        accountAddress = accounts.accounts[0].address;
        console.log(`✅ Created new wallet with address: ${accountAddress}`);
      } else {
        throw new Error('No accounts found in created wallet');
      }
    }

    // Step 3: Create Viem custom account
    const turnkeyAccount = await createAccount({
      client: httpClient,
      organizationId: orgId,
      signWith: accountAddress,
      ethereumAddress: accountAddress,
    });

    // Step 4: Create Viem wallet client
    const walletClient = createWalletClient({
      account: turnkeyAccount,
      chain: baseSepolia,
      transport: http(BASE_SEPOLIA_RPC),
    });

    // Step 5: Create Otim client
    const otimClient = createOtimClient({
      account: turnkeyAccount,
      transport: http(BASE_SEPOLIA_RPC),
      chain: baseSepolia,
    });

    // Step 6: Login to Otim
    console.log("🔐 Logging into Otim...");
    try {
      const loginResponse = await otimClient.auth.login({
        domain: 'otim.com',
        uri: 'https://app.otim.com',
        address: accountAddress as `0x${string}`,
        chainId: baseSepolia.id
      });
      console.log("✅ Successfully logged into Otim!");
    } catch (error) {
      console.log("⚠️ Otim login failed (this is expected if Otim is not configured):");
      console.log("   Error:", error);
      return;
    }

    // Step 7: Perform delegation
    console.log("🔐 Setting up delegation...");
    try {
      // Check delegation status first
      const status = await otimClient.delegation.getDelegationStatus({
        address: accountAddress as `0x${string}`,
        chainId: baseSepolia.id,
      });
      console.log(`📊 Current delegation status: ${status.delegationStatus}`);

      // Get the delegate contract address first
      console.log("🔍 Getting delegate contract address...");
      const config = await otimClient.config.getDelegateAddress({ chainId: baseSepolia.id });
      console.log(`📄 Delegate contract address: ${config.otimDelegateAddress}`);
      
      // Get current nonce
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(BASE_SEPOLIA_RPC),
      });
      
      const nonce = await publicClient.getTransactionCount({
        address: turnkeyAccount.address
      });

      // Sign authorization (eip-7702)
      if (!turnkeyAccount.signAuthorization) {
        throw new Error("signAuthorization method not available on Turnkey account");
      }
      
      const authorization = await turnkeyAccount.signAuthorization({
        contractAddress: config.otimDelegateAddress as `0x${string}`,
        chainId: baseSepolia.id,
        nonce,
      });

      // Convert to rlp format and delegate
      const rlpAuthorization = createRlpEncodedAuthorization(authorization);
      console.log(`📄 RLP Authorization: ${rlpAuthorization}`);

      // Perform delegation (submit to API)
      console.log("📤 Submitting delegation to Otim API...");
      try {
        const result = await otimClient.delegation.delegate({
          signedAuthorization: rlpAuthorization,
        });

        console.log("📄 Delegation result:", result);
        
        if (result.data?.transactionHash) {
          console.log(`✅ Delegation submitted: ${result.data.transactionHash}`);
        } else if (result.data?.success) {
          console.log("✅ Delegation submitted successfully");
        } else {
          console.log("❌ Delegation failed:", result.data?.message);
        }
      } catch (delegateError) {
        console.log("❌ Delegation API call failed:");
        console.log("   Error:", delegateError);
        if (delegateError instanceof Error) {
          console.log("   Message:", delegateError.message);
        }
        // Continue with the demo even if delegation fails
      }

    } catch (error) {
      console.log("⚠️ Delegation failed:");
      console.log("   Error:", error);
      if (error instanceof Error) {
        console.log("   Message:", error.message);
        console.log("   Stack:", error.stack);
      }
      if (typeof error === 'object' && error !== null && 'code' in error) {
        console.log("   Code:", (error as any).code);
        console.log("   Status:", (error as any).status);
      }
    }

    console.log("\n🎉 Demo completed successfully!");
    console.log(`📍 Wallet address: ${accountAddress}`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the demo
main().catch(console.error);
