"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

const AccountContext = createContext();

export function AccountProvider({ children }) {
  const [account, setAccount] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let handler;
    if (typeof window !== "undefined" && window.ethereum) {
      handler = (accs) => {
        if (!accs || !Array.isArray(accs) || accs.length === 0 || accs[0] == null) {
          setAccounts([]);
          setAccount("");
        } else {
          setAccounts(accs);
          setAccount(accs[0]);
        }
      };
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accs) => {
          if (!accs || !Array.isArray(accs) || accs.length === 0 || accs[0] == null) {
            setAccounts([]);
            setAccount("");
          } else {
            setAccounts(accs);
            setAccount(accs[0]);
          }
        })
        .catch((err) => {
          setError("Failed to fetch accounts: " + (err?.message || err));
        });
      window.ethereum.on("accountsChanged", handler);
    } else {
      setError(
        "MetaMask extension not found. Please install MetaMask from https://metamask.io/ and refresh the page."
      );
    }
    // Cleanup event listener on unmount
    return () => {
      if (typeof window !== "undefined" && window.ethereum && handler) {
        window.ethereum.removeListener("accountsChanged", handler);
      }
    };
  }, []);

  const switchAccount = async () => {
    if (
      typeof window === "undefined" ||
      !window.ethereum ||
      !window.ethereum.isMetaMask
    ) {
      setError(
        "MetaMask extension not found or not active. Please install and enable MetaMask from https://metamask.io/ and refresh the page. If you have multiple wallets installed, please disable all except MetaMask."
      );
      return;
    }
    setError(""); // Clear error before attempting
    try {
      // Try eth_requestAccounts first
      const accs = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      console.log('[MetaMask] eth_requestAccounts result:', accs);
      if (!accs || !Array.isArray(accs) || accs.length === 0 || accs[0] == null) {
        // Try wallet_requestPermissions as a fallback
        try {
          await window.ethereum.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          });
          // Try eth_requestAccounts again after permissions
          const accs2 = await window.ethereum.request({
            method: "eth_requestAccounts",
          });
          if (!accs2 || !Array.isArray(accs2) || accs2.length === 0 || accs2[0] == null) {
            setAccounts([]);
            setAccount("");
            setError(
              "No active wallet found. Please unlock MetaMask, select an account, and try again. If MetaMask is already unlocked, refresh this page and try again."
            );
            return;
          }
          setAccounts(accs2);
          setAccount(accs2[0]);
          setError("");
          return;
        } catch (permErr) {
          console.error('[MetaMask] wallet_requestPermissions error:', permErr);
          setAccounts([]);
          setAccount("");
          setError(
            "No active wallet found. Please unlock MetaMask, select an account, and try again. If MetaMask is already unlocked, refresh this page and try again."
          );
          return;
        }
      }
      setAccounts(accs);
      setAccount(accs[0]);
      setError(""); // Clear error on successful connect
    } catch (err) {
      setAccounts([]);
      setAccount("");
      console.error('[MetaMask] eth_requestAccounts error:', err);
      if (err?.code === -32002) {
        setError(
          "MetaMask connection request is already pending. Please check your MetaMask extension."
        );
      } else if (
        err?.code === 4001 ||
        (err?.message && err.message.toLowerCase().includes("user rejected"))
      ) {
        setError("MetaMask connection was rejected.");
      } else if (
        err?.code === -32603 &&
        err?.message &&
        err.message.toLowerCase().includes("no active wallet")
      ) {
        // Try wallet_requestPermissions as a fallback
        try {
          await window.ethereum.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          });
          // Try eth_requestAccounts again after permissions
          const accs2 = await window.ethereum.request({
            method: "eth_requestAccounts",
          });
          if (!accs2 || !Array.isArray(accs2) || accs2.length === 0 || accs2[0] == null) {
            setAccounts([]);
            setAccount("");
            setError(
              "No active wallet found. Please unlock MetaMask, select an account, and try again. If MetaMask is already unlocked, refresh this page and try again."
            );
            return;
          }
          setAccounts(accs2);
          setAccount(accs2[0]);
          setError("");
          return;
        } catch (permErr) {
          console.error('[MetaMask] wallet_requestPermissions error:', permErr);
          setAccounts([]);
          setAccount("");
          setError(
            "No active wallet found. Please unlock MetaMask, select an account, and try again. If MetaMask is already unlocked, refresh this page and try again."
          );
          return;
        }
      } else {
        setError("Failed to connect to MetaMask: " + (err?.message || err));
      }
    }
  };

  const disconnectAccount = () => {
    setAccount("");
    setAccounts([]);
    setError("");
  };

  return (
    <AccountContext.Provider
      value={{ account, accounts, switchAccount, disconnectAccount, error }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}