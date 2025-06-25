import { Transaction } from "viem";
import { RLP } from "@ethereumjs/rlp";

// Helper to convert BigInt to proper hex string without 0x prefix
export function bigIntToHex(value: bigint): string {
  return value.toString(16);
}

// Helper to ensure proper RLP encoding of numeric values
export function formatTransactionForSigning(transaction: any): any {
  // Clone the transaction to avoid mutations
  const formatted = { ...transaction };

  // Convert numeric values to proper hex format
  if (formatted.value !== undefined) {
    // Ensure value is a BigInt
    const valueBigInt = BigInt(formatted.value);
    // Convert to hex without 0x prefix for proper RLP encoding
    formatted.value = valueBigInt === BigInt(0) ? "" : bigIntToHex(valueBigInt);
  }

  if (formatted.gasLimit !== undefined) {
    // Ensure gasLimit is a BigInt
    const gasLimitBigInt = BigInt(formatted.gasLimit);
    // Convert to hex without 0x prefix
    formatted.gasLimit = bigIntToHex(gasLimitBigInt);
  }

  if (formatted.gasPrice !== undefined) {
    const gasPriceBigInt = BigInt(formatted.gasPrice);
    formatted.gasPrice = bigIntToHex(gasPriceBigInt);
  }

  if (formatted.maxFeePerGas !== undefined) {
    const maxFeePerGasBigInt = BigInt(formatted.maxFeePerGas);
    formatted.maxFeePerGas = bigIntToHex(maxFeePerGasBigInt);
  }

  if (formatted.maxPriorityFeePerGas !== undefined) {
    const maxPriorityFeePerGasBigInt = BigInt(formatted.maxPriorityFeePerGas);
    formatted.maxPriorityFeePerGas = bigIntToHex(maxPriorityFeePerGasBigInt);
  }

  if (formatted.nonce !== undefined) {
    const nonceBigInt = BigInt(formatted.nonce);
    formatted.nonce = bigIntToHex(nonceBigInt);
  }

  return formatted;
}

// Fix ASCII-encoded values in a transaction
export function fixAsciiEncodedTransaction(transaction: any): any {
  const fixed = { ...transaction };

  // Fix common fields that might be ASCII-encoded
  if (fixed.gasLimit && typeof fixed.gasLimit === "string" && fixed.gasLimit.length > 10) {
    // If gasLimit looks suspiciously long, it might be ASCII-encoded
    // Standard gas limit for ETH transfer is 21000 (0x5208)
    fixed.gasLimit = BigInt(21000);
  }

  if (fixed.value && typeof fixed.value === "string" && fixed.value.match(/^[0-9]+$/)) {
    // If value is a decimal string, convert to BigInt
    fixed.value = BigInt(fixed.value);
  }

  return fixed;
}

// Post-process transaction after signing to fix any encoding issues
export function fixTransactionEncoding(rawTx: string): string {
  // This is a placeholder for fixing the raw transaction
  // In practice, you might need to decode and re-encode the transaction
  // to fix the ASCII encoding issue
  return rawTx;
}
