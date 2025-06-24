import * as nearAPI from "near-api-js";
import { getBalance } from "./near-provider.js";
import { verifySignature, verifyFullKeyBelongsToUser } from "@near-wallet-selector/core";
import { NextApiRequest, NextApiResponse } from "next";
import { utils } from "near-api-js";

// Extend NextApiRequest to include user property
declare module "next" {
  interface NextApiRequest {
    user?: { accountId: string };
  }
}

export async function getPublicKeyForAccount(accountId) {
  // For testnet, we'll need to query the account's access keys
  const config = {
    networkId: "testnet",
    nodeUrl: "https://test.rpc.fastnear.com",
  };

  const near = await nearAPI.connect(config);
  const account = await near.account(accountId);

  try {
    const keys = await account.getAccessKeys();
    if (keys.length > 0) {
      // Return the first full access key
      return keys[0].public_key;
    }
  } catch (error) {
    console.error("Error fetching public key:", error);
  }

  return null;
}

async function authenticate({
  accountId,
  publicKey,
  signature,
  message,
  recipient,
  nonce,
  callbackUrl,
}: {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
  recipient: string;
  nonce: Buffer;
  callbackUrl: string;
}) {
  // A user is correctly authenticated if:
  // - The key used to sign belongs to the user and is a Full Access Key
  // - The object signed contains the right message and domain
  const full_key_of_user = await verifyFullKeyBelongsToUser({
    accountId,
    publicKey,
    network: {
      nodeUrl: "https://test.rpc.fastnear.com",
      networkId: "testnet",
      helperUrl: "https://helper.testnet.near.org",
      explorerUrl: "https://testnet.nearblocks.io",
      indexerUrl: "https://api.testnet.near.org",
    },
  });
  console.log("full_key_of_user", full_key_of_user);
  const valid_signature = verifySignature({
    publicKey,
    signature,
    message,
    recipient,
    nonce,
    callbackUrl,
  });
  console.log("valid_signature", valid_signature);
  return valid_signature && full_key_of_user;
}

export async function verifyNearSignature(
  accountId: string,
  signature: string,
  message: string,
  publicKey: string,
  nonce: Buffer,
  callbackUrl: string,
  recipient: string
) {
  const isValid = await authenticate({
    accountId,
    publicKey,
    signature,
    message,
    recipient,
    nonce,
    callbackUrl,
  });
  return isValid;
}

export async function verifyOwnerSignature(
  accountId: string,
  signature: string,
  message: string,
  publicKey: string,
  blockId: string,
  keyType: number
) {
  try {
    // Verify that the key belongs to the user and is a full access key
    const full_key_of_user = await verifyFullKeyBelongsToUser({
      accountId,
      publicKey,
      network: {
        nodeUrl: "https://test.rpc.fastnear.com",
        networkId: "testnet",
        helperUrl: "https://helper.testnet.near.org",
        explorerUrl: "https://testnet.nearblocks.io",
        indexerUrl: "https://api.testnet.near.org",
      },
    });

    if (!full_key_of_user) {
      console.log("Key does not belong to user or is not a full access key");
      return false;
    }

    // Reconstruct the signed message data
    const messageData = {
      accountId,
      message,
      blockId,
      publicKey: publicKey.startsWith("ed25519:") ? publicKey.split(":")[1] : publicKey,
      keyType,
    };

    // Convert to the exact format that was signed
    const messageToVerify = JSON.stringify(messageData);
    console.log("Message to verify:", messageToVerify);

    // Use near-api-js utils to verify the signature
    const messageBytes = Buffer.from(messageToVerify, "utf8");
    const signatureBytes = Buffer.from(signature, "base64");

    // Parse the public key
    const publicKeyObj = utils.PublicKey.fromString(publicKey);

    // Verify the signature using near-api-js
    const isValidSignature = publicKeyObj.verify(messageBytes, signatureBytes);
    console.log("Signature verification result:", isValidSignature);

    return isValidSignature;
  } catch (error) {
    console.error("Error verifying owner signature:", error);
    return false;
  }
}

export function authMiddleware(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void | NextApiResponse>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const accountId = req.headers["accountid"] as string;
    const signature = req.headers["signature"] as string;
    const publicKey = req.headers["publickey"] as string;
    const message = req.headers["message"] as string;
    const blockId = req.headers["blockid"] as string;
    const keyType = req.headers["keytype"] as string;

    console.log("Auth middleware - AccountId:", accountId);
    console.log("Auth middleware - Signature:", signature);
    console.log("Auth middleware - Message:", message);
    console.log("Auth middleware - PublicKey:", publicKey);
    console.log("Auth middleware - BlockId:", blockId);
    console.log("Auth middleware - KeyType:", keyType);

    if (!accountId || !signature || !publicKey || !message || !blockId) {
      return res.status(401).json({ error: "Missing authentication" });
    }

    // Verify the verifyOwner result
    const isValid = await verifyOwnerSignature(
      accountId,
      signature,
      message,
      publicKey,
      blockId,
      parseInt(keyType) || 0
    );
    console.log("Auth middleware - Signature valid:", isValid);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Check if account exists and has balance
    const balance = await getBalance(accountId);
    console.log("Auth middleware - Balance:", balance);

    if (!balance || balance.available === "0") {
      return res.status(401).json({ error: "Account not found or has no balance" });
    }

    req.user = { accountId };
    return handler(req, res);
  };
}

// Aux method
