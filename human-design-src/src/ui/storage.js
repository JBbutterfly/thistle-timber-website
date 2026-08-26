// ─────────────────────────────────────────────────────────────────────────
// Shared persistence for the Brotherhood Circle roster.
//
// When firebaseConfig.js has a real project configured, this syncs people
// and circles live through Firestore so every device sees the same roster.
// Until then (or if Firebase init fails for any reason), it falls back to
// this browser's local storage only — the app keeps working either way.
//
// The public API (getPeople/savePerson/deletePerson/getPerson/getCircles/
// saveCircle/deleteCircle/getCircle/uid) is synchronous and identical in
// both modes: cloud mode keeps an in-memory cache fed by a live Firestore
// listener, so callers never have to await a read.
// ─────────────────────────────────────────────────────────────────────────
import { firebaseConfig, isFirebaseConfigured } from "../firebaseConfig.js";

const PEOPLE_KEY = "tt-hd:people:v1";
const CIRCLES_KEY = "tt-hd:circles:v1";

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Local-only backend ─────────────────────────────────────────────────
function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let peopleCache = [];
let circlesCache = [];
export let syncMode = "local"; // "local" | "cloud" | "cloud-error"

function localGetPeople() {
  return peopleCache;
}
function localSavePerson(person) {
  const idx = peopleCache.findIndex((p) => p.id === person.id);
  if (idx >= 0) peopleCache[idx] = person;
  else peopleCache.push(person);
  writeLocal(PEOPLE_KEY, peopleCache);
  return person;
}
function localDeletePerson(id) {
  peopleCache = peopleCache.filter((p) => p.id !== id);
  writeLocal(PEOPLE_KEY, peopleCache);
  circlesCache = circlesCache.map((c) =>
    c.memberIds.includes(id) ? { ...c, memberIds: c.memberIds.filter((m) => m !== id) } : c
  );
  writeLocal(CIRCLES_KEY, circlesCache);
}
function localGetCircles() {
  return circlesCache;
}
function localSaveCircle(circle) {
  const idx = circlesCache.findIndex((c) => c.id === circle.id);
  if (idx >= 0) circlesCache[idx] = circle;
  else circlesCache.push(circle);
  writeLocal(CIRCLES_KEY, circlesCache);
  return circle;
}
function localDeleteCircle(id) {
  circlesCache = circlesCache.filter((c) => c.id !== id);
  writeLocal(CIRCLES_KEY, circlesCache);
}

// ── Cloud (Firestore) backend ──────────────────────────────────────────
let db = null;
let fs = null; // Firestore function bindings (collection/doc/setDoc/etc.), set once initCloud resolves

async function initCloud(onChange) {
  const { initializeApp } = await import("firebase/app");
  const { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, arrayRemove, enableIndexedDbPersistence } =
    await import("firebase/firestore");
  const { getAuth, signInAnonymously, onAuthStateChanged } = await import("firebase/auth");

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  try {
    await enableIndexedDbPersistence(db);
  } catch {
    // Multiple tabs open, or browser doesn't support it — fine, just no offline cache.
  }
  const auth = getAuth(app);
  fs = { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, arrayRemove };

  await new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve();
    });
    signInAnonymously(auth).catch(reject);
  });

  onSnapshot(collection(db, "people"), (snap) => {
    peopleCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange();
  });
  onSnapshot(collection(db, "circles"), (snap) => {
    circlesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange();
  });
}

function cloudSavePerson(person) {
  const { collection, doc, setDoc } = fs;
  const id = person.id ?? doc(collection(db, "people")).id;
  const record = { ...person, id };
  setDoc(doc(db, "people", id), record);
  return record;
}
function cloudDeletePerson(id) {
  const { doc, deleteDoc, updateDoc, arrayRemove } = fs;
  deleteDoc(doc(db, "people", id));
  for (const circle of circlesCache) {
    if (circle.memberIds.includes(id)) updateDoc(doc(db, "circles", circle.id), { memberIds: arrayRemove(id) });
  }
}
function cloudSaveCircle(circle) {
  const { collection, doc, setDoc } = fs;
  const id = circle.id ?? doc(collection(db, "circles")).id;
  const record = { ...circle, id };
  setDoc(doc(db, "circles", id), record);
  return record;
}
function cloudDeleteCircle(id) {
  const { doc, deleteDoc } = fs;
  deleteDoc(doc(db, "circles", id));
}

// ── Public API ──────────────────────────────────────────────────────────
export function getPeople() {
  return syncMode === "cloud" ? peopleCache : localGetPeople();
}
export function savePerson(person) {
  const record = { id: person.id ?? uid(), ...person };
  return syncMode === "cloud" ? cloudSavePerson(record) : localSavePerson(record);
}
export function deletePerson(id) {
  return syncMode === "cloud" ? cloudDeletePerson(id) : localDeletePerson(id);
}
export function getPerson(id) {
  return getPeople().find((p) => p.id === id) ?? null;
}
export function getCircles() {
  return syncMode === "cloud" ? circlesCache : localGetCircles();
}
export function saveCircle(circle) {
  const record = { id: circle.id ?? uid(), ...circle };
  return syncMode === "cloud" ? cloudSaveCircle(record) : localSaveCircle(record);
}
export function deleteCircle(id) {
  return syncMode === "cloud" ? cloudDeleteCircle(id) : localDeleteCircle(id);
}
export function getCircle(id) {
  return getCircles().find((c) => c.id === id) ?? null;
}

/**
 * Boots storage and calls onChange() every time data is ready or changes
 * (including the first time). Must be called once before the first render.
 */
export function initStorage(onChange) {
  peopleCache = readLocal(PEOPLE_KEY);
  circlesCache = readLocal(CIRCLES_KEY);

  if (!isFirebaseConfigured) {
    syncMode = "local";
    onChange();
    return;
  }

  onChange(); // paint the local snapshot immediately while cloud connects
  initCloud(() => {
    syncMode = "cloud";
    onChange();
  }).catch((err) => {
    console.error("Firebase sync failed, staying in local-only mode:", err);
    syncMode = "cloud-error";
    onChange();
  });
}
