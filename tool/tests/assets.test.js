import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanAssets } from "../src/assets.js";

const views = [
  { slot: "front", fileNames: ["front.png"] },
  { slot: "left", fileNames: ["left.png"] },
  { slot: "right", fileNames: ["right.png"] },
];

test("scanAssets 按目录扫描并保持视图槽位映射", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tripo-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = path.join(root, "asset_2");
  const second = path.join(root, "asset_10");
  await Promise.all([mkdir(first), mkdir(second)]);
  for (const directory of [first, second]) {
    await Promise.all(views.map((view) => writeFile(path.join(directory, view.fileNames[0]), view.slot)));
  }

  const result = await scanAssets({ inputDir: root, views, maxImageBytes: 1024 });

  assert.deepEqual(result.valid.map((asset) => asset.id), ["asset_2", "asset_10"]);
  assert.deepEqual(result.valid[0].files.map((file) => file.slot), ["front", "left", "right"]);
  assert.equal(result.invalid.length, 0);
  assert.match(result.valid[0].signature, /^[a-f0-9]{64}$/);
});

test("scanAssets 会拒绝缺少视图的目录", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tripo-assets-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "missing_right");
  await mkdir(directory);
  await writeFile(path.join(directory, "front.png"), "front");
  await writeFile(path.join(directory, "left.png"), "left");

  const result = await scanAssets({ inputDir: root, views, maxImageBytes: 1024 });

  assert.equal(result.valid.length, 0);
  assert.equal(result.invalid.length, 1);
  assert.match(result.invalid[0].problems[0], /right/);
});
