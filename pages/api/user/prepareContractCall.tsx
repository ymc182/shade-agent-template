import { simpleAuthMiddleware } from "../../../utils/simpleAuth";
import { Evm } from "../../../utils/ethereum";
import { NextApiRequest, NextApiResponse } from "next";

const contractId = process.env.NEXT_PUBLIC_contractId;

// Helper function to safely serialize transaction for storage
function serializeTransaction(transaction: any): any {
  const serialized: any = {};
  for (const key in transaction) {
    if (transaction.hasOwnProperty(key)) {
      const value = transaction[key];
      if (typeof value === "bigint") {
        serialized[key] = { type: "bigint", value: value.toString() };
      } else if (value instanceof Uint8Array) {
        serialized[key] = { type: "uint8array", value: Array.from(value) };
      } else {
        serialized[key] = value;
      }
    }
  }
  return serialized;
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

    console.log("Contract call from:", fromAddress);
    console.log("Contract call to:", to);
    console.log("Value:", value);
    console.log("Has data:", data && data !== "0x");

    // Check user's ETH balance
    const balance = await Evm.getBalance(fromAddress);
    const valueWei = BigInt(value);
    const estimatedGas = BigInt(100000) * BigInt(30000000000); // Rough estimate

    if (BigInt(balance.balance) < valueWei + estimatedGas) {
      return res.status(400).json({
        error: "Insufficient balance for transaction",
        required: (valueWei + estimatedGas).toString(),
        available: balance.balance.toString(),
        ethAddress: fromAddress,
      });
    }

    // Prepare transaction
    const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
      from: fromAddress as `0x${string}`,
      to: to as `0x${string}`,
      value: valueWei,
      data: (data || "0x") as `0x${string}`,
    });

    console.log("Transaction prepared");
    console.log("Transaction type:", transaction.type);
    console.log("Transaction gas:", transaction.gas?.toString());

    // Store the full transaction in a safe format
    const safeTransaction = serializeTransaction(transaction);

    res.status(200).json({
      success: true,
      hashToSign: hashesToSign[0],
      serializedTransaction: safeTransaction,
      transactionDetails: {
        from: fromAddress,
        to,
        value: value.toString(),
        data,
      },
      derivationPath,
    });
  } catch (error) {
    console.error("Contract call preparation error:", error);
    res.status(500).json({
      error: error.message || "Transaction preparation failed",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
