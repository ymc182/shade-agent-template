"use client";

import { useState } from "react";
import { walletSelector } from "../utils/wallet-selector";

export function useAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  async function authenticate() {
    if (!walletSelector.wallet) {
      throw new Error("Wallet not connected");
    }

    setIsAuthenticating(true);
    try {
      // Step 1: Get challenge from server
      const challengeRes = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!challengeRes.ok) {
        throw new Error("Failed to get challenge");
      }

      const { challenge, message, recipient } = await challengeRes.json();

      const nonce = Buffer.from(challenge, "base64");

      const signatureRes = await walletSelector.wallet.signMessage({ message, recipient, nonce });
      console.log("signatureRes", signatureRes);
      if (!signatureRes) {
        throw new Error("Failed to sign message");
      }
      if (!signatureRes.publicKey) {
        throw new Error("Failed to get public key");
      }
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: signatureRes.accountId,
          publicKey: signatureRes.publicKey,
          signature: signatureRes.signature,
          message,
          recipient,
          nonce: challenge,
        }),
      });
      console.log("verifyRes", verifyRes);
      const result = await verifyRes.json();
      return result;
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function getAuthHeaders(accountId: string) {
    // For now, just return the account ID
    // In production, you'd return a session token from the authenticate() call
    return {
      accountid: accountId,
    };
  }

  return {
    authenticate,
    getAuthHeaders,
    isAuthenticating,
  };
}
