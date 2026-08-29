import { mkdir } from "node:fs/promises";
import path from "node:path";

const SLOT_INDEX = { front: 0, left: 1, right: 2, back: 3 };
const LOGIN_RE = /注册\s*\/\s*登录|注册|登录|sign\s*up|log\s*in/i;
const GENERATE_RE = /^\s*(生成|generate)\s*\d*\s*$/i;
const SUCCESS_RE = /任务已提交|已开始生成|生成中|正在生成|submitted|generating|processing/i;
const PROCESSING_RE = /排队|生成中|处理中|正在生成|正在拓扑|queuing|generating|processing|retopologizing/i;
const ERROR_RE = /提交失败|生成失败|积分不足|余额不足|并发.*上限|请求过多|验证码|captcha|insufficient|rate.?limit|too many|submission failed/i;

export class SubmissionRejectedError extends Error {}
export class SubmissionUncertainError extends Error {}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function visible(locator) {
  try {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible()) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export class TripoStudioPage {
  constructor(page, config, log = console.log) {
    this.page = page;
    this.config = config;
    this.log = log;
  }

  imageInputs() {
    return this.page.locator(this.config.selectors.imageInputs);
  }

  loginButton() {
    return this.page.getByRole("button", { name: LOGIN_RE });
  }

  generateButton() {
    if (this.config.selectors.generateButton) {
      return this.page.locator(this.config.selectors.generateButton).first();
    }
    return this.page.getByRole("button").filter({ hasText: GENERATE_RE }).first();
  }

  configuredLocator(name) {
    const selector = this.config.selectors[name];
    if (!selector) {
      throw new Error(`缺少页面定位器 selectors.${name}`);
    }
    return this.page.locator(selector).first();
  }

  async openWorkspace() {
    if (this.page.url() !== this.config.studioUrl) {
      await this.page.goto(this.config.studioUrl, { waitUntil: "domcontentloaded" });
    }
    await this.page.waitForLoadState("domcontentloaded");
    await this.page.locator(this.config.selectors.multiViewButton).first().waitFor({
      state: "visible",
      timeout: this.config.uploadTimeoutMs,
    });
  }

  async isLoggedOut() {
    return visible(this.loginButton());
  }

  async waitForLogin() {
    await this.openWorkspace();
    if (!(await this.isLoggedOut())) {
      this.log("已检测到登录状态。");
      return;
    }
    if (this.config.headless) {
      throw new Error("当前没有登录状态；请先把 headless 设为 false 并运行 login 命令");
    }

    this.log("请在打开的浏览器中完成 Tripo 登录，工具会自动继续……");
    const deadline = Date.now() + this.config.loginTimeoutMs;
    while (Date.now() < deadline) {
      if (!(await this.isLoggedOut())) {
        await this.page.waitForTimeout(1000);
        this.log("登录成功，专用浏览器 profile 已保留登录状态。");
        return;
      }
      await sleep(1000);
    }
    throw new Error(`等待登录超时（${Math.round(this.config.loginTimeoutMs / 60000)} 分钟）`);
  }

  async ensureMultiViewMode() {
    if ((await this.imageInputs().count()) >= 4) {
      return;
    }

    const button = this.page.locator(this.config.selectors.multiViewButton).first();
    await button.waitFor({ state: "visible", timeout: this.config.uploadTimeoutMs });
    const deadline = Date.now() + this.config.uploadTimeoutMs;
    while (Date.now() < deadline) {
      if ((await this.imageInputs().count()) >= 4) {
        return;
      }
      await button.click();
      try {
        await this.page.waitForFunction(
          ({ selector }) => document.querySelectorAll(selector).length >= 4,
          { selector: this.config.selectors.imageInputs },
          { timeout: Math.min(2500, Math.max(1, deadline - Date.now())) },
        );
        return;
      } catch {
        // Studio 会先渲染按钮、稍后才完成事件挂载；继续重试直到槽位真正出现。
      }
    }
    throw new Error("点击多视图入口后没有出现四个图片槽位；页面可能尚未加载完成或结构已变化");
  }

  async prepareAsset(asset) {
    await this.openWorkspace();
    if (await this.isLoggedOut()) {
      throw new Error("登录状态已失效，请重新运行 login 命令");
    }
    await this.ensureMultiViewMode();

    const inputs = this.imageInputs();
    for (let index = 0; index < 4; index += 1) {
      await inputs.nth(index).setInputFiles([], { timeout: this.config.uploadTimeoutMs });
    }

    for (const file of asset.files) {
      const index = SLOT_INDEX[file.slot];
      const input = inputs.nth(index);
      await input.setInputFiles(file.path, { timeout: this.config.uploadTimeoutMs });
    }

    if (this.config.uploadSettleDelayMs > 0) {
      await this.page.waitForTimeout(this.config.uploadSettleDelayMs);
    }

    const generate = this.generateButton();
    await generate.waitFor({ state: "visible", timeout: this.config.uploadTimeoutMs });
    const deadline = Date.now() + this.config.uploadTimeoutMs;
    while (Date.now() < deadline && !(await generate.isEnabled())) {
      await sleep(500);
    }
    if (!(await generate.isEnabled())) {
      throw new Error("图片已选择，但生成按钮仍不可用；可能仍在上传、图片无效或页面结构已变化");
    }
  }

  async configureHd() {
    const button = this.configuredLocator("hdModeButton");
    await button.waitFor({ state: "visible", timeout: this.config.uploadTimeoutMs });
    await button.click();
  }

  async openRetopology() {
    const nav = this.configuredLocator("retopologyNav");
    await nav.waitFor({ state: "visible", timeout: this.config.stageTimeoutMs });
    await nav.click();
    await this.configuredLocator("retopologyButton").waitFor({ state: "visible", timeout: this.config.uploadTimeoutMs });
  }

  async configureRetopology() {
    await this.configuredLocator("triangleButton").click();

    const toggle = this.configuredLocator("smartLowPolySwitch");
    await toggle.waitFor({ state: "visible", timeout: this.config.uploadTimeoutMs });
    const checked = await toggle.getAttribute("aria-checked");
    const state = await toggle.getAttribute("data-state");
    if (checked !== "true" && state !== "checked") {
      await toggle.click();
    }

    const polygonCount = this.configuredLocator("polygonCountInput");
    await polygonCount.waitFor({ state: "visible", timeout: this.config.uploadTimeoutMs });
    await polygonCount.fill(String(this.config.targetFaces));
  }

  async openTexture() {
    const nav = this.configuredLocator("textureNav");
    await nav.waitFor({ state: "visible", timeout: this.config.stageTimeoutMs });
    await nav.click();
    await this.configuredLocator("textureButton").waitFor({ state: "visible", timeout: this.config.uploadTimeoutMs });
  }

  async configureTexture() {
    await this.configuredLocator("texture8kButton").click();
  }

  async clickGenerate() {
    const beforeUrl = this.page.url();
    const selectedIndexes = this.config.views.map((view) => SLOT_INDEX[view.slot]);
    const inputsHeldFilesBeforeClick = await this.page.evaluate(
      ({ selector, indexes }) => {
        const inputs = Array.from(document.querySelectorAll(selector));
        return inputs.length >= 4 && indexes.every((index) => inputs[index] instanceof HTMLInputElement && inputs[index].files?.length === 1);
      },
      { selector: this.config.selectors.imageInputs, indexes: selectedIndexes },
    );
    await this.generateButton().click();

    const deadline = Date.now() + this.config.submissionConfirmTimeoutMs;
    while (Date.now() < deadline) {
      if (await this.isLoggedOut()) {
        throw new SubmissionRejectedError("点击生成后要求重新登录，任务未确认提交");
      }

      if (this.config.selectors.submissionError && (await visible(this.page.locator(this.config.selectors.submissionError)))) {
        throw new SubmissionRejectedError("页面显示提交失败");
      }
      if (await visible(this.page.getByText(ERROR_RE))) {
        throw new SubmissionRejectedError("页面显示积分、并发、验证码或提交错误");
      }

      if (this.config.selectors.submissionConfirmation && (await visible(this.page.locator(this.config.selectors.submissionConfirmation)))) {
        return "confirmation-selector";
      }
      if (this.page.url() !== beforeUrl) {
        return "url-changed";
      }
      if (await visible(this.page.getByText(SUCCESS_RE))) {
        return "success-message";
      }

      const cleared = inputsHeldFilesBeforeClick && await this.page.evaluate(
        ({ selector, indexes }) => {
          const inputs = Array.from(document.querySelectorAll(selector));
          if (inputs.length < 4) {
            return false;
          }
          return indexes.every((index) => {
            const input = inputs[index];
            return input instanceof HTMLInputElement && (!input.files || input.files.length === 0);
          });
        },
        { selector: this.config.selectors.imageInputs, indexes: selectedIndexes },
      );
      if (cleared) {
        return "inputs-cleared";
      }

      await sleep(500);
    }

    throw new SubmissionUncertainError(
      "点击生成后未观察到明确的成功或失败信号；状态已标记为 uncertain，避免自动重复扣积分",
    );
  }

  async clickStage(buttonName, label) {
    const button = this.configuredLocator(buttonName);
    await button.waitFor({ state: "visible", timeout: this.config.uploadTimeoutMs });
    const beforeUrl = this.page.url();
    await button.click();

    const deadline = Date.now() + this.config.submissionConfirmTimeoutMs;
    while (Date.now() < deadline) {
      if (await this.isLoggedOut()) {
        throw new SubmissionRejectedError(`${label}提交后要求重新登录`);
      }
      if (this.config.selectors.submissionError && (await visible(this.page.locator(this.config.selectors.submissionError)))) {
        throw new SubmissionRejectedError(`${label}页面显示提交失败`);
      }
      if (await visible(this.page.getByText(ERROR_RE))) {
        throw new SubmissionRejectedError(`${label}页面显示积分、并发、验证码或提交错误`);
      }
      if (this.page.url() !== beforeUrl) {
        return "url-changed";
      }
      if (await visible(this.page.getByText(PROCESSING_RE))) {
        return "processing-visible";
      }
      if (!(await visible(button)) || !(await button.isEnabled())) {
        return "action-disabled";
      }
      await sleep(500);
    }

    throw new SubmissionUncertainError(`${label}点击后未观察到明确的排队或处理信号`);
  }

  async clickRetopology() {
    return this.clickStage("retopologyButton", "智能拓扑");
  }

  async clickTexture() {
    return this.clickStage("textureButton", "纹理生成");
  }

  async waitForStageCompletion(label, readySelectorName) {
    if (this.config.stageSettleDelayMs > 0) {
      await this.page.waitForTimeout(this.config.stageSettleDelayMs);
    }

    const ready = this.configuredLocator(readySelectorName);
    const deadline = Date.now() + this.config.stageTimeoutMs;
    let stableChecks = 0;
    while (Date.now() < deadline) {
      if (await this.isLoggedOut()) {
        throw new SubmissionUncertainError(`${label}处理中登录状态失效`);
      }
      if (this.config.selectors.submissionError && (await visible(this.page.locator(this.config.selectors.submissionError)))) {
        throw new SubmissionUncertainError(`${label}处理失败`);
      }
      if (await visible(this.page.getByText(ERROR_RE))) {
        throw new SubmissionUncertainError(`${label}页面显示处理失败`);
      }

      const processing = await visible(this.page.getByText(PROCESSING_RE));
      const readyNow = await visible(ready) && await ready.isEnabled();
      if (!processing && readyNow) {
        stableChecks += 1;
        if (stableChecks >= 2) {
          return;
        }
      } else {
        stableChecks = 0;
      }
      await sleep(1000);
    }
    throw new SubmissionUncertainError(`${label}在 ${Math.round(this.config.stageTimeoutMs / 60000)} 分钟内未完成`);
  }

  waitForHd() {
    return this.waitForStageCompletion("HD 模型", "retopologyNav");
  }

  waitForRetopology() {
    return this.waitForStageCompletion("智能拓扑", "textureNav");
  }

  waitForTexture() {
    return this.waitForStageCompletion("8K 纹理", "exportButton");
  }

  currentUrl() {
    return this.page.url();
  }

  async screenshot(name) {
    await mkdir(this.config.artifactDir, { recursive: true });
    const safeName = name.replace(/[^\p{L}\p{N}._-]+/gu, "_");
    const filePath = path.join(this.config.artifactDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeName}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }
}
