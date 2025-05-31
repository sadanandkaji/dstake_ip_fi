import React, { useState, useEffect } from "react";
import { Principal } from "@dfinity/principal";
import { HttpAgent, Actor } from "@dfinity/agent";
import { idlFactory as ledgerIdlFactory } from "../../declarations/icp_ledger_canister";
import { idlFactory as backendIdlFactory, canisterId } from "../../declarations/icp_dsatke_backend";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import blake2b from "blake2b";
import crc32 from "crc-32";
import { Buffer } from "buffer";


window.Buffer = Buffer;

const ledgerCanisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const backendCanisterId = canisterId;

function toAccountIdentifier(principal, subaccount = new Uint8Array(32)) {
  if (subaccount.length !== 32) throw new Error("Subaccount must be 32 bytes");

  const padding = new TextEncoder().encode("\x0Aaccount-id");
  const hasher = blake2b(28);
  hasher.update(padding);
  hasher.update(principal.toUint8Array());
  hasher.update(subaccount);
  const hash = hasher.digest();

  const checksum = new Uint8Array(
    new Uint32Array([crc32.buf(Buffer.from(hash)) >>> 0]).buffer
  ).reverse();

  return new Uint8Array([...checksum, ...hash]);
}

const toHex = (arr) =>
  Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const getRawAccountIdHex = (accountIdentifierWithChecksum) => {
  const raw = accountIdentifierWithChecksum.slice(4);
  return toHex(raw);
};

export default function App() {
  const [seed, setSeed] = useState("");
  const [principalId, setPrincipalId] = useState("");
  const [accountIdWithChecksum, setAccountIdWithChecksum] = useState("");
  const [rawAccountId, setRawAccountId] = useState("");
  const [status, setStatus] = useState("");
  const [users, setUsers] = useState([]);

  const [agent, setAgent] = useState(null);
  const [ledgerActor, setLedgerActor] = useState(null);
  const [backendActor, setBackendActor] = useState(null);

  useEffect(() => {
    async function init() {
      const agent = new HttpAgent({ host: "http://localhost:4943" });
      await agent.fetchRootKey();
      setAgent(agent);

      const ledger = Actor.createActor(ledgerIdlFactory, {
        agent,
        canisterId: ledgerCanisterId,
      });
      setLedgerActor(ledger);

      const backend = Actor.createActor(backendIdlFactory, {
        agent,
        canisterId: backendCanisterId,
      });
      setBackendActor(backend);
    }
    init();
  }, []);

  const generateIdentity = () => {
    const identity = Ed25519KeyIdentity.generate();
    const principal = identity.getPrincipal();

    const accountIdentifier = toAccountIdentifier(principal);
    const accountIdHex = toHex(accountIdentifier);
    const rawHex = getRawAccountIdHex(accountIdentifier);

    setSeed(toHex(identity.getKeyPair().secretKey.slice(0, 32)));
    setPrincipalId(principal.toText());
    setAccountIdWithChecksum(accountIdHex);
    setRawAccountId(rawHex);
    setStatus("Identity generated.");
  };

  const checkBalanceAndStoreUser = async () => {
    if (!ledgerActor || !principalId) {
      setStatus("Ledger or principal not ready.");
      return;
    }

    setStatus("Checking balance on ledger...");
    try {
      const principal = Principal.fromText(principalId);
      const accountIdentifier = toAccountIdentifier(principal);

      const balance = await ledgerActor.account_balance({
        account: Array.from(accountIdentifier),
      });

      setStatus(`Balance on ledger: ${balance.e8s} e8s`);

      if (backendActor) {
        setStatus("Saving user to backend canister...");
        const res = await backendActor.add_or_update_user(
          principalId,
          rawAccountId,
          BigInt(balance.e8s)
        );
        setStatus("User saved to backend: " + res);
      }
    } catch (err) {
      setStatus("Error: " + err.message);
    }
  };

  const fetchUsers = async () => {
    if (!backendActor) {
      setStatus("Backend not ready.");
      return;
    }
    setStatus("Fetching users...");
    try {
      const allUsers = await backendActor.get_all_users();
      setUsers(allUsers);
      setStatus(`Fetched ${allUsers.length} users.`);
    } catch (err) {
      setStatus("Failed to fetch users.");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto font-sans">
      <h1 className="text-3xl font-bold text-center mb-6">ICP Wallet + Ledger + Backend Demo</h1>

      <div className="flex flex-col space-y-4 items-center">
        <button
          onClick={generateIdentity}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Generate Wallet
        </button>

        {seed && (
          <div className="w-full bg-gray-50 p-4 rounded shadow-md space-y-2">
            <p><strong>Seed (demo):</strong> <code className="break-words">{seed}</code></p>
            <p><strong>Principal:</strong> <code className="break-words">{principalId}</code></p>
            <p><strong>Account ID (with checksum):</strong> <code className="break-words">{accountIdWithChecksum}</code></p>
            <p><strong>Raw Account ID (no checksum):</strong> <code className="break-words">{rawAccountId}</code></p>

            <button
              onClick={checkBalanceAndStoreUser}
              className="mt-4 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
            >
              Check Balance & Store User
            </button>
          </div>
        )}

        <hr className="w-full border-t my-6" />

        <button
          onClick={fetchUsers}
          className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
        >
          Fetch All Users from Backend
        </button>

        {users.length > 0 && (
          <div className="overflow-x-auto w-full mt-6">
            <table className="table-auto w-full border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-4 py-2 text-left">Principal</th>
                  <th className="border px-4 py-2 text-left">Account ID (raw)</th>
                  <th className="border px-4 py-2 text-left">Balance (e8s)</th>
                </tr>
              </thead>
              <tbody>
                {users.map(({ principal_id, account_id, balance_e8s }) => (
                  <tr key={principal_id} className="hover:bg-gray-50">
                    <td className="border px-4 py-2">{principal_id}</td>
                    <td className="border px-4 py-2">{account_id}</td>
                    <td className="border px-4 py-2">{balance_e8s.toString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-sm text-gray-700">
          <strong>Status:</strong> {status}
        </p>
      </div>
    </div>
  );
}
