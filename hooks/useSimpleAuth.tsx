"use client";

import { walletSelector } from "../utils/wallet-selector";

export function useSimpleAuth() {
  async function getAuthHeaders(accountId: string) {
    return {
      accountid: accountId,
    };
  }

  return {
    getAuthHeaders,
  };
}
