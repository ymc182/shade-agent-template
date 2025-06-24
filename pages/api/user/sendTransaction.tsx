import { contractCall } from "@neardefi/shade-agent-js";
import { simpleAuthMiddleware } from "../../../utils/simpleAuth";
import { Evm } from "../../../utils/ethereum";
import { utils } from "chainsig.js";
import { NextApiRequest, NextApiResponse } from "next";
const { toRSV } = utils.cryptography;

const contractId = process.env.NEXT_PUBLIC_contractId;

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
    const estimatedGas = BigInt("21000000000000000"); // ~0.021 ETH for gas

    if (BigInt(balance.balance) < valueWei + estimatedGas) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: (valueWei + estimatedGas).toString(),
        available: balance.balance,
        ethAddress: fromAddress,
      });
    }

    // Prepare transaction
    const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
      from: fromAddress as `0x${string}`,
      to,
      value: value.toString(),
      data,
    });

    // Get signature through worker agent for this specific user
    const signRes = await contractCall({
      methodName: "sign_tx_for_user",
      args: {
        user_id: accountId,
        payload: hashesToSign[0],
        derivation_path: derivationPath,
        key_version: 0,
      },
    });

    // Reconstruct and broadcast the signed transaction
    const signedTransaction = Evm.finalizeTransactionSigning({
      transaction,
      rsvSignatures: [toRSV(signRes)],
    });

    const txHash = await Evm.broadcastTx(signedTransaction);

    return res.status(200).json({
      success: true,
      txHash: txHash.hash,
      from: fromAddress,
      to,
      value: value.toString(),
      explorerUrl: `https://sepolia.etherscan.io/tx/${txHash.hash}`,
    });
  } catch (error) {
    console.error("Transaction error:", error);
    return res.status(500).json({
      error: error.message || "Transaction failed",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
