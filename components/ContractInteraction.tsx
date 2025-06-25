import { useState } from "react";
import { ethers } from "ethers";
import styles from "../styles/Home.module.css";
import { useSimpleAuth } from "../hooks/useSimpleAuth";
import { walletSelector } from "../utils/wallet-selector";

export default function ContractInteraction({ wallet }) {
  const [contractAddress, setContractAddress] = useState("");
  const [contractABI, setContractABI] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [functionArgs, setFunctionArgs] = useState("");
  const [ethValue, setEthValue] = useState("0");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { getAuthHeaders } = useSimpleAuth();

  const callContract = async () => {
    if (!contractAddress || !contractABI || !functionName) {
      setResult({ error: "Please fill in all fields" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const accountId = walletSelector.getAccountId();
      const authHeaders = await getAuthHeaders(accountId);

      // Parse ABI
      const abi = JSON.parse(contractABI);
      const iface = new ethers.Interface(abi);

      // Parse function arguments
      const args = functionArgs ? JSON.parse(`[${functionArgs}]`) : [];

      // Encode function call
      const data = iface.encodeFunctionData(functionName, args);

      // Step 1: Prepare the transaction
      const prepareRes = await fetch("/api/user/prepareContractCall", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          to: contractAddress,
          value: (parseFloat(ethValue) * 10 ** 18).toString(),
          data: data,
        }),
      });

      const prepareData = await prepareRes.json();
      if (!prepareData.success) {
        setResult({ error: prepareData.error || "Transaction preparation failed" });
        setLoading(false);
        return;
      }

      // Step 2: Sign with NEAR wallet
      const signResult = await walletSelector.signAndSendTransaction({
        receiverId: process.env.NEXT_PUBLIC_contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "sign_tx_for_user",
              args: {
                user_id: accountId,
                payload: prepareData.hashToSign,
                derivation_path: prepareData.derivationPath,
                key_version: 0,
              },
              gas: "300000000000000", // 30 TGas
              deposit: "0",
            },
          },
        ],
      });

      // Extract signature
      let signature = null;
      if (signResult && "receipts_outcome" in signResult && signResult.receipts_outcome) {
        for (const outcome of signResult.receipts_outcome) {
          if (
            outcome.outcome.status &&
            typeof outcome.outcome.status === "object" &&
            "SuccessValue" in outcome.outcome.status
          ) {
            const successValue = outcome.outcome.status.SuccessValue;
            if (successValue) {
              const decodedResult = atob(successValue);
              try {
                signature = JSON.parse(decodedResult);
                break;
              } catch (e) {
                console.error("Failed to parse signature:", e);
              }
            }
          }
        }
      }

      if (!signature) {
        throw new Error("Failed to get signature from contract");
      }

      // Step 3: Finalize and send transaction
      const finalizeRes = await fetch("/api/user/finalizeContractCall", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          signature: signature,
          serializedTransaction: prepareData.serializedTransaction,
          transactionDetails: prepareData.transactionDetails,
        }),
      });

      const finalizeData = await finalizeRes.json();

      if (finalizeData.success) {
        setResult({
          success: true,
          txHash: finalizeData.txHash,
          explorerUrl:
            finalizeData.explorerUrl || `https://sepolia.etherscan.io/tx/${finalizeData.txHash}`,
        });
        // Clear form on success
        setFunctionArgs("");
        setEthValue("0");
      } else {
        setResult({ error: finalizeData.error || "Transaction failed" });
      }
    } catch (error) {
      setResult({
        error: error.message || "Failed to call contract",
        details: error.toString(),
      });
    }

    setLoading(false);
  };

  // Preset examples
  const loadExample = (example) => {
    switch (example) {
      case "erc20":
        setContractABI(
          '[{"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]'
        );
        setFunctionName("approve");
        setFunctionArgs('"0x1234567890123456789012345678901234567890", "1000000000000000000"');
        break;
      case "nft":
        setContractABI(
          '[{"inputs":[{"name":"to","type":"address"},{"name":"tokenId","type":"uint256"}],"name":"transferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"}]'
        );
        setFunctionName("transferFrom");
        setFunctionArgs(
          '"0x1234567890123456789012345678901234567890", "0x5678901234567890123456789012345678901234", 1'
        );
        break;
      case "oracle":
        setContractAddress("0xb8d9b079F1604e9016137511464A1Fe97F8e2Bd8");
        setContractABI(
          '[{"inputs":[{"name":"_price","type":"uint256"}],"name":"updatePrice","outputs":[],"stateMutability":"nonpayable","type":"function"}]'
        );
        setFunctionName("updatePrice");
        setFunctionArgs("250000");
        break;
    }
  };

  return (
    <div className={styles.card}>
      <h3>Smart Contract Interaction</h3>
      <p>Call any Ethereum smart contract function</p>

      <div style={{ marginBottom: "10px" }}>
        <strong>Load Example:</strong>
        <button
          className={styles.btn}
          onClick={() => loadExample("oracle")}
          style={{ marginLeft: "10px", fontSize: "0.9em" }}
        >
          Price Oracle
        </button>
        <button
          className={styles.btn}
          onClick={() => loadExample("erc20")}
          style={{ marginLeft: "5px", fontSize: "0.9em" }}
        >
          ERC20 Approve
        </button>
        <button
          className={styles.btn}
          onClick={() => loadExample("nft")}
          style={{ marginLeft: "5px", fontSize: "0.9em" }}
        >
          NFT Transfer
        </button>
      </div>

      <input
        type="text"
        placeholder="Contract Address (0x...)"
        value={contractAddress}
        onChange={(e) => setContractAddress(e.target.value)}
        className={styles.input}
        style={{ width: "100%", marginBottom: "10px" }}
      />

      <textarea
        placeholder='Contract ABI (JSON array, e.g., [{"inputs":[],"name":"..."}])'
        value={contractABI}
        onChange={(e) => setContractABI(e.target.value)}
        className={styles.input}
        style={{ width: "100%", marginBottom: "10px", minHeight: "80px" }}
      />

      <input
        type="text"
        placeholder="Function Name"
        value={functionName}
        onChange={(e) => setFunctionName(e.target.value)}
        className={styles.input}
        style={{ width: "100%", marginBottom: "10px" }}
      />

      <input
        type="text"
        placeholder='Function Arguments (comma-separated, e.g., "0x123...", 100)'
        value={functionArgs}
        onChange={(e) => setFunctionArgs(e.target.value)}
        className={styles.input}
        style={{ width: "100%", marginBottom: "10px" }}
      />

      <input
        type="text"
        placeholder="ETH Value (if payable)"
        value={ethValue}
        onChange={(e) => setEthValue(e.target.value)}
        className={styles.input}
        style={{ width: "100%", marginBottom: "10px" }}
      />

      <button className={styles.btn} onClick={callContract} disabled={loading}>
        {loading ? "Calling Contract..." : "Call Contract Function"}
      </button>

      {result && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px",
            backgroundColor: "#f5f5f5",
            borderRadius: "5px",
          }}
        >
          {result.success ? (
            <>
              <strong>Success!</strong>
              <br />
              Transaction Hash:{" "}
              <a
                href={result.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#0070f3" }}
              >
                {result.txHash}
              </a>
            </>
          ) : (
            <>
              <strong>Error:</strong>
              <br />
              {result.error}
            </>
          )}
        </div>
      )}
    </div>
  );
}
