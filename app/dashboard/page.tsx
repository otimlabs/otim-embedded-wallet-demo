'use client';

import { useState, useEffect } from 'react';
import { useTurnkey } from '@turnkey/sdk-react';
import { useRouter } from 'next/navigation';

// USDC token contract on Base Sepolia
const USDC_CONTRACT = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';

export default function Dashboard() {
  const { turnkey, indexedDbClient } = useTurnkey();
  const [session, setSession] = useState<any>(null);
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [usdcBalance, setUsdcBalance] = useState<string>('0.00');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('');
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const router = useRouter();



  const handleLogout = async () => {
    try {
      await turnkey?.logout();
      router.push('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleSubscribe = async () => {
    if (!walletInfo || !walletInfo.accounts.length) {
      setSubscriptionStatus('No wallet available');
      return;
    }

    const ethAccount = walletInfo.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM');
    if (!ethAccount) {
      setSubscriptionStatus('No Ethereum wallet found');
      return;
    }

    // Check if user has enough balance
    const currentBalance = parseFloat(usdcBalance);
    if (currentBalance < 0.16) {
      setSubscriptionStatus(`Insufficient balance. You need $0.16, but have $${usdcBalance}`);
      return;
    }

    setIsSubscribing(true);
    setSubscriptionStatus('Processing subscription...');

    try {
      // Simulate subscription process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setSubscriptionStatus('🎉 Subscription started! You will receive Silly Bandz every 10 seconds!');
      
      // Update balance (subtract $0.16)
      const newBalance = (currentBalance - 0.16).toFixed(2);
      setUsdcBalance(newBalance);
      
    } catch (error) {
      console.error('Subscription failed:', error);
      setSubscriptionStatus('❌ Subscription failed. Please try again.');
    } finally {
      setIsSubscribing(false);
    }
  };

  const getUsdcBalance = async (address: string) => {
    try {
      // ERC20 balanceOf function selector
      const balanceOfSelector = '0x70a08231';
      const paddedAddress = address.slice(2).padStart(64, '0');
      
      const response = await fetch(BASE_SEPOLIA_RPC, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            {
              to: USDC_CONTRACT,
              data: balanceOfSelector + paddedAddress,
            },
            'latest',
          ],
          id: 1,
        }),
      });

      const result = await response.json();
      
      if (result.result) {
        // Convert hex balance to decimal (USDC has 6 decimals)
        const balanceHex = result.result;
        const balanceDecimal = parseInt(balanceHex, 16);
        const usdcBalance = (balanceDecimal / 1000000).toFixed(2);
        setUsdcBalance(usdcBalance);
      }
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
      setUsdcBalance('0.00');
    }
  };

  const refreshBalance = async () => {
    if (!walletInfo || !walletInfo.accounts.length) return;
    
    const ethAccount = walletInfo.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM');
    if (ethAccount) {
      setIsRefreshingBalance(true);
      await getUsdcBalance(ethAccount.address);
      setIsRefreshingBalance(false);
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

          // Get USDC balance for the first Ethereum account
          const ethAccount = accounts?.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM');
          if (ethAccount) {
            await getUsdcBalance(ethAccount.address);
          }
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
      setError(null);
      
      const checkSession = async () => {
        try {
          const session = await turnkey.getSession();
          if (session) {
            console.log('Session found:', session);
            setSession(session);
            setRetryCount(0); // Reset retry count on success
          } else {
            console.log('No session found, redirecting to login');
            router.push('/');
          }
        } catch (error) {
          console.error('Error getting session:', error);
          setError('Failed to load session');
          setIsLoading(false);
          
          // Retry up to 3 times
          if (retryCount < 3) {
            setTimeout(() => {
              setRetryCount(prev => prev + 1);
            }, 1000 * (retryCount + 1)); // Exponential backoff
          }
        }
      };

      // Try immediately first
      checkSession();
      
      // If that fails, try again after a short delay
      const timeoutId = setTimeout(checkSession, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [turnkey, router, retryCount]);

  useEffect(() => {
    if (session) {
      const loadWalletInfo = async () => {
        try {
          await getWalletInfo();
        } catch (error) {
          console.error('Error loading wallet info:', error);
          setError('Failed to load wallet information');
        } finally {
          setIsLoading(false);
        }
      };
      
      loadWalletInfo();
    }
  }, [session]);

  // Auto-refresh balance every 5 seconds
  useEffect(() => {
    if (!walletInfo || !walletInfo.accounts.length) return;

    const interval = setInterval(() => {
      refreshBalance();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [walletInfo]);

  return (
    <div className="min-h-screen bg-white relative">
      {/* Balance, Wallet Address, Faucet, and Logout button in top right */}
      <div className="absolute top-6 right-6 flex items-center gap-4 z-10">
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-2">
          <div className="text-lg font-bold text-gray-800">${usdcBalance}</div>
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-500 hover:bg-blue-600 text-white rounded w-6 h-6 flex items-center justify-center text-sm cursor-pointer transition-colors"
            title="Get USDC from faucet"
          >
            💧
          </a>
        </div>
        
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm font-mono text-gray-800">
            {walletInfo?.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM')?.address 
              ? `${walletInfo.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM').address.slice(0, 6)}...${walletInfo.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM').address.slice(-4)}`
              : 'No wallet'
            }
          </span>
          <button
            onClick={() => {
              const address = walletInfo?.accounts.find((acc: any) => acc.addressFormat === 'ADDRESS_FORMAT_ETHEREUM')?.address;
              if (address) {
                navigator.clipboard.writeText(address);
              }
            }}
            className="bg-gray-200 hover:bg-gray-300 text-gray-600 rounded w-6 h-6 flex items-center justify-center text-sm cursor-pointer transition-colors"
            title="Copy address"
          >
            📋
          </button>
        </div>


        
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 text-white rounded w-8 h-8 flex items-center justify-center cursor-pointer transition-colors"
          title="Logout"
        >
          🚪
        </button>
      </div>
      
      {/* Network indicator right under the top bar */}
      <div className="absolute top-20 right-6 text-sm text-gray-500 font-medium">
        Base Sepolia
      </div>

      {/* Centered content */}
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          
          {isLoading && (
            <div className="bg-gray-50 p-8 rounded-xl">
              <p className="text-gray-600">Loading wallet information...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 p-8 rounded-xl border border-red-200">
              <p className="text-red-600 mb-4">{error}</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Go to Login
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && walletInfo && walletInfo.accounts.length > 0 && (
            <div className="bg-purple-50 p-8 rounded-xl border border-purple-200 shadow-lg">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-purple-800 mb-2">Silly Bandz starting at $0.16!</h2>
              </div>
              
              {/* Silly Bandz Image */}
              <div className="mb-6 flex justify-center">
                <img 
                  src="/silly-bandz.png" 
                  alt="Colorful Silly Bandz bracelets on wrists" 
                  className="w-64 h-48 object-cover rounded-lg shadow-lg"
                />
              </div>
              
              {parseFloat(usdcBalance) < 0.16 ? (
                <a
                  href="https://faucet.circle.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-6 rounded-lg font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <span>💧</span>
                  <span>Get USDC from Faucet</span>
                </a>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={isSubscribing}
                  className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors ${
                    isSubscribing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-purple-500 hover:bg-purple-600'
                  }`}
                >
                  {isSubscribing ? 'Processing...' : 'Subscribe (every 10 seconds)'}
                </button>
              )}

              {subscriptionStatus && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${
                  subscriptionStatus.includes('started') 
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : subscriptionStatus.includes('Insufficient') || subscriptionStatus.includes('failed')
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-blue-100 text-blue-700 border border-blue-200'
                }`}>
                  {subscriptionStatus}
                </div>
              )}
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
