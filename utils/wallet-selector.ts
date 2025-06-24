import {
  setupWalletSelector,
  Wallet,
  WalletSelector as WalletSelectorType,
} from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupSender } from "@near-wallet-selector/sender";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupNightly } from "@near-wallet-selector/nightly";

export class WalletSelector {
  selector: WalletSelectorType;
  modal: any;
  accountId: string | null;
  wallet: Wallet;

  async init(contractId) {
    const _selector = await setupWalletSelector({
      network: "testnet",
      debug: true,
      modules: [
        setupMyNearWallet(),
        setupMeteorWallet(),
        setupSender(),
        setupHereWallet(),
        setupNightly(),
      ],
    });

    const _modal = setupModal(_selector, {
      contractId: contractId || process.env.NEXT_PUBLIC_contractId,
    });

    const state = _selector.store.getState();
    const accounts = state.accounts;

    // Subscribe to account changes
    _selector.store.observable.subscribe((state) => {
      const { accounts } = state;
      const accountId = accounts.find((account) => account.active)?.accountId || null;
      this.accountId = accountId;
    });

    this.selector = _selector;
    this.modal = _modal;

    // Set initial account if already connected
    if (accounts.length > 0) {
      this.accountId = accounts.find((account) => account.active)?.accountId || null;
      if (this.accountId) {
        const wallet = await _selector.wallet();
        this.wallet = wallet;
      }
    }

    return this;
  }

  async show() {
    this.modal.show();
  }

  async signIn() {
    this.modal.show();

    return new Promise((resolve) => {
      const subscription = this.selector.store.observable.subscribe((state) => {
        const { accounts } = state;
        if (accounts.length > 0) {
          subscription.unsubscribe();
          resolve(accounts);
        }
      });
    });
  }

  async signMessage({ message, recipient, nonce: challenge, callbackUrl: serverAuthUrl }) {
    return await this.wallet.signMessage({
      message: message,
      recipient: recipient,
      nonce: challenge,
      callbackUrl: serverAuthUrl,
    });
  }

  async verifyOwner(message) {
    if (!this.wallet) {
      const wallet = await this.selector.wallet();
      this.wallet = wallet;
    }

    // Use verifyOwner for authentication purposes
    const result = await this.wallet.verifyOwner({
      message: message,
    });

    console.log("Wallet verifyOwner result:", result);

    // Return the full result object, not just the signature
    return result;
  }

  async signAndSendTransaction(transaction) {
    if (!this.wallet) {
      const wallet = await this.selector.wallet();
      this.wallet = wallet;
    }

    return await this.wallet.signAndSendTransaction(transaction);
  }

  isSignedIn() {
    const state = this.selector?.store.getState();
    return state?.accounts.length > 0;
  }

  getAccountId() {
    const state = this.selector?.store.getState();
    const accounts = state?.accounts || [];
    return accounts.find((account) => account.active)?.accountId || null;
  }

  async getAccountBalance() {
    if (!this.isSignedIn()) return null;

    try {
      // Get account details from the wallet
      if (!this.wallet) {
        const wallet = await this.selector.wallet();
        this.wallet = wallet;
      }

      const accounts = await this.wallet.getAccounts();
      return accounts[0]; // This includes balance info in some wallets
    } catch (error) {
      console.error("Error getting balance:", error);
      return null;
    }
  }

  async signOut() {
    if (this.wallet) {
      await this.wallet.signOut();
      this.wallet = null;
      this.accountId = null;
    }
  }

  onAccountChange(callback) {
    return this.selector.store.observable.subscribe((state) => {
      const { accounts } = state;
      const accountId = accounts.find((account) => account.active)?.accountId || null;
      callback(accountId);
    });
  }
}

// Export a singleton instance
export const walletSelector = new WalletSelector();
