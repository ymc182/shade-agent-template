import { simpleAuthMiddleware } from "../../../utils/simpleAuth";
import { Evm } from "../../../utils/ethereum";
import { utils } from "chainsig.js";
import { NextApiRequest, NextApiResponse } from "next";
const { toRSV } = utils.cryptography;

// Helper function to deserialize transaction
function deserializeTransaction(serialized: any): any {
  const transaction: any = {};
  for (const key in serialized) {
    if (serialized.hasOwnProperty(key)) {
      const value = serialized[key];
      if (value && typeof value === "object" && value.type) {
        if (value.type === "bigint") {
          transaction[key] = BigInt(value.value);
        } else if (value.type === "uint8array") {
          transaction[key] = new Uint8Array(value.value);
        } else {
          transaction[key] = value;
        }
      } else {
        transaction[key] = value;
      }
    }
  }
  return transaction;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accountId } = req.user;
  const { signature, serializedTransaction, transactionDetails } = req.body;

  if (!signature || !serializedTransaction) {
    return res.status(400).json({ error: "Missing signature or transaction" });
  }

  try {
    console.log("User account:", accountId);
    console.log("Transaction details:", transactionDetails);

    // Deserialize the original transaction
    const transaction = deserializeTransaction(serializedTransaction);
    console.log("Deserialized transaction from:", transaction.from);

    // Check the balance of the from address
    if (transaction.from) {
      const balance = await Evm.getBalance(transaction.from);
      console.log("Balance of from address", transaction.from, ":", balance);
    }

    // Finalize with the signature from the client using the ORIGINAL transaction
    const signedTransaction = Evm.finalizeTransactionSigning({
      transaction,
      rsvSignatures: [toRSV(signature)],
    });

    console.log("About to broadcast transaction");

    // Try to decode the signed transaction to see what address it's using
    try {
      console.log("Signed transaction (first 100 chars):", signedTransaction.slice(0, 100));
    } catch (e) {
      console.error("Error inspecting signed transaction:", e);
    }

    // Broadcast the signed transaction
    const txHash = await Evm.broadcastTx(signedTransaction);

    // Return success with transaction details
    res.status(200).json({
      success: true,
      txHash: txHash.hash,
      newPrice: (transactionDetails.ethPrice / 100).toFixed(2),
      explorerUrl: `https://sepolia.etherscan.io/tx/${txHash.hash}`,
    });
  } catch (error) {
    console.error("Transaction finalization error:", error);
    res.status(500).json({
      error: error.message || "Transaction finalization failed",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
