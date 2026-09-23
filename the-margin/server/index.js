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
} from './lib/db.js';
import { generateProvocations } from './lib/provoke.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5175;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Optional whole-app password gate — set APP_USER + APP_PASSWORD when this
// server is reachable over the public internet (e.g. a hosted deployment for
// testing) so a guessed/shared URL can't rack up API usage on your key.
// Leave both unset for local-only use and no prompt appears.
if (process.env.APP_USER && process.env.APP_PASSWORD) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
      if (user === process.env.APP_USER && pass === process.env.APP_PASSWORD) {
        return next();
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="The Margin"');
    res.status(401).send('Authentication required.');
  });
}

app.get('/api/drafts', async (req, res) => {
  const drafts = await listDrafts();
  res.json(drafts);
});

app.post('/api/drafts', async (req, res) => {
  const { title, text, audience } = req.body || {};
  const draft = await createDraft({ title, text, audience });
  res.status(201).json(draft);
});

app.get('/api/drafts/:id', async (req, res) => {
  const draft = await getDraft(req.params.id);
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
  const draft = await saveDraft(req.params.id, updates);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

app.delete('/api/drafts/:id', async (req, res) => {
  const ok = await deleteDraft(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Draft not found' });
  res.status(204).end();
});

// Ask Claude for 1-3 provocations against the draft's current text, save them
// onto the draft as new (non-dismissed, unresponded) notes, and return them.
app.post('/api/drafts/:id/provoke', async (req, res) => {
  const draft = await getDraft(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });

  const text = req.body && typeof req.body.text === 'string' ? req.body.text : draft.text;
  const audience =
    req.body && typeof req.body.audience === 'string' ? req.body.audience : draft.audience;

  try {
    const provocations = await generateProvocations(text, audience);
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

    const updatedDraft = await saveDraft(draft.id, {
      text,
      audience,
      notes: [...(draft.notes || []), ...newNotes],
    });

    res.json({ notes: newNotes, draft: updatedDraft });
  } catch (err) {
    console.error('provoke failed:', err);
    res.status(500).json({ error: err.message || 'Failed to generate provocations' });
  }
});

function findNote(draft, noteId) {
  return (draft.notes || []).find((n) => n.id === noteId);
}

app.patch('/api/drafts/:id/notes/:noteId', async (req, res) => {
  const draft = await getDraft(req.params.id);
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

  const updatedDraft = await saveDraft(draft.id, { notes: draft.notes });
  res.json(updatedDraft);
});

app.get('/api/history', async (req, res) => {
  const entries = await listRespondedProvocations();
  res.json(entries);
});

// In production there's no separate Vite dev server — this process serves
// the built frontend too, so a host only needs to run one service.
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
      'Warning: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key before using "Provoke".'
    );
  }
});
