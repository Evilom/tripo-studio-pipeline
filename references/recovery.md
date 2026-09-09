# 恢复与浏览器协议

用于原任务的观察、续接和导出。任何恢复都先读取当前项目最新规格、真实进程、checkpoint/history、日志及文件，不把历史起点或旧状态卡当成实时状态。

## 浏览器与互斥

若项目已有入口，在项目根目录统一执行：

```sh
node tools/run_tripo_ui.mjs script tools/VERIFIED_STAGE_SCRIPT.mjs
```

上例是**项目适配器协议**，不是本仓库已附带的命令；先检查该文件和目标阶段脚本实际存在、角色/stem/阶段正确。`tools/run_tripo_ui.mjs`、`tripo-verified-page.mjs`、`tripo-dom-page.mjs`、`tripo-download-local.mjs` 是已有 allstar 项目中的辅助文件，新项目不得假设这些文件或绝对路径存在。

项目缺少适配器时，使用环境提供且允许的浏览器工具完成下面同样的可见 UI 操作；需要脚本化时将这些约束实现在用户项目中，先验证免费预览，不凭空运行缺失命令。图像生成、浏览器和 Blender 是独立能力，不由通用 CLI 自动提供。

- 所有浏览器 UI 操作共用一个串行入口，包含 B 站取帧、预览、付费提交、阶段等待、下载。已有锁保持原协议，不引入彼此不兼容的第二把锁。
- allstar 的 `.runtime/tripo-ui.lock.json` 记录 PID、mode、target、started。PID 活着就等待并检查进度；不能导航走它的工作页。PID 确认死亡后由入口归档旧锁并退出，核对旧 checkpoint 后才再次调用。进程锁仅是本机互斥，不是平台任务存在证明。
- 连接正常启动的可见浏览器，使用项目集中配置的 CDP endpoint。已验证的环境使用 loopback 9223；这是可配置值，不是公网服务地址。
- 使用支持该选项的 Playwright/CDP 版本时，`chromium.connectOverCDP(endpoint, { noDefaults: true })` 保留浏览器默认下载设置。先检查实际依赖支持情况；通用 `tool/src/browser.js` 不是这一项目适配器。
- 下载期间不创建第二个 CDP 连接。页面选择按审核页面身份或已接受项目 ID，不能取同站第一个标签页；选择不唯一就先免费核验。

## 持久阶段记录

头身分别保存 HD checkpoint 与 retopo checkpoint，历史追加留档：

```text
.runtime/<stem>.json
.runtime/<stem>-retopo.json
.runtime/<stem>-retopo.json.history.jsonl
.runtime/<stem>-preview.json
.runtime/<stem>-before-submit.png
```

提交前写 `phase/status/time/asset_id/input_signature` 与预览证据；接受后立即保存 `project_id/url`，尽可能保留平台阶段 ID。错误记录保留上一个阶段和 ID，不用新的 uncertain 覆盖掉恢复所需信息。记录本地 PID、持久日志路径与输出目标，但不要把本地观察进程等同平台任务。

| 当前证据 | 下一步 | 禁止动作 |
|---|---|---|
| 上传未完成，无任何接受记录 | 等缺槽完成或免费补传，重新看图 | 未核对槽位就提交 |
| 已有 HD ID/排队/扣费证据 | 打开原项目，等候并收取原 HD | 再次 Generate 或新建同角色轮次 |
| `submitting`/`uncertain`，接受结果不明 | 检查当前页、资产列表、历史和扣费证据，保存观察 | 因超时自动 `retry` |
| `retopology processing` | 等原拓扑完成，然后只做尚未接受的首次纹理 | 重点 Retopology 或从头跑 `finish_*` |
| `texture4k processing` | 等原纹理完成后导出 | 再点 Generate Texture |
| 某一个导出已落盘 | 核验已有文件，免费补另一格式 | 重做纹理或 HD |
| cell/session 丢失 | 查 OS PID、日志、checkpoint、实际文件 | 重新启动整条付费流程 |
| 登录/额度/验证码/平台失败 | 保存具体错误及最后阶段，继续独立可做的工作 | 循环付费重试或绕过限制 |

仅在实际证据足以确认未被接受时，才可执行原授权内的**首次有效提交**：例如仍在同一已审核上传页、资产列表无新任务、余额无变化且没有 ID/排队等接受信号。单独余额不变或 URL 没跳转不充分。有任何接受证据或证据不足则继续核查原任务。

首次点击前将唯一已审核页面置前台，用真实 locator click，随后等待 `domcontentloaded` 与匹配的项目 URL/ID。不要用观察超时去触发点击循环。没有网页接受确认时持久标记 uncertain。

## 等待器卡住

服务可能已完成，后台页的动画帧和进度显示仍停滞。先核对原项目：

1. 激活**同一个已接受项目**，确认 ID 和路由未变。
2. 使用约 1 秒定时轮询（`polling: 1000` 或等价 loop），避免依赖后台页的 animation-frame。
3. HD 观察只看当前项目关联且可见可用的 Export 控件，不能被侧栏其他任务的“生成中”影响；拓扑/纹理同时核验当前阶段处理结束和可用导出/后续控件。
4. 等待超过约 120 秒时，最多刷新该已接受项目一次，继续观察；刷新不能点击付费按钮。具体超时沿用项目配置。
5. 到达超时仍无充分证据，保存原 ID/阶段/错误并报告待续接。不得把失去等待条件或页面离开当作完成。

终止本地卡住的观察进程前先确认它没有正在提交或下载；恢复时重新取得串行锁并收原结果。不能声称终止观察进程取消了平台任务。

## 下载与原件保留

Export 菜单、格式选中或 download 事件都不是交付证据。按当前项目实际 ID 打开导出，核对 GLB/OBJ 选项和明确的输出 stem。下载处理应：

1. 记录点击前目标目录内同名文件与时间，避免拿到旧角色/旧轮次。
2. 等待本次完整文件出现，确认没有对应 `.crdownload`/partial、大小稳定。
3. 核验 GLB magic、版本与声明长度；OBJ ZIP 验证 CRC，包含 OBJ、MTL、真实贴图与相互引用。
4. 先复制到项目临时文件，再原子改名到最终路径；保留浏览器下载原件，不覆盖已归档的不同内容。已有同名文件先核验和查记录。
5. 保存来源文件、目标文件、大小、SHA256 和项目映射；一个格式已好就只补缺失格式。

`noDefaults` 模式可能没有可靠 download 事件，文件可能进入浏览器原有 Downloads。按集中配置/真实浏览器设置定位下载目录，不硬编码用户名、不复制浏览器凭据。
