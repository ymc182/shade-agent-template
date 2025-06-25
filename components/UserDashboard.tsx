import { useState, useEffect } from "react";
import { walletSelector } from "../utils/wallet-selector";
import { formatNearAmount, getBalance } from "../utils/near-provider";
import ContractInteraction from "./ContractInteraction";
import { SignedMessage } from "@near-wallet-selector/core";
import styles from "../styles/Home.module.css";
import "@near-wallet-selector/modal-ui/styles.css";
import { useSimpleAuth } from "../hooks/useSimpleAuth";
import { useAuth } from "../hooks/useAuth";
import { getContractPrice, convertToDecimal } from "../utils/ethereum";

export default function UserDashboard() {
  const [wallet, setWallet] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [ethAddress, setEthAddress] = useState("");
  const [ethBalance, setEthBalance] = useState("0");
  const [nearBalance, setNearBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [currentPrice, setCurrentPrice] = useState("0");
  const [priceUpdating, setPriceUpdating] = useState(false);
  const { getAuthHeaders } = useSimpleAuth();
  const { authenticate, isAuthenticating } = useAuth();

  useEffect(() => {
    initWallet();
  }, []);

  useEffect(() => {
    // Fetch current price when component mounts or user changes
    if (ethAddress) {
      fetchCurrentPrice();
    }
  }, [ethAddress]);

  const fetchCurrentPrice = async () => {
    try {
      const price = await getContractPrice();
      const formattedPrice = convertToDecimal(price, 2);
      setCurrentPrice(formattedPrice);
    } catch (error) {
      console.error("Error fetching price:", error);
    }
  };

  const initWallet = async () => {
    try {
      await walletSelector.init(process.env.NEXT_PUBLIC_contractId);
      setWallet(walletSelector);

      if (walletSelector.isSignedIn()) {
        const accountId = walletSelector.getAccountId();
        setUserAccount(accountId);
        await loadUserData();
      }

      // Subscribe to account changes
      walletSelector.onAccountChange(async (accountId) => {
        if (accountId) {
          setUserAccount(accountId);
          await loadUserData();
        } else {
          // User disconnected
          setUserAccount(null);
          setEthAddress("");
          setEthBalance("0");
          setNearBalance(null);
        }
      });
    } catch (error) {
      console.error("Failed to initialize wallet selector:", error);
      setMessage("Failed to initialize wallet selector. Please refresh the page.");
    }
  };

  const loadUserData = async () => {
    const accountId = walletSelector.getAccountId();
    if (!accountId) return;

    console.log("Loading user data for:", accountId);

    try {
      const authHeaders = await getAuthHeaders(accountId);

      const res = await fetch("/api/user/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      });

      const data = await res.json();
      console.log("User info response:", data);

      if (data.registered) {
        setEthAddress(data.ethAddress);
        setEthBalance(data.ethBalanceFormatted);
        setMessage(""); // Clear any previous messages
      } else {
        // User not registered yet
        setEthAddress("");
        setEthBalance("0");
      }

      // Get NEAR balance
      const balance = await getBalance(accountId);
      setNearBalance(balance);
    } catch (error) {
      console.error("Error loading user data:", error);
      if (error.message?.includes("User rejected")) {
        setMessage("Message signing was rejected. Please try again.");
      } else {
        setMessage(`Error loading user data: ${error.message}`);
      }
    }
  };

  const handleSignIn = async () => {
    try {
      await walletSelector.show();
    } catch (error) {
      console.error("Error showing wallet selector:", error);
    }
  };

  const handleSignOut = async () => {
    await walletSelector.signOut();
    setUserAccount(null);
    setEthAddress("");
    setEthBalance("0");
    setNearBalance(null);
  };

  const registerUser = async () => {
    setLoading(true);
    setMessage("");
    const accountId = walletSelector.getAccountId();

    try {
      // Call register_user on the contract directly from the client
      const result = await walletSelector.signAndSendTransaction({
        receiverId: process.env.NEXT_PUBLIC_contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "register_user",
              args: {},
              gas: "300000000000000", // 30 TGas
              deposit: "0",
            },
          },
        ],
      });

      // Extract the derivation path from the contract response
      let derivationPath = null;
      if (result && "receipts_outcome" in result && result.receipts_outcome) {
        for (const outcome of result.receipts_outcome) {
          if (
            outcome.outcome.status &&
            typeof outcome.outcome.status === "object" &&
            "SuccessValue" in outcome.outcome.status
          ) {
            const successValue = outcome.outcome.status.SuccessValue;
            if (successValue) {
              // Decode the base64 result
              const decodedResult = atob(successValue);
              // Remove quotes if present
              derivationPath = decodedResult.replace(/^"|"$/g, "");
              break;
            }
          }
        }
      }

      if (!derivationPath) {
        throw new Error("Failed to get derivation path from contract");
      }

      // Now notify the server that registration is complete
      const authHeaders = await getAuthHeaders(accountId);

      const res = await fetch("/api/user/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          accountId,
          derivationPath,
          txHash: result && "transaction" in result ? result.transaction.hash : undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setEthAddress(data.ethAddress);
        setMessage(data.message || "Successfully registered!");
        // Reload user data
        await loadUserData();
      } else {
        setMessage(data.error || "Registration failed");
      }
    } catch (error) {
      console.error("Registration error:", error);

      // Check if user is already registered
      if (
        error.message?.includes("already registered") ||
        error.message?.includes("User already registered")
      ) {
        // Try to get the user's ETH address from the server
        try {
          const authHeaders = await getAuthHeaders(accountId);
          const res = await fetch("/api/user/info", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
          });
          const data = await res.json();
          if (data.registered) {
            setEthAddress(data.ethAddress);
            setMessage("User already registered");
            await loadUserData();
            setLoading(false);
            return;
          }
        } catch (infoError) {
          console.error("Failed to get user info:", infoError);
        }
      }

      if (error.message?.includes("User rejected")) {
        setMessage("Transaction was rejected. Please try again.");
      } else {
        setMessage(error.message || "Error during registration");
      }
    }

    setLoading(false);
  };

  const updatePrice = async () => {
    setPriceUpdating(true);
    setMessage("");

    try {
      const accountId = walletSelector.getAccountId();
      const authHeaders = await getAuthHeaders(accountId);

      // Step 1: Prepare the transaction
      const prepareRes = await fetch("/api/user/updatePrice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      });

      const prepareData = await prepareRes.json();

      if (!prepareData.success) {
        setMessage(prepareData.error || "Failed to prepare price update");
        setPriceUpdating(false);
        return;
      }

      // Step 2: Sign the transaction with NEAR wallet
      console.log("Hash to sign:", prepareData.hashToSign);

      const result = await walletSelector.signAndSendTransaction({
        receiverId: process.env.NEXT_PUBLIC_contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "sign_tx_for_user",
              args: {
                user_id: accountId,
                payload: prepareData.hashToSign, // Send the hash directly
                derivation_path: prepareData.derivationPath,
                key_version: 0,
              },
              gas: "300000000000000", // 30 TGas
              deposit: "0",
            },
          },
        ],
      });

      // Extract the signature from the contract response
      let signature = null;
      if (result && "receipts_outcome" in result && result.receipts_outcome) {
        for (const outcome of result.receipts_outcome) {
          if (
            outcome.outcome.status &&
            typeof outcome.outcome.status === "object" &&
            "SuccessValue" in outcome.outcome.status
          ) {
            const successValue = outcome.outcome.status.SuccessValue;
            if (successValue) {
              // Decode the base64 result
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

      // Step 3: Finalize and broadcast the transaction
      const finalizeRes = await fetch("/api/user/finalizeUpdatePrice", {
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
        setMessage(`Price updated successfully! New price: $${finalizeData.newPrice}`);
        setCurrentPrice(finalizeData.newPrice);

        // Show transaction link
        if (finalizeData.explorerUrl) {
          setTimeout(() => {
            setMessage(
              `Price updated! New price: $${finalizeData.newPrice} - View transaction at: ${finalizeData.explorerUrl}`
            );
          }, 100);
        }
      } else {
        setMessage(finalizeData.error || "Failed to update price");
      }
    } catch (error) {
      console.error("Price update error:", error);
      if (error.message?.includes("User rejected")) {
        setMessage("Transaction was rejected. Please try again.");
      } else {
        setMessage(error.message || "Error updating price");
      }
    }

    setPriceUpdating(false);
  };

  const updateBalance = async () => {
    if (walletSelector && walletSelector.isSignedIn()) {
      await loadUserData();
    }
  };

  const handleSignMessage = async () => {
    try {
      setMessage("Authenticating with NEAR wallet...");
      const result = await authenticate();
      console.log("Authentication result:", result);
      setMessage(`Authentication successful for ${result.accountId}`);
    } catch (error) {
      console.error("Authentication error:", error);
      setMessage(`Authentication failed: ${error.message}`);
    }
  };

  return (
    <div className={styles.userDashboard}>
      <h2>Multi-User ETH Wallet</h2>

      {!userAccount ? (
        <div className={styles.card}>
          <h3>Connect Your NEAR Wallet</h3>
          <p>Sign in with any NEAR wallet to manage your personal ETH address on Sepolia</p>
          <button className={styles.btn} onClick={handleSignIn}>
            Connect Wallet
          </button>
          <p style={{ marginTop: "10px", fontSize: "0.9em", color: "#666" }}>
            Supports: MyNearWallet, Meteor, Sender, HERE, Nightly, and more
          </p>
        </div>
      ) : (
        <div>
          <div className={styles.card}>
            <h3>NEAR Account</h3>
            <p>
              <strong>Account:</strong> {userAccount}
            </p>
            {nearBalance && (
              <p>
                <strong>NEAR Balance:</strong> {formatNearAmount(nearBalance.available, 4)} NEAR
              </p>
            )}
            <button className={styles.btn} onClick={handleSignOut}>
              Sign Out
            </button>
          </div>

          {!ethAddress ? (
            <div className={styles.card}>
              <h3>Register for ETH Address</h3>
              <p>Register to get your personal Ethereum address</p>
              <button className={styles.btn} onClick={registerUser} disabled={loading}>
                {loading ? "Registering..." : "Register"}
              </button>
              <button className={styles.btn} onClick={loadUserData} style={{ marginLeft: "10px" }}>
                Check Registration Status
              </button>
            </div>
          ) : (
            <>
              <div className={styles.card}>
                <h3>Your Ethereum Address (Sepolia)</h3>
                <p style={{ wordBreak: "break-all" }}>{ethAddress}</p>
                <p>
                  <strong>Balance:</strong> {ethBalance} ETH
                </p>
                <button className={styles.btn} onClick={updateBalance}>
                  Refresh Balance
                </button>
                <button
                  className={styles.btn}
                  onClick={() => {
                    navigator.clipboard.writeText(ethAddress);
                    setMessage("Address copied!");
                    setTimeout(() => setMessage(""), 2000);
                  }}
                >
                  Copy Address
                </button>
                <br />
                <br />
                <a
                  href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#0070f3", textDecoration: "none" }}
                >
                  Get Sepolia ETH from faucet →
                </a>
              </div>

              <div className={styles.card}>
                <h3>Oracle Price Update</h3>
                <p>
                  <strong>Current Price:</strong> ${currentPrice}
                </p>
                <button className={styles.btn} onClick={updatePrice} disabled={priceUpdating}>
                  {priceUpdating ? "Updating..." : "Update Price from Oracle"}
                </button>
                <button
                  className={styles.btn}
                  onClick={fetchCurrentPrice}
                  style={{ marginLeft: "10px" }}
                >
                  Refresh Price
                </button>
              </div>

              <ContractInteraction wallet={wallet} />
            </>
          )}

          {message && (
            <div className={styles.card} style={{ backgroundColor: "#f0f0f0" }}>
              <p>{message}</p>
            </div>
          )}
        </div>
      )}
      <button
        className={styles.btn}
        onClick={handleSignMessage}
        disabled={isAuthenticating || !userAccount}
      >
        {isAuthenticating ? "Authenticating..." : "Test NEAR Authentication"}
      </button>
    </div>
  );
}
