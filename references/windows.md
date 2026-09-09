# Windows 安装、配置与运行

适用 Windows 10/11，Windows PowerShell 5.1 或 PowerShell 7。以下命令都在 **PowerShell** 中运行，不是 CMD、Git Bash 或 WSL。Windows 与 macOS 使用相同的 Node 队列和 Python 文件校验器；人物 Skill 仍需要宿主提供图像、浏览器和模型查看能力，以及人物项目适配脚本，安装本仓库不会自动补齐这些能力。

## 1. 安装与检查环境

安装 Git、Node.js 20 或更高版本和 Microsoft Edge（或 Chrome）。需要文件交付校验时再安装 Python 3.10 或更高版本。安装后重新打开 PowerShell，检查：

```powershell
git --version
node --version
npm.cmd --version
py -3 --version
```

`py` 仅用于 Python 校验；没有 Python 不影响网页队列。`npm.cmd` 可避免 PowerShell 误选受执行策略限制的 `npm.ps1`。

```powershell
$Repo = Join-Path $env:USERPROFILE 'projects\tripo-studio-pipeline'
New-Item -ItemType Directory -Force (Split-Path $Repo) | Out-Null
git clone https://github.com/Evilom/tripo-studio-pipeline.git $Repo
Set-Location (Join-Path $Repo 'tool')
npm.cmd ci
if (!(Test-Path config.json)) { Copy-Item config.example.json config.json }
New-Item -ItemType Directory -Force inputs | Out-Null
node src/cli.js help
```

后续步骤均从 `$Repo\tool` 运行，除非明确切换目录。重新开终端后需重新设置 `$Repo`。仓库可以放在其他盘，也支持含空格、中文的路径；传路径时保留引号。

## 2. 配置和浏览器登录（推荐工具自动启动）

```powershell
notepad config.json
```

保留示例的其他字段，先确认以下值：

```json
{
  "browserChannel": "msedge",
  "cdpEndpoint": "",
  "headless": false,
  "inputDir": "inputs",
  "profileDir": ".runtime/browser-profile"
}
```

这只是要核对的字段，**不能用它替换整个配置**，还需保留 `views`、`selectors` 等。Chrome 改为 `"browserChannel": "chrome"`。空 `cdpEndpoint` 表示工具自动启动本机浏览器，无需找 exe 路径或开放调试端口。

示例配置对应中文 Tripo 页面；英文页面使用 [主 README 的完整英文配置](../README.md#config)。不要将中英文按钮选择器混用。三视图是 `front / left / back`，每个槽位对应自己的图片。

JSON 中 Windows 绝对路径写成 `"D:/Tripo Assets/inputs"` 或 `"D:\\Tripo Assets\\inputs"`，不能写单个反斜杠。相对路径均以 **config.json 所在目录** 为基准。文件必须保存为 UTF-8；支持带 BOM 的 UTF-8，不支持 Windows PowerShell 默认重定向可能产生的 UTF-16。用 PowerShell 写 JSON 时明确 `Set-Content -Encoding UTF8`。

```powershell
node src/cli.js login --config config.json
```

在打开的专用 Edge/Chrome 窗口完成 Tripo 登录和验证码，并按终端提示结束登录命令。后续沿用 `.runtime/browser-profile` 保存的会话；不是日常浏览器个人资料。不要同时启动两个使用该目录的队列，也不要把该目录提交到 GitHub。自动启动模式下，一条命令结束后再执行下一条。

## 3. 图片、免费预览、首次生成

将真实图片放在以下结构中；头部与全身分别建目录：

```text
tool/inputs/example-head/front.png
tool/inputs/example-head/left.png
tool/inputs/example-head/back.png
tool/inputs/example-body/front.png
tool/inputs/example-body/left.png
tool/inputs/example-body/back.png
```

```powershell
node src/cli.js scan --config config.json
node src/cli.js preview --config config.json --asset example-head
```

`scan` 检查全部目录，缺图目录需要先补齐；指定 `--asset` 也不能绕过其他无效目录。`preview` 会上传图片但不点付费生成。在网页上检查三个槽位的真实缩略图，回终端按提示结束。确认输入和付费范围后，执行：

```powershell
node src/cli.js pipeline --config config.json --asset example-head --limit 1
node src/cli.js status --config config.json
```

**这条 pipeline 会消耗 Studio 积分**，自动执行 HD → Smart Low Poly 拓扑 → 纹理；配置示例为 2,000 面、2K。它不是完整人物头身交付调度器，也不会自动下载模型。人物要求的普通 Quad、头部 30,000 / 全身 10,000、4K、原 HD 归档和 GLB/OBJ 收取，须由 Skill 按人物流程执行，见 [人物工作流](character-workflow.md)。

本页命令均用单行，避免把 macOS 示例里的反斜杠续行直接粘贴到 PowerShell。需要续行时用反引号，且反引号后不能有空格。

## 4. 可选：PowerShell 启动器

从仓库根目录运行：

```powershell
Set-Location $Repo
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\invoke.ps1 status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\invoke.ps1 preview --asset example-head
```

也可把 `powershell.exe` 换成 PowerShell 7 的 `pwsh`。这里的执行策略只作用于本次进程，不修改系统策略；受组织策略管理的机器应使用上面的 `node` 命令，不改组织设置。

启动器首次发现缺配置时只创建 `tool/config.json` 和 `inputs`，随后退出，让你编辑配置；再次运行才执行命令，并在缺依赖时调用 `npm.cmd ci`。默认状态命令不会生成模型。跨工具目录可设置 `$env:TRIPO_STUDIO_QUEUE_ROOT = 'D:\tools\tripo\tool'`。自定义配置建议直接用 `node ... --config 'D:/config/tripo.json'`，避免启动器默认配置初始化带来混淆。

## 5. 可选：连接独立启动的浏览器（CDP）

自动启动模式工作正常时无需此步骤。确需保持同一浏览器窗口时，从 `tool` 目录执行以下代码，自动寻找 Edge 的常见安装路径：

```powershell
Set-Location (Join-Path $Repo 'tool')
$Candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$BrowserExe = $Candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$BrowserExe) { throw 'Edge not found; set $BrowserExe to your browser executable.' }
$Profile = Join-Path (Get-Location).Path '.runtime\browser-profile'
& $BrowserExe --remote-debugging-address=127.0.0.1 --remote-debugging-port=9223 "--user-data-dir=$Profile" 'https://studio.tripo3d.ai/workspace/generate'
Invoke-RestMethod 'http://127.0.0.1:9223/json/version'
```

先结束占用该专用 profile 的浏览器，再按此方式启动。Chrome 使用自己的 `chrome.exe` 完整路径。浏览器启动后若探测太早失败，等窗口就绪再执行最后一行。确认返回包含 `webSocketDebuggerUrl`，再将配置改为 `"cdpEndpoint": "http://127.0.0.1:9223"`。登录后仍使用前面的 `preview/pipeline` 命令；CDP 模式不会关闭外部浏览器。

不要把地址改成公网或 `0.0.0.0`，不要直接使用日常浏览器用户目录。端口冲突时浏览器参数和配置一起改成同一个空闲端口。

## 6. 安装 Skill 与交付校验

先确保 Windows 上的 agent 宿主支持本地技能及所需工具；通用 Node CLI 不依赖 Codex。建立本地目录联接，让仓库更新同步进入技能目录：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.agents\skills" | Out-Null
New-Item -ItemType Junction -Path "$env:USERPROFILE\.agents\skills\tripo-studio-pipeline" -Value $Repo
```

若目标已存在，先检查它是否已指向本仓库，不要覆盖已有技能。重新打开宿主，确认能发现 `tripo-studio-pipeline`；在聊天中调用 `$tripo-studio-pipeline`，并给出 Windows 人物项目绝对路径。不要复制原机器的 `/Users/...` 路径。具体宿主的浏览器、图像和模型工具需要单独配置，本仓库不包含这些服务的凭据。

已有完整交付文件和 manifest 后，从仓库根目录校验（替换示例项目和角色）：

```powershell
Set-Location $Repo
py -3 scripts/verify_character_delivery.py --project 'D:/Tripo Assets/character-project' --manifest deliveries/character_001/candidate-manifest.json --character '示例角色' --head-stem example-head-v1 --body-stem example-body-apose-v1 --source assets/example_actor/references/sources.json
```

Python 未提供 `py` 启动器时，确认 `python --version` 为 3.10+ 后用 `python` 替代 `py -3`。退出码 0 仅表示文件检查通过，视觉验收仍需实际看模型。

## 7. 恢复、更新和排错

- 找不到 `node/git/npm.cmd`：安装后重开终端并检查 PATH；Node 版本必须至少为 20。
- 找不到浏览器：安装 Edge/Chrome，确认 `browserChannel` 与安装的软件匹配；不用额外下载 Playwright Chromium。
- 浏览器 profile 被占用：结束同一 profile 的旧进程，再启动一次，不删除会话与断点。
- 配置 JSON 报错：检查 UTF-8 编码、路径反斜杠、尾随逗号及完整 `views`。
- 无法定位按钮：检查页面语言和当前 DOM，先修选择器并免费预览；不靠重试付费生成定位问题。
- 网络/生成超时：保留 `.runtime/state.json`、截图和已接受的 Studio ID，先在原网页查结果，再按 [恢复指南](recovery.md) 续接；不要删状态重新跑。
- 从 macOS 迁移：复制项目输入、manifest 和已有资产，修正绝对路径并重新登录；不能把另一系统的浏览器 profile 当成可靠登录迁移方案。输入签名含文件时间，复制后变化可能触发阻断，先核对已接受任务，不能清空状态绕过。

更新时在仓库根目录 `git pull --ff-only`，随后在 `tool` 执行 `npm.cmd ci`。保留本地配置、项目资产和 `.runtime`，不要用强制重置解决本地修改冲突。

## 8. 验证范围

[Windows 自动测试](https://github.com/Evilom/tripo-studio-pipeline/actions/workflows/windows.yml) 在 Windows runner 上覆盖 PowerShell 5.1 / 7、Node 20 / 22、启动器参数传递、UTF-8 BOM 与中文空格路径、真实 Edge 打开本地模拟 Studio 的上传/阶段操作，以及 Python 交付校验。它不登录真实 Tripo、不消耗积分；真实账号权限、网页最新控件和人物资产质量仍需要首次预览及实际交付验收。

本地复查：

```powershell
Set-Location (Join-Path $Repo 'tool')
npm.cmd test
Set-Location $Repo
py -3 -m unittest discover -s tests -v
```
