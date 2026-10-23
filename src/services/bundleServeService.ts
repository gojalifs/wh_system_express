import type { Request, Response } from 'express';
import {
  packageFilePath,
  readGzBuffer,
  serialsFilePath,
  gunzipToJsonText,
} from '../cache/bundleArtifacts.js';
import { getVersionOnly } from '../cache/keys.js';
import { cacheStore } from '../cache/store.js';
import { getBuild, type BuildStatus } from '../infra/db/buildQueue.js';
import { createLogger } from '../infra/logger.js';

const log = createLogger('sto-serve');

/**
 * Download path for v4 artifacts (Plan B Fase 2):
 *
 * - A build row exists for the session's current cache_version:
 *     READY          -> serve the pre-generated .gz file
 *     QUEUED/RUNNING -> not_ready (caller answers 409 BUNDLE_NOT_READY)
 *     FAILED         -> not_ready (admin retries from the Web page)
 * - No build row (rollout transition): 'live' — caller builds on demand
 *   with the Fase 1 services, exactly as before Fase 2 existed.
 */
export type ServeDecision =
  | { state: 'file'; buffer: Buffer }
  | { state: 'not_ready'; status: BuildStatus }
  | { state: 'live' };

async function decide(
  file: string,
  sessionId: string,
  version: number
): Promise<ServeDecision> {
  const build = await getBuild(sessionId, version).catch(() => null);

  if (!build) {
    log.debug(`no build row, live fallback session=${sessionId} v${version}`);
    return { state: 'live' };
  }
  if (build.status !== 'READY') {
    log.info(
      `bundle not ready session=${sessionId} v${version} status=${build.status}`
    );
    return { state: 'not_ready', status: build.status };
  }

  const buffer = await readGzBuffer(file);
  if (!buffer) {
    // READY but file gone: degrade to live
    log.warn(`READY build but artifact missing, live fallback session=${sessionId} v${version}`);
    return { state: 'live' };
  }
  log.debug(`serve artifact session=${sessionId} v${version} bytes=${buffer.length}`);
  return { state: 'file', buffer };
}

export async function decidePackageServe(sessionId: string): Promise<ServeDecision> {
  const version = await getVersionOnly(cacheStore, sessionId);
  return decide(packageFilePath(sessionId, version), sessionId, version);
}

export async function decideSerialsServe(
  sessionId: string,
  materialNo: string,
  page: number
): Promise<ServeDecision> {
  const version = await getVersionOnly(cacheStore, sessionId);
  return decide(serialsFilePath(sessionId, version, materialNo, page), sessionId, version);
}

/** Send a pre-gzipped artifact, honoring the client's Accept-Encoding. */
export function sendArtifact(req: Request, res: Response, buffer: Buffer): void {
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (acceptEncoding.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.status(200).send(buffer);
    return;
  }
  res.status(200).send(gunzipToJsonText(buffer));
}

/** 409 answer while a bundle is not READY (Plan B contract for Android v4). */
export function sendNotReady(res: Response, status: BuildStatus): void {
  res.status(409).json({
    success: false,
    message: 'Bundle untuk session ini belum siap.',
    code: 'BUNDLE_NOT_READY',
    data: { build_status: status },
  });
}
