"use client";
import { useAccount } from './AccountContext';

export default function AccountSwitcher() {
  const { account, accounts, switchAccount } = useAccount();

  const handleConnect = async () => {
    if (window.ethereum) {
      await switchAccount();
    }
  };

  return (
    <div style={{ position: 'fixed', top: 10, left: 10, zIndex: 1000 }}>
      <button
        onClick={handleConnect}
        className="bg-black hover:bg-gray-900 text-white px-3 py-1 rounded-lg text-sm font-medium mr-2"
        title={account ? 'Change MetaMask Account' : 'Connect MetaMask'}
      >
        {account ? 'Change Account' : 'Connect MetaMask'}
      </button>
      <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
        {account ? `${account.slice(0, 7)}...${account.slice(-6)}` : 'No account connected'}
      </span>
    </div>
  );
}

