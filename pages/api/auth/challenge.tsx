import { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Generate a cryptographically secure random challenge
    const challenge = randomBytes(32).toString("base64");

    // Store challenge in session or temporary storage (for demo, we'll return it)
    // In production, you'd want to store this server-side with a TTL

    return res.status(200).json({
      challenge,
      message: "Login with NEAR",
      recipient: process.env.NEXT_PUBLIC_contractId || "shade-agent.testnet",
    });
  } catch (error) {
    console.error("Error generating challenge:", error);
    return res.status(500).json({ error: "Failed to generate challenge" });
  }
}
