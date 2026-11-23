import { afterEach, describe, expect, test } from '@jest/globals';
import Crypto from 'crypto';
import Fs from 'fs/promises';
import OS from 'os';
import Path from 'path';
import Persist from './Persist.js';

const sha256 = (value: string) => Crypto.createHash('sha256').update(value).digest('hex');
const roots: string[] = [];

async function makeStorage() {
  const root = await Fs.mkdtemp(Path.join(OS.tmpdir(), 'lg-thinq-persist-'));
  roots.push(root);
  const dir = Path.join(root, 'devices');
  await Fs.mkdir(dir);
  return { dir, backupDir: Path.join(root, '_backups') };
}

describe('Persist legacy file migration', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => Fs.rm(root, { recursive: true, force: true })));
  });

  test('migrates legacy files, keeps corrupt ones as backups, and skips folders and migrated files', async () => {
    const { dir, backupDir } = await makeStorage();
    await Fs.writeFile(Path.join(dir, 'legacy-device'), JSON.stringify({ key: 'device-1', value: { name: 'Washer' } }));
    await Fs.writeFile(Path.join(dir, 'broken'), '{not json');
    await Fs.mkdir(Path.join(dir, 'a-folder'));
    const alreadyMigrated = sha256('device-2');
    await Fs.writeFile(Path.join(dir, alreadyMigrated), JSON.stringify({ key: 'device-2', value: 2 }));

    // init() runs this migration too, but removes the backups once storage is ready.
    await (new Persist(dir) as unknown as { migrateLegacyFiles(): Promise<void> }).migrateLegacyFiles();

    const migrated = JSON.parse(await Fs.readFile(Path.join(dir, sha256('device-1')), 'utf8'));
    expect(migrated.key).toBe('device-1');
    expect(migrated.value).toEqual({ name: 'Washer' });

    const files = await Fs.readdir(dir);
    expect(files).not.toContain('legacy-device');
    expect(files).not.toContain('broken');
    expect(files).toContain('a-folder');
    expect(files).toContain(alreadyMigrated);

    const backups = await Fs.readdir(backupDir);
    expect(backups.some(name => name.startsWith('legacy-device.migrated.'))).toBe(true);
    expect(backups.some(name => name.startsWith('broken.corrupt.'))).toBe(true);
  });
});
