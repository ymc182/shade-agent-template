import * as nearAPI from "near-api-js";

export class FunctionCallKeyManager {
  private keyPair: nearAPI.utils.KeyPairEd25519;
  private keyStore: nearAPI.keyStores.InMemoryKeyStore;
  private near: nearAPI.Near;
  private account: nearAPI.Account;

  constructor(
    private privateKey: string,
    private accountId: string,
    private networkId: string = "testnet"
  ) {
    this.keyPair = nearAPI.utils.KeyPair.fromString(
      privateKey as nearAPI.utils.KeyPairString
    ) as nearAPI.utils.KeyPairEd25519;
    this.keyStore = new nearAPI.keyStores.InMemoryKeyStore();
  }

  async init() {
    // Set the key in the keystore
    await this.keyStore.setKey(this.networkId, this.accountId, this.keyPair);

    // Initialize NEAR connection
    const config = {
      networkId: this.networkId,
      keyStore: this.keyStore,
      nodeUrl:
        this.networkId === "testnet"
          ? "https://test.rpc.fastnear.com"
          : "https://rpc.mainnet.near.org",
      walletUrl:
        this.networkId === "testnet"
          ? "https://wallet.testnet.near.org"
          : "https://wallet.mainnet.near.org",
      helperUrl:
        this.networkId === "testnet"
          ? "https://helper.testnet.near.org"
          : "https://helper.mainnet.near.org",
    };

    this.near = await nearAPI.connect(config);
    this.account = await this.near.account(this.accountId);

    return this;
  }

  async callContractMethod(
    contractId: string,
    methodName: string,
    args: any,
    gas?: string,
    attachedDeposit?: string
  ) {
    try {
      const result = await this.account.functionCall({
        contractId,
        methodName,
        args,
        gas: BigInt(gas || "30000000000000"), // 30 TGas default
        attachedDeposit: BigInt(attachedDeposit || "0"),
      });

      return result;
    } catch (error) {
      console.error("Error calling contract method:", error);
      throw error;
    }
  }

  async viewMethod(contractId: string, methodName: string, args: any = {}) {
    try {
      const result = await this.account.viewFunction({
        contractId,
        methodName,
        args,
      });

      return result;
    } catch (error) {
      console.error("Error viewing contract method:", error);
      throw error;
    }
  }

  getPublicKey(): string {
    return this.keyPair.getPublicKey().toString();
  }

  async getAccountBalance() {
    const balance = await this.account.getAccountBalance();
    return balance;
  }
}

// Example usage:
export const exampleUsage = `
// Initialize the manager with your function call key
const manager = new FunctionCallKeyManager(
  "ed25519:YOUR_PRIVATE_KEY_HERE",
  "your-account.testnet"
);

await manager.init();

// Call a contract method
const result = await manager.callContractMethod(
  "contract.testnet",
  "some_method",
  { param1: "value1", param2: "value2" }
);

// View a contract method (no gas required)
const viewResult = await manager.viewMethod(
  "contract.testnet",
  "get_info",
  { user_id: "alice.testnet" }
);
`;

// Helper to validate if a string is a valid NEAR private key
export function isValidNearPrivateKey(key: string): boolean {
  try {
    nearAPI.utils.KeyPair.fromString(key as nearAPI.utils.KeyPairString);
    return true;
  } catch {
    return false;
  }
}

// Helper to extract key type and data from a private key string
export function parsePrivateKey(key: string): { type: string; data: string } | null {
  const parts = key.split(":");
  if (parts.length !== 2) return null;

  return {
    type: parts[0],
    data: parts[1],
  };
}
