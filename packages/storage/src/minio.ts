// packages/storage/src/minio.ts
// MinIO low-level helpers — S3-compatible object storage.
// Tái lập từ file-storage.service.ts (đã xóa khỏi web) nhưng tách khỏi model DB
// để dùng chung cho FileRecord, Document và DocumentTemplate.

import * as Minio from "minio";
import { randomUUID } from "node:crypto";
import path from "node:path";

const _clients = new Map<string, Minio.Client>();

function makeClient(endPoint: string, port: number): Minio.Client {
  const accessKey = process.env["MINIO_ACCESS_KEY"];
  const secretKey = process.env["MINIO_SECRET_KEY"];
  if (!accessKey || !secretKey) {
    throw new Error(
      "MINIO_ACCESS_KEY / MINIO_SECRET_KEY chưa được cấu hình — hãy đặt trong .env. " +
        "(Không dùng giá trị mặc định để tránh chạy với secret công khai.)",
    );
  }
  return new Minio.Client({
    endPoint,
    port,
    useSSL: process.env["MINIO_USE_SSL"] === "true",
    accessKey,
    secretKey,
  });
}

export function getMinioClient(): Minio.Client {
  const endPoint = process.env["MINIO_ENDPOINT"] ?? "localhost";
  const port = parseInt(process.env["MINIO_PORT"] ?? "9000", 10);
  const key = `${endPoint}:${port}`;
  if (!_clients.has(key)) _clients.set(key, makeClient(endPoint, port));
  return _clients.get(key)!;
}

/**
 * Client dùng endpoint công khai khác (MINIO_PUBLIC_ENDPOINT) — dành cho việc
 * ký presigned URL mà OnlyOffice Document Server (trong Docker) phải tải file.
 * Presigned URL ký theo host nào thì phải truy cập đúng host đó (chữ ký bao gồm Host).
 * Nếu không set MINIO_PUBLIC_ENDPOINT → trả về client mặc định.
 */
export function getMinioPublicClient(): Minio.Client {
  const pub = process.env["MINIO_PUBLIC_ENDPOINT"];
  if (!pub) return getMinioClient();
  const port = parseInt(process.env["MINIO_PUBLIC_PORT"] ?? process.env["MINIO_PORT"] ?? "9000", 10);
  const key = `${pub}:${port}`;
  if (!_clients.has(key)) _clients.set(key, makeClient(pub, port));
  return _clients.get(key)!;
}

export const BUCKETS = {
  FILES: process.env["MINIO_BUCKET_FILES"] ?? "vsme-files",
  EXPORTS: process.env["MINIO_BUCKET_EXPORTS"] ?? "vsme-exports",
  TEMP: process.env["MINIO_BUCKET_TEMP"] ?? "vsme-temp",
} as const;

/** Đảm bảo bucket tồn tại (idempotent). */
export async function ensureBucket(bucket: string): Promise<void> {
  const minio = getMinioClient();
  const exists = await minio.bucketExists(bucket).catch(() => false);
  if (!exists) await minio.makeBucket(bucket);
}

/**
 * Sinh storage path phân cấp: {prefix}/{year}/{month}/{uuid}{ext}
 * prefix thường là `{companyId}/{moduleKey}` hoặc `_system/templates`.
 */
export function buildStoragePath(prefix: string, originalName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const ext = path.extname(originalName).toLowerCase();
  return `${prefix}/${year}/${month}/${randomUUID()}${ext}`;
}

export interface UploadBufferParams {
  bucket?: string;
  storagePath: string;
  buffer: Buffer;
  mimeType: string;
}

/** Upload một buffer lên MinIO. */
export async function uploadBuffer(params: UploadBufferParams): Promise<{ bucket: string; storagePath: string; size: number }> {
  const bucket = params.bucket ?? BUCKETS.FILES;
  await ensureBucket(bucket);
  const minio = getMinioClient();
  await minio.putObject(bucket, params.storagePath, params.buffer, params.buffer.length, {
    "Content-Type": params.mimeType,
  });
  return { bucket, storagePath: params.storagePath, size: params.buffer.length };
}

/** Tải object về dưới dạng Buffer (dùng cho đọc nội dung / callback OnlyOffice). */
export async function getObjectBuffer(bucket: string, storagePath: string): Promise<Buffer> {
  const minio = getMinioClient();
  const stream = await minio.getObject(bucket, storagePath);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Sinh presigned GET URL có hạn (mặc định 1 giờ) — dùng cho trình duyệt. */
export async function getPresignedUrl(bucket: string, storagePath: string, expiresIn = 3600): Promise<string> {
  const minio = getMinioClient();
  return minio.presignedGetObject(bucket, storagePath, expiresIn);
}

/** Presigned URL theo endpoint công khai — dành cho OnlyOffice container tải file. */
export async function getPresignedUrlPublic(bucket: string, storagePath: string, expiresIn = 3600): Promise<string> {
  const minio = getMinioPublicClient();
  return minio.presignedGetObject(bucket, storagePath, expiresIn);
}

/** Xóa hẳn object khỏi MinIO. */
export async function removeObject(bucket: string, storagePath: string): Promise<void> {
  const minio = getMinioClient();
  await minio.removeObject(bucket, storagePath);
}
