# Tripo Studio 多视图任务队列

从零安装、完整配置、Chrome/Edge 连接、登录与首次运行，请从 [根目录 README](../README.md) 开始；该文档已将各系统命令与配置字段集中说明。下面保留通用工具的补充说明。

本文介绍原有通用 CLI。人物的独立头部＋A-Pose 全身、30,000/10,000 普通 Quad、原 HD 保存和 GLB/OBJ 交付，见仓库 [SKILL.md](../SKILL.md) 与 [人物工作流](../references/character-workflow.md)。通用 `pipeline` 不实现这套完整调度，不要用其默认参数替代人物规格；在共享浏览器中操作时先遵守项目互斥与下载协议。

这个本地工具通过 Tripo Studio 的可见网页界面，逐组执行多视图任务。它使用 Studio 会员积分，不调用 Tripo API，也不会读取、导出或复刻网页内部请求。

## 能做什么

- 每个资产目录对应一个生成任务。
- 支持旧版固定槽位，以及新版 Studio 的 `front`、`left`、`back` 动态三视图流程。
- 使用专用 Edge/Chrome profile，首次人工登录后复用登录状态。
- `preview` 只上传第一组图片并截图，不会点击生成。
- `pipeline` 自动执行多视图 HD → Smart Low Poly v2（四边面、默认目标 2,000 面）→ 2K 纹理。
- 每次明确确认网页已接收任务后才写入 `submitted` 状态。
- 发生崩溃或无法确认时停止运行，防止重复提交、重复扣积分。

## 输入目录

默认配置采用“前、左、后”三视图：

```text
inputs/
├─ sword_001/
│  ├─ front.png
│  ├─ left.png
│  └─ back.png
└─ sword_002/
   ├─ front.png
   ├─ left.png
   └─ back.png
```

旧版固定四槽位页面仍可把 `dynamicMultiView` 设为 `false`，并在 `views` 中使用任意 2–4 个方向：

```json
{
  "slot": "back",
  "fileNames": ["back.png", "back.jpg", "背面.png", "背面.jpg"]
}
```

槽位名称必须是 `front`、`left`、`right`、`back`，顺序不会影响网页中的方向映射。

## 首次使用

在 PowerShell 中运行：

```powershell
cd <tripo-studio-pipeline 克隆目录>\tool
.\start.ps1 status
```

第一次会创建 `config.json` 和空的 `inputs/`。把资产子目录放进 `inputs/`，并按需修改 `views` 后依次执行：

```powershell
# 检查每个目录是否都有正确的三张图
.\start.ps1 scan

# 打开专用浏览器，由你手动登录一次
.\start.ps1 login

# 上传第一组并停在生成前，人工核对方向
.\start.ps1 preview

# 先提交 3 组小样
.\start.ps1 run --limit 3

# 完整跑 1 组：HD → 智能拓扑 → 2K 纹理
.\start.ps1 pipeline --limit 1

# 查看断点状态
.\start.ps1 status

# 验证无误后提交剩余全部任务
.\start.ps1 run

# 验证无误后完整处理剩余任务
.\start.ps1 pipeline
```

运行 `preview` 时请在网页里确认三视图方向、模型和私密性等生成设置。`pipeline` 会明确选择 HD、Smart Low Poly v2、配置中的拓扑模式、面数和纹理分辨率；其他 Studio 选项沿用账号当前保存的设置。

指定单个资产：

```powershell
.\start.ps1 preview --asset sword_001
.\start.ps1 run --asset sword_001
.\start.ps1 pipeline --asset sword_001
```

## 不确定状态的处理

如果任一扣费点击后网页既没有明确成功信号，也没有明确错误，工具会把任务标记为 `uncertain` 并停止。先去 Tripo Studio 的资产列表核对：

```powershell
# Studio 中已经存在该任务：保留为已提交
.\start.ps1 resolve --asset sword_001 --as submitted --confirm

# Studio 中确认整条流水线已经完成
.\start.ps1 resolve --asset sword_001 --as completed --confirm

# Studio 中确定没有该任务：允许重新提交
.\start.ps1 resolve --asset sword_001 --as retry --confirm
```

不要在未核对网页资产列表时使用 `retry`，否则可能重复消耗积分。

## 配置说明

- `browserChannel`：Windows 默认 `msedge`；安装了 Chrome 时可改为 `chrome`。
- `cdpEndpoint`：连接到用户正常启动的 Chrome，例如 `http://127.0.0.1:9223`；适合直接启动的自动化浏览器频繁遇到真人验证时使用。
- `dynamicMultiView`：新版 Studio 设为 `true`，按 `front`、`left`、`back` 顺序上传动态槽位。
- `profileDir`：专用浏览器登录数据，只保存在本机 `.runtime` 中。
- `submissionDelayMs`：两个任务提交之间的间隔；不要用它规避平台限流。
- `uploadSettleDelayMs`：三张图片放入槽位后的保守等待时间；大图或慢网络可适当提高。
- `submissionConfirmTimeoutMs`：点击生成后等待网页确认的最长时间。
- `stageTimeoutMs`：单个 HD、拓扑或纹理阶段最长等待时间，默认 20 分钟。
- `topologyMode`：重拓扑类型，网页默认 `quad`（智能四边面），也可设为 `triangle`。
- `targetFaces`：Smart Low Poly v2 的目标面数，网页默认 2,000；实际结果会由算法略微浮动。
- `textureResolution`：支持 `2K`、`4K`、`8K`，网页默认 `2K`；导出后还可继续生成 1K 发布版本。
- `selectors`：Tripo 页面结构变化时才需要调整。默认定位器已根据 2026-08-28 的实际 Studio 页面验证。

错误和预览截图保存在 `.runtime/artifacts/`，状态保存在 `.runtime/state.json`。这些内容都不会提交到 Git。

## macOS 实测跑通流程

这套流程用于避免 Playwright 自带启动特征反复触发真人验证。它不绕过验证码，而是让自动化连接一个由用户正常启动、可见、带独立本地 Profile 的 Chrome。

1. 安装依赖并创建本地配置：

```bash
cd /path/to/tripo-studio-pipeline/tool
npm install
cp config.example.json config.json
mkdir -p inputs
```

2. 从 `tool` 目录启动正常 Chrome。先完全退出占用同一个专用 Profile 的旧进程，再运行：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9223 \
  --user-data-dir="$PWD/.runtime/browser-profile" \
  --start-maximized \
  https://studio.tripo3d.ai/workspace/generate
```

3. 在这个 Chrome 窗口中手动登录 Tripo 一次；真人验证如果出现，也只在这里由用户正常完成。登录状态会留在被 Git 忽略的 `.runtime/browser-profile` 中。

4. 在 `config.json` 保留以下关键配置：

```json
{
  "cdpEndpoint": "http://127.0.0.1:9223",
  "dynamicMultiView": true,
  "topologyMode": "quad",
  "targetFaces": 2000,
  "textureResolution": "2K"
}
```

5. 把每个物件的 `front.png`、`left.png`、`back.png` 放入独立子目录，然后从只读检查开始：

```bash
node src/cli.js scan
node src/cli.js preview --asset example_asset
node src/cli.js pipeline --asset example_asset
node src/cli.js status
```

第一件验收无误后，再用 `node src/cli.js pipeline --limit 1` 或不带 `--limit` 处理剩余任务。`pipeline` 当前完成到纹理阶段并保存截图，不自动点击导出。

工具只通过 Chrome 官方远程调试接口控制可见页面，不复制账号 Cookie，也不会关闭这个浏览器。`cdpEndpoint` 为空时才会由 Playwright 启动专用浏览器。

## 这次跑通后的关键防错

- 新版多视图槽位是动态出现的：先上传 `front`，切换多视图后依次上传 `left`、`back`；不能再按旧版四个固定 input 的下标硬填。
- Studio 从生成页跳到重拓扑或纹理页时，偶尔只给出裸任务 ID 路径。工具会从页面链接恢复包含 slug 的完整任务路由，避免按钮存在但模型没有载入。
- “重拓扑中”“纹理生成中”“重绘中”都视为处理中；只有处理提示消失且下一阶段入口出现，才会继续。
- 拓扑按钮和纹理分辨率必须通过 `aria-pressed` 或 `data-state=on` 确认选中。否则停止，不假定点击成功；这可避免 Studio 保留 8K 默认值而意外多扣积分。
- 阶段按钮若仍禁用会持续等待；登录失效、验证码、积分不足或处理错误会进入 `uncertain`/失败保护，不会自动重复付费点击。
- 四边面模式的目标面数有平台范围限制，实际输出也可能与目标值略有浮动。网页展示用途仍应在导出后检查体积、法线、锐边和材质效果。

## 常见故障

- **无法连接 `127.0.0.1:9223`**：Chrome 没有按上面的命令启动，或同一 Profile 已被另一个 Chrome 进程占用。关闭该专用 Profile 的 Chrome 后重启。
- **仍出现真人验证**：不要循环刷新、并发开多个自动化窗口或尝试绕过。停在正常 Chrome 中人工完成；仍反复出现时停止任务，等待平台解除风控。
- **任务显示 `uncertain`**：先在 Studio 资产列表确认是否已经扣费/创建任务，再执行对应的 `resolve` 命令。未经核对不要使用 `retry`。
- **Studio 改版后找不到按钮**：先运行 `preview`，再根据可见页面更新 `config.json` 中的 `selectors`；不要直接批量执行付费任务。

## 账号边界

使用前请确认 Tripo 允许你在本人付费账号中进行 RPA/浏览器自动化。工具不会绕过验证码、并发限制、登录或积分检查；遇到此类页面会停止等待人工处理。
