'use client';

import { useState, useEffect } from 'react';
import { useTurnkey } from '@turnkey/sdk-react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const { turnkey, indexedDbClient } = useTurnkey();
  const [session, setSession] = useState<any>(null);
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();



  const handleLogout = async () => {
    try {
      await turnkey?.logout();
      router.push('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const getWalletInfo = async () => {
    if (session && indexedDbClient) {
      try {
        // Get the user's wallets
        const wallets = await indexedDbClient.getWallets({
          organizationId: session.organizationId,
        });

        if (wallets?.wallets && wallets.wallets.length > 0) {
          const wallet = wallets.wallets[0];
          
          // Get the accounts associated with the wallet
          const accounts = await indexedDbClient.getWalletAccounts({
            organizationId: session.organizationId,
            walletId: wallet.walletId,
          });

          setWalletInfo({
            walletId: wallet.walletId,
            walletName: wallet.walletName,
            accounts: accounts?.accounts || []
          });
        } else {
          console.log('No wallets found for user');
          setWalletInfo({ walletId: 'No wallet found', walletName: 'No wallet', accounts: [] });
        }
      } catch (error) {
        console.error('Error fetching wallet info:', error);
        setWalletInfo({ walletId: 'Error loading wallet', walletName: 'Error', accounts: [] });
      }
    }
  };

  useEffect(() => {
    if (turnkey) {
      setIsLoading(true);
      
      // Add a small delay to ensure Turnkey is fully initialized
      setTimeout(() => {
        turnkey.getSession().then((session) => {
          if (session) {
            setSession(session);
          } else {
            // No session found, redirect to login
            router.push('/');
          }
        }).catch((error) => {
          console.error('Error getting session:', error);
          setError('Failed to load session');
          setIsLoading(false);
        });
      }, 100);
    }
  }, [turnkey, router]);

  useEffect(() => {
    if (session) {
      getWalletInfo().finally(() => {
        setIsLoading(false);
      });
    }
  }, [session]);

  return (
    <div className="min-h-screen bg-white relative">
      {/* Logout button in top right */}
      <button
        onClick={handleLogout}
        className="absolute top-6 right-6 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors z-10"
      >
        Logout
      </button>

      {/* Centered content */}
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
          
          {isLoading && (
            <div className="bg-gray-50 p-8 rounded-xl">
              <p className="text-gray-600">Loading wallet information...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 p-8 rounded-xl border border-red-200">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && walletInfo && walletInfo.accounts.length > 0 && (
            <div className="bg-blue-50 p-8 rounded-xl border border-blue-200 shadow-lg">
              <h2 className="text-xl font-semibold text-blue-800 mb-6">Your Ethereum Wallet</h2>
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-sm text-gray-600 mb-2">Address</p>
                  <p className="font-mono text-sm text-blue-900 break-all">
                    {walletInfo.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM')?.address || 'No ETH address found'}
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  Wallet ID: {walletInfo.walletId}
                </div>
              </div>
            </div>
          )}

          {!isLoading && !error && (!walletInfo || walletInfo.accounts.length === 0) && (
            <div className="bg-yellow-50 p-8 rounded-xl border border-yellow-200">
              <p className="text-yellow-700">No wallet found. Please try logging in again.</p>
              <button
                onClick={() => router.push('/')}
                className="mt-4 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
