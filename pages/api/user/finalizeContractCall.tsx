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
    console.log("Finalizing contract call for user:", accountId);
    console.log("Transaction to:", transactionDetails.to);
    console.log("Transaction value:", transactionDetails.value);

    // Deserialize the original transaction
    const transaction = deserializeTransaction(serializedTransaction);
    console.log("Deserialized transaction from:", transaction.from);

    // Check the balance of the from address
    if (transaction.from) {
      const balance = await Evm.getBalance(transaction.from);
      console.log("Balance of from address", transaction.from, ":", balance.balance.toString());
    }

    // Finalize with the signature from the client using the ORIGINAL transaction
    const signedTransaction = Evm.finalizeTransactionSigning({
      transaction,
      rsvSignatures: [toRSV(signature)],
    });

    console.log("Transaction signed, broadcasting...");

    // Broadcast the signed transaction
    const txHash = await Evm.broadcastTx(signedTransaction);

    console.log("Transaction broadcast successful:", txHash.hash);

    // Return success with transaction details
    res.status(200).json({
      success: true,
      txHash: txHash.hash,
      from: transaction.from,
      to: transactionDetails.to,
      value: transactionDetails.value,
      explorerUrl: `https://sepolia.etherscan.io/tx/${txHash.hash}`,
    });
  } catch (error) {
    console.error("Contract call finalization error:", error);
    res.status(500).json({
      error: error.message || "Transaction finalization failed",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
