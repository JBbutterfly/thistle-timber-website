import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'drafts');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function draftPath(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

function firstLine(text) {
  const line = (text || '').split('\n').find((l) => l.trim().length > 0);
  return line ? line.trim().slice(0, 80) : 'Untitled draft';
}

export async function listDrafts() {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const drafts = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
    const draft = JSON.parse(raw);
    drafts.push({
      id: draft.id,
      title: draft.title,
      updatedAt: draft.updatedAt,
      createdAt: draft.createdAt,
      preview: (draft.text || '').trim().slice(0, 140),
      noteCount: (draft.notes || []).length,
    });
  }
  drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return drafts;
}

export async function getDraft(id) {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(draftPath(id), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function createDraft({ title, text, audience } = {}) {
  await ensureDataDir();
  const now = new Date().toISOString();
  const draft = {
    id: randomUUID(),
    title: title || firstLine(text) || 'Untitled draft',
    text: text || '',
    audience: audience || 'general',
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(draftPath(draft.id), JSON.stringify(draft, null, 2));
  return draft;
}

export async function saveDraft(id, updates) {
  const existing = await getDraft(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  if (updates.text !== undefined && updates.title === undefined && !existing.titleSetByUser) {
    updated.title = firstLine(updates.text) || 'Untitled draft';
  }

  await fs.writeFile(draftPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteDraft(id) {
  try {
    await fs.unlink(draftPath(id));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

// Every provocation the user has expanded and written a private response to,
// across every draft, oldest first — the raw material for the History view.
export async function listRespondedProvocations() {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const entries = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
    const draft = JSON.parse(raw);
    for (const note of draft.notes || []) {
      if (note.response && note.response.trim() && note.respondedAt) {
        entries.push({
          draftId: draft.id,
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
  }

  entries.sort((a, b) => new Date(a.respondedAt) - new Date(b.respondedAt));
  return entries;
}
