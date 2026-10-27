// Talks to Django, keeps decrypted records in memory, remembers the data key on this device if asked.
import * as C from "./crypto.js";
import { buildDemoRecords } from "./demo.js";
import { track } from "./track.js";

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
  email: null, vault: null, key: null, isAdmin: false,
  isDemo: typeof location !== "undefined" && new URLSearchParams(location.search).get("demo") === "1",
  rows: new Map(), // id -> { id, type, period, version, deleted, data }
  lastSync: null,

  resetDemo() {
    this.key = "demo-key";
    this.rows.clear();
    for (const r of buildDemoRecords()) this.rows.set(r.id, r);
    this.lastSync = new Date().toISOString();
  },

  async load() {
    if (this.isDemo) {
      this.email = "demo@plannedout.in";
      this.isAdmin = false;
      this.vault = {
        kdf: "demo", salt: "demo", wrapped_key: "demo",
        keys: [
          { id: 1, kind: "recovery", label: "Recovery key 1 (Home safe)", created_at: "2026-01-15T10:00:00Z" },
          { id: 2, kind: "recovery", label: "Recovery key 2 (Password manager)", created_at: "2026-01-15T10:00:00Z" },
        ],
      };
      this.resetDemo();
      return { vault: this.vault, email: this.email, is_admin: false };
    }
    const r = await api("/api/vault");
    this.email = r.email; this.vault = r.vault; this.isAdmin = !!r.is_admin;
    return r;
  },

  async unlock(key) {
    if (this.isDemo) {
      this.key = key || "demo-key";
      if (!this.rows.size) this.resetDemo();
      return;
    }
    this.key = key;
    this.rows.clear(); this.lastSync = null;
    await this.pull();
  },

  lock() { this.key = null; if (!this.isDemo) { this.rows.clear(); this.lastSync = null; } },

  async pull() {
    if (this.isDemo) return;
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
    if (this.isDemo) {
      for (const it of items) {
        const id = it.id || crypto.randomUUID();
        const prev = this.rows.get(id);
        it.id = id;
        this.rows.set(id, {
          id, type: it.type, period: it.period || "",
          version: (prev ? prev.version : 0) + 1,
          deleted: !!it.deleted, data: it.deleted ? null : it.data,
        });
      }
      return items.map((x) => x.id);
    }
    const payload = [], prevVersion = new Map();
    for (const it of items) {
      const id = it.id || crypto.randomUUID();
      const prev = this.rows.get(id);
      prevVersion.set(id, prev ? prev.version : 0);
      const base = { id, type: it.type, period: it.period || "", base_version: prev ? prev.version : 0, deleted: !!it.deleted };
      if (!it.deleted) Object.assign(base, await C.encryptRecord(this.key, this.email, { id, type: it.type, data: it.data }));
      payload.push(base);
      it.id = id;
    }
    for (let i = 0; i < payload.length; i += 400) {
      const r = await api("/api/records/push", { method: "POST", body: { records: payload.slice(i, i + 400) } });
      for (const s of r.saved) {
        const it = items.find((x) => x.id === s.id);
        track(`${it.deleted ? "delete" : prevVersion.get(s.id) ? "edit" : "save"}:${it.type}`);
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
