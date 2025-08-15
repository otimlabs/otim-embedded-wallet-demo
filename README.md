# Embedded Wallet Demos

A collection of TypeScript demos showing how to integrate various embedded wallet providers with Otim SDK.

## 🚀 Features

- ✅ **Multiple Wallet Providers**: Support for various embedded wallet solutions
- ✅ **Turnkey Integration**: Uses Turnkey's secure infrastructure for wallet management
- ✅ **Viem Integration**: Leverages viem for Ethereum interactions
- ✅ **Otim SDK**: Demonstrates Otim login functionality
- ✅ **Auto Wallet Creation**: Creates wallets and accounts automatically
- ✅ **Message Signing**: Tests wallet functionality with message signing
- ✅ **Clean Architecture**: Simple, focused TypeScript implementation

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run the demo
pnpm start

# Or run in development mode
pnpm dev
```

## 🚀 Available Scripts

```bash
# Turnkey embedded wallet demo
pnpm turnkey

# Build for production
pnpm build && pnpm start
```

## 🔧 Configuration

The demo **requires** environment variables for configuration. You must set them in a `.env` file:

```bash
TURNKEY_ORGANIZATION_ID=your_organization_id
TURNKEY_API_PUBLIC_KEY=your_public_key
TURNKEY_API_PRIVATE_KEY=your_private_key
```

**⚠️ No fallback values are provided for security reasons.**

## 🏗️ Architecture

This project demonstrates various embedded wallet integrations:

### Turnkey Demo
Follows the [Turnkey SDK patterns](https://github.com/tkhq/sdk/tree/main/examples/with-viem) and demonstrates:

1. **Turnkey HTTP Client**: Server-side wallet management
2. **Viem Integration**: Ethereum interactions and signing
3. **Otim SDK**: Authentication and login
4. **Wallet Creation**: Automatic wallet and account creation

## 📋 Available Demos

### Turnkey (`pnpm turnkey`)
1. **Checks for Existing Wallets**: Looks for existing wallets in your organization
2. **Creates New Wallet** (if none exist): Creates a new HD wallet with Ethereum account following the [Turnkey SDK pattern](https://github.com/tkhq/sdk/blob/main/examples/with-viem/src/createNewWallet.ts)
3. **Waits for Creation**: Polls for wallet creation completion
4. **Integrates with Viem**: Creates a viem wallet client for Ethereum operations
5. **Tests Message Signing**: Demonstrates wallet functionality
6. **Logs into Otim**: Shows Otim SDK integration
7. **Displays Wallet Info**: Shows all relevant wallet information

## 🔐 Security

- Uses Turnkey's secure infrastructure for private key management
- No private keys stored in the application
- Secure API key authentication
- Proper error handling and validation

## 🛠️ Development

```bash
# Clean build artifacts
pnpm clean

# Build TypeScript
pnpm build

# Run with ts-node (development)
pnpm dev
```

## 📚 Dependencies

- `@turnkey/http`: Turnkey HTTP client
- `@turnkey/api-key-stamper`: API key authentication
- `@turnkey/viem`: Turnkey integration with viem
- `@otim/sdk`: Otim SDK for authentication
- `viem`: Ethereum library for TypeScript

## 🎯 Use Cases

These demos are perfect for:
- Learning embedded wallet integrations
- Understanding Otim SDK usage
- Building embedded wallet applications
- Testing wallet functionality
- Prototyping Ethereum applications
- Comparing different wallet providers

## 📄 License

MIT
