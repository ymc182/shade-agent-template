import { KeyPair, keyStores, Near, utils as nearUtils } from "near-api-js";
import { Evm } from "../../../utils/ethereum";
import { getPricePayloadByAgent } from "../sendTransaction";
import { getEthereumPriceUSD } from "../../../utils/fetch-eth-price";
import { utils } from "chainsig.js";
import { NextResponse } from "next/server";
import { NextApiRequest, NextApiResponse } from "next";
import { KeyPairString } from "near-api-js/lib/utils";
const { toRSV } = utils.cryptography;
const privateKey = process.env.secretKey;
const accountId = process.env.NEXT_PUBLIC_accountId;
const contractId = process.env.NEXT_PUBLIC_contractId;
const keyStore = new keyStores.InMemoryKeyStore();
const keyPair = nearUtils.key_pair.KeyPair.fromString(privateKey as KeyPairString);
keyStore.setKey("testnet", accountId, keyPair);
const near = new Near({
  networkId: "testnet",
  nodeUrl: "https://test.rpc.fastnear.com",
  keyStore: keyStore,
});
const parseSuccessValue = (transaction) => {
  if (transaction.status.SuccessValue.length === 0) return;
  try {
    return JSON.parse(Buffer.from(transaction.status.SuccessValue, "base64").toString("ascii"));
  } catch (e) {
    console.log(`Error parsing success value for transaction ${JSON.stringify(transaction)}`);
  }
};
export const dynamic = "force-dynamic";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userAccountIdRaw = await req.body;
    const userAccountId = JSON.parse(userAccountIdRaw).userAccountId;
    console.log("userAccountId", userAccountId);
    if (!userAccountId) {
      return NextResponse.json({ error: "User account ID is required" }, { status: 400 });
    }
    const result = await updatePrice(userAccountId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to update price" });
  }
}

const updatePrice = async (userAccountId: string) => {
  const agentAccount = await near.account(accountId);
  console.log("agentAccount", agentAccount);
  const ethPrice = await getEthereumPriceUSD();
  const { transaction, hashesToSign } = await getPricePayloadByAgent(ethPrice, userAccountId);
  let verified = false;
  let signRes;
  console.log("hashesToSign", hashesToSign);
  console.log("userAccountId", userAccountId);
  try {
    const tx = await agentAccount.functionCall({
      contractId,
      methodName: "agent_sign_tx",
      args: {
        payload: hashesToSign[0],
        account_id: userAccountId,
      },
      gas: BigInt(300000000000000),
    });
    console.log("tx", tx.receipts, tx.status);
    signRes = parseSuccessValue(tx);
    console.log("signRes", signRes);
    verified = true;
  } catch (error) {
    console.error("Contract call error:", error);
  }

  if (!verified) {
    return { verified: false, error: "Failed to send price" };
  }

  console.log("signRes", signRes);
  console.log("rsv", toRSV(signRes));

  const signedTransaction = Evm.finalizeTransactionSigning({
    transaction,
    rsvSignatures: [toRSV(signRes)],
  });

  // Broadcast the signed transaction
  const txHash = await Evm.broadcastTx(signedTransaction);
  console.log("txHash", txHash);
  // Send back both the txHash and the new price optimistically
  return NextResponse.json({
    txHash: txHash.hash,
    newPrice: (ethPrice / 100).toFixed(2), // Format the price the same way as in getPrice
  });
};
