import * as nearAPI from "near-api-js";

export class NearWallet {
    constructor() {
        this.wallet = null;
        this.accountId = null;
        this.near = null;
    }
    
    async init() {
        const config = {
            networkId: "testnet",
            keyStore: new nearAPI.keyStores.BrowserLocalStorageKeyStore(),
            nodeUrl: "https://test.rpc.fastnear.com",
            walletUrl: "https://wallet.testnet.near.org",
            helperUrl: "https://helper.testnet.near.org",
        };
        
        this.near = await nearAPI.connect(config);
        this.wallet = new nearAPI.WalletConnection(this.near, 'shade-agent-multi-user');
    }
    
    async signIn() {
        await this.wallet.requestSignIn({
            contractId: process.env.NEXT_PUBLIC_contractId,
            methodNames: [],
            successUrl: window.location.origin + window.location.pathname,
            failureUrl: window.location.origin + window.location.pathname,
        });
    }
    
    async signMessage(message) {
        const keyStore = this.wallet._keyStore;
        const networkId = this.wallet._networkId;
        const accountId = this.wallet.getAccountId();
        
        try {
            const keyPair = await keyStore.getKey(networkId, accountId);
            if (!keyPair) {
                throw new Error("No key found for account");
            }
            
            const messageBytes = Buffer.from(message);
            const signature = keyPair.sign(messageBytes);
            
            // Return base64 encoded signature
            return Buffer.from(signature.signature).toString('base64');
        } catch (error) {
            console.error("Error signing message:", error);
            throw error;
        }
    }
    
    isSignedIn() {
        return this.wallet && this.wallet.isSignedIn();
    }
    
    getAccountId() {
        return this.wallet.getAccountId();
    }
    
    async getAccountBalance() {
        if (!this.isSignedIn()) return null;
        
        try {
            const account = await this.near.account(this.getAccountId());
            const balance = await account.getAccountBalance();
            return balance;
        } catch (error) {
            console.error("Error getting balance:", error);
            return null;
        }
    }
    
    signOut() {
        this.wallet.signOut();
        // Clear any cached data
        this.accountId = null;
    }
} 