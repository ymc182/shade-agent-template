import { NextApiRequest, NextApiResponse } from "next";
import { getBalance } from "../../../utils/near-provider";
import { verifySignature, verifyFullKeyBelongsToUser, Network } from "@near-wallet-selector/core";
interface VerifyRequest {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
  nonce: string;
  recipient: string;
  callbackUrl?: string;
  state?: string;
}

// NEP-413 Payload structure
class Payload {
  tag: number;
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string | null;

  constructor({
    message,
    nonce,
    recipient,
    callbackUrl,
  }: {
    message: string;
    nonce: Uint8Array;
    recipient: string;
    callbackUrl?: string | null;
  }) {
    this.tag = 2147484061; // NEP-413 tag
    this.message = message;
    this.nonce = nonce;
    this.recipient = recipient;
    this.callbackUrl = callbackUrl || null;
  }
}

// Borsh schema for the payload
const payloadSchema = {
  struct: {
    tag: "u32",
    message: "string",
    nonce: { array: { type: "u8", len: 32 } },
    recipient: "string",
    callbackUrl: { option: "string" },
  },
};

const network: Network = {
  networkId: "testnet",
  nodeUrl: "https://test.rpc.fastnear.com",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://explorer.testnet.near.org",
  indexerUrl: "https://api.testnet.near.org/indexer",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accountId, publicKey, signature, message, recipient, nonce } = req.body;

    if (!accountId || !publicKey || !signature || !message || !nonce || !recipient) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Convert base64 nonce to Uint8Array
    const nonceArray = Buffer.from(nonce, "base64");

    const isAuthenticated = await authenticate({
      accountId,
      publicKey,
      signature,
      message,
      recipient,
      nonce: nonceArray,
    });
    if (!isAuthenticated) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    // Authentication successful
    // In production, you would create a session token here
    return res.status(200).json({
      success: true,
      accountId,
      message: "Authentication successful",
    });
  } catch (error) {
    console.error("Auth verification error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

async function authenticate({
  accountId,
  publicKey,
  signature,
  message,
  recipient,
  nonce,
}: {
  accountId: string;
  publicKey: string;
  signature: any;
  message: string;
  recipient: string;
  nonce: Buffer;
}) {
  // A user is correctly authenticated if:
  // - The key used to sign belongs to the user and is a Full Access Key
  // - The object signed contains the right message and domain
  console.log("================");
  console.log("accountId", accountId);
  console.log("publicKey", publicKey);
  console.log("signature", signature);
  console.log("message", message);
  console.log("recipient", recipient);
  console.log("nonce", nonce);
  const full_key_of_user = await verifyFullKeyBelongsToUser({ accountId, publicKey, network });
  const valid_signature = verifySignature({ publicKey, signature, message, recipient, nonce });
  console.log("valid_signature", valid_signature);
  console.log("full_key_of_user", full_key_of_user);
  return valid_signature && full_key_of_user;
}
