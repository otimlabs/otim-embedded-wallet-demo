# Silly Bands Subscription App

A simple subscription app for buying silly bands using USDC on Base Sepolia.

## Setup

1. Copy `.env.example` to `.env.local` and fill in your Turnkey credentials:
```bash
cp .env.example .env.local
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) to see the login page.

## Features

- ✅ Email authentication only
- ✅ Light mode UI
- ✅ Simple subscription interface
- ✅ USDC balance display on Base Sepolia
- ✅ $1 subscription for silly bands
- ✅ Logout functionality
- ✅ Minimal codebase

## Environment Variables

You need to set up these environment variables in `.env.local`:

- `NEXT_PUBLIC_ORGANIZATION_ID` - Your Turnkey organization ID
- `TURNKEY_API_PUBLIC_KEY` - Your Turnkey API public key  
- `TURNKEY_API_PRIVATE_KEY` - Your Turnkey API private key
- `NEXT_PUBLIC_BASE_URL` - Turnkey API base URL (https://api.turnkey.com)

## Tech Stack

- Next.js 15 with App Router
- React 19
- Turnkey SDK
- Tailwind CSS
- TypeScript
