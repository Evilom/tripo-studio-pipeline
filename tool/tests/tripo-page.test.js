import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import { TripoStudioPage } from "../src/tripo-page.js";

test("TripoStudioPage 切换多视图、按槽位上传并确认提交", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tripo-browser-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [];
  for (const slot of ["front", "right", "back"]) {
    const filePath = path.join(root, `${slot}.png`);
    await writeFile(filePath, slot);
    files.push({ slot, path: filePath, name: `${slot}.png` });
  }
  const staleFile = path.join(root, "stale.png");
  await writeFile(staleFile, "stale");

  const mockUrl = pathToFileURL(path.resolve("tests/mock-studio.html")).href;
  const config = {
    studioUrl: mockUrl,
    headless: true,
    loginTimeoutMs: 1000,
    uploadTimeoutMs: 5000,
    submissionConfirmTimeoutMs: 5000,
    uploadSettleDelayMs: 0,
    views: files.map(({ slot }) => ({ slot })),
    selectors: {
      multiViewButton: 'button:has(> [class~="i-tripo:multi-view"])',
      imageInputs: 'input[type="file"][accept*="image"]',
      generateButton: "#generate",
      submissionConfirmation: "[data-testid=submission]",
      submissionError: "",
    },
  };

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(mockUrl);
  const tripo = new TripoStudioPage(page, config, () => {});

  await tripo.ensureMultiViewMode();
  await page.locator(config.selectors.imageInputs).nth(1).setInputFiles(staleFile);
  await tripo.prepareAsset({ id: "asset_1", files });
  const uploaded = await page.locator(config.selectors.imageInputs).evaluateAll((inputs) =>
    inputs.map((input) => input.files?.[0]?.name ?? ""),
  );
  assert.deepEqual(uploaded, ["front.png", "", "right.png", "back.png"]);

  const confirmation = await tripo.clickGenerate();
  assert.equal(confirmation, "confirmation-selector");
  await assert.doesNotReject(page.getByText(/Submitted front\.png,right\.png,back\.png/).waitFor());
});

test("TripoStudioPage 跑通 HD、智能拓扑和 8K 纹理", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tripo-pipeline-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [];
  for (const slot of ["front", "left", "right"]) {
    const filePath = path.join(root, `${slot}.png`);
    await writeFile(filePath, slot);
    files.push({ slot, path: filePath, name: `${slot}.png` });
  }

  const mockUrl = pathToFileURL(path.resolve("tests/mock-studio.html")).href;
  const config = {
    studioUrl: mockUrl,
    headless: true,
    loginTimeoutMs: 1000,
    uploadTimeoutMs: 5000,
    submissionConfirmTimeoutMs: 5000,
    uploadSettleDelayMs: 0,
    stageTimeoutMs: 5000,
    stageSettleDelayMs: 200,
    targetFaces: 10000,
    textureResolution: "8K",
    views: files.map(({ slot }) => ({ slot })),
    selectors: {
      multiViewButton: "#multi-view",
      imageInputs: 'input[type="file"][accept*="image"]',
      generateButton: "#generate",
      submissionConfirmation: "[data-testid=submission]",
      submissionError: "",
      hdModeButton: "#hd-mode",
      retopologyNav: "#retopo-nav",
      triangleButton: "#triangle",
      smartLowPolySwitch: "#smart",
      polygonCountInput: "#polygon-count",
      retopologyButton: "#retopology",
      textureNav: "#texture-nav",
      texture8kButton: "#texture-8k",
      textureButton: "#texture",
      exportButton: "#export",
    },
  };

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(mockUrl);
  const tripo = new TripoStudioPage(page, config, () => {});

  await tripo.prepareAsset({ id: "robot", files });
  await tripo.configureHd();
  await tripo.clickGenerate();
  await tripo.waitForHd();
  assert.equal(await page.locator("#hd-mode").getAttribute("aria-pressed"), "true");

  await tripo.openRetopology();
  await tripo.configureRetopology();
  assert.equal(await page.locator("#smart").getAttribute("aria-checked"), "true");
  assert.equal(await page.locator("#polygon-count").inputValue(), "10000");
  await tripo.clickRetopology();
  await tripo.waitForRetopology();

  await tripo.openTexture();
  await tripo.configureTexture();
  await tripo.clickTexture();
  await tripo.waitForTexture();
  assert.equal(await page.locator("#texture-8k").getAttribute("data-selected"), "true");
  assert.equal(await page.locator("#export").isVisible(), true);
});
