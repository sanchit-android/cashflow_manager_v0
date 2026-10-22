// End-to-end encryption. Runs in the browser (and Node 20+ for tests). Uses only WebCrypto.
//
// Data key: random AES-256-GCM key that encrypts every record. Never leaves the device unwrapped.
// Passphrase -> PBKDF2-SHA256 (600k iterations) -> wrapping key. (v0; Argon2id is the planned upgrade,
//   kdf params are stored per vault so old vaults keep working.)
// Recovery key: 160 random bits shown to the user -> HKDF-SHA256 -> wrapping key.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const DEFAULT_KDF = { alg: "pbkdf2-sha256", iterations: 600000 };

export const b64 = {
  encode(bytes) {
    let s = "";
    const u = new Uint8Array(bytes);
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  },
  decode(str) {
    const s = atob(str);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  },
};

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---- recovery key format: 32 base32 chars in 8 groups, e.g. ABCD-EFGH-... ----
const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
export function newRecoveryKey() {
  const bytes = randomBytes(20);
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i < 160; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g).join("-");
}
export function normalizeRecoveryKey(s) {
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ---- wrapping keys ----
async function passphraseKey(passphrase, saltB64, kdf) {
  if (kdf.alg !== "pbkdf2-sha256") throw new Error("Unsupported key derivation: " + kdf.alg);
  const base = await subtle.importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64.decode(saltB64), iterations: kdf.iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function recoveryWrappingKey(recoveryKey, saltB64) {
  const base = await subtle.importKey("raw", enc.encode(normalizeRecoveryKey(recoveryKey)), "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: b64.decode(saltB64), info: enc.encode("cashflow-recovery-v1") },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function wrapRaw(rawKey, wrappingKey) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, rawKey);
  return b64.encode(iv) + "." + b64.encode(ct);
}

async function unwrapRaw(wrapped, wrappingKey) {
  const [iv, ct] = wrapped.split(".");
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: b64.decode(iv) }, wrappingKey, b64.decode(ct)));
}

function importDataKey(raw, extractable = false) {
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, extractable, ["encrypt", "decrypt"]);
}

// ---- vault lifecycle ----

/** Create a new vault. Returns { payload for the server, dataKey, recoveryKeys (show once) }. */
export async function createVault(passphrase, recoveryCount = 3) {
  const raw = randomBytes(32);
  const salt = b64.encode(randomBytes(16));
  const kdf = { ...DEFAULT_KDF };
  const wrapped_key = await wrapRaw(raw, await passphraseKey(passphrase, salt, kdf));
  const recoveryKeys = [];
  const recovery_keys = [];
  for (let i = 0; i < recoveryCount; i++) {
    const rk = newRecoveryKey();
    recoveryKeys.push(rk);
    recovery_keys.push({ label: `Recovery key ${i + 1}`, wrapped_key: await wrapRecovery(raw, rk, salt) });
  }
  const dataKey = await importDataKey(raw);
  raw.fill(0);
  return { payload: { kdf, salt, wrapped_key, recovery_keys }, dataKey, recoveryKeys };
}

async function wrapRecovery(raw, recoveryKey, salt) {
  return wrapRaw(raw, await recoveryWrappingKey(recoveryKey, salt));
}

export async function unlockWithPassphrase(vault, passphrase) {
  const raw = await unwrapRaw(vault.wrapped_key, await passphraseKey(passphrase, vault.salt, vault.kdf));
  return importDataKey(raw);
}

/** Try every active recovery key slot. Returns { dataKey, raw } — raw is needed to set a new passphrase. */
export async function unlockWithRecoveryKey(vault, recoveryKey) {
  const wk = await recoveryWrappingKey(recoveryKey, vault.salt);
  for (const k of vault.keys) {
    try {
      const raw = await unwrapRaw(k.wrapped_key, wk);
      return { dataKey: await importDataKey(raw), raw };
    } catch { /* not this slot */ }
  }
  throw new Error("That recovery key doesn't match this vault.");
}

/** Re-wrap with a new passphrase. Needs the raw key (from passphrase or recovery unlock). Salt is kept
 *  so existing recovery-key slots stay valid. */
export async function rewrapPassphrase(vault, raw, newPassphrase) {
  const kdf = { ...DEFAULT_KDF };
  return { kdf, salt: vault.salt, wrapped_key: await wrapRaw(raw, await passphraseKey(newPassphrase, vault.salt, kdf)) };
}

export async function rawFromPassphrase(vault, passphrase) {
  return unwrapRaw(vault.wrapped_key, await passphraseKey(passphrase, vault.salt, vault.kdf));
}

export async function newRecoverySlot(vault, raw) {
  const rk = newRecoveryKey();
  return { recoveryKey: rk, wrapped_key: await wrapRecovery(raw, rk, vault.salt) };
}

// ---- records ----
const aadFor = (userTag, id, type) => enc.encode(`${userTag}|${id}|${type}`);

export async function encryptRecord(dataKey, userTag, rec) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadFor(userTag, rec.id, rec.type) },
    dataKey, enc.encode(JSON.stringify(rec.data)));
  return { ciphertext: b64.encode(ct), iv: b64.encode(iv) };
}

export async function decryptRecord(dataKey, userTag, row) {
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: b64.decode(row.iv), additionalData: aadFor(userTag, row.id, row.type) },
    dataKey, b64.decode(row.ciphertext));
  return JSON.parse(dec.decode(pt));
}
