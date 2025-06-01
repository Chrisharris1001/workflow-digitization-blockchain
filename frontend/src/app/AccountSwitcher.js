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
        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm font-medium mr-2"
        title={account ? 'Change MetaMask Account' : 'Connect MetaMask'}
      >
        {account ? 'Change Account' : 'Connect MetaMask'}
      </button>
      <span className="font-mono text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
        {account ? account : 'No account connected'}
      </span>
    </div>
  );
}

