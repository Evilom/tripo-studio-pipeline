# Tripo Studio Pipeline

一个非官方的 Codex Skill 和本地浏览器队列，通过 Tripo Studio 的可见网页界面顺序执行：

```text
多视图 HD → Smart Low Poly v2 → 8K 纹理
```

它使用 Studio 会员积分，不需要 Tripo API，也不读取或复刻网页内部请求。

## 安装

需要 Windows、Node.js 20+，以及已安装的 Edge 或 Chrome。

```powershell
git clone https://github.com/Evilom/tripo-studio-pipeline.git "$env:USERPROFILE\.codex\skills\tripo-studio-pipeline"
cd "$env:USERPROFILE\.codex\skills\tripo-studio-pipeline\tool"
.\start.ps1 status
```

首次运行会创建本地 `config.json` 和 `inputs/`。之后在专用浏览器窗口登录一次：

```powershell
.\start.ps1 login
```

## 使用

每个资产对应 `tool/inputs/` 下的一个子目录。默认采用 `front.png`、`left.png`、`right.png` 三视图。

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

也可以在 Codex 中直接调用：

```text
$tripo-studio-pipeline 扫描三视图素材
$tripo-studio-pipeline 先完整跑一个
```

## 安全边界

- 每次付费点击前写入断点；无法确认时停止，不自动重复扣费。
- 不绕过 CAPTCHA、并发、登录或积分限制。
- `tool/config.json`、`tool/.runtime/`、`tool/inputs/`、浏览器 Profile 和 `node_modules/` 均被 Git 忽略。
- Studio 的页面结构和积分价格可能变化；批量运行前先用一组素材验收。

详细参数和异常恢复方式见 [tool/README.md](tool/README.md)。

Tripo 及相关商标归其权利人所有；本项目与 Tripo 官方无隶属或背书关系。
