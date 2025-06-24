import { NextApiRequest, NextApiResponse } from "next";
import { walletSelector } from "../../../utils/wallet-selector";
import { verifyOwnerSignature } from "../../../utils/verifyOwnerAuth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accountId } = req.user;
  const { message, signature, publicKey } = req.body;

  return res.status(200).json({ success: true });
}
