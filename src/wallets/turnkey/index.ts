import { config } from "dotenv";
import { TurnkeyClient } from "@turnkey/http";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { createWalletClient, createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { createAccount } from "@turnkey/viem";
import { createOtimClient, createRlpEncodedAuthorization } from "@otim/sdk";
import { checkUSDCBalance } from './utils/balance';
import { performUSDCTransfers } from './utils/transfers';
import { askQuestion } from './utils/input';
import { BASE_SEPOLIA_RPC } from './utils/constants';

// Load environment variables
config();

// Configuration - Environment variables required
const ORGANIZATION_ID = process.env.TURNKEY_ORGANIZATION_ID;
const API_PUBLIC_KEY = process.env.TURNKEY_API_PUBLIC_KEY;
const API_PRIVATE_KEY = process.env.TURNKEY_API_PRIVATE_KEY;

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

const orgId = ORGANIZATION_ID!;
const publicKey = API_PUBLIC_KEY!;
const privateKey = API_PRIVATE_KEY!;
const CREATE_NEW_WALLET = process.env.CREATE_NEW_WALLET === 'true';

async function main() {
  try {
    // Step 1: Create Turnkey HTTP client
    const httpClient = new TurnkeyClient(
      { baseUrl: "https://api.turnkey.com" },
      new ApiKeyStamper({
        apiPublicKey: publicKey,
        apiPrivateKey: privateKey,
      }),
    );

    // Step 2: Check for existing wallets
    const wallets = await httpClient.getWallets({ organizationId: orgId });

    let walletId: string;
    let accountAddress: string;

    if (wallets.wallets && wallets.wallets.length > 0 && !CREATE_NEW_WALLET) {
      // Use existing wallet
      const wallet = wallets.wallets[0];
      walletId = wallet.walletId;

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
      // Create new wallet
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
    const otimClient = createOtimClient({ walletClient });

    // Step 6: Login to Otim
    try {
      const loginResponse = await otimClient.auth.login({
        domain: "otim.com",
        uri: "https://app.otim.com",
        address: accountAddress as `0x${string}`,
        chainId: baseSepolia.id,
      });
      await otimClient.auth.setAuthorizationHeader(loginResponse.authorization);
    } catch (error) {
      return;
    }

    // Step 7: Create public client for delegation and balance checking
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(BASE_SEPOLIA_RPC),
    });

    // Step 8: Perform delegation
    try {
      const status = await otimClient.delegation.getDelegationStatus({
        address: accountAddress as `0x${string}`,
        chainId: baseSepolia.id,
      });

      if (!(status.delegationStatus === "Delegated" || status.delegationStatus === "Pending")) {
        const config = await otimClient.config.getDelegateAddress({
          chainId: baseSepolia.id,
        });

        const nonce = await publicClient.getTransactionCount({
          address: turnkeyAccount.address,
        });

        if (!turnkeyAccount.signAuthorization) {
          throw new Error("signAuthorization method not available on Turnkey account");
        }

        const authorization = await turnkeyAccount.signAuthorization({
          contractAddress: config.otimDelegateAddress as `0x${string}`,
          chainId: baseSepolia.id,
          nonce,
        });

        const rlpAuthorization = createRlpEncodedAuthorization(authorization);

        const result = await otimClient.delegation.delegate({
          address: accountAddress as `0x${string}`,
          signedAuthorization: rlpAuthorization,
        });

        if (!(result.data?.transactionHash || result.data?.success)) {
          return;
        }

        // Wait for delegation to complete
        let delegationStatus = "Pending";
        let attempts = 0;
        const maxAttempts = 30;

        while (delegationStatus === "Pending" && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          attempts++;

          try {
            const poll = await otimClient.delegation.getDelegationStatus({
              address: accountAddress as `0x${string}`,
              chainId: baseSepolia.id,
            });
            delegationStatus = poll.delegationStatus;
          } catch {
            // Continue polling
          }
        }
      }
    } catch {
      // Continue with demo even if delegation fails
    }

    // Step 9: Check USDC balance
    const usdcBalance = await checkUSDCBalance(publicClient, accountAddress as `0x${string}`);

    // Step 10: Perform USDC transfers
    if (usdcBalance > 0) {
      const recipientAddress = await askQuestion("\nEnter the address you'd like to send USDC to: ");
      
      if (recipientAddress && recipientAddress.length === 42 && recipientAddress.startsWith('0x')) {
        await performUSDCTransfers(
          otimClient,
          walletClient,
          publicClient,
          accountAddress,
          recipientAddress,
          usdcBalance
        );
      }
    }

  } catch (error) {
    process.exit(1);
  }
}

// Run the demo
main().catch(() => process.exit(1));
