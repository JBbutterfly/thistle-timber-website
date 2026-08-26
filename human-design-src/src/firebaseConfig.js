// ─────────────────────────────────────────────────────────────────────────
// Firebase project config for the Brotherhood Circle shared roster.
//
// This file ships with placeholder values on purpose. Until you replace
// them with your real project's config, the app automatically falls back
// to local-only (per-device) storage — nothing breaks, it just won't sync.
//
// To go live with a shared roster everyone can see:
//   1. Go to https://console.firebase.google.com and create a new project
//      (free "Spark" plan is enough — no credit card required).
//   2. In the project, click "Add app" → Web (</>) → give it any nickname.
//      Firebase will show you a config object exactly like the one below —
//      copy those real values in here.
//   3. In the left sidebar: Build → Firestore Database → Create database →
//      start in "Production mode" → pick any region.
//   4. In the left sidebar: Build → Authentication → Get started → enable
//      the "Anonymous" sign-in provider (no password, just gates the data
//      to people who load this app rather than the wide-open internet).
//   5. In Firestore → Rules, paste:
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{database}/documents {
//            match /people/{personId} { allow read, write: if request.auth != null; }
//            match /circles/{circleId} { allow read, write: if request.auth != null; }
//          }
//        }
//   6. Replace the values below, then rebuild (`npm run build`) and push.
// ─────────────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== "REPLACE_ME" && !!firebaseConfig.apiKey;
