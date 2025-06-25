import { simpleAuthMiddleware } from "../../../utils/simpleAuth";
import { Evm } from "../../../utils/ethereum";
import { utils } from "chainsig.js";
import { NextApiRequest, NextApiResponse } from "next";
const { toRSV } = utils.cryptography;

// Helper function to convert hex strings back to BigInt for transaction reconstruction
// Only convert numeric fields, not addresses
function deserializeBigInt(obj: any, key?: string): any {
  if (typeof obj === "string" && obj.startsWith("0x")) {
    // Only convert numeric fields to BigInt, keep addresses as hex strings
    const numericFields = [
      "value",
      "gasLimit",
      "gasPrice",
      "maxFeePerGas",
      "maxPriorityFeePerGas",
      "nonce",
    ];
    if (key && numericFields.includes(key)) {
      try {
        return BigInt(obj);
      } catch (e) {
        // If conversion fails, return as string
        return obj;
      }
    }
    // Keep addresses and other hex strings as-is
    return obj;
  } else if (Array.isArray(obj)) {
    return obj.map((item, index) => deserializeBigInt(item, key));
  } else if (obj !== null && typeof obj === "object") {
    const deserialized: any = {};
    for (const objKey in obj) {
      if (obj.hasOwnProperty(objKey)) {
        deserialized[objKey] = deserializeBigInt(obj[objKey], objKey);
      }
    }
    return deserialized;
  }
  return obj;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accountId } = req.user;
  const { preparedTransaction, signature, to, value } = req.body;

  if (!preparedTransaction || !signature) {
    return res.status(400).json({ error: "Missing prepared transaction or signature" });
  }

  try {
    // Deserialize hex strings back to BigInt values
    const deserializedTransaction = deserializeBigInt(preparedTransaction);

    // Reconstruct and broadcast the signed transaction
    const signedTransaction = Evm.finalizeTransactionSigning({
      transaction: deserializedTransaction,
      rsvSignatures: [toRSV(signature)],
    });

    const txHash = await Evm.broadcastTx(signedTransaction);

    return res.status(200).json({
      success: true,
      txHash: txHash.hash,
      from: deserializedTransaction.from,
      to,
      value: value.toString(),
      explorerUrl: `https://sepolia.etherscan.io/tx/${txHash.hash}`,
    });
  } catch (error) {
    console.error("Transaction finalization error:", error);
    return res.status(500).json({
      error: error.message || "Transaction finalization failed",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
