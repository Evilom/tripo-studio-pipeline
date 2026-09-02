import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import { TripoStudioPage } from "../src/tripo-page.js";

const browserChannel = process.env.TRIPO_TEST_BROWSER_CHANNEL
  ?? (process.platform === "darwin" ? "chrome" : "msedge");

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

  const browser = await chromium.launch({ channel: browserChannel, headless: true });
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

test("TripoStudioPage 跑通 HD、智能拓扑和 2K 网页纹理", async (t) => {
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
    stageSettleDelayMs: 20,
    topologyMode: "quad",
    targetFaces: 2000,
    textureResolution: "2K",
    views: files.map(({ slot }) => ({ slot })),
    selectors: {
      multiViewButton: "#multi-view",
      imageInputs: 'input[type="file"][accept*="image"]',
      generateButton: "#generate",
      submissionConfirmation: "[data-testid=submission]",
      submissionError: "",
      hdModeButton: "#hd-mode",
      retopologyNav: "#retopo-nav",
      quadButton: "#quad",
      triangleButton: "#triangle",
      smartLowPolySwitch: "#smart",
      polygonCountInput: "#polygon-count",
      retopologyButton: "#retopology",
      textureNav: "#texture-nav",
      textureButton: "#texture",
      exportButton: "#export",
    },
  };

  const browser = await chromium.launch({ channel: browserChannel, headless: true });
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
  assert.equal(await page.locator("#quad").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#polygon-count").inputValue(), "2000");
  await tripo.clickRetopology();
  const retopologyStartedAt = Date.now();
  await tripo.waitForRetopology();
  assert.ok(Date.now() - retopologyStartedAt >= 1100, "应等待中文“重拓扑中”状态真正结束");

  await tripo.openTexture();
  await tripo.configureTexture();
  await tripo.clickTexture();
  await tripo.waitForTexture();
  assert.equal(await page.locator("#texture-2k").getAttribute("data-selected"), "true");
  assert.equal(await page.locator("#export").isVisible(), true);
});

test("TripoStudioPage 适配上传后槽位消失的新版三视图", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tripo-dynamic-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [];
  for (const slot of ["front", "left", "back"]) {
    const filePath = path.join(root, `${slot}.png`);
    await writeFile(filePath, slot);
    files.push({ slot, path: filePath, name: `${slot}.png` });
  }

  const mockUrl = pathToFileURL(path.resolve("tests/mock-studio-dynamic.html")).href;
  const config = {
    studioUrl: mockUrl,
    dynamicMultiView: true,
    headless: true,
    loginTimeoutMs: 1000,
    uploadTimeoutMs: 5000,
    submissionConfirmTimeoutMs: 5000,
    uploadSettleDelayMs: 0,
    views: files.map(({ slot }) => ({ slot })),
    selectors: {
      singleViewButton: "#single-view",
      multiViewButton: "#multi-view",
      imageInputs: 'input[type="file"][accept*="image"]',
      generateButton: "#generate",
      submissionConfirmation: "[data-testid=submission]",
      submissionError: "",
    },
  };

  const browser = await chromium.launch({ channel: browserChannel, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(mockUrl);
  const tripo = new TripoStudioPage(page, config, () => {});

  await tripo.prepareAsset({ id: "controller", files });
  assert.equal(await page.locator("#generate").isEnabled(), true);
  const confirmation = await tripo.clickGenerate();
  assert.equal(confirmation, "confirmation-selector");
  await assert.doesNotReject(page.getByText(/front:front\.png,left:left\.png,back:back\.png/).waitFor());
});

test("TripoStudioPage 从裸任务 ID 路由恢复完整 slug 路由", async () => {
  const taskId = "61034e7b-1111-4111-8111-123456789abc";
  const incompletePath = `/workspace/retopology/${taskId}`;
  const canonicalPath = `/workspace/retopology/handheld-console-${taskId}`;
  let navigatedTo = "";
  const page = {
    waitForTimeout: async () => {},
    url: () => `https://studio.tripo3d.ai${incompletePath}`,
    locator: () => ({
      evaluateAll: async () => [incompletePath, canonicalPath],
    }),
    goto: async (url) => {
      navigatedTo = url;
    },
  };
  const tripo = new TripoStudioPage(page, { uploadTimeoutMs: 1000 }, () => {});

  await tripo.ensureCanonicalTaskRoute("retopology", taskId);

  assert.equal(navigatedTo, `https://studio.tripo3d.ai${canonicalPath}`);
});
