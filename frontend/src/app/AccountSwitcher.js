"use client";
import { useAccount } from './AccountContext';
import { useState, useEffect } from 'react';

export default function AccountSwitcher() {
  const { account, accounts, switchAccount, error: contextError } = useAccount();
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (contextError) setError(contextError);
  }, [contextError]);

  const handleConnect = async () => {
    setError('');
    setIsConnecting(true);
    await switchAccount();
    setIsConnecting(false);
  };

  return (
    <div style={{ position: 'fixed', top: 10, left: 10, zIndex: 1000 }}>
      <button
        onClick={handleConnect}
        className="bg-black hover:bg-gray-900 text-white px-3 py-1 rounded-lg text-sm font-medium mr-2"
        title={account ? 'Change MetaMask wallet' : 'Connect Web3 wallet (MetaMask)'}
        disabled={isConnecting}
      >
        {isConnecting ? 'Connecting...' : account ? 'Change Account' : 'Connect MetaMask'}
      </button>
      <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
        {account ? `${account.slice(0, 7)}...${account.slice(-6)}` : 'No account connected'}
      </span>
      {error && (
        <div className="text-red-600 text-xs mt-1 bg-red-50 border border-red-200 rounded px-2 py-1 max-w-xs">
          {error}
          {error.toLowerCase().includes('no active wallet') && (
            <div className="mt-1 text-gray-700">
              <b>Tip:</b> If you do not see a MetaMask popup, open the MetaMask extension manually, unlock it, and select an account. Then try again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}