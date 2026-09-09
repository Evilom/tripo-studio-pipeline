# 交付记录与校验

用于人物双资产文件齐备候选。自动校验只验证文件和映射；原片还原度、姿势、缺陷、Wrap、骨骼与动画验收需要实际证据。

## 目录及 13 项文件

输入 ID 用下划线，模型 stem 用连字符；头部和全身分别指定，不能由上一角色清单盲目替换。

| 角色文件 | 用途 |
|---|---|
| `assets/<actor_slug>/references/sources.json` | 身份、原片、真实帧、推断与排除项 |
| `models/<stem>-hd.glb` | 独立保留原 HD |
| `models/<stem>-retopo-4k.glb` | 纹理拓扑模型 |
| `models/<stem>-retopo-4k-obj.zip` | 原生 OBJ、MTL、实际贴图 |
| `models/<stem>-native-diagnostic.json` | 原生面型、边界、非流形、UV 诊断 |
| `models/review-<stem>/validation.json` | HD 渲染/诊断记录 |
| `models/review-<stem>-retopo/validation.json` | 拓扑渲染/诊断记录 |

头、身各 6 项，加共同 sources.json，共 13 项。`4k` 是命名和颜色贴图目标，不代表所有贴图都是 4K；其他项目可使用校验器的 `--texture-label 2k/8k`。原始参考、六张输入图、全部正侧背渲染与脸部近景、下载原件、checkpoint/history 也必须保留，但不挤入这 13 项核心清单。

角色交付目录保存 `candidate-manifest.json`、`visual-review.json`、`README.md`。manifest 最小形式：

```json
{
  "character": "示例角色",
  "status": "dual_assets_exported_candidate_with_recorded_defects",
  "files": [
    {"path": "models/example-head-v1-hd.glb", "bytes": 1234, "sha256": "实际64位SHA256"}
  ],
  "visual_review": {
    "head_HD_seen": false,
    "head_topology_seen": false,
    "body_HD_seen": false,
    "body_topology_seen": false
  },
  "limitations": [],
  "final_acceptance": "pending"
}
```

示例只展示一项；实际必须列全 13 项并填写真实大小/哈希。保持现有项目 schema，不为套示例删除既有字段。分别记录 `head_project_id`、`body_project_id`、实际 HD 面数、原生 `face_sides`、贴图名/宽高、姿态观察与未解决问题。真实 ID 和材料仅保存在用户项目，不放入公共 skill 仓库。

## 文件校验命令

Python 3.10+，仅标准库。从 skill 仓库根运行：

```sh
python3 scripts/verify_character_delivery.py \
  --project /path/to/character-project \
  --manifest deliveries/character_001/candidate-manifest.json \
  --character '示例角色' \
  --head-stem example-head-v1 \
  --body-stem example-body-apose-v1 \
  --source assets/example_actor/references/sources.json
```

输出 JSON 和退出码：0 表示本次文件检查通过，1 表示文件/映射问题，2 表示命令参数错误。不会修改 manifest 或 `*_seen`，不会给出自动视觉通过。可将输出保存到新的项目验证记录，别覆盖原始交付文件。

检查内容：精确 13 项路径/角色映射、文件存在/非空、大小与 SHA256、GLB v2 头和 chunk 边界、ZIP CRC、原生 OBJ 面型、OBJ→MTL→贴图引用、PNG/JPEG 头部尺寸，以及同一项目其他 `deliveries/character_*/candidate-manifest.json` 中重复的 GLB 路径。符号链接不能逃出项目或让本人的多个 GLB 指向同一个文件。非标准交付目录可用重复的 `--peer-manifest` 指定其他清单。相同内容被改名复制、身份错误或图像质量仍须人工/agent 核验；路径查重和图片头部读取不能替代实际解码与观察。

原生诊断的 `face_sides` 要与 ZIP 内真实 OBJ 一致。脚本不重算边界、非流形和 UV，不把已存在的 diagnostic 当作这些指标已验证。已有项目可使用其 `tools/inspect_obj_archive.py`；新项目用建模工具检查并记录实际指标。颜色/法线尺寸从实际图片读取，不能从 Export 选项抄写。

## 视觉观察

头/身、HD/拓扑四组都保留正、左、背及脸部近景，并实际看图。按各视角包围盒宽高取景，A-Pose 不裁手脚；宽帽灯光按模型尺度调整，帽檐阴影可增加低位预览补光，不因此修改原模型。

Blender 若已安装，可用项目中的已核对渲染脚本：

```sh
/path/to/blender -b -t 4 --python tools/VERIFIED_RENDER_SCRIPT.py
```

查看日志、validation 和实际渲染文件；进程返回 0 不能替代检查 Python 错误或缺图。渲染未变且已经看过时，不重复渲染来制造进度。

重点记录脸型/五官、毛发/头饰、同服装、明显缺口和破面、手指/手掌/双腿间隙、袍内结构。头身独立归一化时说明方向与比例，自动全身头像若弱于独立高清头像写明差异，不宣称已焊接、Wrap 或绑定通过。

## 同步进度

一人收齐后同步角色 README、manifest、visual-review、`deliveries/README.md`、`roster.json` 和 `PROGRESS.md`。后两者沿用原 schema。记录：本次实际落盘、已实际观察的视角、缺陷、最后接受阶段、下一位/下一步。

区分文件齐备候选、明显问题待处理和最终通过；`*_seen=true` 仅表示看过，不代表无缺陷。宽袍遮挡、A-Pose 角度不足或手指靠近不能被“已导出”掩盖。保留 HD 后推进批次，不因小瑕疵重生成；批次结束仍需按用户规格处理最终验收和待处理项。
