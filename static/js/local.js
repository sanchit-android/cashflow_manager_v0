// "Start free, no sign-up": the app works before you create an account.
// Records live only in this browser (IndexedDB), each one encrypted with an AES-256 key that is
// generated here and can never be exported. Nothing is sent to the server. After signing up,
// the app offers to move these records into the account (encrypted with the account's key) and
// then erases the local copy.
import * as C from "./crypto.js";

const DB = "plannedout-local", STORE = "kv", TAG = "local";

export const isLocalMode = () => typeof location !== "undefined" && new URLSearchParams(location.search).get("local") === "1";

function idb() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function kv(mode, fn) {
  const db = await idb();
  return new Promise((ok, fail) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); ok(req && req.result); };
    tx.onerror = () => { db.close(); fail(tx.error); };
  });
}
const get = (k) => kv("readonly", (s) => s.get(k));
const put = (k, v) => kv("readwrite", (s) => s.put(v, k));
const del = (k) => kv("readwrite", (s) => s.delete(k));

async function deviceKey(create) {
  let k = await get("key");
  if (!k && create) {
    k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await put("key", k);
  }
  return k || null;
}

/** Decrypted records saved in this browser, as store rows. */
export async function loadLocal() {
  try {
    const key = await deviceKey(false);
    const rows = (await get("rows")) || [];
    if (!key) return [];
    const out = [];
    for (const r of rows) {
      try {
        out.push({ id: r.id, type: r.type, period: r.period || "", version: r.version || 1, deleted: false,
          data: await C.decryptRecord(key, TAG, r) });
      } catch { /* unreadable row: skip it */ }
    }
    return out;
  } catch { return []; }
}

// Saves are chained so two quick edits can't overwrite each other out of order.
let chain = Promise.resolve();
/** Replace the stored copy with these rows (deleted rows are dropped). */
export function saveLocal(rows) {
  const snapshot = rows.filter((r) => !r.deleted).map(({ id, type, period, version, data }) => ({ id, type, period, version, data }));
  chain = chain.catch(() => {}).then(async () => {
    const key = await deviceKey(true);
    const enc = [];
    for (const r of snapshot) {
      enc.push({ id: r.id, type: r.type, period: r.period || "", version: r.version || 1,
        ...(await C.encryptRecord(key, TAG, { id: r.id, type: r.type, data: r.data })) });
    }
    await put("rows", enc);
    await put("saved_at", new Date().toISOString());
  });
  return chain;
}

export async function hasLocal() {
  try { const rows = await get("rows"); return Array.isArray(rows) && rows.length > 0; } catch { return false; }
}

export async function clearLocal() {
  await chain.catch(() => {});
  try { await del("rows"); await del("key"); await del("saved_at"); } catch { /* ignore */ }
}
