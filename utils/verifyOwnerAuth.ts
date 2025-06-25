import { NextApiRequest, NextApiResponse } from "next";
import { getBalance } from "./near-provider.js";
import * as bs58 from "bs58";
import nacl from "tweetnacl";
import crypto from "crypto";

// Extend NextApiRequest to include user property
declare module "next" {
  interface NextApiRequest {
    user?: { accountId: string };
  }
}

interface VerifyOwnerResult {
  accountId: string;
  message: string;
  blockId: string;
  publicKey: string;
  signature: string;
}

// Verify the signature from verifyOwner
export async function verifyOwnerSignature(result: VerifyOwnerResult): Promise<boolean> {
  try {
    const { accountId, message, blockId, publicKey, signature } = result;

    // Reconstruct the message that was signed
    const messageObj = {
      accountId,
      message,
      blockId,
      publicKey,
    };

    // The message must be stringified in the exact same way
    const messageStr = JSON.stringify(messageObj);
    console.log("Message to verify:", messageStr);

    // Convert signature from base64 to bytes
    const signatureBytes = Buffer.from(signature, "base64");

    // Convert message to bytes
    const messageBytes = Buffer.from(messageStr, "utf8");

    // Extract the actual public key (remove the "ed25519:" prefix if present)
    const publicKeyStr = publicKey.startsWith("ed25519:")
      ? publicKey.replace("ed25519:", "")
      : publicKey;

    // Decode the public key from base58
    const publicKeyBytes = bs58.decode(publicKeyStr);

    // Verify the signature
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

    console.log("Signature verification result:", isValid);
    return isValid;
  } catch (error) {
    console.error("Error verifying signature:", error);
    return false;
  }
}

// Check if the public key belongs to the account
export async function verifyKeyBelongsToAccount(
  accountId: string,
  publicKey: string
): Promise<boolean> {
  try {
    const config = {
      networkId: "testnet",
      nodeUrl: "https://test.rpc.fastnear.com",
    };

    const nearAPI = await import("near-api-js");
    const near = await nearAPI.connect(config);
    const account = await near.account(accountId);

    // Get all access keys for the account
    const keys = await account.getAccessKeys();

    // Check if the provided public key exists in the account's keys
    const keyExists = keys.some((key) => key.public_key === publicKey);

    console.log(`Key ${publicKey} belongs to ${accountId}:`, keyExists);
    return keyExists;
  } catch (error) {
    console.error("Error checking key ownership:", error);
    return false;
  }
}

// Auth middleware using verifyOwner
export function verifyOwnerAuthMiddleware(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void | NextApiResponse>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Extract verifyOwner result from headers
      const accountId = req.headers["accountid"] as string;
      const message = req.headers["message"] as string;
      const blockId = req.headers["blockid"] as string;
      const publicKey = req.headers["publickey"] as string;
      const signature = req.headers["signature"] as string;

      console.log("VerifyOwner Auth - AccountId:", accountId);
      console.log("VerifyOwner Auth - Message:", message);
      console.log("VerifyOwner Auth - BlockId:", blockId);
      console.log("VerifyOwner Auth - PublicKey:", publicKey);
      console.log("VerifyOwner Auth - Signature:", signature);

      if (!accountId || !message || !blockId || !publicKey || !signature) {
        return res.status(401).json({ error: "Missing authentication data" });
      }

      // Create the verifyOwner result object
      const verifyOwnerResult: VerifyOwnerResult = {
        accountId,
        message,
        blockId,
        publicKey,
        signature,
      };

      // Step 1: Verify the signature
      const isSignatureValid = await verifyOwnerSignature(verifyOwnerResult);
      if (!isSignatureValid) {
        console.log("VerifyOwner Auth - Invalid signature");
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Step 2: Verify the key belongs to the account
      const keyBelongsToAccount = await verifyKeyBelongsToAccount(accountId, publicKey);
      if (!keyBelongsToAccount) {
        console.log("VerifyOwner Auth - Key does not belong to account");
        return res.status(401).json({ error: "Key does not belong to account" });
      }

      // Step 3: Check if account has balance (optional but recommended)
      const balance = await getBalance(accountId);
      console.log("VerifyOwner Auth - Balance:", balance);

      if (!balance || balance.available === "0") {
        return res.status(401).json({ error: "Account not found or has no balance" });
      }

      // Authentication successful
      req.user = { accountId };
      return handler(req, res);
    } catch (error) {
      console.error("VerifyOwner Auth - Error:", error);
      return res.status(401).json({ error: "Authentication failed" });
    }
  };
}
