import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

// Every user's own Anthropic key is encrypted at rest with a single server
// master key (never the user's key itself, and never stored in Firestore
// in plaintext). Generate the master key once with `openssl rand -hex 32`.
function getMasterKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` and add it to server/.env — ' +
        "it's what encrypts users' saved API keys at rest."
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'ENCRYPTION_KEY must be a 32-byte value, hex-encoded (64 hex characters). Generate one with `openssl rand -hex 32`.'
    );
  }
  return key;
}

export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decrypt({ ciphertext, iv, authTag }) {
  const decipher = crypto.createDecipheriv(ALGO, getMasterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
