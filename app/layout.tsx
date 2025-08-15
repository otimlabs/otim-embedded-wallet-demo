import type { Metadata } from "next";
import "./globals.css";
import { TurnkeyProvider } from "@turnkey/sdk-react";
import "@turnkey/sdk-react/styles";

export const metadata: Metadata = {
  title: "Silly Bandz Subscription",
  description: "Subscribe to get silly bandz for $1 USDC",
};

const config = {
  apiBaseUrl: "https://api.turnkey.com",
  defaultOrganizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID!,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <TurnkeyProvider config={config}>
          {/* @ts-ignore */}
          {children}
        </TurnkeyProvider>
      </body>
    </html>
  );
}
