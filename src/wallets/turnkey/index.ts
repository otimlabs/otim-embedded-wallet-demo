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

// Configuration flag - set to true to force creating a new wallet
const CREATE_NEW_WALLET = process.env.CREATE_NEW_WALLET === 'true';

async function main() {
  console.log("Turnkey Embedded Wallet Demo");

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

        // Use existing wallet if available, unless CREATE_NEW_WALLET is true
    if (wallets.wallets && wallets.wallets.length > 0 && !CREATE_NEW_WALLET) {
      // Use the first existing wallet
      const wallet = wallets.wallets[0];
      walletId = wallet.walletId;
      console.log(`Using existing wallet: ${wallet.walletName}`);

      const accounts = await httpClient.getWalletAccounts({
        organizationId: orgId,
        walletId: wallet.walletId,
      });

      if (accounts.accounts && accounts.accounts.length > 0) {
        const ethAccount = accounts.accounts.find(
          (acc: any) => acc.addressFormat === "ADDRESS_FORMAT_ETHEREUM",
        );
        if (ethAccount) {
          accountAddress = ethAccount.address;
        } else {
          throw new Error("No Ethereum account found in existing wallet");
        }
      } else {
        throw new Error("No accounts found in existing wallet");
      }
    } else {
      // Create new wallet only if CREATE_NEW_WALLET is true or no wallets exist
      if (CREATE_NEW_WALLET) {
        console.log("Creating new wallet (CREATE_NEW_WALLET flag is true)...");
      } else {
        console.log("Creating new wallet (no existing wallets found)...");
      }

        const createWalletResponse = await httpClient.createWallet({
          organizationId: orgId,
          type: "ACTIVITY_TYPE_CREATE_WALLET",
          timestampMs: Date.now().toString(),
          parameters: {
            walletName: `Demo Wallet ${new Date().toISOString()}`,
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

      while (
        activity.activity.status === "ACTIVITY_STATUS_PENDING" ||
        activity.activity.status === "ACTIVITY_STATUS_CREATED"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
        console.log(`Created new wallet with address: ${accountAddress}`);
      } else {
        throw new Error("No accounts found in created wallet");
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
      walletClient,
    });

    // Step 6: Login to Otim
    console.log("Logging into Otim...");
    try {
      const loginResponse = await otimClient.auth.login({
        domain: "otim.com",
        uri: "https://app.otim.com",
        address: accountAddress as `0x${string}`,
        chainId: baseSepolia.id,
      });

      await otimClient.auth.setAuthorizationHeader(loginResponse.authorization);

      console.log("Successfully logged into Otim!");
    } catch (error) {
      console.log(
        "⚠️ Otim login failed (this is expected if Otim is not configured):",
      );
      console.log("   Error:", error);
      return;
    }

    // Step 7: Perform delegation
    console.log("Setting up delegation...");
    try {
      // Check delegation status first
      const status = await otimClient.delegation.getDelegationStatus({
        address: accountAddress as `0x${string}`,
        chainId: baseSepolia.id,
      });
      console.log(`Current delegation status: ${status.delegationStatus}`);

      // Skip delegation if already delegated or pending
      if (status.delegationStatus === "Delegated" || status.delegationStatus === "Pending") {
        console.log("Wallet is already delegated or pending - skipping delegation step");
      } else {
        // Get the delegate contract address first
        const config = await otimClient.config.getDelegateAddress({
          chainId: baseSepolia.id,
        });

      // Get current nonce
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(BASE_SEPOLIA_RPC),
      });

      const nonce = await publicClient.getTransactionCount({
        address: turnkeyAccount.address,
      });

      if (!turnkeyAccount.signAuthorization) {
        throw new Error(
          "signAuthorization method not available on Turnkey account",
        );
      }

      const authorization = await turnkeyAccount.signAuthorization({
        contractAddress: config.otimDelegateAddress as `0x${string}`,
        chainId: baseSepolia.id,
        nonce,
      });

      const rlpAuthorization = createRlpEncodedAuthorization(authorization);

        // Perform delegation (submit to API)
        try {
          const result = await otimClient.delegation.delegate({
            address: accountAddress as `0x${string}`,
            signedAuthorization: rlpAuthorization,
          });

          if (result.data?.transactionHash) {
            console.log(`Delegation submitted: ${result.data.transactionHash}`);
          } else if (result.data?.success) {
            console.log("Delegation submitted successfully");
          } else {
            console.log("Delegation failed:", result.data?.message);
            return;
          }

          // Wait for delegation to complete by polling status
          console.log("Waiting for delegation to complete...");
          let delegationStatus = "Pending";
          let attempts = 0;
          const maxAttempts = 30; // 5 minutes max (30 * 10 seconds)

          while (delegationStatus === "Pending" && attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
            attempts++;

            try {
              const status = await otimClient.delegation.getDelegationStatus({
                address: accountAddress as `0x${string}`,
                chainId: baseSepolia.id,
              });
              delegationStatus = status.delegationStatus;
              console.log(`Delegation status (attempt ${attempts}): ${delegationStatus}`);
            } catch (statusError) {
              console.log(`Failed to get delegation status (attempt ${attempts}):`, (statusError as any).message);
            }
          }

          if (delegationStatus === "Delegated") {
            console.log("Delegation completed successfully!");
          } else if (delegationStatus === "Pending") {
            console.log("Delegation still pending after maximum attempts");
          } else {
            console.log(`Delegation ended with status: ${delegationStatus}`);
          }
        } catch (delegateError) {
          console.log("Delegation failed:", (delegateError as any).message);
          // Continue with the demo even if delegation fails
        }
      }
    } catch (error) {
      console.log("Delegation failed:", (error as any).message);
    }

    console.log("\nDemo completed successfully!");
    console.log(`Wallet address: ${accountAddress}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run the demo
main().catch(console.error);
