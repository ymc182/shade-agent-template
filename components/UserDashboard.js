import { useState, useEffect } from "react";
import { NearWallet } from "../utils/near-wallet";
import { formatNearAmount } from "../utils/near-provider";
import ContractInteraction from "./ContractInteraction";
import styles from "../styles/Home.module.css";

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
    
    useEffect(() => {
        initWallet();
    }, []);
    
    const initWallet = async () => {
        const nearWallet = new NearWallet();
        await nearWallet.init();
        setWallet(nearWallet);
        
        if (nearWallet.isSignedIn()) {
            setUserAccount(nearWallet.getAccountId());
            await loadUserData(nearWallet);
        }
    };
    
    const loadUserData = async (nearWallet) => {
        const accountId = nearWallet.getAccountId();
        const message = JSON.stringify({ action: "get_info", timestamp: Date.now() });
        
        try {
            const signature = await nearWallet.signMessage(message);
            
            const res = await fetch("/api/user/info", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    accountid: accountId,
                    signature: signature,
                },
                body: message,
            });
            
            const data = await res.json();
            
            if (data.registered) {
                setEthAddress(data.ethAddress);
                setEthBalance(data.ethBalanceFormatted);
            }
            
            // Get NEAR balance
            const balance = await nearWallet.getAccountBalance();
            setNearBalance(balance);
        } catch (error) {
            console.error("Error loading user data:", error);
        }
    };
    
    const handleSignIn = async () => {
        await wallet.signIn();
    };
    
    const handleSignOut = () => {
        wallet.signOut();
        setUserAccount(null);
        setEthAddress("");
        setEthBalance("0");
        setNearBalance(null);
    };
    
    const registerUser = async () => {
        setLoading(true);
        setMessage("");
        const message = JSON.stringify({ action: "register", timestamp: Date.now() });
        
        try {
            const signature = await wallet.signMessage(message);
            
            const res = await fetch("/api/user/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    accountid: wallet.getAccountId(),
                    signature: signature,
                },
                body: message,
            });
            
            const data = await res.json();
            
            if (data.success) {
                setEthAddress(data.ethAddress);
                setMessage(data.message || "Successfully registered!");
                // Reload user data
                await loadUserData(wallet);
            } else {
                setMessage(data.error || "Registration failed");
            }
        } catch (error) {
            console.error("Registration error:", error);
            setMessage("Error during registration");
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
                value: txValue
            }),
        };
        
        try {
            const signature = await wallet.signMessage(body.message);
            
            const res = await fetch("/api/user/sendTransaction", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    accountid: wallet.getAccountId(),
                    signature: signature,
                },
                body: JSON.stringify(body),
            });
            
            const data = await res.json();
            
            if (data.success) {
                setMessage(`Transaction sent! Hash: ${data.txHash}`);
                setTransactions([...transactions, {
                    hash: data.txHash,
                    to: data.to,
                    value: txValue,
                    timestamp: new Date().toLocaleString()
                }]);
                // Clear form
                setTxTo("");
                setTxValue("");
                // Reload balance
                await loadUserData(wallet);
            } else {
                setMessage(data.error || "Transaction failed");
            }
        } catch (error) {
            console.error("Transaction error:", error);
            setMessage("Error sending transaction");
        }
        
        setSending(false);
    };
    
    const updateBalance = async () => {
        if (wallet && wallet.isSignedIn()) {
            await loadUserData(wallet);
        }
    };
    
    return (
        <div className={styles.userDashboard}>
            <h2>Multi-User ETH Wallet</h2>
            
            {!userAccount ? (
                <div className={styles.card}>
                    <h3>Connect Your NEAR Wallet</h3>
                    <p>Sign in to manage your personal ETH address on Sepolia</p>
                    <button className={styles.btn} onClick={handleSignIn}>
                        Connect NEAR Wallet
                    </button>
                </div>
            ) : (
                <div>
                    <div className={styles.card}>
                        <h3>NEAR Account</h3>
                        <p><strong>Account:</strong> {userAccount}</p>
                        {nearBalance && (
                            <p><strong>NEAR Balance:</strong> {formatNearAmount(nearBalance.available, 4)} NEAR</p>
                        )}
                        <button className={styles.btn} onClick={handleSignOut}>
                            Sign Out
                        </button>
                    </div>
                    
                    {!ethAddress ? (
                        <div className={styles.card}>
                            <h3>Register for ETH Address</h3>
                            <p>Register to get your personal Ethereum address</p>
                            <button 
                                className={styles.btn} 
                                onClick={registerUser} 
                                disabled={loading}
                            >
                                {loading ? "Registering..." : "Register"}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className={styles.card}>
                                <h3>Your Ethereum Address (Sepolia)</h3>
                                <p style={{ wordBreak: "break-all" }}>{ethAddress}</p>
                                <p><strong>Balance:</strong> {ethBalance} ETH</p>
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
                                <br /><br />
                                <a 
                                    href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    style={{ color: '#0070f3', textDecoration: 'none' }}
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
                                <button
                                    className={styles.btn}
                                    onClick={sendTransaction}
                                    disabled={sending}
                                >
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
                                                style={{ color: '#0070f3' }}
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
        </div>
    );
} 