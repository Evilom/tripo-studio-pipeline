# Tripo Studio Pipeline

一个非官方的 Codex Skill 和本地浏览器队列，将人物参考、三视图、Tripo 生成、断点续收与本地交付连成可复用的流程：

```text
核实原片与同服装 → 独立头部＋大字 A-Pose 全身三视图
→ 分别生成并保留 HD → 普通 Quad 拓扑 → 4K 颜色纹理
→ GLB＋原生 OBJ/MTL/贴图 → 文件与视觉检查 → 记录后推进下一人
```

人物配置以长相和批量落地为先：首次头部目标 30,000 面、全身 10,000 面，Smart Low Poly 关闭。已接受任务只续接，小瑕疵留档供后续 Wrap；文件齐备候选与最终验收分开记录。用户及项目最新规格优先。

它通过可见网页操作 Studio 会员积分，不需要 Tripo API，也不读取或复刻网页内部请求。

## 能力与入口

| 入口 | 能做什么 |
|---|---|
| [SKILL.md](SKILL.md) | 由 agent 协调参考、头身生产、恢复和交付检查 |
| [人物工作流](references/character-workflow.md) | 同一角色/服装核验、六图、A-Pose、首次生成参数 |
| [恢复协议](references/recovery.md) | 串行浏览器、付费防重、原项目等待与下载落盘 |
| [交付记录](references/delivery.md) | 13 项文件、原生面型、视觉记录、候选与验收区分 |
| [文件校验脚本](scripts/verify_character_delivery.py) | 只读检查角色映射、哈希、GLB、OBJ 包和跨角色引用 |
| [通用队列](references/queue.md) | 保留已有 scan/preview/run/pipeline/status/resolve 命令 |

人物流程依赖当前环境的图像工具、浏览器操作与本地模型查看能力；优先复用项目已验证的阶段脚本。仓库 `tool/` 的通用 CLI 仍默认 2,000 面、2K，完成到纹理阶段，不自动收取原 HD 或双格式导出。完整人物流程由 skill 指导 agent 执行，不是一个新增的无人值守 CLI 命令。

## 安装

通用队列需要 Node.js 20+ 和 Edge/Chrome；交付校验需要 Python 3.10+，只用标准库。模型渲染按项目使用 Blender 或等价工具。

macOS/Linux：源码放在项目目录，技能目录用符号链接。若目标目录已存在，先核对原安装，不覆盖。

```sh
mkdir -p "$HOME/projects" "$HOME/.agents/skills"
git clone https://github.com/Evilom/tripo-studio-pipeline.git "$HOME/projects/tripo-studio-pipeline"
ln -s "$HOME/projects/tripo-studio-pipeline" "$HOME/.agents/skills/tripo-studio-pipeline"
cd "$HOME/projects/tripo-studio-pipeline/tool"
npm ci
```

Codex 支持用户技能目录和链接目录，详情见 [官方 skill 文档](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)。已有旧版技能安装路径可以保留，不重复安装同名 skill。

Windows 可在已有技能安装目录运行，或从项目源码创建目录联接：

```powershell
git clone https://github.com/Evilom/tripo-studio-pipeline.git "$env:USERPROFILE\projects\tripo-studio-pipeline"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.agents\skills"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.agents\skills\tripo-studio-pipeline" -Value "$env:USERPROFILE\projects\tripo-studio-pipeline"
cd "$env:USERPROFILE\projects\tripo-studio-pipeline\tool"
.\start.ps1 status
```

Windows `start.ps1` 首次运行会创建本地 `config.json` 和 `inputs/`；macOS 初次配置按下方工具文档建立，不覆盖已有集中配置。随后在专用浏览器窗口正常登录：

```powershell
.\start.ps1 login
```

macOS 上如果 Playwright 直接启动的浏览器反复触发真人验证，请改用正常启动的 Chrome 并通过 CDP 连接。已实测跑通的完整命令、配置和故障恢复步骤见 [tool/README.md](tool/README.md#macos-实测跑通流程)。

## 使用 skill

```text
$tripo-studio-pipeline 把这份名单逐人做成独立高清头部和同服装 A-Pose 全身，保留 HD，并交付纹理 GLB/OBJ。
$tripo-studio-pipeline 续接这个项目，先检查已接受任务和真实文件，收齐后推进下一位。
$tripo-studio-pipeline 只核验这位角色的交付清单和模型文件。
```

付费动作沿用会话授权；仅检查或整理流程不会提交生成任务。每次恢复读取项目最新 WORKFLOW/GOAL/ASSET_SPEC、roster、交付入口、进程、日志和 checkpoint，不从历史角色起点重启。

## 使用通用队列

每个资产对应 `tool/inputs/` 下的一个子目录。新版 Studio 默认采用 `front.png`、`left.png`、`back.png` 三视图。

```powershell
# 只检查输入，不消耗积分
.\start.ps1 scan

# 上传一组供人工核对，但不点击生成
.\start.ps1 preview --asset example_asset

# 完整处理一组
.\start.ps1 pipeline --limit 1

# 处理剩余全部有效资产
.\start.ps1 pipeline

# 查看断点状态
.\start.ps1 status
```

以上是通用队列命令；人物模式的具体角色、普通 Quad 参数、原 HD 保存和双格式导出按 skill 及项目适配器处理。

## 验证

交付校验完整示例见 [交付记录](references/delivery.md#文件校验命令)。从仓库根运行离线脚本测试，从 `tool/` 运行本地模拟网页测试；均不访问真实 Tripo 任务：

```sh
python3 -m unittest discover -s tests -v
npm --prefix tool test
```

## 安全边界

- 每次付费点击前写入断点；无法确认时停止，不自动重复扣费。
- 不绕过 CAPTCHA、并发、登录或积分限制。
- `tool/config.json`、`tool/.runtime/`、`tool/inputs/`、浏览器 Profile 和 `node_modules/` 均被 Git 忽略。
- Studio 的页面结构和积分价格可能变化；批量运行前先用一组素材验收。
- 不上传用户的角色参考、模型、下载、运行记录和账户页面到 skill 仓库；脱敏示例不含真实项目 ID、账号或本机绝对路径。
- 交付校验通过只说明文件/映射检查通过，不能自动宣称视觉、Wrap、绑定或动画通过。

详细参数和异常恢复方式见 [tool/README.md](tool/README.md)。

Tripo 及相关商标归其权利人所有；本项目与 Tripo 官方无隶属或背书关系。
