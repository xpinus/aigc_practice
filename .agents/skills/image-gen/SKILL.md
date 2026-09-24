---
name: image-gen
description: 通过 ofox.ai 代理或 OpenAI 官方 API 调用 GPT-Image 系列模型生图或改图。用户需要文生图、图像编辑、透明背景素材、产品图、海报、头像等位图资产时使用；支持中英文提示词，默认走 ofox 代理、无需海外网络。
license: MIT
metadata:
  author: ofoxcoding
  version: "2.0"
  rewrittenFrom: "system imagegen skill (C:/Users/pinus/.codex/skills/.system/imagegen/SKILL.md)"
  generatedBy: "Codex"
---

# 图像生成技能（image-gen）

通过 OpenAI 兼容的 Images API 生成或编辑图像。默认后端为 ofox.ai 代理（无需海外网络），缺失时自动回退 OpenAI 官方 API。本技能是系统 `imagegen` 技能在项目内的可执行通道：规则冲突时以系统技能为准，本技能负责后端接入与 `generate.py` CLI。

## 双模式与路由规则

- **内置工具模式（优先）**：会话提供内置 `image_gen` 工具时，默认用它完成生成、编辑与透明背景请求，无需任何 API key。
- **CLI 模式（本技能 `generate.py`）**：仅当用户明确要 CLI/API/模型控制，或内置工具不可用且用户确认后使用；需要 `OFOX_API_KEY` 或 `OPENAI_API_KEY`。

路由红线：
- 不为普通的质量、尺寸、保存路径控制而切到 CLI 模式。
- 本技能只启用 `gpt-image-2`；不静默切换到任何其他模型。用户明确点名其他模型时，告知其不在本技能支持范围并确认是否改走其他路线。
- 多资产请求按"每个资产/提示词一次调用"执行；`--count` 只用于同一提示词的多个变体。
- 内置工具不可用时，告知用户本技能 CLI 通道存在且需要 API key，用户确认后才继续。

## 模型与透明背景事实（重要）

| 模型 | 用途 | background=transparent |
|------|------|------------------------|
| gpt-image-2 | 本技能唯一启用模型（默认生成/编辑） | **preview 阶段支持**：成败取决于调用方式/后端，产物必须实测 alpha；失败走"实底 + 抠图" |

- 透明背景资产：优先内置 `image_gen` 请求真实透明并保留 alpha；CLI 模式用 `gpt-image-2 --background transparent`。
- `gpt-image-2` 的透明背景为 **preview 特性**（OpenAI API 参考标注 in preview）：同一参数在不同调用方式/后端（官方 API、代理、ChatGPT 通道）可能成功、报错或返回实底；使用后必须校验产物 alpha。`generate.py` 对 transparent 请求自动做 alpha 校验汇报（装有 PIL 时）。
- 注意：`background=transparent` 可能同时轻微改变 gpt-image-2 的渲染风格，验收时一并检查主体边缘与质感。
- 透明失败（报错或返回实底）时：先重试或换调用方式/后端；仍失败走备选路线 = 纯实底背景生成（深色主体推荐纯白底）+ 本地几何抠图合成 RGBA PNG；不要用提示词写"透明背景"来假装透明。

## 后端与鉴权

解析顺序：
1. `OFOX_API_KEY`（可选 `OFOX_BASE_URL`，默认 `https://api.ofox.ai/v1`）—— ofox 代理，一个 key 访问 50+ 模型，无需海外网络。
2. `OPENAI_API_KEY`（可选 `OPENAI_BASE_URL`）—— OpenAI 官方 API。
3. 两者皆无：`generate.py` 打印设置指引并以非零码退出。

设置示例（Windows PowerShell）：

```powershell
[Environment]::SetEnvironmentVariable("OFOX_API_KEY", "your-key", "User")
```

- 绝不要求用户在对话中粘贴完整密钥；只请其本地设置并确认。
- ofox 路由 ID 带 `openai/` 前缀（如 `openai/gpt-image-2`）；`generate.py` 在 ofox 后端自动完成映射，无需手填。

## generate.py 用法

```bash
# 单张
python .agents/skills/image-gen/scripts/generate.py "A cute cat sitting on a windowsill"

# 自定义参数
python .agents/skills/image-gen/scripts/generate.py "Futuristic city skyline" --size 1536x1024 --quality high --output city.png

# 同一提示词多变体
python .agents/skills/image-gen/scripts/generate.py "Beautiful sunset" --count 3 --output ./sunset_images/

# 原生透明背景（preview 特性；auto 策略：原生优先，翻车自动白底+几何抠图）
python .agents/skills/image-gen/scripts/generate.py "A red apple" --background transparent --output apple.png

# 透明 + 直接交付 2K（原生尺寸不足时 Lanczos 放大）
python .agents/skills/image-gen/scripts/generate.py "A red apple" --background transparent --size 1536x1536 --target-size 2048x2048 --output apple.png

# 跳过原生透明，直接白底 + 几何抠图（最稳路线）
python .agents/skills/image-gen/scripts/generate.py "A red apple" --background transparent --transparent-strategy cutout --output apple.png
```

## API 参数规范

| 参数 | 类型 | 必填 | 说明 | 默认 |
|------|------|------|------|------|
| model | string | 否 | 模型 ID（本技能固定 gpt-image-2） | gpt-image-2 |
| prompt | string | 是 | 图像描述（中英文均可） | 必填 |
| n / --count | integer | 否 | 同一提示词的变体数（1-10） | 1 |
| size | string | 否 | 输出尺寸（约束见下） | 1024x1024 |
| quality | string | 否 | low / medium / high / auto | auto |
| response_format | string | 否 | 固定 b64_json，由脚本解码落盘 | b64_json |
| background | string | 否 | auto / transparent / opaque；transparent 为 gpt-image-2 的 preview 特性 | auto |
| --transparent-strategy | string | 否 | auto / native / cutout（仅 transparent 时生效） | auto |
| --ladder | string | 否 | auto / off：连接类错误的降级梯 | auto |
| --target-size | string | 否 | 最终交付尺寸 WxH；不一致时 Lanczos 放大 | 无 |
| moderation | string | 否 | 内容审核级别 | auto |

gpt-image-2 尺寸硬约束（脚本客户端前置校验）：
- 最大边 <= 3840px；两边均为 16 的倍数；长短边比 <= 3:1；总像素在 655,360 与 8,294,400 之间。

常用尺寸：
- 1024x1024 方形（草稿最快）
- 1536x1024 横 / 1024x1536 竖
- 2048x2048 2K 方形 / 2048x1152 2K 横
- 3840x2160 4K 横 / 2160x3840 4K 竖
- auto 由模型自决

quality 选择：
- low：草稿、缩略图、快速迭代
- medium / high / auto：最终资产、密集文字、图表、身份敏感编辑、高分辨率输出

## 鲁棒生成管线（generate.py 内置默认）

- **降级梯（--ladder auto）**：仅对连接类错误（连接被切断/连接失败）自动降档重试，最多 3 次；序列为「原配置 → medium@≤1.5MP → low@≤1.5MP」——先缩尺寸再降质量（代理多按 质量×像素 预算切断长任务）；HTTP 4xx 等业务错误不降档、直接失败。`--ladder off` 关闭。
- **透明 auto 策略（--transparent-strategy auto）**：先走原生 transparent → 落盘后 alpha 校验 → ceiling 250-254 自动归一化为 255 → 若完全 opaque 则自动「白底再生 + 几何圆角矩形抠图」原地替换；`native` 只走原生、`cutout` 跳过原生直接白底+抠图。
- **几何抠图**：拟合圆角矩形轮廓、8 倍超采样抗锯齿 alpha、边缘白底反混合去光晕、产物居中；依赖 opencv-python + numpy，缺失时保留 opaque 图并告警。
- **--target-size**：最终资产尺寸与生成尺寸不一致时用 Pillow Lanczos 放大/缩放到目标。
- **依赖**：openai 必需；Pillow 可选（alpha 校验/归一化/缩放）；opencv-python + numpy 可选（抠图回退）。
- **trace 输出**：`[backend] [ladder] [alpha] [fallback] [resize] [saved]` 全链路打印到 stderr，stdout 只打印最终绝对路径。
- **代码结构**（`scripts/` 目录，单责模块）：`generate.py` CLI 编排入口；`common.py` 后端/密钥/路由 ID 映射；`sizing.py` 尺寸校验与降级梯；`alpha.py` alpha 校验/归一化/缩放（Pillow 可选）；`cutout.py` 几何抠图（opencv+numpy 可选）。

## 提示词规范（移植自系统技能，精简版）

带标签模板（只取有用的行）：

```text
Use case: <场景 slug，如 product-mockup / logo-brand / infographic-diagram>
Asset type: <资产将用在哪里>
Primary request: <用户主诉求>
Scene/backdrop: <环境>
Subject: <主体>
Style/medium: <照片 / 插画 / 3D 等>
Composition/framing: <宽景 / 特写 / 俯视；摆放>
Lighting/mood: <光照与情绪>
Color palette: <色板说明>
Materials/textures: <表面细节>
Text (verbatim): "<必须逐字出现的文字>"
Constraints: <必须保持 / 必须满足>
Avoid: <负面约束>
```

规则：
- 图内文字：加引号并指定字体、颜色、位置；生僻词逐字母拼写；要求逐字渲染、不得多出字符。
- specificity 政策：用户提示已详细时只规范化/结构化，不加创意要求；提示泛时仅在明显有益时补充构图、用途、布局信息。
- 不添加请求未暗示的人物、道具、品牌叙事或色板。
- 编辑类请求：显式列出不变量（`change only X; keep Y unchanged`），每次迭代复述。
- 多张输入图：按索引标注角色（编辑目标 / 风格参考 / 合成素材）。
- 迭代：一次只做一个定向修改，不整段重写提示词。

## 输出与保存策略

- 项目资产必须落盘到工作区并汇报最终绝对路径；不得只留临时副本。
- 中间文件放 `tmp/`，用完即删；最终产物用稳定、可描述的文件名；CLI 默认输出目录为 `output/image-gen/`。
- 不覆盖既有资产（除非用户明确要求替换）；否则在同目录加 `-v2` 后缀。
- 结束时汇报：保存路径、最终提示词、所用通道（内置工具 / CLI）。

## 故障排查

- ofox 通道生图请求连接被切断但 `/models` 正常：ofox 使用带 `openai/` 前缀的路由 ID，裸 ID 会被切断连接；`generate.py` 已自动映射，手工调 API 时须用带前缀 ID。
- ofox 长任务切断（实测）：`quality=high` 且 2K 尺寸（如 2048x1280）的同步请求会在约 90-180s 被上游切断（`Server disconnected without sending a response`）；`medium` + 1536x960 及以下组合可稳定完成。该故障已由降级梯自动处理（第二档即 medium@≤1.5MP）；需要原生 2K/high 时改走官方后端。
- ofox 透明 preview 实测：低成本组合（如 low + 1024x1024）下透明可用——背景 alpha=0、主体 alpha 上限约 254（非 255）；`generate.py` 的 alpha 校验将此判为 transparent OK 并提示 ceiling。
- 超时：生图可能耗时数十秒，脚本默认 timeout=120s；high + 大尺寸组合超时时降级 medium 或提高 timeout。
- 引号/JSON：一律经 OpenAI SDK 序列化，不手工拼接 JSON 字符串。
- 中文提示：支持但偶有不稳；关键资产建议"中文主体 + 英文风格词"或纯英文并对比结果。
- 缺密钥：按"后端与鉴权"设置 `OFOX_API_KEY` 或 `OPENAI_API_KEY` 后重开终端。
- 透明背景返回实底或报错：属 gpt-image-2 preview 特性的调用方式差异（官方 API 成功率高于部分代理/通道）；可重试或换调用方式/后端；仍失败则走"实底 + 抠图"备选路线。

## 参考

- ofox.ai 控制台：https://ofox.ai
- 原始教程：https://blog.csdn.net/ofoxcoding/article/details/160450155
- OpenAI Images API：https://platform.openai.com/docs/api-reference/images
- 系统 imagegen 技能（规则来源）：C:/Users/pinus/.codex/skills/.system/imagegen/SKILL.md

注：若本技能未出现在会话技能列表（工作区 `.agents/skills` 未被自动加载），可按显式路径引用调用（如 `$image-gen` + 本文件路径）。
