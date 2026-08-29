import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

function signatureFor(id, files) {
  const hash = createHash("sha256");
  hash.update(id);
  for (const file of files) {
    hash.update(`\n${file.slot}:${path.basename(file.path)}:${file.size}:${Math.trunc(file.mtimeMs)}`);
  }
  return hash.digest("hex");
}

export async function scanAssets(config) {
  let entries;
  try {
    entries = await readdir(config.inputDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`输入目录不存在：${config.inputDir}`);
    }
    throw error;
  }

  const valid = [];
  const invalid = [];
  const directories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));

  for (const directory of directories) {
    const assetDir = path.join(config.inputDir, directory.name);
    const fileEntries = (await readdir(assetDir, { withFileTypes: true })).filter((entry) => entry.isFile());
    const names = new Map(fileEntries.map((entry) => [entry.name.toLocaleLowerCase(), entry.name]));
    const files = [];
    const problems = [];

    for (const view of config.views) {
      const matchedName = view.fileNames
        .map((candidate) => names.get(candidate.toLocaleLowerCase()))
        .find(Boolean);

      if (!matchedName) {
        problems.push(`${view.slot} 缺少文件（候选：${view.fileNames.join("、")}）`);
        continue;
      }

      const filePath = path.join(assetDir, matchedName);
      const info = await stat(filePath);
      if (info.size > config.maxImageBytes) {
        problems.push(`${matchedName} 超过 ${(config.maxImageBytes / 1024 / 1024).toFixed(0)}MB`);
        continue;
      }

      files.push({
        slot: view.slot,
        path: filePath,
        name: matchedName,
        size: info.size,
        mtimeMs: info.mtimeMs,
      });
    }

    if (problems.length > 0) {
      invalid.push({ id: directory.name, directory: assetDir, problems });
      continue;
    }

    valid.push({
      id: directory.name,
      directory: assetDir,
      files,
      signature: signatureFor(directory.name, files),
    });
  }

  return { valid, invalid };
}
