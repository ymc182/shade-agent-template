# Multi-User Shade Agent Implementation Plan

## Overview

Transform the current shared ETH price oracle into a multi-user system where each NEAR user (e.g., eric.near, bob.near) has their own derived Ethereum address on Sepolia that they can control through the Shade Agent.

## Architecture Changes

### Current Architecture (Shared Oracle)

- Single derived ETH address for all users
- No user authentication
- Worker agent acts on its own behalf
- Shared service model

### New Architecture (Multi-User)

- Each user gets their own derived ETH address
- NEAR wallet authentication required
- Worker agent acts on behalf of authenticated users
- User-specific operations and balances

## Implementation Phases

### Phase 1: Smart Contract Modifications 🔴 Priority

#### 1.1 Update Contract State Structure

```rust
// contract/src/lib.rs
#[near(contract_state)]
pub struct Contract {
    pub owner_id: AccountId,
    pub approved_codehashes: IterableSet<String>,
    pub worker_by_account_id: IterableMap<AccountId, Worker>,

    // NEW: User management
    pub registered_users: IterableSet<AccountId>,
    pub user_eth_addresses: LookupMap<AccountId, String>,
    pub user_permissions: LookupMap<AccountId, UserPermissions>,
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct UserPermissions {
    pub enabled: bool,
    pub max_gas_per_tx: U128,
    pub allowed_methods: Vec<String>,
    pub registration_timestamp: u64,
}
```

#### 1.2 Add User Registration Methods

```rust
// User self-registration
pub fn register_user(&mut self) -> String {
    let user = env::predecessor_account_id();
    require!(!self.registered_users.contains(&user), "User already registered");

    // Generate user-specific derivation path
    let derivation_path = format!("ethereum-{}", user);

    // Store user registration
    self.registered_users.insert(user.clone());
    self.user_permissions.insert(&user, &UserPermissions {
        enabled: true,
        max_gas_per_tx: U128(1000000000000000), // 0.001 ETH
        allowed_methods: vec!["transfer".to_string(), "updatePrice".to_string()],
        registration_timestamp: env::block_timestamp(),
    });

    // Return the derivation path (ETH address will be derived client-side)
    derivation_path
}
```

#### 1.3 Modify sign_tx for User-Specific Operations

```rust
pub fn sign_tx_for_user(
    &mut self,
    user_id: AccountId,
    payload: Vec<u8>,
    derivation_path: String,
    key_version: u32,
) -> Promise {
    // Verify worker is registered (only in production)
    let worker = self.get_worker(env::predecessor_account_id());
    require!(self.approved_codehashes.contains(&worker.codehash));

    // Verify user is registered and has permissions
    require!(self.registered_users.contains(&user_id), "User not registered");
    let permissions = self.user_permissions.get(&user_id).unwrap();
    require!(permissions.enabled, "User account disabled");

    // Verify derivation path matches user
    let expected_path = format!("ethereum-{}", user_id);
    require!(derivation_path == expected_path, "Invalid derivation path for user");

    // Call MPC to sign with user-specific derived key
    ecdsa::get_sig(payload, derivation_path, key_version)
}
```

### Phase 2: Backend API Modifications 🟠 Priority

#### 2.1 Add Authentication Middleware

Create `utils/auth.js`:

```javascript
import * as nearAPI from "near-api-js";

export async function verifyNearSignature(accountId, signature, message) {
  try {
    // Verify NEAR account signature
    const publicKey = await getPublicKeyForAccount(accountId);
    const isValid = nearAPI.utils.key_pair.verify(message, signature, publicKey);
    return isValid;
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

export function authMiddleware(handler) {
  return async (req, res) => {
    const { accountId, signature } = req.headers;
    const message = req.body.message || JSON.stringify(req.body);

    if (!accountId || !signature) {
      return res.status(401).json({ error: "Missing authentication" });
    }

    const isValid = await verifyNearSignature(accountId, signature, message);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    req.user = { accountId };
    return handler(req, res);
  };
}
```

#### 2.2 Create User-Specific API Endpoints

Create `pages/api/user/register.js`:

```javascript
import { contractCall } from "@neardefi/shade-agent-js";
import { authMiddleware } from "../../../utils/auth";

async function handler(req, res) {
  const { accountId } = req.user;

  try {
    // Register user in smart contract
    const derivationPath = await contractCall({
      accountId: process.env.WORKER_ACCOUNT_ID,
      methodName: "register_user",
      args: {
        user_id: accountId,
      },
    });

    // Derive ETH address for user
    const { address } = await Evm.deriveAddressAndPublicKey(contractId, derivationPath);

    res.status(200).json({
      success: true,
      accountId,
      ethAddress: address,
      derivationPath,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default authMiddleware(handler);
```

Create `pages/api/user/sendTransaction.js`:

```javascript
import { contractCall } from "@neardefi/shade-agent-js";
import { authMiddleware } from "../../../utils/auth";

async function handler(req, res) {
  const { accountId } = req.user;
  const { to, value, data } = req.body;

  const derivationPath = `ethereum-${accountId}`;

  // Get user's ETH address
  const { address: fromAddress } = await Evm.deriveAddressAndPublicKey(contractId, derivationPath);

  // Check user's ETH balance
  const balance = await Evm.getBalance(fromAddress);
  if (balance.balance < value + estimatedGas) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  // Prepare transaction
  const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
    from: fromAddress,
    to,
    value,
    data,
  });

  // Get signature through worker agent
  const signRes = await contractCall({
    methodName: "sign_tx_for_user",
    args: {
      user_id: accountId,
      payload: hashesToSign[0],
      derivation_path: derivationPath,
      key_version: 0,
    },
  });

  // Broadcast transaction
  const signedTx = Evm.finalizeTransactionSigning({
    transaction,
    rsvSignatures: [toRSV(signRes)],
  });

  const txHash = await Evm.broadcastTx(signedTx);

  res.status(200).json({
    success: true,
    txHash: txHash.hash,
    from: fromAddress,
    to,
  });
}

export default authMiddleware(handler);
```

### Phase 3: Frontend Implementation 🟡 Priority

#### 3.1 Add NEAR Wallet Integration

Create `utils/near-wallet.js`:

```javascript
import * as nearAPI from "near-api-js";

export class NearWallet {
  constructor() {
    this.wallet = null;
    this.accountId = null;
  }

  async init() {
    const near = await nearAPI.connect({
      networkId: "testnet",
      keyStore: new nearAPI.keyStores.BrowserLocalStorageKeyStore(),
      nodeUrl: "https://test.rpc.fastnear.com",
      walletUrl: "https://wallet.testnet.near.org",
    });

    this.wallet = new nearAPI.WalletConnection(near);
  }

  async signIn() {
    await this.wallet.requestSignIn({
      contractId: process.env.NEXT_PUBLIC_contractId,
      methodNames: [],
    });
  }

  async signMessage(message) {
    const keyPair = await this.wallet._keyStore.getKey(
      this.wallet._networkId,
      this.wallet.getAccountId()
    );
    return keyPair.sign(Buffer.from(message));
  }

  isSignedIn() {
    return this.wallet && this.wallet.isSignedIn();
  }

  getAccountId() {
    return this.wallet.getAccountId();
  }

  signOut() {
    this.wallet.signOut();
  }
}
```

#### 3.2 Create User Dashboard Component

Create `components/UserDashboard.js`:

```javascript
import { useState, useEffect } from "react";
import { NearWallet } from "../utils/near-wallet";

export default function UserDashboard() {
  const [wallet, setWallet] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [ethAddress, setEthAddress] = useState("");
  const [ethBalance, setEthBalance] = useState("0");
  const [loading, setLoading] = useState(false);

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

  const handleSignIn = async () => {
    await wallet.signIn();
  };

  const registerUser = async () => {
    setLoading(true);
    const message = JSON.stringify({ action: "register", timestamp: Date.now() });
    const signature = await wallet.signMessage(message);

    const res = await fetch("/api/user/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accountId: wallet.getAccountId(),
        signature: signature.toString(),
      },
      body: message,
    });

    const data = await res.json();
    if (data.success) {
      setEthAddress(data.ethAddress);
      await updateBalance(data.ethAddress);
    }
    setLoading(false);
  };

  const sendTransaction = async (to, value) => {
    const message = JSON.stringify({ to, value, timestamp: Date.now() });
    const signature = await wallet.signMessage(message);

    const res = await fetch("/api/user/sendTransaction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accountId: wallet.getAccountId(),
        signature: signature.toString(),
      },
      body: JSON.stringify({ to, value, data: "0x", message }),
    });

    const data = await res.json();
    return data;
  };

  return (
    <div>
      {!userAccount ? (
        <button onClick={handleSignIn}>Connect NEAR Wallet</button>
      ) : (
        <div>
          <h3>Connected as: {userAccount}</h3>
          {!ethAddress ? (
            <button onClick={registerUser} disabled={loading}>
              Register for ETH Address
            </button>
          ) : (
            <div>
              <p>Your ETH Address: {ethAddress}</p>
              <p>Balance: {ethBalance} ETH</p>
              {/* Add transaction UI here */}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Phase 4: Testing & Deployment 🟢

#### 4.1 Update Docker Configuration

Ensure worker agent has necessary permissions:

```yaml
# docker-compose.yaml
services:
  web:
    environment:
      - WORKER_ACCOUNT_ID=${WORKER_ACCOUNT_ID}
      - ENABLE_USER_AUTH=true
```

#### 4.2 Testing Checklist

- [ ] User registration flow
- [ ] ETH address derivation per user
- [ ] User authentication via NEAR wallet
- [ ] Transaction signing with user-specific keys
- [ ] Multiple users can operate independently
- [ ] Error handling for insufficient balance
- [ ] Rate limiting per user

#### 4.3 Migration Steps

1. Deploy updated smart contract
2. Register worker agent with new contract
3. Deploy updated API endpoints
4. Update frontend with wallet integration
5. Test with multiple test accounts
6. Document user onboarding process

## Security Considerations

1. **Authentication**: All user-specific operations require NEAR wallet signature
2. **Authorization**: Smart contract verifies user permissions
3. **Isolation**: Each user's derived keys are isolated
4. **Rate Limiting**: Implement per-user rate limits
5. **Balance Checks**: Verify ETH balance before operations

## API Reference

### Authenticated Endpoints

All require NEAR wallet signature in headers:

- `POST /api/user/register` - Register new user
- `GET /api/user/info` - Get user's ETH address and balance
- `POST /api/user/sendTransaction` - Send ETH transaction
- `GET /api/user/transactions` - Get transaction history

### Public Endpoints

- `GET /api/derive` - Get worker agent account (for funding)
- `POST /api/register` - Register worker agent (admin only)

## Next Steps

1. Start with Phase 1 (Smart Contract) - Critical foundation
2. Implement Phase 2 (Backend) - Enable user operations
3. Build Phase 3 (Frontend) - User interface
4. Complete Phase 4 (Testing) - Ensure reliability

## Timeline Estimate

- Phase 1: 2-3 days
- Phase 2: 2-3 days
- Phase 3: 3-4 days
- Phase 4: 2-3 days
- **Total: ~2 weeks**
