import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ENV } from '../core/env.js';

/**
 * Pre-generated STO v4 bundle artifacts on disk (Plan B Fase 2).
 *
 * Layout under STO_BUNDLE_DIR:
 *   <session>/v<version>/package.json.gz
 *   <session>/v<version>/serials/<material_no>/p<page>.json.gz
 *
 * Files hold the full response envelope JSON, gzipped once at build time,
 * so downloads are plain file serves. Writes are atomic (tmp + rename) so
 * a reader never sees a half-written artifact.
 */

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function packagePath(root: string, sessionId: string, version: number): string {
  return path.join(root, safeSegment(sessionId), `v${version}`, 'package.json.gz');
}

export function serialsPath(
  root: string,
  sessionId: string,
  version: number,
  materialNo: string,
  page: number
): string {
  return path.join(
    root,
    safeSegment(sessionId),
    `v${version}`,
    'serials',
    safeSegment(materialNo),
    `p${page}.json.gz`
  );
}

export function packageFilePath(sessionId: string, version: number): string {
  return packagePath(ENV.STO_BUNDLE_DIR, sessionId, version);
}

export function serialsFilePath(
  sessionId: string,
  version: number,
  materialNo: string,
  page: number
): string {
  return serialsPath(ENV.STO_BUNDLE_DIR, sessionId, version, materialNo, page);
}

/** Serialize + gzip + atomic write (tmp file in same dir, then rename). */
export async function writeJsonGz(file: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const gz = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, gz);
  await fs.rename(tmp, file);
}

/** Read a gzipped artifact; null when it does not exist. */
export async function readGzBuffer(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Decompress an artifact buffer back to its JSON text. */
export function gunzipToJsonText(buffer: Buffer): string {
  return gunzipSync(buffer).toString('utf8');
}
