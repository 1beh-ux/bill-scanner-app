import crypto from "crypto";

// The Fio API token (read-only, but it reveals every movement on the account)
// is encrypted at rest -- same AES-256-GCM layout as src/lib/mail-token-crypto.ts,
// its own key. Never logged, never returned by an API.
function getKey(): Buffer {
  const b64 = process.env.BANK_TOKEN_ENC_KEY;
  if (!b64) throw new Error("BANK_TOKEN_ENC_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("BANK_TOKEN_ENC_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptBankToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptBankToken(ciphertextB64: string): string {
  const raw = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf-8");
}
