import { simpleAuthMiddleware } from "../../../utils/simpleAuth";
import { Evm } from "../../../utils/ethereum";
import { NextApiRequest, NextApiResponse } from "next";

const contractId = process.env.NEXT_PUBLIC_contractId;

interface RegisterRequest extends NextApiRequest {
  body: {
    accountId: string;
    derivationPath: string;
    txHash?: string;
  };
}

async function handler(req: RegisterRequest, res: NextApiResponse) {
  const { accountId } = req.user;
  const { derivationPath, txHash } = req.body;

  try {
    // Verify the derivation path matches the expected format
    const expectedPath = `ethereum-${accountId}`;
    if (derivationPath !== expectedPath) {
      return res.status(400).json({
        error: "Invalid derivation path for user",
      });
    }

    // Derive ETH address for user
    const { address } = await Evm.deriveAddressAndPublicKey(contractId, derivationPath);

    return res.status(200).json({
      success: true,
      accountId,
      ethAddress: address,
      derivationPath,
      txHash,
      message: "User registration confirmed",
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      error: error.message || "Registration confirmation failed",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
