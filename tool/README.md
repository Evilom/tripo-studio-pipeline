# Tripo Studio 多视图任务队列

这个本地工具通过 Tripo Studio 的可见网页界面，逐组执行多视图任务。它使用 Studio 会员积分，不调用 Tripo API，也不会读取、导出或复刻网页内部请求。

## 能做什么

- 每个资产目录对应一个生成任务。
- 支持 `front`、`left`、`right`、`back` 四个网页槽位中的任意 2–4 个组合。
- 使用专用 Edge/Chrome profile，首次人工登录后复用登录状态。
- `preview` 只上传第一组图片并截图，不会点击生成。
- `pipeline` 自动执行多视图 HD → Smart Low Poly v2（三角面、目标 10,000 面）→ 8K 纹理。
- 每次明确确认网页已接收任务后才写入 `submitted` 状态。
- 发生崩溃或无法确认时停止运行，防止重复提交、重复扣积分。

## 输入目录

默认配置采用“前、左、右”三视图：

```text
inputs/
├─ sword_001/
│  ├─ front.png
│  ├─ left.png
│  └─ right.png
└─ sword_002/
   ├─ front.png
   ├─ left.png
   └─ right.png
```

如果你的组合是“前、右、后”，在 `config.json` 的 `views` 中删除 `left`，加入：

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

# 完整跑 1 组：HD → 智能拓扑 → 8K 纹理
.\start.ps1 pipeline --limit 1

# 查看断点状态
.\start.ps1 status

# 验证无误后提交剩余全部任务
.\start.ps1 run

# 验证无误后完整处理剩余任务
.\start.ps1 pipeline
```

运行 `preview` 时也请在网页里确认 AI 模型、纹理、拓扑、私密性等生成设置。工具只负责三视图槽位与提交队列，不会擅自修改这些选项；后续任务沿用 Studio 当前保存的设置。

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
- `profileDir`：专用浏览器登录数据，只保存在本机 `.runtime` 中。
- `submissionDelayMs`：两个任务提交之间的间隔；不要用它规避平台限流。
- `uploadSettleDelayMs`：三张图片放入槽位后的保守等待时间；大图或慢网络可适当提高。
- `submissionConfirmTimeoutMs`：点击生成后等待网页确认的最长时间。
- `stageTimeoutMs`：单个 HD、拓扑或纹理阶段最长等待时间，默认 20 分钟。
- `targetFaces`：Smart Low Poly v2 的目标面数，默认 10,000；实际结果会由算法略微浮动。
- `textureResolution`：当前完整流水线固定为 `8K`。
- `selectors`：Tripo 页面结构变化时才需要调整。默认定位器已根据 2026-08-28 的实际 Studio 页面验证。

错误和预览截图保存在 `.runtime/artifacts/`，状态保存在 `.runtime/state.json`。这些内容都不会提交到 Git。

## 账号边界

使用前请确认 Tripo 允许你在本人付费账号中进行 RPA/浏览器自动化。工具不会绕过验证码、并发限制、登录或积分检查；遇到此类页面会停止等待人工处理。
