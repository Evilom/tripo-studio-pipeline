# 任务与素材包契约

这里描述扩展已经实现的版本化 JSON 导入格式。字段校验在 [policy.js](../extension/policy.js)和 [bundle.js](../extension/bundle.js)执行；当前没有独立的 JSON Schema 文件。Agent 可以按此格式构造输入，实际浏览器、费用和素材验证仍在运行时执行。

## 纯任务 JSON

可导入的示例见 [task-example.json](../extension/task-example.json)。

| 字段 | 约束与用途 |
|---|---|
| schema | 整数 1 |
| id | 1–100 个字母、数字、下划线或短横线；禁止 __proto__ / constructor / prototype。全程复用同一任务 ID |
| name | 非空名称，最多 100 字符 |
| initialBalance | 实际初始余额，非负安全整数 |
| maximumSpend | 已获准的共享总上限，正安全整数且不超过初始余额 |
| variants | 1–30 个互不重复的方案名称；每项非空、最多 80 字符、无控制字符，禁止上述三个特殊键 |
| authorization | 实际授权来源说明，非空、最多 2,000 字符；文字本身不能替代人类会话授权 |

多风格及后处理共用一个任务的 maximumSpend。同一 ID 重导入不能改变初始余额或上限；换 ID、删账本或重装扩展不构成提高授权额度的依据。新任务示例中填写的数字不授权支出。

## 自包含素材包

~~~json
{
  "format": "tripo-workflow-task-bundle",
  "version": 1,
  "task": {
    "schema": 1,
    "id": "example-task",
    "name": "示例任务",
    "initialBalance": 100,
    "maximumSpend": 20,
    "variants": ["方案 A"],
    "authorization": "替换为实际授权来源"
  },
  "stages": ["generate", "retopo", "texture"],
  "assets": [
    {
      "variant": "方案 A",
      "images": {
        "front": {
          "name": "front.png",
          "data": "data:image/png;base64,<实际图片字节>",
          "sha256": "<实际字节的64位SHA256>",
          "width": 1024,
          "height": 1024
        }
      }
    }
  ]
}
~~~

上面的图片占位符用于解释结构，不能直接导入。使用实际 PNG/JPEG 字节和对应 SHA256，避免把远程 URL 或机器路径放进 data。

- 完整 JSON 按 UTF-8 序列化后最多 8,000,000 字节。每张图片解码后为 1–2,500,000 字节，检查 PNG/JPEG 头和实际 SHA256。
- assets 至少一组、不超过方案数；variant 必须属于任务且每组互不重复。
- images 只允许 front / left / back；可以只有正面，或完整三视图。不同方向的图片字节不能完全相同。实际图像解码、尺寸、特征及朝向还要看网页预览。
- 文件名最多 160 字符，非空、不包含路径分隔符或控制字符。提供 width 时，width/height 均须为 1–8192 的整数；声明尺寸不等于实际解码尺寸。
- stages 可省略，默认 generate；否则为非空、互不重复的受支持阶段数组。当前支持 generate / retopo / texture / rig / text-motion / studio-operation，animate 仅用于已有旧动画记录。它是计划声明，不会自动启动这些阶段。

导入先完成校验，再原子保存任务、阶段和当前素材；失败不清空原任务账本。为控制 storage 配额，成功换素材会释放其他任务的图片字节，保留其预算与提交记录。原参考和素材包仍应在资产项目保存。

## 运行时事实与恢复

付费提交身份由方案、候选编号（1–99）和阶段构成；studio-operation 还包含当前路由和明确操作名称。计划 JSON 不存最终报价，也不能证明阶段执行成功。

每次预览/提交读取实际 URL、模型 ID、输入哈希、设置、余额和报价。按未取消记录的预留总额、相对初始余额的实际支出、支出高水位的最大值计预算。这样会保守计入同账号其他操作，不因充值或余额回升降低已计支出。

submitting / uncertain 会阻止新的付费操作；已接受阶段不能重复提交。只有明确在点击前取消的记录可重新准备。接受后保存可见 task/model ID 的真实来源及余额差额，不能把模型 ID 冒充任务 ID。

导出记录独立于付费账本：绑定原模型/标签页、文件名、格式、骨骼、动作数、分辨率和短时窗口。保存 Chrome 下载编号、最终文件名和无签名参数的来源；未知结果先查已有下载与磁盘文件。实际完整记录留在资产项目，公共仓不收集账号、素材、真实任务 ID 或签名地址。
