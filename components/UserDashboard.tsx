import { useState, useEffect } from "react";
import { walletSelector } from "../utils/wallet-selector";
import { formatNearAmount, getBalance } from "../utils/near-provider";
import ContractInteraction from "./ContractInteraction";
import { SignedMessage } from "@near-wallet-selector/core";
import styles from "../styles/Home.module.css";
import "@near-wallet-selector/modal-ui/styles.css";
import { useSimpleAuth } from "../hooks/useSimpleAuth";
import { useAuth } from "../hooks/useAuth";

export default function UserDashboard() {
  const [wallet, setWallet] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [ethAddress, setEthAddress] = useState("");
  const [ethBalance, setEthBalance] = useState("0");
  const [nearBalance, setNearBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txValue, setTxValue] = useState("");
  const [sending, setSending] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const { getAuthHeaders } = useSimpleAuth();
  const { authenticate, isAuthenticating } = useAuth();

  useEffect(() => {
    initWallet();
  }, []);

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
        setEthBalance(data.ethBalanceFormatted);
      }

      // Get NEAR balance
      const balance = await getBalance(accountId);
      setNearBalance(balance);
    } catch (error) {
      console.error("Error loading user data:", error);
      if (error.message?.includes("User rejected")) {
        setMessage("Message signing was rejected. Please try again.");
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
      const authHeaders = await getAuthHeaders(accountId);

      const res = await fetch("/api/user/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ accountId }),
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
      if (error.message?.includes("User rejected")) {
        setMessage("Message signing was rejected. Please try again.");
      } else {
        setMessage("Error during registration");
      }
    }

    setLoading(false);
  };

  const sendTransaction = async () => {
    if (!txTo || !txValue) {
      setMessage("Please enter recipient address and amount");
      return;
    }

    setSending(true);
    setMessage("");

    const body = {
      to: txTo,
      value: (parseFloat(txValue) * 10 ** 18).toString(), // Convert ETH to Wei
      data: "0x",
      message: JSON.stringify({
        action: "send_transaction",
        timestamp: Date.now(),
        to: txTo,
        value: txValue,
      }),
    };

    try {
      const accountId = walletSelector.getAccountId();
      const authHeaders = await getAuthHeaders(accountId);

      const res = await fetch("/api/user/sendTransaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        setMessage(`Transaction sent! Hash: ${data.txHash}`);
        setTransactions([
          ...transactions,
          {
            hash: data.txHash,
            to: data.to,
            value: txValue,
            timestamp: new Date().toLocaleString(),
          },
        ]);
        // Clear form
        setTxTo("");
        setTxValue("");
        // Reload balance
        await loadUserData();
      } else {
        setMessage(data.error || "Transaction failed");
      }
    } catch (error) {
      console.error("Transaction error:", error);
      if (error.message?.includes("User rejected")) {
        setMessage("Message signing was rejected. Please try again.");
      } else {
        setMessage("Error sending transaction");
      }
    }

    setSending(false);
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
                <h3>Send ETH</h3>
                <input
                  type="text"
                  placeholder="Recipient Address (0x...)"
                  value={txTo}
                  onChange={(e) => setTxTo(e.target.value)}
                  className={styles.input}
                  style={{ width: "100%", marginBottom: "10px" }}
                />
                <input
                  type="text"
                  placeholder="Amount in ETH"
                  value={txValue}
                  onChange={(e) => setTxValue(e.target.value)}
                  className={styles.input}
                  style={{ width: "100%", marginBottom: "10px" }}
                />
                <button className={styles.btn} onClick={sendTransaction} disabled={sending}>
                  {sending ? "Sending..." : "Send Transaction"}
                </button>
              </div>

              <ContractInteraction wallet={wallet} />

              {transactions.length > 0 && (
                <div className={styles.card}>
                  <h3>Recent Transactions</h3>
                  {transactions.map((tx, i) => (
                    <div key={i} style={{ marginBottom: "10px", fontSize: "0.9em" }}>
                      <a
                        href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0070f3" }}
                      >
                        {tx.hash.substring(0, 10)}...{tx.hash.substring(tx.hash.length - 8)}
                      </a>
                      <br />
                      To: {tx.to.substring(0, 10)}...
                      <br />
                      Amount: {tx.value} ETH
                      <br />
                      {tx.timestamp}
                    </div>
                  ))}
                </div>
              )}
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
