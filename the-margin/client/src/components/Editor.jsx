import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { segmentText } from '../lib/textSegmentation.js';
import { locateQuote } from '../lib/textMatch.js';
import { AUDIENCES, DEFAULT_AUDIENCE_KEY } from '../lib/audiences.js';
import MarginNote from './MarginNote.jsx';

const MIRROR_STYLE_PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'textAlign',
  'wordSpacing',
  'whiteSpace',
  'wordWrap',
  'overflowWrap',
];

const SAVE_DEBOUNCE_MS = 700;
const NOTE_STACK_GAP = 14;

function syncMirrorStyle(textarea, mirror) {
  const computed = window.getComputedStyle(textarea);
  for (const prop of MIRROR_STYLE_PROPS) {
    mirror.style[prop] = computed[prop];
  }
}

function measureCharTop(mirror, text, charIndex) {
  mirror.textContent = '';
  const before = document.createTextNode(text.slice(0, Math.max(charIndex, 0)));
  const marker = document.createElement('span');
  marker.textContent = '​';
  const after = document.createTextNode(text.slice(Math.max(charIndex, 0)));
  mirror.appendChild(before);
  mirror.appendChild(marker);
  mirror.appendChild(after);
  return marker.offsetTop;
}

export default function Editor({ draftId, onDraftSaved }) {
  const [draft, setDraft] = useState(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState(DEFAULT_AUDIENCE_KEY);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [provoking, setProvoking] = useState(false);
  const [provokeMessage, setProvokeMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved');
  const [positions, setPositions] = useState({});
  const [layoutTops, setLayoutTops] = useState({});
  const [error, setError] = useState('');

  const textareaRef = useRef(null);
  const mirrorRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const loadedDraftIdRef = useRef(null);
  const noteElsRef = useRef(new Map());
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProvokeMessage('');
    setError('');
    api
      .getDraft(draftId)
      .then((d) => {
        if (cancelled) return;
        setDraft(d);
        setText(d.text || '');
        setTitle(d.title || '');
        setAudience(d.audience || DEFAULT_AUDIENCE_KEY);
        setNotes(d.notes || []);
        loadedDraftIdRef.current = draftId;
        setSaveStatus('saved');
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const persist = useCallback(
    (updates) => {
      if (!draftId) return;
      setSaveStatus('saving');
      api
        .saveDraft(draftId, updates)
        .then((d) => {
          setSaveStatus('saved');
          onDraftSaved && onDraftSaved(d);
        })
        .catch((err) => setError(err.message));
    },
    [draftId, onDraftSaved]
  );

  function scheduleSave(updates) {
    setSaveStatus('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => persist(updates), SAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [draftId]);

  function handleTextChange(e) {
    const next = e.target.value;
    setText(next);
    if (loadedDraftIdRef.current === draftId) {
      scheduleSave({ text: next });
    }
  }

  function handleTitleChange(e) {
    const next = e.target.value;
    setTitle(next);
    if (loadedDraftIdRef.current === draftId) {
      scheduleSave({ title: next });
    }
  }

  function handleAudienceChange(e) {
    const next = e.target.value;
    setAudience(next);
    if (loadedDraftIdRef.current === draftId) {
      scheduleSave({ audience: next });
    }
  }

  async function handleProvoke() {
    if (!text.trim() || provoking) return;
    setProvoking(true);
    setProvokeMessage('');
    setError('');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    try {
      const result = await api.provoke(draftId, text, audience);
      setNotes((prev) => [...prev, ...result.notes]);
      setSaveStatus('saved');
      onDraftSaved && onDraftSaved(result.draft);
      if (result.notes.length === 0) {
        setProvokeMessage('Nothing here warrants a challenge yet.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProvoking(false);
    }
  }

  function handleDismiss(noteId) {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, dismissed: true, dismissedAt: new Date().toISOString() } : n))
    );
    api.updateNote(draftId, noteId, { dismissed: true }).catch((err) => setError(err.message));
  }

  function handleRespond(noteId, response) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? { ...n, response, respondedAt: response.trim() ? new Date().toISOString() : null }
          : n
      )
    );
    api.updateNote(draftId, noteId, { response }).catch((err) => setError(err.message));
  }

  const visibleNotes = notes.filter((n) => !n.dismissed);

  const recomputePositions = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    syncMirrorStyle(textarea, mirror);

    const paragraphs = segmentText(text);
    const raw = [];

    for (const note of visibleNotes) {
      const match = locateQuote(text, note.quote, paragraphs);
      if (match) {
        const top = measureCharTop(mirror, text, match.start);
        raw.push({ id: note.id, top, matchType: match.matchType });
      } else {
        raw.push({ id: note.id, top: mirror.scrollHeight || 0, matchType: 'orphaned' });
      }
    }

    const next = {};
    for (const item of raw) next[item.id] = item;
    setPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, notes]);

  useLayoutEffect(() => {
    recomputePositions();
  }, [recomputePositions]);

  useEffect(() => {
    function onResize() {
      recomputePositions();
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputePositions]);

  // Pass two: notes are variable-height (they wrap, and expand when the user
  // reflects on one), so once each note has actually rendered at its raw
  // quote-anchored top, nudge any that overlap down by their real measured
  // height rather than a guessed fixed gap. A ResizeObserver re-runs this
  // whenever a note's height changes (wrapping, expand/collapse, a longer
  // response) so later notes keep reflowing out of the way.
  const applyStacking = useCallback(() => {
    const ids = Object.keys(positions);
    if (ids.length === 0) {
      setLayoutTops({});
      return;
    }

    const sorted = ids
      .map((id) => ({ id, top: positions[id].top }))
      .sort((a, b) => a.top - b.top);

    let cursor = -Infinity;
    const next = {};
    for (const item of sorted) {
      const top = Math.max(item.top, cursor);
      next[item.id] = top;
      const el = noteElsRef.current.get(item.id);
      const height = el ? el.offsetHeight : 80;
      cursor = top + height + NOTE_STACK_GAP;
    }

    setLayoutTops((prev) => {
      const changed =
        Object.keys(next).length !== Object.keys(prev).length ||
        Object.keys(next).some((id) => Math.abs((prev[id] ?? -1) - next[id]) > 0.5);
      return changed ? next : prev;
    });
  }, [positions]);

  useLayoutEffect(() => {
    applyStacking();
  }, [applyStacking]);

  useEffect(() => {
    const observer = new ResizeObserver(() => applyStacking());
    resizeObserverRef.current = observer;
    for (const el of noteElsRef.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [applyStacking]);

  function registerNoteEl(id, el) {
    const observer = resizeObserverRef.current;
    const prevEl = noteElsRef.current.get(id);
    if (prevEl && observer) observer.unobserve(prevEl);
    if (el) {
      noteElsRef.current.set(id, el);
      if (observer) observer.observe(el);
    } else {
      noteElsRef.current.delete(id);
    }
  }

  if (loading) {
    return <div className="content-scroll" />;
  }

  return (
    <>
      <div className="topbar">
        <input
          className="topbar-title-input"
          value={title}
          onChange={handleTitleChange}
          placeholder="Untitled draft"
        />
        <select
          className="audience-select"
          value={audience}
          onChange={handleAudienceChange}
          title="What kind of piece is this? Tunes what Provoke pushes on."
        >
          {AUDIENCES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <div className="topbar-actions">
          {error && <span className="topbar-status" style={{ color: 'var(--margin-ink)' }}>{error}</span>}
          <span className="topbar-status">
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved' : 'Saved'}
          </span>
          <button className="btn primary" onClick={handleProvoke} disabled={provoking || !text.trim()}>
            {provoking ? 'Reading…' : 'Provoke'}
          </button>
        </div>
      </div>

      <div className="content-scroll">
        <div className="manuscript-frame">
          <div className="manuscript-col">
            <textarea
              ref={textareaRef}
              className="manuscript-textarea"
              value={text}
              onChange={handleTextChange}
              placeholder="Begin writing. When you want to be challenged, not helped, press Provoke."
              spellCheck="true"
            />
            <div ref={mirrorRef} className="manuscript-mirror" aria-hidden="true" />
          </div>

          <div className="margin-col">
            {provokeMessage && (
              <div className="margin-note" style={{ position: 'static', marginBottom: 16 }}>
                {provokeMessage}
              </div>
            )}
            {visibleNotes.map((note) => (
              <MarginNote
                key={note.id}
                ref={(el) => registerNoteEl(note.id, el)}
                note={{ ...note, anchor: positions[note.id] || note.anchor }}
                top={layoutTops[note.id] ?? (positions[note.id] ? positions[note.id].top : 0)}
                onDismiss={handleDismiss}
                onRespond={handleRespond}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
