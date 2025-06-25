import * as nearAPI from "near-api-js";

/**
 * Adds a function call access key to an account using a full access key.
 * This requires having access to a full access key for the account.
 *
 * @param accountId - The account to add the key to
 * @param newPublicKey - The new public key to add
 * @param contractId - The contract the key will have access to
 * @param methodNames - Array of method names the key can call (empty for all)
 * @param allowance - The allowance in NEAR (optional, defaults to 0.25 NEAR)
 * @param privateKey - The full access private key of the account
 */
export async function addFunctionCallKey(
  accountId: string,
  newPublicKey: string,
  contractId: string,
  methodNames: string[] = [],
  allowance: string = "0.25",
  privateKey: string,
  networkId: string = "testnet"
) {
  try {
    // Create key store with the full access key
    const keyPair = nearAPI.utils.KeyPair.fromString(privateKey as nearAPI.utils.KeyPairString);
    const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
    await keyStore.setKey(networkId, accountId, keyPair);

    // Connect to NEAR
    const config = {
      networkId,
      keyStore,
      nodeUrl:
        networkId === "testnet" ? "https://test.rpc.fastnear.com" : "https://rpc.mainnet.near.org",
      walletUrl:
        networkId === "testnet"
          ? "https://wallet.testnet.near.org"
          : "https://wallet.mainnet.near.org",
      helperUrl:
        networkId === "testnet"
          ? "https://helper.testnet.near.org"
          : "https://helper.mainnet.near.org",
    };

    const near = await nearAPI.connect(config);
    const account = await near.account(accountId);

    // Parse the new public key
    const publicKey = nearAPI.utils.PublicKey.from(newPublicKey);

    // Add the function call access key
    const result = await account.addKey(
      publicKey,
      contractId,
      methodNames,
      BigInt(nearAPI.utils.format.parseNearAmount(allowance) || "250000000000000000000000")
    );

    console.log("Function call key added successfully:", result);
    return result;
  } catch (error) {
    console.error("Error adding function call key:", error);
    throw error;
  }
}

/**
 * Example of how to use this function:
 *
 * ```typescript
 * // You need a full access key for the account
 * const fullAccessKey = "ed25519:YOUR_FULL_ACCESS_PRIVATE_KEY";
 *
 * // The new function call key to add
 * const newPublicKey = "ed25519:GENERATED_PUBLIC_KEY";
 *
 * await addFunctionCallKey(
 *   "myaccount.testnet",
 *   newPublicKey,
 *   "contract.testnet",
 *   [], // All methods
 *   "0.25", // 0.25 NEAR allowance
 *   fullAccessKey
 * );
 * ```
 */

/**
 * Alternative: Add function call key using NEAR CLI
 *
 * If you have NEAR CLI installed and configured with your account:
 *
 * ```bash
 * near add-key YOUR_ACCOUNT.testnet PUBLIC_KEY \
 *   --contract-id CONTRACT.testnet \
 *   --method-names "" \
 *   --allowance 0.25
 * ```
 */

/**
 * Smart Contract Approach:
 *
 * If you want users to add function call keys without exposing their full access keys,
 * you could implement a smart contract method that:
 *
 * 1. Accepts a public key as parameter
 * 2. Uses a cross-contract call to add the key
 * 3. Requires the user to be the predecessor (caller)
 *
 * However, this requires the contract to have permission to manage keys,
 * which is typically not possible due to NEAR's security model.
 */
