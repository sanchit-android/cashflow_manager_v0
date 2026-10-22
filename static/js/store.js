// Talks to Django, keeps decrypted records in memory, remembers the data key on this device if asked.
import * as C from "./crypto.js";

function csrf() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method, credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { location.href = "/login/"; throw new Error("Signed out"); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---- remembered key: non-extractable CryptoKey in IndexedDB ----
const DB = "cashflow", STORE = "keys";
function idb() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((ok, fail) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => ok(req && req.result);
    tx.onerror = () => fail(tx.error);
  });
}
export const device = {
  save: (email, key) => idbDo("readwrite", (s) => s.put(key, email)).catch(() => {}),
  load: (email) => idbDo("readonly", (s) => s.get(email)).catch(() => null),
  forget: (email) => idbDo("readwrite", (s) => s.delete(email)).catch(() => {}),
};

// ---- the store ----
export const store = {
  email: null, vault: null, key: null,
  rows: new Map(), // id -> { id, type, period, version, deleted, data }
  lastSync: null,

  async load() {
    const r = await api("/api/vault");
    this.email = r.email; this.vault = r.vault;
    return r;
  },

  async unlock(key) {
    this.key = key;
    this.rows.clear(); this.lastSync = null;
    await this.pull();
  },

  lock() { this.key = null; this.rows.clear(); this.lastSync = null; },

  async pull() {
    const q = this.lastSync ? `?since=${encodeURIComponent(this.lastSync)}` : "";
    const r = await api("/api/records" + q);
    for (const row of r.records) {
      if (row.deleted) { this.rows.set(row.id, { ...row, data: null }); continue; }
      const data = await C.decryptRecord(this.key, this.email, row);
      this.rows.set(row.id, { id: row.id, type: row.type, period: row.period, version: row.version, deleted: false, data });
    }
    this.lastSync = r.server_time;
  },

  records() { return [...this.rows.values()]; },
  ofType(type) { return this.records().filter((r) => r.type === type && !r.deleted); },

  /** Save one or more { id?, type, period?, data, deleted? }. Returns saved ids. */
  async save(items) {
    items = Array.isArray(items) ? items : [items];
    const payload = [];
    for (const it of items) {
      const id = it.id || crypto.randomUUID();
      const prev = this.rows.get(id);
      const base = { id, type: it.type, period: it.period || "", base_version: prev ? prev.version : 0, deleted: !!it.deleted };
      if (!it.deleted) Object.assign(base, await C.encryptRecord(this.key, this.email, { id, type: it.type, data: it.data }));
      payload.push(base);
      it.id = id;
    }
    for (let i = 0; i < payload.length; i += 400) {
      const r = await api("/api/records/push", { method: "POST", body: { records: payload.slice(i, i + 400) } });
      for (const s of r.saved) {
        const it = items.find((x) => x.id === s.id);
        this.rows.set(s.id, { id: s.id, type: it.type, period: it.period || "", version: s.version, deleted: !!it.deleted, data: it.deleted ? null : it.data });
      }
      if (r.conflicts.length) {
        await this.pull();
        throw new Error("This data changed on another device. It has been reloaded; make your edit again.");
      }
    }
    return items.map((x) => x.id);
  },

  remove(id) {
    const r = this.rows.get(id);
    return this.save({ id, type: r ? r.type : "transaction", deleted: true });
  },
};
