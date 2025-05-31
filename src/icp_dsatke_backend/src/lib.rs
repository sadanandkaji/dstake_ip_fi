// src/lib.rs

use ic_cdk::export::candid::{CandidType, Deserialize};
use ic_cdk_macros::{update, query};
use std::cell::RefCell;
use std::collections::HashMap;

type PrincipalText = String;
type AccountId = String;
type Balance = u64;

#[derive(Clone, CandidType, Deserialize, Debug)]
struct User {
    principal_id: PrincipalText,
    account_id: AccountId,
    balance_e8s: Balance,
}

#[derive(Default)]
struct BackendState {
    users: HashMap<PrincipalText, User>,
}

// Thread-safe storage for canister state
thread_local! {
    static STATE: RefCell<BackendState> = RefCell::new(BackendState::default());
}

/// Add or update a user — this changes state, so it's an `update` call
#[update]
fn add_or_update_user(principal_id: String, account_id: String, balance_e8s: Balance) -> String {
    let user = User {
        principal_id: principal_id.clone(),
        account_id,
        balance_e8s,
    };

    STATE.with(|state| {
        state.borrow_mut().users.insert(principal_id.clone(), user);
    });

    format!("User {} stored successfully", principal_id)
}

/// Return all users — reads state, so it's a `query` call
#[query]
fn get_all_users() -> Vec<User> {
    STATE.with(|state| {
        state.borrow().users.values().cloned().collect()
    })
}
