// Minimal .xlsx reader with no dependencies. Works in browsers and Node 18+.
// Reads cell values (formula cells give their last calculated value). No styles, no dates-as-numbers magic.
//
//   const book = await readXlsx(arrayBuffer);   // { sheetNames: [...], sheet(name) -> { get("B5"), rows() } }

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read every file in a zip archive. Returns Map(name -> Uint8Array). */
async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This isn't an .xlsx file.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map(), dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Damaged .xlsx file.");
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const dataStart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = u8.subarray(dataStart, dataStart + csize);
    files.set(name, { method, raw });
    p += 46 + nlen + xlen + clen;
  }
  return {
    has: (name) => files.has(name),
    async text(name) {
      const f = files.get(name);
      if (!f) return null;
      const bytes = f.method === 0 ? f.raw : f.method === 8 ? await inflate(f.raw) : null;
      if (!bytes) throw new Error("Unsupported compression in .xlsx file.");
      return dec.decode(bytes);
    },
  };
}

const unescape = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
  ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e.toLowerCase()] ??
    String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))));
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? unescape(m[1]) : null; };
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");

export function colToNum(col) { let n = 0; for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
export function numToCol(n) { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
export function splitRef(ref) { const m = ref.match(/^([A-Z]+)(\d+)$/); return [m[1], +m[2]]; }

function parseSheet(xml, shared) {
  const cells = new Map();
  let maxRow = 0, maxCol = 0;
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const tag = m[1], body = m[2] || "";
    const ref = attr(tag, "r"); if (!ref) continue;
    const t = attr(tag, "t");
    let v = null;
    if (t === "inlineStr") v = textOf(body);
    else {
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      if (vm) {
        const raw = unescape(vm[1]);
        if (t === "s") v = shared[+raw] ?? "";
        else if (t === "str" || t === "e") v = raw;
        else if (t === "b") v = raw === "1";
        else v = Number(raw);
      }
    }
    if (v === null || v === "") continue;
    cells.set(ref, v);
    const [c, r] = splitRef(ref);
    maxRow = Math.max(maxRow, r); maxCol = Math.max(maxCol, colToNum(c));
  }
  return {
    get: (ref) => (cells.has(ref) ? cells.get(ref) : null),
    maxRow, maxCol,
    /** 2-D array of values, row 1 first. */
    rows() {
      const out = [];
      for (let r = 1; r <= maxRow; r++) {
        const row = [];
        for (let c = 1; c <= maxCol; c++) row.push(cells.get(numToCol(c) + r) ?? null);
        out.push(row);
      }
      return out;
    },
  };
}

export async function readXlsx(buf) {
  const zip = await unzip(buf);
  const wb = await zip.text("xl/workbook.xml");
  if (!wb) throw new Error("This isn't an .xlsx file.");
  const rels = await zip.text("xl/_rels/workbook.xml.rels") || "";
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) target[attr(m[1], "Id")] = attr(m[1], "Target");
  const sharedXml = await zip.text("xl/sharedStrings.xml") || "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], "name"), rid = attr(m[1], "r:id");
    let path = target[rid] || "";
    path = path.startsWith("/") ? path.slice(1) : "xl/" + path.replace(/^\.\//, "");
    sheets.push({ name, path });
  }
  const cache = {};
  return {
    sheetNames: sheets.map((s) => s.name),
    async sheet(name) {
      if (!cache[name]) {
        const s = sheets.find((x) => x.name === name);
        if (!s) return null;
        cache[name] = parseSheet(await zip.text(s.path) || "", shared);
      }
      return cache[name];
    },
  };
}

/** Excel serial date -> YYYY-MM-DD. */
export function excelDate(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
}
