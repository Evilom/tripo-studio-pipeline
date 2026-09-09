import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

test('UTF-8 BOM config and Unicode paths with spaces work on the native OS', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tripo 中文 project '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, '设置.json');
  await writeFile(file, '\uFEFF' + JSON.stringify({
    inputDir: '角色 inputs',
    views: ['front', 'left', 'back'].map(slot => ({ slot, fileNames: [slot + '.png'] })),
  }));
  const config = await loadConfig(file);
  assert.equal(config.inputDir, path.join(root, '角色 inputs'));
  assert.equal(config.profileDir, path.join(root, '.runtime/browser-profile'));
  await writeFile(file, '\uFEFF{broken');
  await assert.rejects(loadConfig(file), /JSON/);
});
