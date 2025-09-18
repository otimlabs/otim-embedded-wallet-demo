# Otim Embedded Wallet Demo

A simple collection of TypeScript demos showcasing embedded wallet providers with Otim integration.

## Available Providers

### Turnkey
Run: `pnpm turnkey`

### Privy
Run: `pnpm privy`

## Setup

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env` and configure your credentials

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
