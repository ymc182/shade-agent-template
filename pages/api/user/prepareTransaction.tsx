import { simpleAuthMiddleware } from "../../../utils/simpleAuth";
import { Evm } from "../../../utils/ethereum";
import { NextApiRequest, NextApiResponse } from "next";

const contractId = process.env.NEXT_PUBLIC_contractId;

// Helper function to convert BigInt values to hex strings for JSON serialization
function serializeBigInt(obj: any): any {
  if (typeof obj === "bigint") {
    // Convert BigInt to hex string for proper reconstruction
    return "0x" + obj.toString(16);
  } else if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  } else if (obj !== null && typeof obj === "object") {
    const serialized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        serialized[key] = serializeBigInt(obj[key]);
      }
    }
    return serialized;
  }
  return obj;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accountId } = req.user;
  const { to, value = "0", data = "0x" } = req.body;

  if (!to) {
    return res.status(400).json({ error: "Missing 'to' address" });
  }

  const derivationPath = `ethereum-${accountId}`;

  try {
    // Get user's ETH address
    const { address: fromAddress } = await Evm.deriveAddressAndPublicKey(
      contractId,
      derivationPath
    );

    // Check user's ETH balance
    const balance = await Evm.getBalance(fromAddress);
    const valueWei = BigInt(value);

    if (BigInt(balance.balance) < valueWei) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: valueWei.toString(),
        available: balance.balance.toString(),
        ethAddress: fromAddress,
      });
    }

    // WORKAROUND for chainsig.js ASCII encoding bug:
    // The library has a bug where it ASCII-encodes numeric values when 'value' is present
    // This causes gas limit and value to be encoded incorrectly in RLP format
    // Unfortunately, there's no easy fix without modifying the library itself

    // For now, we'll prepare the transaction normally and document the issue
    const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
      from: fromAddress as `0x${string}`,
      to: to as `0x${string}`,
      value: valueWei,
      data: (data || "0x") as `0x${string}`,
    });

    // Log warning about the known issue
    if (valueWei > BigInt(0)) {
      console.warn(
        "WARNING: chainsig.js v1.1.6 has a bug that ASCII-encodes numeric values in transactions with ETH transfers. This may cause transaction failures."
      );
    }

    // Serialize BigInt values for JSON response
    const serializedTransaction = serializeBigInt(transaction);
    const serializedHashToSign = serializeBigInt(hashesToSign[0]);

    return res.status(200).json({
      success: true,
      transaction: serializedTransaction,
      hashToSign: serializedHashToSign,
      fromAddress,
      to,
      value: value.toString(),
    });
  } catch (error) {
    console.error("Transaction preparation error:", error);
    return res.status(500).json({
      error: error.message || "Transaction preparation failed",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
