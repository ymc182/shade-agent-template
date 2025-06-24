import * as nearAPI from "near-api-js";
import { getBalance } from "./near-provider.js";

export async function getPublicKeyForAccount(accountId) {
    // For testnet, we'll need to query the account's access keys
    const config = {
        networkId: "testnet",
        nodeUrl: "https://test.rpc.fastnear.com",
    };
    
    const near = await nearAPI.connect(config);
    const account = await near.account(accountId);
    
    try {
        const keys = await account.getAccessKeys();
        if (keys.length > 0) {
            // Return the first full access key
            return keys[0].public_key;
        }
    } catch (error) {
        console.error("Error fetching public key:", error);
    }
    
    return null;
}

export async function verifyNearSignature(accountId, signature, message) {
    try {
        // Get the public key for the account
        const publicKey = await getPublicKeyForAccount(accountId);
        if (!publicKey) {
            console.error("No public key found for account:", accountId);
            return false;
        }

        // Verify the signature
        const publicKeyObj = nearAPI.utils.PublicKey.from(publicKey);
        const messageBytes = Buffer.from(message);
        const signatureBytes = Buffer.from(signature, 'base64');
        
        const isValid = publicKeyObj.verify(messageBytes, signatureBytes);
        return isValid;
    } catch (error) {
        console.error("Signature verification failed:", error);
        return false;
    }
}

export function authMiddleware(handler) {
    return async (req, res) => {
        const { accountid: accountId, signature } = req.headers;
        const message = req.body.message || JSON.stringify(req.body);
        
        if (!accountId || !signature) {
            return res.status(401).json({ error: "Missing authentication" });
        }
        
        const isValid = await verifyNearSignature(accountId, signature, message);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid signature" });
        }
        
        // Check if account exists and has balance
        const balance = await getBalance(accountId);
        if (!balance || balance.available === '0') {
            return res.status(401).json({ error: "Account not found or has no balance" });
        }
        
        req.user = { accountId };
        return handler(req, res);
    };
} 