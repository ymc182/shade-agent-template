import { contractView } from "@neardefi/shade-agent-js";
import { simpleAuthMiddleware } from "../../../utils/simpleAuth";
import { Evm } from "../../../utils/ethereum";
import { NextApiRequest, NextApiResponse } from "next";

const contractId = process.env.NEXT_PUBLIC_contractId;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { accountId } = req.user;

  try {
    // Check if user is registered
    const isRegistered = await contractView({
      methodName: "is_user_registered",
      args: { user_id: accountId },
    });

    if (!isRegistered) {
      return res.status(200).json({
        success: true,
        registered: false,
        accountId,
        message: "User not registered yet",
      });
    }

    // Get user permissions
    const permissions = await contractView({
      methodName: "get_user_permissions",
      args: { user_id: accountId },
    });

    // Get user's ETH address
    const derivationPath = `ethereum-${accountId}`;
    const { address } = await Evm.deriveAddressAndPublicKey(contractId, derivationPath);

    // Get ETH balance
    const balance = await Evm.getBalance(address);

    return res.status(200).json({
      success: true,
      registered: true,
      accountId,
      ethAddress: address,
      ethBalance: balance.balance,
      ethBalanceFormatted:
        (BigInt(balance.balance) / BigInt(10 ** 18)).toString() +
        "." +
        (BigInt(balance.balance) % BigInt(10 ** 18)).toString().padStart(18, "0").slice(0, 6),
      permissions,
      derivationPath,
    });
  } catch (error) {
    console.error("Error getting user info:", error);
    return res.status(500).json({
      error: error.message || "Failed to get user info",
      details: error.toString(),
    });
  }
}

export default simpleAuthMiddleware(handler);
