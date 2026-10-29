// Custom-run store (12b, B): client-run simulations are ~4 MB per
// home — too big for sessionStorage, so "3D에서 보기" round-trips them
// through IndexedDB (?custom=<id>). Same-browser only, no server.
// Falls back to process memory when IndexedDB is missing (tests, SSR).

const DB_NAME = "sim-chat-12b";
const STORE_NAME = "custom-runs";

const memoryFallback = new Map();

function idb() {
  try {
    return typeof indexedDB !== "undefined" ? indexedDB : null;
  } catch {
    return null;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const db = idb();
    if (!db) {
      reject(new Error("no-indexeddb"));
      return;
    }
    const req = db.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) {
        d.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb open failed"));
  });
}

export function customRunId(search) {
  try {
    const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
    return q.get("custom") || "";
  } catch {
    return "";
  }
}

export function newCustomId(nowMs = Date.now(), rand = Math.random) {
  const r = Math.floor(rand() * 0xffff).toString(16).padStart(4, "0");
  return `c${nowMs.toString(36)}${r}`;
}

export function isCustomPayload(doc) {
  return Boolean(doc && typeof doc === "object"
    && typeof doc.id === "string" && doc.id !== ""
    && doc.scenario && typeof doc.scenario === "object"
    && doc.runs && typeof doc.runs === "object"
    && Array.isArray(doc.labels) && doc.labels.length > 0);
}

export async function saveCustomRun(doc) {
  if (!isCustomPayload(doc)) throw new Error("custom run payload invalid");
  const record = { ...doc, savedAt: new Date().toISOString() };
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("idb put failed")); };
    });
    return doc.id;
  } catch {
    memoryFallback.set(doc.id, record);
    return doc.id;
  }
}

export async function loadCustomRun(id) {
  if (!id) return null;
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error || new Error("idb get failed")); };
    });
    if (record && isCustomPayload(record)) return record;
  } catch {
    // Fall through to the memory map.
  }
  const mem = memoryFallback.get(id);
  return mem && isCustomPayload(mem) ? mem : null;
}

export function clearMemoryRuns() {
  memoryFallback.clear();
}
