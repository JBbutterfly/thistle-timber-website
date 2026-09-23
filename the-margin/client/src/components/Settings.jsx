import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function Settings() {
  const [hasKey, setHasKey] = useState(null); // null = unknown (still loading, or failed to load)
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getApiKeyStatus()
      .then((status) => !cancelled && setHasKey(status.hasKey))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.saveApiKey(input.trim());
      setHasKey(true);
      setInput('');
      setNotice('Key saved. Provoke will use it from now on.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.deleteApiKey();
      setHasKey(false);
      setNotice('Key removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-scroll">
      <div className="settings-view">
        <h2 className="settings-title">Your Anthropic API key</h2>
        <p className="settings-intro">
          The Margin uses your own key to read your drafts and generate provocations — your usage is
          billed to your own Anthropic account, and your writing never passes through a shared key
          pooled with other people's.{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            Get a key from console.anthropic.com
          </a>
          .
        </p>

        {checking && <div className="draft-meta">Checking…</div>}

        {!checking && hasKey === true && (
          <div className="settings-status">
            <span className="settings-status-dot" /> A key is saved for your account.
          </div>
        )}
        {!checking && hasKey === false && (
          <div className="settings-status settings-status-empty">
            <span className="settings-status-dot" /> No key saved yet — Provoke won't work until you add one.
          </div>
        )}

        <form onSubmit={handleSave} className="settings-form">
          <label className="login-label" htmlFor="apikey-input">
            {hasKey ? 'Replace your key' : 'Add your key'}
          </label>
          <input
            id="apikey-input"
            className="login-input"
            type="password"
            placeholder="sk-ant-..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
          />
          {error && <div className="login-error">{error}</div>}
          {notice && <div className="login-notice">{notice}</div>}
          <div className="settings-actions">
            <button className="btn primary" type="submit" disabled={busy || !input.trim()}>
              {busy ? 'Saving…' : 'Save key'}
            </button>
            {hasKey && (
              <button type="button" className="btn" onClick={handleRemove} disabled={busy}>
                Remove key
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
