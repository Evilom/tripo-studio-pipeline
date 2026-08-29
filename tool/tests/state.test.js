import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StateStore } from "../src/state.js";

const asset = {
  id: "chair_001",
  signature: "signature-1",
  files: [
    { slot: "front", name: "front.png" },
    { slot: "left", name: "left.png" },
    { slot: "right", name: "right.png" },
  ],
};

test("StateStore 保存提交状态并可人工解析", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tripo-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, "runtime", "state.json");

  const state = await new StateStore(filePath).load();
  await state.mark(asset, "uncertain", { error: "no signal" });

  const reloaded = await new StateStore(filePath).load();
  assert.equal(reloaded.get(asset.id).status, "uncertain");
  assert.deepEqual(reloaded.get(asset.id).files, {
    front: "front.png",
    left: "left.png",
    right: "right.png",
  });

  await reloaded.resolve(asset.id, "submitted", asset.signature);
  assert.equal(reloaded.get(asset.id).status, "submitted");
  assert.equal(reloaded.get(asset.id).resolution, "manual");

  await reloaded.resolve(asset.id, "completed", asset.signature);
  assert.equal(reloaded.get(asset.id).status, "completed");

  await reloaded.resolve(asset.id, "retry");
  assert.equal(reloaded.get(asset.id), undefined);
});
