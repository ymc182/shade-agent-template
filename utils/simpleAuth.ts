import { NextApiRequest, NextApiResponse } from "next";
import { getBalance } from "./near-provider.js";

// Extend NextApiRequest to include user property
declare module "next" {
  interface NextApiRequest {
    user?: { accountId: string };
  }
}

// Simple auth middleware that just checks if the user has a NEAR account with balance
export function simpleAuthMiddleware(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void | NextApiResponse>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const accountId = req.headers["accountid"] as string;

    console.log("Simple Auth - AccountId:", accountId);

    if (!accountId) {
      return res.status(401).json({ error: "Missing accountId" });
    }

    try {
      // Just check if account exists and has balance
      const balance = await getBalance(accountId);
      console.log("Simple Auth - Balance:", balance);

      if (!balance || balance.available === "0") {
        return res.status(401).json({ error: "Account not found or has no balance" });
      }

      req.user = { accountId };
      return handler(req, res);
    } catch (error) {
      console.error("Simple Auth - Error:", error);
      return res.status(401).json({ error: "Authentication failed" });
    }
  };
}
