use hex::{decode, encode};
use near_sdk::{
    env::{self, block_timestamp},
    near, require,
    store::{IterableMap, IterableSet, LookupMap},
    AccountId, Gas, NearToken, PanicOnDefault, Promise,
};

use dcap_qvl::{verify, QuoteCollateralV3};

mod collateral;
mod ecdsa;
mod external;
mod utils;

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Worker {
    checksum: String,
    codehash: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct UserPermissions {
    pub enabled: bool,
    pub max_gas_per_tx: u128,
    pub allowed_methods: Vec<String>,
    pub registration_timestamp: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner_id: AccountId,
    pub approved_codehashes: IterableSet<String>,
    pub worker_by_account_id: IterableMap<AccountId, Worker>,
    pub registered_users: IterableSet<AccountId>,
    pub user_permissions: LookupMap<AccountId, UserPermissions>,
}

#[near]
impl Contract {
    #[init]
    #[private]
    pub fn init(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            approved_codehashes: IterableSet::new(b"a"),
            worker_by_account_id: IterableMap::new(b"b"),
            registered_users: IterableSet::new(b"c"),
            user_permissions: LookupMap::new(b"d"),
        }
    }

    // Helpers for method access control

    pub fn require_owner(&mut self) {
        require!(env::predecessor_account_id() == self.owner_id);
    }

    pub fn require_worker(&self, codehash: String) {
        let worker = self
            .worker_by_account_id
            .get(&env::predecessor_account_id())
            .unwrap()
            .to_owned();

        require!(worker.codehash == codehash);
    }

    // Examples for method access control

    // Approve a new codehash
    pub fn approve_codehash(&mut self, codehash: String) {
        self.require_owner();
        self.approved_codehashes.insert(codehash);
    }

    /// Will throw on client if worker agent is not registered with a codehash in self.approved_codehashes
    pub fn sign_tx(
        &mut self,
        payload: Vec<u8>,
        derivation_path: String,
        key_version: u32,
    ) -> Promise {
        // Comment these two lines for local development
        // let worker = self.get_worker(env::predecessor_account_id());
        // require!(self.approved_codehashes.contains(&worker.codehash));

        // Call the MPC contract to get a signature for the payload
        ecdsa::get_sig(payload, derivation_path, key_version)
    }

    // Register args see: https://github.com/mattlockyer/based-agent-template/blob/main/pages/api/register.js

    pub fn register_worker(
        &mut self,
        quote_hex: String,
        collateral: String,
        checksum: String,
        tcb_info: String,
    ) -> bool {
        let collateral = collateral::get_collateral(collateral);
        let quote = decode(quote_hex).unwrap();
        let now = block_timestamp() / 1000000000;
        let result = verify::verify(&quote, &collateral, now).expect("report is not verified");
        let rtmr3 = encode(result.report.as_td10().unwrap().rt_mr3.to_vec());
        let codehash = collateral::verify_codehash(tcb_info, rtmr3);

        // Comment this line to allow any worker to register
        require!(self.approved_codehashes.contains(&codehash));

        let predecessor = env::predecessor_account_id();
        self.worker_by_account_id
            .insert(predecessor, Worker { checksum, codehash });

        true
    }

    pub fn get_worker(&self, account_id: AccountId) -> Worker {
        self.worker_by_account_id
            .get(&account_id)
            .unwrap()
            .to_owned()
    }

    // NEW: User management methods

    /// Register a new user and return their derivation path
    pub fn register_user(&mut self) -> String {
        let user = env::predecessor_account_id();
        require!(
            !self.registered_users.contains(&user),
            "User already registered"
        );

        // Generate user-specific derivation path
        let derivation_path = format!("ethereum-{}", user);

        // Store user registration
        self.registered_users.insert(user.clone());
        self.user_permissions.insert(
            user.clone(),
            UserPermissions {
                enabled: true,
                max_gas_per_tx: 1000000000000000, // 0.001 ETH
                allowed_methods: vec!["transfer".to_string(), "updatePrice".to_string()],
                registration_timestamp: env::block_timestamp(),
            },
        );

        // Return the derivation path (ETH address will be derived client-side)
        derivation_path
    }

    /// Check if a user is registered
    pub fn is_user_registered(&self, user_id: AccountId) -> bool {
        self.registered_users.contains(&user_id)
    }

    /// Get user permissions
    pub fn get_user_permissions(&self, user_id: AccountId) -> Option<UserPermissions> {
        self.user_permissions.get(&user_id).map(|p| p.clone())
    }

    /// Sign transaction for a specific user
    pub fn sign_tx_for_user(
        &mut self,
        user_id: AccountId,
        payload: Vec<u8>,
        derivation_path: String,
        key_version: u32,
    ) -> Promise {
        // Comment these lines for local development
        // let worker = self.get_worker(env::predecessor_account_id());
        // require!(self.approved_codehashes.contains(&worker.codehash));

        // Verify user is registered and has permissions
        require!(
            self.registered_users.contains(&user_id),
            "User not registered"
        );
        let permissions = self.user_permissions.get(&user_id).unwrap();
        require!(permissions.enabled, "User account disabled");

        // Verify derivation path matches user
        let expected_path = format!("ethereum-{}", user_id);
        require!(
            derivation_path == expected_path,
            "Invalid derivation path for user"
        );

        // Call MPC to sign with user-specific derived key
        ecdsa::get_sig(payload, derivation_path, key_version)
    }

    /// Update user permissions (owner only)
    pub fn update_user_permissions(&mut self, user_id: AccountId, permissions: UserPermissions) {
        self.require_owner();
        require!(
            self.registered_users.contains(&user_id),
            "User not registered"
        );
        self.user_permissions.insert(user_id, permissions);
    }

    /// Disable/enable user (owner only)
    pub fn set_user_enabled(&mut self, user_id: AccountId, enabled: bool) {
        self.require_owner();
        let mut permissions = self
            .user_permissions
            .get(&user_id)
            .expect("User not found")
            .clone();
        permissions.enabled = enabled;
        self.user_permissions.insert(user_id, permissions);
    }

    /// Get all registered users
    pub fn get_registered_users(&self) -> Vec<AccountId> {
        self.registered_users.iter().cloned().collect()
    }
}
