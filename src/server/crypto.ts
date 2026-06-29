import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// AES-256-GCM encryption for GitHub tokens at rest.
// Stored format: base64(iv).base64(authTag).base64(ciphertext)

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const k = Buffer.from(env.tokenEncKey, "base64");
  if (k.length !== 32) {
    throw new Error(
      "TOKEN_ENC_KEY must be 32 bytes (base64-encoded). Generate with: openssl rand -base64 32",
    );
  }
  return k;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// Tolerant decrypt: returns null if the value isn't in our encrypted format.
// Lets us migrate / handle legacy plaintext without crashing.
export function tryDecrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decrypt(payload);
  } catch {
    return null;
  }
}
