# 通用 Studio 队列

用于已有的非人物专用 `tool/` 队列：扫描、免费预览、HD 或到纹理的通用流程。人物双资产收取与交付按 [character-workflow.md](character-workflow.md) 执行。

## 调用

Windows 使用 [invoke.ps1](../scripts/invoke.ps1)，它查找随 skill 附带的 `tool/`，或沿用 `TRIPO_STUDIO_QUEUE_ROOT` 指定的工具目录：

```powershell
& /path/to/tripo-studio-pipeline/scripts/invoke.ps1 scan
& /path/to/tripo-studio-pipeline/scripts/invoke.ps1 status
& /path/to/tripo-studio-pipeline/scripts/invoke.ps1 preview --asset example_asset
```

macOS/Linux 在仓库 `tool/` 下安装锁定依赖，沿用已有本地配置：

```sh
node src/cli.js scan --config /path/to/config.json
node src/cli.js status --config /path/to/config.json
node src/cli.js preview --config /path/to/config.json --asset example_asset
```

首次依赖、配置和正常 Chrome CDP 启动方式见 [tool/README.md](../tool/README.md)。不要覆盖已存在配置或复制凭据。若同一浏览器有项目锁入口，连通用 preview 也必须先纳入该互斥协议；正在下载时不能用通用 CLI 建立额外 CDP 连接。

| 命令 | 实际能力 |
|---|---|
| `scan` | 检查视图文件和签名，不能证明长相或方向视觉正确 |
| `status` | 读取本地 checkpoint，不保证平台实时状态 |
| `preview --asset ID` | 上传并截图，不点生成，之后需要实际看图 |
| `run --asset ID` | 有授权时首次提交生成；沿用页面当前模型设置，不主动选择 HD |
| `pipeline --asset ID` | 有授权时首次 HD→Smart Low Poly→纹理 |
| `resolve` | 根据核对结果修改本地队列状态，不运行缺失阶段 |

通用 `pipeline` 默认 Quad、目标 2,000、2K，保留旧 API 契约，不自动保存原 HD 或导出模型。不能仅在配置中填 30,000/4K 就认为具备人物工作流的普通 Quad、双资产和导出能力。其 `completed` 只代表队列定义的纹理阶段完成。

## 付费与恢复

真实提交需要当前会话已有授权；授权内不用逐步再问。说明实际选中资产数量，别把目录全部内容自动当作获准角色。只有指定未接受资产才运行 `run/pipeline`，`--limit` 限制队列数量但不代替角色选择核验。

`uncertain/submitting/processing` 后先检查实际 Studio 原任务、截图与历史。已有 ID、扣费或排队证据就按 [recovery.md](recovery.md) 续接，不能重跑整条 pipeline。`resolve --as retry` 会放开再次提交，仅在确认未接受时才适用；即使纹理未完成，也不能把已接受 HD 设成 retry。

```sh
node src/cli.js resolve --config /path/to/config.json --asset example_asset --as submitted --confirm
node src/cli.js resolve --config /path/to/config.json --asset example_asset --as completed --confirm
```

只有实际已完成对应阶段才选择 completed；这些命令不是下载或验收。结束时报告当前阶段、uncertain 项、截图/文件路径和恢复动作。
