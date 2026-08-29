import { access, readFile } from "node:fs/promises";
import path from "node:path";

const VALID_SLOTS = new Set(["front", "left", "right", "back"]);

const DEFAULTS = {
  studioUrl: "https://studio.tripo3d.ai/workspace/generate",
  inputDir: "inputs",
  profileDir: ".runtime/browser-profile",
  stateFile: ".runtime/state.json",
  artifactDir: ".runtime/artifacts",
  browserChannel: "msedge",
  headless: false,
  loginTimeoutMs: 10 * 60 * 1000,
  uploadTimeoutMs: 2 * 60 * 1000,
  submissionConfirmTimeoutMs: 30 * 1000,
  submissionDelayMs: 3000,
  uploadSettleDelayMs: 5000,
  stageTimeoutMs: 20 * 60 * 1000,
  stageSettleDelayMs: 5000,
  targetFaces: 10000,
  textureResolution: "8K",
  maxImageBytes: 20 * 1024 * 1024,
  views: [],
  selectors: {
    multiViewButton: 'button:has(> [class~="i-tripo:multi-view"])',
    imageInputs: 'input[type="file"][accept*="image"]',
    generateButton: "",
    submissionConfirmation: "",
    submissionError: "",
    hdModeButton: 'text="HD Model"',
    retopologyNav: 'text="Retopo"',
    triangleButton: 'text="Triangle"',
    smartLowPolySwitch: 'button[role="switch"]',
    polygonCountInput: 'input[type="number"]',
    retopologyButton: 'button:has-text("Retopology")',
    textureNav: 'text="Texture"',
    texture8kButton: 'text="8K"',
    textureButton: 'button:has-text("Generate Texture")',
    exportButton: 'button:has-text("Export")',
  },
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveRelative(configDir, value) {
  return path.isAbsolute(value) ? value : path.resolve(configDir, value);
}

function positiveNumber(config, key, allowZero = false) {
  const value = config[key];
  const valid = typeof value === "number" && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) {
    throw new Error(`配置 ${key} 必须是${allowZero ? "非负" : "正"}数`);
  }
}

function validateViews(views) {
  if (!Array.isArray(views) || views.length < 2 || views.length > 4) {
    throw new Error("配置 views 必须包含 2 到 4 个视图；三视图任务通常配置 3 个");
  }

  const seen = new Set();
  for (const view of views) {
    if (!view || !VALID_SLOTS.has(view.slot)) {
      throw new Error(`无效视图槽位：${view?.slot ?? "<空>"}，只能使用 front/left/right/back`);
    }
    if (seen.has(view.slot)) {
      throw new Error(`视图槽位重复：${view.slot}`);
    }
    if (!Array.isArray(view.fileNames) || view.fileNames.length === 0 || view.fileNames.some((name) => typeof name !== "string" || !name.trim())) {
      throw new Error(`视图 ${view.slot} 的 fileNames 至少需要一个文件名`);
    }
    seen.add(view.slot);
  }
}

export async function loadConfig(configArgument = "config.json") {
  const configPath = path.resolve(process.cwd(), configArgument);
  if (!(await exists(configPath))) {
    throw new Error(`找不到配置文件：${configPath}\n请先复制 config.example.json 为 config.json`);
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(`配置文件不是有效 JSON：${configPath}\n${error.message}`);
  }

  const configDir = path.dirname(configPath);
  const config = {
    ...DEFAULTS,
    ...parsed,
    selectors: { ...DEFAULTS.selectors, ...(parsed.selectors ?? {}) },
  };

  validateViews(config.views);
  for (const key of [
    "loginTimeoutMs",
    "uploadTimeoutMs",
    "submissionConfirmTimeoutMs",
    "submissionDelayMs",
    "uploadSettleDelayMs",
    "stageTimeoutMs",
    "stageSettleDelayMs",
    "targetFaces",
    "maxImageBytes",
  ]) {
    positiveNumber(config, key, ["submissionDelayMs", "uploadSettleDelayMs", "stageSettleDelayMs"].includes(key));
  }

  if (config.textureResolution !== "8K") {
    throw new Error("当前全流程自动化只支持 textureResolution=8K");
  }

  if (!config.selectors.multiViewButton || !config.selectors.imageInputs) {
    throw new Error("selectors.multiViewButton 和 selectors.imageInputs 不能为空");
  }
  try {
    new URL(config.studioUrl);
  } catch {
    throw new Error(`studioUrl 不是有效网址：${config.studioUrl}`);
  }

  return {
    ...config,
    configPath,
    configDir,
    inputDir: resolveRelative(configDir, config.inputDir),
    profileDir: resolveRelative(configDir, config.profileDir),
    stateFile: resolveRelative(configDir, config.stateFile),
    artifactDir: resolveRelative(configDir, config.artifactDir),
  };
}

export { VALID_SLOTS };
