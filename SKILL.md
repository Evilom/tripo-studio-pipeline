---
name: tripo-studio-pipeline
description: Operate Tripo Studio through visible browser UI with a versioned task bundle, shared credit budget, duplicate-submit protection, native export continuation, file checks, and recovery. Use when reusing the current logged-in Chrome with the extension, producing character or quadruped game assets, or running the existing Studio batch queue. Also covers independent HD head and A-Pose body workflows. Excludes Tripo API integration and private-request reverse engineering.
---

# Tripo Studio Pipeline

通过可见 Studio 网页执行生产，保留本地源参考、生成图、原 HD、阶段记录和下载原件。用户最新规格优先；下面的人物参数是一套经过实际生产使用的配置，不是所有物件的通用默认值。

## 选择入口

先按用户指定的浏览器模式选择入口。用户要求复用当前 Chrome 时，不执行专用浏览器启动命令，也不创建新的 profile、无痕窗口或登录会话。另行使用 Windows CLI 时读 [Windows 指南](references/windows.md)，使用原生 PowerShell/Node 路径与命令。

- **当前已登录 Chrome、模型生成和自动导出**：先读 [当前 Chrome 流程及验收边界](references/current-chrome.md)，再读 [扩展指南](extension/README.md)和 [任务契约](references/task-contract.md)。核对实际加载版本与当前 URL；使用环境提供且允许的浏览器工具操作同一标签页。
- **人物生产、批量头身资产**：先读 [人物工作流](references/character-workflow.md)。需要的是参考、生成、收取和验收的完整闭环。
- **断线、超时、已接受任务或导出故障**：先读 [恢复与浏览器协议](references/recovery.md)，定位原项目最后接受的阶段后继续。
- **仅扫描、预览或使用现有通用队列**：读 [通用队列命令](references/queue.md)。保留原有 `scan/preview/run/pipeline/status/resolve` 契约。
- **检查双资产交付文件**：读 [交付记录与校验](references/delivery.md)，运行 [verify_character_delivery.py](scripts/verify_character_delivery.py)。脚本只读文件，不打开浏览器、不扣费、不修改验收状态。
- **检查导出骨骼与动作**：运行 [verify_glb_motion.py](scripts/verify_glb_motion.py)并按需要加 `--require-animation`。文件检查不能替代姿态、比例、变形、根运动和游戏导入验收。

用户只要求头部、全身或单个文件时，只处理该范围；13 项校验器用于完整双资产清单，不为满足它而扩展单资产任务。

本仓库的 `tool/` 通用 CLI 默认仍为 2,000 面、2K，运行到纹理阶段；它没有人物双资产、原 HD 收取和双格式导出的完整调度器。人物流程由 agent 按本 skill 协调项目适配脚本或当前可用的浏览器工具，不能直接把通用 `pipeline` 当成人物全流程，也不能靠 `resolve` 补做未完成阶段。

## 恢复时先读真实状态

1. 在用户指定项目读取 `WORKFLOW.md`、`GOAL.md`、`ASSET_SPEC.md`（存在时），随后读取 `roster.json`、`deliveries/README.md` 和 `PROGRESS.md`。没有既定结构的新项目，按参考文档建立等价记录。
2. 核对当前角色的头身文件映射、OS 进程、日志、checkpoint/history、已有项目 ID 和真实文件。锁文件或工具句柄单独都不能证明任务还在运行。
3. 优先收齐已生成模型；从最后接受的阶段恢复，不从旧文档的角色、轮次或名单总数重新开始。不要把历史快照写成 skill 的固定起点。

## 人物生产的必要约束

- 锁定同一角色、扮演者、原作、时期和标志服装；视频素材优先 B 站原片，保存来源、分 P、真实秒数和实际帧。缺失角度注明推断，不混用其他演员或 AI 换脸素材作为原片证据。
- 先建立独立高清头颈，再以同一头像和服装参考建立全身。全身双臂向两侧约 45°、手掌离衣、手指和双腿分开；正侧背旋转相机，保持同姿态。宽袍遮挡不能证明内部腿部存在或可绑定。
- 三视图按 `front / left / back` 显式映射，右槽留空。逐槽等待图片解码，实际查看网页缩略图与 HD 模式；预览和付费提交分两次工具调用，检查输入签名和真实尺寸，不能随手选择第一个同站标签页。
- 每人一轮，头身分别保留 HD，首次普通 Quad 头部目标 30,000、全身 10,000，显式关闭 Smart Low Poly；颜色纹理目标 4K。目标面数和分辨率不是实际结果，清单填写原生 OBJ 面型及每张贴图的真实尺寸。
- 已接受的 HD、拓扑和纹理只能续接与导出。超时、断线、目标重启、观察失败和小瑕疵均不构成重复付费理由。明显错误单列待处理；小瑕疵留档，保留 HD 供后续 Wrap，不反复焊接或重画。
- 同一浏览器的所有 UI 操作串行，包含取帧和下载。项目已有 `tools/run_tripo_ui.mjs` 时统一经过该锁入口；下载期间不另建 CDP 连接。模型服务计算期间可以做本地渲染或下一角色的独立参考准备。
- 实际查看头身 HD 与拓扑的正、侧、背及脸部近景后才能标记视觉已看。文件检查通过不等于长相、姿势、Wrap、绑定或动画验收通过。

## 提交与停止条件

任务 JSON 中写了额度不等于人类已授权。沿用会话授权及原共享账本；预算门禁只保护经过助手的提交，Agent 在网页直接操作时仍须记录意图、报价及实际余额变化。空输入价格、按钮暂未显示价格、保存操作没有价格均不能证明免费；不明确时先核实该操作的费用。通过更新页面或配置清空未知提交记录会破坏防重。

四足使用四爪着地的中立基础姿态，不直接套用人物 A-Pose 参数。不同风格分别核对自己的参考，不能复用一套三视图冒充其他设定。平台文本动作在人形与 Other 四足上的能力分别检查，不能把人形成功写成四足成功。

沿用会话已有授权，在授权角色和轮次内正常推进，无需逐步重复确认。仅整理流程、免费预览或检查文件不授权付费生成。每次付费点击前落盘阶段记录，接受后立即保存原项目 ID/URL；不确定时保留证据并核对原任务，不能自动重试。确认登录、额度或平台问题时记录具体阻碍，继续独立可做的工作。

使用正常登录的可见 Chrome/Edge，不导出凭据，不绕过验证码或平台限制，不调用或复刻 Tripo 私有请求。仓库只保存通用代码和脱敏示例，项目凭据、参考、模型、账户页面和运行记录留在原项目。

## 一人的完成与下一人

确认头身 HD、纹理 GLB、原生 OBJ/MTL/实际贴图全部落盘，核对角色映射、大小、SHA256、容器完整性与视觉证据。同步角色 manifest、visual-review、README、roster 和 PROGRESS，然后推进下一人。报告文件齐备候选、待处理缺陷、最后接受阶段及下一步；只有用户要求的验收均有证据才报告最终完成。
