import type { NextApiRequest, NextApiResponse } from "next";
import { contractCall } from "@neardefi/shade-agent-js";
import { ethContractAbi, ethContractAddress, ethRpcUrl, Evm } from "../../utils/ethereum";
import { getEthereumPriceUSD } from "../../utils/fetch-eth-price";
import { Contract, JsonRpcProvider } from "ethers";
import { utils } from "chainsig.js";
import { NextRequest, NextResponse } from "next/server";
const { toRSV } = utils.cryptography;

const contractId = process.env.NEXT_PUBLIC_contractId;

type Data =
  | {
      txHash: string;
      newPrice: string;
    }
  | {
      verified: boolean;
      error: string;
    };

export default async function sendTransaction(req: NextRequest, res: NextResponse) {
  // Get the ETH price
  const ethPrice = await getEthereumPriceUSD();

  // Get the transaction and payload to sign
  const { transaction, hashesToSign } = await getPricePayload(ethPrice);

  let signRes;
  let verified = false;
  // Call the agent contract to get a signature for the payload
  try {
    signRes = await contractCall({
      methodName: "sign_tx",
      args: {
        payload: hashesToSign[0],
        derivation_path: "ethereum-1",
        key_version: 0,
      },
    });
    verified = true;
  } catch (e) {
    console.error("Contract call error:", e);
  }

  if (!verified) {
    return NextResponse.json({ verified, error: "Failed to send price" }, { status: 400 });
  }

  // Reconstruct the signed transaction
  const signedTransaction = Evm.finalizeTransactionSigning({
    transaction,
    rsvSignatures: [toRSV(signRes)],
  });

  // Broadcast the signed transaction
  const txHash = await Evm.broadcastTx(signedTransaction);

  // Send back both the txHash and the new price optimistically
  return NextResponse.json({
    txHash: txHash.hash,
    newPrice: (ethPrice / 100).toFixed(2), // Format the price the same way as in getPrice
  });
}

async function getPricePayload(ethPrice: number) {
  const { address: senderAddress } = await Evm.deriveAddressAndPublicKey(contractId, "ethereum-1");
  const provider = new JsonRpcProvider(ethRpcUrl);
  const contract = new Contract(ethContractAddress, ethContractAbi, provider);
  const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);
  const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
    from: senderAddress as `0x${string}`,
    to: ethContractAddress as `0x${string}`,
    data: data as `0x${string}`,
  });

  return { transaction, hashesToSign };
}

export async function getPricePayloadByAgent(ethPrice: number, userAccountId: string) {
  const { address: senderAddress } = await Evm.deriveAddressAndPublicKey(
    contractId,
    `ethereum-${userAccountId}`
  );
  const provider = new JsonRpcProvider(ethRpcUrl);
  const contract = new Contract(ethContractAddress, ethContractAbi, provider);
  const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);
  const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
    from: senderAddress as `0x${string}`,
    to: ethContractAddress as `0x${string}`,
    data: data as `0x${string}`,
  });

  return { transaction, hashesToSign };
}
