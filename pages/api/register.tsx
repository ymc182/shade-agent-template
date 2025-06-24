import type { NextApiRequest, NextApiResponse } from "next";
import { registerWorker } from "@neardefi/shade-agent-js";

export const dynamic = "force-dynamic";

type Data =
  | {
      registered: boolean;
    }
  | {
      error: string;
    };

export default async function register(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    if (process.env.NEXT_PUBLIC_accountId !== undefined) {
      // cannot register worker when running locally
      console.log("cannot register while running locally");
      res.status(200).json({ registered: false });
      return;
    }

    const registered = await registerWorker();

    res.status(200).json({ registered });
  } catch (error) {
    console.error("Error registering worker:", error);
    res.status(500).json({ error: "Failed to register worker" });
  }
}
