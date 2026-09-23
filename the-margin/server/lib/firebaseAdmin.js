import { existsSync, readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let app = null;

// Two ways to supply credentials, so this works both for local dev (a
// downloaded service-account JSON file) and hosts that only offer
// environment variables (the JSON pasted in whole, e.g. Render):
//   1. FIREBASE_SERVICE_ACCOUNT_JSON — the service account key JSON, inline.
//   2. GOOGLE_APPLICATION_CREDENTIALS — a path to that same JSON file;
//      initializeApp() with no args picks this up automatically.
function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    return cert(JSON.parse(inline));
  }

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) {
    return cert(JSON.parse(readFileSync(path, 'utf-8')));
  }

  return null;
}

export function getFirebaseApp() {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }

  const credential = loadCredential();
  if (!credential) {
    throw new Error(
      'No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON (the service account key, as one JSON string) ' +
        'or GOOGLE_APPLICATION_CREDENTIALS (a path to that key file) in server/.env. ' +
        'See the README for how to get this from the Firebase console.'
    );
  }

  app = initializeApp({ credential });
  return app;
}

export function getAuth() {
  return getAdminAuth(getFirebaseApp());
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}
