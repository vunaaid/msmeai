// src/lib/crypto.ts
// Mã hóa đối xứng cho secret nhạy cảm (API key LLM của credential công ty).
// AES-256-GCM với key 32 byte lấy từ env LLM_CREDENTIAL_KEY (hex 64 ký tự HOẶC base64).
// Định dạng ciphertext: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
// LƯU Ý: nếu LLM_CREDENTIAL_KEY bị mất/xoay, toàn bộ apiKeyEnc đã lưu sẽ KHÔNG giải mã được
// → phải nhập lại credential. Lỗi giải mã được ném ra rõ ràng, KHÔNG fallback im lặng.

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

function loadKey(): Buffer {
  const raw = process.env["LLM_CREDENTIAL_KEY"];
  if (!raw) {
    throw new Error(
      "LLM_CREDENTIAL_KEY chưa được cấu hình — không thể mã hóa/giải mã API key. " +
        "Hãy đặt một chuỗi 32 byte (hex 64 ký tự hoặc base64) trong .env.",
    );
  }
  const buf = raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("LLM_CREDENTIAL_KEY phải là 32 byte (hex 64 ký tự hoặc base64 hợp lệ).");
  }
  return buf;
}

/** Mã hóa plaintext → chuỗi "v1:iv:tag:ct" (base64). */
export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** Giải mã chuỗi "v1:iv:tag:ct" → plaintext. Ném lỗi nếu định dạng/khóa sai. */
export function decryptSecret(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Định dạng credential không hợp lệ (mong đợi v1:iv:tag:ct).");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = loadKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, "base64")), decipher.final()]).toString("utf8");
}

/** Hiển thị gợi ý cho client mà không lộ key: "sk-a…wxyz". KHÔNG lưu vào DB. */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 4)}…${plain.slice(-4)}`;
}
