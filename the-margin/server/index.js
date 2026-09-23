import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  listDrafts,
  getDraft,
  createDraft,
  saveDraft,
  deleteDraft,
  listRespondedProvocations,
  getAnthropicKeyRecord,
  setAnthropicKeyRecord,
  deleteAnthropicKeyRecord,
} from './lib/db.js';
import { generateProvocations, validateApiKey, NoApiKeyError } from './lib/provoke.js';
import { encrypt, decrypt } from './lib/crypto.js';
import { requireAuth } from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5175;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Every /api/* route requires a signed-in Firebase user; the built frontend
// (including the login screen itself) is served separately, below, without
// this gate, since a signed-out visitor still needs to load the login page.
app.use('/api', requireAuth);

app.get('/api/drafts', async (req, res) => {
  const drafts = await listDrafts(req.uid);
  res.json(drafts);
});

app.post('/api/drafts', async (req, res) => {
  const { title, text, audience } = req.body || {};
  const draft = await createDraft(req.uid, { title, text, audience });
  res.status(201).json(draft);
});

app.get('/api/drafts/:id', async (req, res) => {
  const draft = await getDraft(req.uid, req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

app.put('/api/drafts/:id', async (req, res) => {
  const { text, title, audience } = req.body || {};
  const updates = {};
  if (text !== undefined) updates.text = text;
  if (title !== undefined) {
    updates.title = title;
    updates.titleSetByUser = true;
  }
  if (audience !== undefined) updates.audience = audience;
  const draft = await saveDraft(req.uid, req.params.id, updates);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

app.delete('/api/drafts/:id', async (req, res) => {
  const ok = await deleteDraft(req.uid, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Draft not found' });
  res.status(204).end();
});

// Ask Claude for 1-3 provocations against the draft's current text, save them
// onto the draft as new (non-dismissed, unresponded) notes, and return them.
app.post('/api/drafts/:id/provoke', async (req, res) => {
  const draft = await getDraft(req.uid, req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });

  const text = req.body && typeof req.body.text === 'string' ? req.body.text : draft.text;
  const audience =
    req.body && typeof req.body.audience === 'string' ? req.body.audience : draft.audience;

  try {
    const keyRecord = await getAnthropicKeyRecord(req.uid);
    const apiKey = keyRecord ? decrypt(keyRecord) : null;

    const provocations = await generateProvocations(text, audience, apiKey);
    const now = new Date().toISOString();
    const newNotes = provocations.map((p) => ({
      id: randomUUID(),
      quote: p.quote,
      provocation: p.provocation,
      sentenceId: p.sentenceId,
      anchor: p.anchor,
      createdAt: now,
      dismissed: false,
      dismissedAt: null,
      response: null,
      respondedAt: null,
    }));

    const updatedDraft = await saveDraft(req.uid, draft.id, {
      text,
      audience,
      notes: [...(draft.notes || []), ...newNotes],
    });

    res.json({ notes: newNotes, draft: updatedDraft });
  } catch (err) {
    console.error('provoke failed:', err);
    const status = err instanceof NoApiKeyError ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to generate provocations' });
  }
});

function findNote(draft, noteId) {
  return (draft.notes || []).find((n) => n.id === noteId);
}

app.patch('/api/drafts/:id/notes/:noteId', async (req, res) => {
  const draft = await getDraft(req.uid, req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  const note = findNote(draft, req.params.noteId);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  const { dismissed, response } = req.body || {};
  const now = new Date().toISOString();

  if (dismissed !== undefined) {
    note.dismissed = dismissed;
    note.dismissedAt = dismissed ? now : null;
  }
  if (response !== undefined) {
    note.response = response;
    note.respondedAt = response && response.trim() ? now : null;
  }

  const updatedDraft = await saveDraft(req.uid, draft.id, { notes: draft.notes });
  res.json(updatedDraft);
});

app.get('/api/history', async (req, res) => {
  const entries = await listRespondedProvocations(req.uid);
  res.json(entries);
});

// The user's own Anthropic key — write-only from the client's perspective.
// Once saved, the plaintext key is never sent back; only whether one exists.
app.get('/api/settings/anthropic-key', async (req, res) => {
  const record = await getAnthropicKeyRecord(req.uid);
  res.json({ hasKey: Boolean(record) });
});

app.put('/api/settings/anthropic-key', async (req, res) => {
  const apiKey = req.body && typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
  if (!apiKey) return res.status(400).json({ error: 'API key is required.' });

  try {
    await validateApiKey(apiKey);
  } catch (err) {
    return res.status(400).json({ error: "That key doesn't seem to work — double-check it and try again." });
  }

  await setAnthropicKeyRecord(req.uid, encrypt(apiKey));
  res.json({ hasKey: true });
});

app.delete('/api/settings/anthropic-key', async (req, res) => {
  await deleteAnthropicKeyRecord(req.uid);
  res.json({ hasKey: false });
});

// In production there's no separate Vite dev server — this process serves
// the built frontend too (including the login screen), so a host only needs
// to run one service. Intentionally not behind requireAuth: a signed-out
// visitor has to be able to load the page that lets them sign in.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`The Margin server listening on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      'Note: ANTHROPIC_API_KEY is not set. That\'s fine if every user brings their own key in Settings — ' +
        'it only matters as a fallback for accounts that haven\'t added one.'
    );
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.warn(
      'Warning: ENCRYPTION_KEY is not set. Saving a personal API key in Settings will fail until you set it ' +
        '(generate one with `openssl rand -hex 32`).'
    );
  }
});
