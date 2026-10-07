# 低模精简打包

[package_low_delivery.py](../scripts/package_low_delivery.py)只收集显式计划中的文件，不扫描原高模、账本或全部下载目录。GLB保留内嵌材质；可选一个原生二进制FBX和对应.fbm图片。引用图片和最多六张真实预览按需加入。原件留在资产项目。

复制[示例计划](../examples/delivery-plan.example.json)到资产项目，修改为真实相对路径；没有FBX、参考或预览时删掉对应字段。所有输入位于同一资产根目录内，路径禁止跨出根目录及符号链接。

~~~powershell
python scripts/package_low_delivery.py --plan 'D:/assets/example/delivery-plan.json' --root 'D:/assets/example' --output 'D:/assets/example/game-low-v1.zip'
~~~

默认限制为20,000三角、每张贴图最大2048、最终包20,000,000字节。这是游戏低模交付的起点，按本次规格在limits中明确修改；不能将该默认值套到人物高清头部或其他DCC用途。超过限制报错，不自动减面、缩图或重新生成。

| 字段 | 用途 |
|---|---|
| schema | 整数1 |
| name | 最多100字符的非空交付名称 |
| lowGlb | 必需的自包含GLB相对路径；检查实际几何、图片及可用的骨骼/动作数据 |
| editSource | 可选fbx与textureDirectory；同级且目录名为FBX文件stem加.fbm，保留原生相对组织 |
| reference | 可选PNG/JPEG参考 |
| previews | 可选PNG/JPEG预览数组，最多6张 |
| limits | 可选maxTriangles / maxTextureSize / maxArchiveBytes正整数 |

包中有model/、可选edit-source/、reference/和previews/，并生成MODEL-REPORT.json、MANIFEST.json、SHA256SUMS.txt。不会添加高模目录、重复原生ZIP或GLB外置贴图。通过检查的输入按原字节保存；FBX二进制头与图片尺寸检查不证明FBX材质语义或与GLB对应关系，需原模型记录及DCC检查。

脚本先在输出目录创建partial包，完成ZIP CRC与清单哈希核对后，用同目录硬链接发布完整文件，拒绝覆盖既有版本。输出文件系统须支持硬链接；失败时报告原因，原件与既有输出保留。

脚本仅负责本地文件。Drive上传、权限核对、授权通知和接收方领取回执由Agent依照[生产管线](production-pipeline.md)完成，不在脚本中存储连接凭据。文件结构通过不等于美术、动作或游戏运行验收。
