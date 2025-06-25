import { simpleAuthMiddleware } from "../../../utils/simpleAuth";
import { ethContractAbi, ethContractAddress, Evm } from "../../../utils/ethereum";
import { getEthereumPriceUSD } from "../../../utils/fetch-eth-price";
import { Contract, JsonRpcProvider } from "ethers";
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

  try {
    // Get the ETH price from the oracle
    const ethPrice = await getEthereumPriceUSD();

    // Prepare the transaction payload
    const derivationPath = `ethereum-${accountId}`;

    // Get user's ETH address
    const { address: senderAddress } = await Evm.deriveAddressAndPublicKey(
      contractId,
      derivationPath
    );

    console.log("Derived ETH address for user", accountId, ":", senderAddress);
    console.log("Derivation path:", derivationPath);

    const provider = new JsonRpcProvider(
      process.env.NEXT_PUBLIC_ethRpcUrl || "https://eth-sepolia.public.blastapi.io"
    );
    const contract = new Contract(ethContractAddress, ethContractAbi, provider);
    const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);

    const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
      from: senderAddress as `0x${string}`,
      to: ethContractAddress as `0x${string}`,
      data: data as `0x${string}`,
    });

    // Log to see what we're getting
    console.log("Transaction object keys:", Object.keys(transaction));
    console.log("Transaction type:", transaction.type);
    console.log("HashToSign:", hashesToSign[0]);

    // Store the full transaction in a safe format
    const safeTransaction = serializeTransaction(transaction);

    // Instead of serializing the full transaction, just send the hash
    // The client will sign it and we'll reconstruct the transaction server-side
    res.status(200).json({
      success: true,
      hashToSign: hashesToSign[0], // Send raw hash, not serialized
      // Store the serialized transaction that we'll need later
      serializedTransaction: safeTransaction,
      transactionDetails: {
        from: senderAddress,
        to: ethContractAddress,
        data: data,
        ethPrice: ethPrice,
      },
      derivationPath,
      newPrice: (ethPrice / 100).toFixed(2),
    });
  } catch (error) {
    console.error("Price update preparation error:", error);
    res.status(500).json({
      error: error.message || "Failed to prepare price update",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
