import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_STATE = { version: 1, jobs: {} };

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = structuredClone(EMPTY_STATE);
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (parsed.version !== 1 || !parsed.jobs || typeof parsed.jobs !== "object") {
        throw new Error("状态文件格式不受支持");
      }
      this.data = parsed;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(`无法读取状态文件 ${this.filePath}：${error.message}`);
      }
      this.data = structuredClone(EMPTY_STATE);
    }
    return this;
  }

  get(assetId) {
    return this.data.jobs[assetId];
  }

  entries() {
    return Object.entries(this.data.jobs).sort(([left], [right]) => left.localeCompare(right, "zh-CN", { numeric: true }));
  }

  async mark(asset, status, details = {}) {
    this.data.jobs[asset.id] = {
      status,
      signature: asset.signature,
      files: Object.fromEntries(asset.files.map((file) => [file.slot, file.name])),
      updatedAt: new Date().toISOString(),
      ...details,
    };
    await this.save();
  }

  async resolve(assetId, status, signature) {
    if (status === "retry") {
      delete this.data.jobs[assetId];
    } else {
      const previous = this.data.jobs[assetId] ?? {};
      this.data.jobs[assetId] = {
        ...previous,
        status,
        signature: signature ?? previous.signature,
        resolution: "manual",
        updatedAt: new Date().toISOString(),
      };
    }
    await this.save();
  }

  async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
  }
}
