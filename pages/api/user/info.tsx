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
      accountId,
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
      accountId,
      methodName: "get_user_permissions",
      args: { user_id: accountId },
    });

    // Get user's ETH address
    const derivationPath = `ethereum-${accountId}`;
    const { address } = await Evm.deriveAddressAndPublicKey(contractId, derivationPath);

    // Get ETH balance
    const balance = await Evm.getBalance(address);

    // Convert BigInt to string for JSON serialization
    const balanceStr = balance.balance.toString();
    const balanceBigInt = BigInt(balanceStr);
    const ethUnit = BigInt(10 ** 18);

    // Format balance: whole.fractional
    const wholePart = (balanceBigInt / ethUnit).toString();
    const fractionalPart = (balanceBigInt % ethUnit).toString().padStart(18, "0").slice(0, 6);
    const formattedBalance = `${wholePart}.${fractionalPart}`;

    return res.status(200).json({
      success: true,
      registered: true,
      accountId,
      ethAddress: address,
      ethBalance: balanceStr, // Keep as string
      ethBalanceFormatted: formattedBalance,
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
