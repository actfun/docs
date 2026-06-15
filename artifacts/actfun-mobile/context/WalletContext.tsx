import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface WalletContextType {
  address: `0x${string}` | null;
  isConnected: boolean;
  setAddress: (addr: `0x${string}` | null) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  setAddress: () => {},
  disconnect: () => {},
});

const STORAGE_KEY = "@actfun_wallet_address";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddressState] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v) setAddressState(v as `0x${string}`);
    }).catch(() => {});
  }, []);

  const setAddress = useCallback((addr: `0x${string}` | null) => {
    setAddressState(addr);
    if (addr) {
      AsyncStorage.setItem(STORAGE_KEY, addr).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, [setAddress]);

  return (
    <WalletContext.Provider value={{
      address,
      isConnected: !!address,
      setAddress,
      disconnect,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
