import { getAuth } from './firebaseAdmin.js';

// Every route below this middleware requires a signed-in Firebase user.
// The client sends the ID token it got from the Firebase Auth SDK as a
// bearer token; we verify it server-side on every request rather than
// trusting anything the client claims about who it is.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <idToken> header.' });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (err) {
    if (err && err.message && err.message.startsWith('No Firebase credentials found')) {
      // A misconfigured server, not a bad token — surface the real problem
      // instead of telling the user to sign in again.
      console.error(err.message);
      return res.status(500).json({ error: err.message });
    }
    res.status(401).json({ error: 'Invalid or expired sign-in. Please sign in again.' });
  }
}
