import { useState } from 'react';
import { signIn, signUp, signInWithGoogle, resetPassword } from '../lib/firebase.js';

function friendlyError(err) {
  const code = err && err.code;
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Wrong email or password.';
  }
  if (code === 'auth/email-already-in-use') return 'An account already exists with that email — try signing in instead.';
  if (code === 'auth/weak-password') return 'Password needs to be at least 6 characters.';
  if (code === 'auth/invalid-email') return 'That doesn’t look like a valid email address.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in popup — allow popups for this site and try again.';
  return (err && err.message) || 'Something went wrong. Try again.';
}

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your email above first, then click "Forgot password" again.');
      return;
    }
    try {
      await resetPassword(email);
      setNotice('Password reset email sent — check your inbox.');
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) {
        // The user just closed the popup — not worth showing as an error.
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="brand">The Margin</h1>
        <p className="brand-sub">a tool for thought</p>

        <button className="btn google-btn" type="button" onClick={handleGoogleSignIn} disabled={busy}>
          Continue with Google
        </button>

        <div className="login-divider"><span>or</span></div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            className="login-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="login-label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            className="login-input"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {error && <div className="login-error">{error}</div>}
          {notice && <div className="login-notice">{notice}</div>}

          <button className="btn primary login-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="login-links">
          {mode === 'signin' ? (
            <button className="link-btn" onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>
              Need an account? Create one
            </button>
          ) : (
            <button className="link-btn" onClick={() => { setMode('signin'); setError(''); setNotice(''); }}>
              Already have an account? Sign in
            </button>
          )}
          <button className="link-btn" onClick={handleForgotPassword}>Forgot password?</button>
        </div>
      </div>
    </div>
  );
}
