import { ENV } from '../core/env.js';
import {
  packageFilePath,
  serialsFilePath,
  writeJsonGz,
} from '../cache/bundleArtifacts.js';
import {
  claimNextBuild,
  completeBuild,
  failBuild,
  requeueStaleBuilds,
  updateBuildProgress,
  type StoBuildRow,
} from '../infra/db/buildQueue.js';
import { getSessionPackageV4 } from './packageService.js';
import { getMaterialSerialsV4, SERIALS_DEFAULT_PER_PAGE } from './serialService.js';

/**
 * In-process build runner (Plan B Fase 2). Polls sto_bundle_builds and
 * builds bundle artifacts with a small concurrency cap, so ~30 operators
 * being assigned at once turn into a queue instead of a thundering herd.
 *
 * One build = package.json.gz + one serials file per material page,
 * written under the build's cache_version. max_serial_count per build is
 * recorded for tuning the per-material page size later.
 */

const activeBuilds = new Set<Promise<void>>();
let timer: NodeJS.Timeout | null = null;

export async function buildSessionBundle(build: StoBuildRow): Promise<void> {
  const { session_id: sessionId, cache_version: version } = build;

  const pkg = await getSessionPackageV4(sessionId);
  await writeJsonGz(packageFilePath(sessionId, version), {
    success: true,
    message: 'Session package ready.',
    data: pkg,
  });

  let maxSerialCount = 0;
  let materialsDone = 0;

  for (const material of pkg.materials) {
    maxSerialCount = Math.max(maxSerialCount, material.serial_count);
    const pages = Math.max(
      1,
      Math.ceil(material.serial_count / SERIALS_DEFAULT_PER_PAGE)
    );
    for (let page = 1; page <= pages; page += 1) {
      const data = await getMaterialSerialsV4(
        sessionId,
        material.material_no,
        page,
        SERIALS_DEFAULT_PER_PAGE
      );
      await writeJsonGz(
        serialsFilePath(sessionId, version, material.material_no, page),
        { success: true, message: 'Material serials ready.', data }
      );
    }
    materialsDone += 1;
    // Progress is best-effort: a failed progress write must not fail the build.
    await updateBuildProgress(build.id, materialsDone, maxSerialCount).catch(
      () => undefined
    );
  }

  await completeBuild(build.id, pkg.materials.length, maxSerialCount);
}

async function tick(): Promise<void> {
  await requeueStaleBuilds(ENV.STO_BUILD_STALE_MINUTES).catch((err: unknown) =>
    console.error('[sto-build] requeue stale failed:', err)
  );

  const concurrency = Math.min(3, Math.max(1, ENV.STO_BUILD_CONCURRENCY));
  while (activeBuilds.size < concurrency) {
    const build = await claimNextBuild().catch((err: unknown) => {
      console.error('[sto-build] claim failed:', err);
      return null;
    });
    if (!build) break;

    const run: Promise<void> = buildSessionBundle(build)
      .then(() => {
        console.log(
          `[sto-build] READY session=${build.session_id} v${build.cache_version} build=${build.id}`
        );
      })
      .catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[sto-build] FAILED session=${build.session_id} build=${build.id}: ${message}`
        );
        await failBuild(build.id, message).catch(() => undefined);
      })
      .finally(() => {
        activeBuilds.delete(run);
      });
    activeBuilds.add(run);
  }
}

export function startBuildRunner(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick().catch((err: unknown) =>
      console.error('[sto-build] tick failed:', err)
    );
  }, ENV.STO_RUNNER_INTERVAL_MS);
  void tick().catch((err: unknown) =>
    console.error('[sto-build] initial tick failed:', err)
  );
  console.log(
    `[sto-build] runner started (concurrency=${ENV.STO_BUILD_CONCURRENCY}, dir=${ENV.STO_BUNDLE_DIR})`
  );
}

export function stopBuildRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
