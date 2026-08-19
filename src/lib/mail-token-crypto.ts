import crypto from "crypto";

// Refresh tokens are long-lived send-as-this-mailbox credentials, so they're
// encrypted at rest (AES-256-GCM) rather than stored as plain text --
// unlike Event.senderEmail (just an address), a leaked refresh token lets
// someone send mail as that Workspace user indefinitely until revoked.
const KEY_B64 = process.env.MAIL_TOKEN_ENC_KEY;

function getKey(): Buffer {
  if (!KEY_B64) throw new Error("MAIL_TOKEN_ENC_KEY is not set");
  const key = Buffer.from(KEY_B64, "base64");
  if (key.length !== 32) throw new Error("MAIL_TOKEN_ENC_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptMailToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptMailToken(ciphertextB64: string): string {
  const raw = Buffer.from(ciphertextB64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
}
