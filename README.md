# Embedded Wallet Demos

TypeScript demos for embedded wallet providers with Otim SDK integration.

## Quick Start

```bash
pnpm install
pnpm turnkey
```

## Configuration

Create `.env` file with required variables:

```bash
TURNKEY_ORGANIZATION_ID=your_organization_id
TURNKEY_API_PUBLIC_KEY=your_public_key
TURNKEY_API_PRIVATE_KEY=your_private_key
CREATE_NEW_WALLET=false  # Set to 'true' to force new wallet creation
```

## Available Demos

### Turnkey (`pnpm turnkey`)
- Creates/uses Turnkey wallet with Viem integration
- Logs into Otim and performs delegation
- Waits for delegation completion
- Uses existing wallet by default, creates new one if `CREATE_NEW_WALLET=true`

## Dependencies

- `@turnkey/http`, `@turnkey/api-key-stamper`, `@turnkey/viem`
- `@otim/sdk`, `viem`, `dotenv`
