import { randomUUID } from 'crypto';
import { getDb } from './firebaseAdmin.js';

// Every draft lives under users/{uid}/drafts/{draftId}, with its notes as a
// plain array field on the draft doc (not a subcollection) — this app's
// scale is "one person's drafts", not big data, so keeping the exact same
// shape the old JSON-file version used means History can just read all of a
// user's drafts and filter in memory, no composite index to set up.

function draftsCol(uid) {
  return getDb().collection('users').doc(uid).collection('drafts');
}

function firstLine(text) {
  const line = (text || '').split('\n').find((l) => l.trim().length > 0);
  return line ? line.trim().slice(0, 80) : 'Untitled draft';
}

export async function listDrafts(uid) {
  const snap = await draftsCol(uid).orderBy('updatedAt', 'desc').get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      title: d.title,
      updatedAt: d.updatedAt,
      createdAt: d.createdAt,
      preview: (d.text || '').trim().slice(0, 140),
      noteCount: (d.notes || []).length,
    };
  });
}

export async function getDraft(uid, id) {
  const doc = await draftsCol(uid).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function createDraft(uid, { title, text, audience } = {}) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const draft = {
    title: title || firstLine(text) || 'Untitled draft',
    text: text || '',
    audience: audience || 'general',
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
  await draftsCol(uid).doc(id).set(draft);
  return { id, ...draft };
}

export async function saveDraft(uid, id, updates) {
  const ref = draftsCol(uid).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  const existingData = existing.data();

  const merged = { ...updates, updatedAt: new Date().toISOString() };
  if (updates.text !== undefined && updates.title === undefined && !existingData.titleSetByUser) {
    merged.title = firstLine(updates.text) || 'Untitled draft';
  }

  await ref.set(merged, { merge: true });
  const updatedDoc = await ref.get();
  return { id, ...updatedDoc.data() };
}

export async function deleteDraft(uid, id) {
  const ref = draftsCol(uid).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// Every provocation this user has expanded and responded to, across every
// one of their drafts, oldest first — the raw material for the History view.
export async function listRespondedProvocations(uid) {
  const snap = await draftsCol(uid).get();
  const entries = [];

  snap.forEach((doc) => {
    const draft = doc.data();
    for (const note of draft.notes || []) {
      if (note.response && note.response.trim() && note.respondedAt) {
        entries.push({
          draftId: doc.id,
          draftTitle: draft.title,
          noteId: note.id,
          quote: note.quote,
          provocation: note.provocation,
          response: note.response,
          respondedAt: note.respondedAt,
          createdAt: note.createdAt,
        });
      }
    }
  });

  entries.sort((a, b) => new Date(a.respondedAt) - new Date(b.respondedAt));
  return entries;
}
