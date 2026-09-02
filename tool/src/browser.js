import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

export async function launchPersistentBrowser(config) {
  if (config.cdpEndpoint) {
    try {
      const browser = await chromium.connectOverCDP(config.cdpEndpoint);
      const context = browser.contexts()[0];
      if (!context) {
        throw new Error("CDP 浏览器没有可用的默认上下文");
      }
      return {
        context,
        close: async () => {},
      };
    } catch (error) {
      throw new Error(
        `无法连接普通浏览器 ${config.cdpEndpoint}。请确认浏览器已用 remote-debugging-port 启动。\n${error.message}`,
      );
    }
  }

  await mkdir(config.profileDir, { recursive: true });
  try {
    const context = await chromium.launchPersistentContext(config.profileDir, {
      channel: config.browserChannel,
      headless: config.headless,
      acceptDownloads: true,
      viewport: config.headless ? { width: 1440, height: 1000 } : null,
      args: config.headless ? [] : ["--start-maximized"],
    });
    return {
      context,
      close: () => context.close(),
    };
  } catch (error) {
    throw new Error(
      `无法启动浏览器频道 ${config.browserChannel}。请确认对应浏览器已安装，并关闭正在占用专用 profile 的工具实例。\n${error.message}`,
    );
  }
}

export async function studioPage(context, studioUrl) {
  const host = new URL(studioUrl).host;
  const existing = context.pages().find((page) => {
    try {
      return new URL(page.url()).host === host;
    } catch {
      return false;
    }
  });
  return existing ?? context.newPage();
}
