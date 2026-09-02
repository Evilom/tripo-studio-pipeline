#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import process from "node:process";
import { scanAssets } from "./assets.js";
import { studioPage, launchPersistentBrowser } from "./browser.js";
import { loadConfig } from "./config.js";
import { StateStore } from "./state.js";
import {
  SubmissionRejectedError,
  SubmissionUncertainError,
  TripoStudioPage,
} from "./tripo-page.js";

function parseArguments(argv) {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "help";
  const start = command === "help" && argv[0]?.startsWith("--") ? 0 : 1;
  const options = {};
  const positionals = [];

  for (let index = start; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const equalsIndex = token.indexOf("=");
    if (equalsIndex !== -1) {
      options[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return { command, options, positionals };
}

function printHelp() {
  console.log(`
Tripo Studio 多视图队列

用法：
  node src/cli.js scan    [--config config.json]
  node src/cli.js login   [--config config.json]
  node src/cli.js preview [--asset 资产目录名] [--config config.json]
  node src/cli.js run     [--limit 数量] [--asset 资产目录名] [--config config.json]
  node src/cli.js pipeline [--limit 数量] [--asset 资产目录名] [--config config.json]
  node src/cli.js status  [--config config.json]
  node src/cli.js resolve --asset 资产目录名 --as submitted|completed|retry --confirm

安全约定：preview 只上传不点击生成；run/pipeline 无法确认提交结果时会立即停止。
`);
}

function printScan(result) {
  console.log(`有效资产：${result.valid.length}，无效资产：${result.invalid.length}`);
  for (const asset of result.valid) {
    console.log(`  ✓ ${asset.id}: ${asset.files.map((file) => `${file.slot}=${file.name}`).join(", ")}`);
  }
  for (const asset of result.invalid) {
    console.log(`  ✗ ${asset.id}: ${asset.problems.join("；")}`);
  }
}

function requireCleanInput(result) {
  if (result.invalid.length > 0) {
    printScan(result);
    throw new Error("存在缺图或超限资产；为防止方向错配，已停止提交");
  }
  if (result.valid.length === 0) {
    throw new Error("输入目录中没有可提交的资产子目录");
  }
}

function chooseAssets(assets, state, options) {
  const selected = options.asset ? assets.filter((asset) => asset.id === options.asset) : assets;
  if (options.asset && selected.length === 0) {
    throw new Error(`找不到资产目录：${options.asset}`);
  }

  const pending = [];
  const blockers = [];
  for (const asset of selected) {
    const job = state.get(asset.id);
    if (!job || job.status === "failed") {
      pending.push(asset);
      continue;
    }
    if (job.signature !== asset.signature) {
      blockers.push(`${asset.id} 的图片在上次记录后发生变化，请先 resolve --as retry`);
      continue;
    }
    if (!["submitted", "completed"].includes(job.status)) {
      blockers.push(`${asset.id} 状态为 ${job.status}，请先在 Studio 中核对后 resolve`);
    }
  }

  if (blockers.length > 0) {
    throw new Error(blockers.join("\n"));
  }

  const rawLimit = options.limit ?? "0";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`--limit 必须是非负整数，当前值：${rawLimit}`);
  }
  return limit === 0 ? pending : pending.slice(0, limit);
}

async function waitForEnter(message) {
  if (!process.stdin.isTTY) {
    return;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await terminal.question(message);
  } finally {
    terminal.close();
  }
}

async function withBrowser(config, action) {
  const session = await launchPersistentBrowser(config);
  try {
    const page = await studioPage(session.context, config.studioUrl);
    const tripo = new TripoStudioPage(page, config);
    await action(tripo);
  } finally {
    await session.close();
  }
}

async function commandLogin(config) {
  await withBrowser(config, async (tripo) => {
    await tripo.waitForLogin();
  });
}

async function commandPreview(config, result, options) {
  requireCleanInput(result);
  const asset = options.asset
    ? result.valid.find((candidate) => candidate.id === options.asset)
    : result.valid[0];
  if (!asset) {
    throw new Error(`找不到资产目录：${options.asset}`);
  }

  await withBrowser(config, async (tripo) => {
    await tripo.waitForLogin();
    console.log(`预览 ${asset.id}：${asset.files.map((file) => `${file.slot}=${file.name}`).join(", ")}`);
    await tripo.prepareAsset(asset);
    const screenshot = await tripo.screenshot(`preview-${asset.id}`);
    console.log(`图片已放入对应槽位；不会点击生成。截图：${screenshot}`);
    await waitForEnter("请在浏览器中核对方向，确认后按 Enter 关闭……");
  });
}

async function safeScreenshot(tripo, name) {
  try {
    return await tripo.screenshot(name);
  } catch {
    return "<截图失败>";
  }
}

async function commandRun(config, result, state, options) {
  requireCleanInput(result);
  const assets = chooseAssets(result.valid, state, options);
  if (assets.length === 0) {
    console.log("没有待提交任务；已提交任务会被断点状态自动跳过。");
    return;
  }

  console.log(`本次准备提交 ${assets.length} 个任务。`);
  await withBrowser(config, async (tripo) => {
    await tripo.waitForLogin();

    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      console.log(`[${index + 1}/${assets.length}] 准备 ${asset.id}`);

      try {
        await tripo.prepareAsset(asset);
      } catch (error) {
        const screenshot = await safeScreenshot(tripo, `prepare-failed-${asset.id}`);
        await state.mark(asset, "failed", { phase: "prepare", error: error.message, screenshot });
        throw new Error(`${asset.id} 上传或页面准备失败：${error.message}\n截图：${screenshot}`);
      }

      await state.mark(asset, "submitting", { phase: "click" });
      try {
        const confirmation = await tripo.clickGenerate();
        await state.mark(asset, "submitted", { confirmation, submittedAt: new Date().toISOString() });
        console.log(`  已确认提交（${confirmation}）`);
      } catch (error) {
        const screenshot = await safeScreenshot(tripo, `submit-${asset.id}`);
        if (error instanceof SubmissionRejectedError) {
          await state.mark(asset, "failed", { phase: "submit", error: error.message, screenshot });
          throw new Error(`${asset.id} 明确提交失败：${error.message}\n截图：${screenshot}`);
        }

        await state.mark(asset, "uncertain", { phase: "submit", error: error.message, screenshot });
        const prefix = error instanceof SubmissionUncertainError ? error.message : `提交过程中出现未知错误：${error.message}`;
        throw new Error(`${asset.id}：${prefix}\n请先在 Studio 资产列表核对，再运行 resolve。\n截图：${screenshot}`);
      }

      if (config.submissionDelayMs > 0 && index < assets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, config.submissionDelayMs));
      }
    }
  });
}

async function markPipelineUncertain(tripo, state, asset, phase, error) {
  const screenshot = await safeScreenshot(tripo, `pipeline-${phase}-${asset.id}`);
  await state.mark(asset, "uncertain", {
    workflow: "pipeline",
    phase,
    error: error.message,
    workspaceUrl: tripo.currentUrl(),
    screenshot,
  });
  throw new Error(`${asset.id} 在 ${phase} 阶段停止：${error.message}\n请先在 Studio 核对，避免重复扣积分。\n截图：${screenshot}`);
}

async function runPipelineStage(tripo, state, asset, phase, submit, waitForCompletion) {
  await state.mark(asset, "submitting", {
    workflow: "pipeline",
    phase,
    workspaceUrl: tripo.currentUrl(),
  });
  try {
    const confirmation = await submit();
    await state.mark(asset, "processing", {
      workflow: "pipeline",
      phase,
      confirmation,
      workspaceUrl: tripo.currentUrl(),
    });
    await waitForCompletion();
    await state.mark(asset, "stage-complete", {
      workflow: "pipeline",
      phase,
      confirmation,
      workspaceUrl: tripo.currentUrl(),
    });
  } catch (error) {
    await markPipelineUncertain(tripo, state, asset, phase, error);
  }
}

async function commandPipeline(config, result, state, options) {
  requireCleanInput(result);
  const assets = chooseAssets(result.valid, state, options);
  if (assets.length === 0) {
    console.log("没有待处理任务；已完成任务会被断点状态自动跳过。");
    return;
  }

  const topologyLabel = config.topologyMode === "quad" ? "四边面" : "三角面";
  console.log(`本次准备跑通 ${assets.length} 个 HD → 智能${topologyLabel}拓扑 → ${config.textureResolution} 纹理任务。`);
  await withBrowser(config, async (tripo) => {
    await tripo.waitForLogin();

    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      console.log(`[${index + 1}/${assets.length}] ${asset.id}：准备多视图 HD`);
      try {
        await tripo.prepareAsset(asset);
        await tripo.configureHd();
      } catch (error) {
        const screenshot = await safeScreenshot(tripo, `pipeline-prepare-${asset.id}`);
        await state.mark(asset, "failed", { workflow: "pipeline", phase: "prepare", error: error.message, screenshot });
        throw new Error(`${asset.id} 上传或 HD 参数准备失败：${error.message}\n截图：${screenshot}`);
      }

      await runPipelineStage(tripo, state, asset, "hd", () => tripo.clickGenerate(), () => tripo.waitForHd());
      console.log("  ✓ HD 模型完成");

      try {
        await tripo.openRetopology();
        await tripo.configureRetopology();
      } catch (error) {
        await markPipelineUncertain(tripo, state, asset, "retopology-prepare", error);
      }
      await runPipelineStage(tripo, state, asset, "retopology", () => tripo.clickRetopology(), () => tripo.waitForRetopology());
      console.log(`  ✓ Smart Low Poly v2 ${topologyLabel}完成（目标 ${config.targetFaces} 面）`);

      try {
        await tripo.openTexture();
        await tripo.configureTexture();
      } catch (error) {
        await markPipelineUncertain(tripo, state, asset, "texture-prepare", error);
      }
      await runPipelineStage(tripo, state, asset, "texture", () => tripo.clickTexture(), () => tripo.waitForTexture());

      const screenshot = await safeScreenshot(tripo, `completed-${asset.id}`);
      await state.mark(asset, "completed", {
        workflow: "pipeline",
        phase: "texture",
        completedAt: new Date().toISOString(),
        workspaceUrl: tripo.currentUrl(),
        screenshot,
      });
      console.log(`  ✓ ${config.textureResolution} 纹理完成；截图：${screenshot}`);

      if (config.submissionDelayMs > 0 && index < assets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, config.submissionDelayMs));
      }
    }
  });
}

function printStatus(result, state) {
  const byId = new Map(result.valid.map((asset) => [asset.id, asset]));
  const ids = new Set([...byId.keys(), ...state.entries().map(([id]) => id)]);
  const rows = [...ids]
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }))
    .map((id) => {
      const asset = byId.get(id);
      const job = state.get(id);
      let status = job?.status ?? "pending";
      if (asset && job && asset.signature !== job.signature) {
        status = "changed";
      }
      return {
        asset: id,
        status,
        updatedAt: job?.updatedAt ?? "-",
      };
    });
  console.table(rows);
  if (result.invalid.length > 0) {
    console.log("\n无效输入：");
    printScan({ valid: [], invalid: result.invalid });
  }
}

async function commandResolve(config, result, state, options) {
  const assetId = options.asset;
  const resolution = options.as;
  if (!assetId || !["submitted", "completed", "retry"].includes(resolution)) {
    throw new Error("resolve 需要 --asset <目录名> --as submitted|completed|retry");
  }
  if (options.confirm !== true) {
    throw new Error("resolve 会改变断点判断；请先人工核对 Studio，再追加 --confirm");
  }
  const current = state.get(assetId);
  if (!current) {
    throw new Error(`状态文件中没有任务：${assetId}`);
  }
  const asset = result.valid.find((candidate) => candidate.id === assetId);
  await state.resolve(assetId, resolution, asset?.signature);
  console.log(`${assetId} 已人工解析为 ${resolution}`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "help" || options.help) {
    printHelp();
    return;
  }

  const config = await loadConfig(options.config === true ? "config.json" : options.config);
  if (command === "login") {
    await commandLogin(config);
    return;
  }

  const result = await scanAssets(config);
  if (command === "scan") {
    printScan(result);
    return;
  }

  const state = await new StateStore(config.stateFile).load();
  if (command === "status") {
    printStatus(result, state);
    return;
  }
  if (command === "preview") {
    await commandPreview(config, result, options);
    return;
  }
  if (command === "run") {
    await commandRun(config, result, state, options);
    return;
  }
  if (command === "pipeline") {
    await commandPipeline(config, result, state, options);
    return;
  }
  if (command === "resolve") {
    await commandResolve(config, result, state, options);
    return;
  }

  printHelp();
  throw new Error(`未知命令：${command}`);
}

main().catch((error) => {
  console.error(`错误：${error.message}`);
  process.exitCode = 1;
});
