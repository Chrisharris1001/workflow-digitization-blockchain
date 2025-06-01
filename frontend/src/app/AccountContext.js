'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

const AccountContext = createContext();

export function AccountProvider({ children }) {
  const [account, setAccount] = useState('');
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(accs => {
        setAccounts(accs);
        if (accs.length > 0) setAccount(accs[0]);
      });
      window.ethereum.on('accountsChanged', (accs) => {
        setAccounts(accs);
        if (accs.length > 0) setAccount(accs[0]);
      });
    }
  }, []);

  const switchAccount = async () => {
    if (window.ethereum) {
      try {
        const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccounts(accs);
        if (accs.length > 0) setAccount(accs[0]);
      } catch (err) {
        // User rejected or error
        setAccounts([]);
        setAccount('');
      }
    }
  };

  return (
    <AccountContext.Provider value={{ account, accounts, switchAccount }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}

