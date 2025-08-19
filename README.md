# Otim Embedded Wallet Demo

A simple collection of TypeScript demo showcasing embedded wallet providers with Otim integration.

## Available Providers

### Turnkey
Run: `pnpm turnkey`

## Setup

1. Install dependencies: `pnpm install`
2. Create `.env` file with your configuration:
   ```
   TURNKEY_ORGANIZATION_ID=your_organization_id
   TURNKEY_API_PUBLIC_KEY=your_api_public_key
   TURNKEY_API_PRIVATE_KEY=your_api_private_key
   CHAIN_NAME=base-sepolia
   CREATE_NEW_WALLET=false
   ```



## Configuration

### Chain Selection
Set `CHAIN_NAME` in your `.env` file to choose the network:
- `base-sepolia` (default) - Base Sepolia testnet
- `sepolia` - Ethereum Sepolia testnet

The system automatically selects the correct:
- Viem chain object
- RPC URL
- USDC contract address

### Wallet Creation
Set `CREATE_NEW_WALLET=true` to force creating a new wallet account, or `false` to use existing ones.

## Features

- Embedded wallet creation/management
- Otim login and delegation
- USDC balance checking
- Automated USDC transfers via Otim instructions
