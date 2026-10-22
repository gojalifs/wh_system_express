import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  gunzipToJsonText,
  packagePath,
  readGzBuffer,
  serialsPath,
  writeJsonGz,
} from '../../cache/bundleArtifacts.js';

describe('bundleArtifacts paths', () => {
  it('builds the versioned package path', () => {
    expect(packagePath('/data/bundles', 'SES-1', 3)).toBe(
      path.join('/data/bundles', 'SES-1', 'v3', 'package.json.gz')
    );
  });

  it('builds the per-material serials path and escapes unsafe segments', () => {
    expect(serialsPath('/data/bundles', 'SES-1', 2, 'MAT/01', 4)).toBe(
      path.join(
        '/data/bundles',
        'SES-1',
        'v2',
        'serials',
        'MAT%2F01',
        'p4.json.gz'
      )
    );
  });
});

describe('bundleArtifacts write/read roundtrip', () => {
  it('round-trips JSON through gzip on disk', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sto-bundles-'));
    const file = packagePath(root, 'SES-9', 1);
    const payload = { success: true, data: { materials: [{ material_no: 'A' }] } };

    await writeJsonGz(file, payload);

    const buffer = await readGzBuffer(file);
    expect(buffer).not.toBeNull();
    expect(JSON.parse(gunzipToJsonText(buffer as Buffer))).toEqual(payload);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns null for a missing artifact', async () => {
    const missing = packagePath(os.tmpdir(), 'NOPE-SESSION', 99);
    await expect(readGzBuffer(missing)).resolves.toBeNull();
  });
});
