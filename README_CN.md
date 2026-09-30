# scientific-diagram-v41（科研流程图与技术路线图绘制 skill）

> 面向 DeepSeek V4.1（dsh）的科研绘图 skill，覆盖流程图、技术路线图、系统架构图、方法框架图、算法流程图、状态机与时序图。强调信息层级先行、正交连线、焦点克制与真实架构约束，杜绝 AI 绘图的"结构过载、斜线乱接、流向不明、想象图冒充"。附带纯标准库 Node 工具链，支持 drawio/SVG 生成、评分与彩色修订对照。

## 背景与问题

让 AI 画"科研图"时，常出现四类通病：

1. **结构过载** —— 一张图 15+ 节点、连线交叉成网，5 秒内读不出主线。
2. **斜线乱接** —— 用对角线 `<line>` 斜拉，缺少正交直角走线。
3. **流向与语义不明** —— 箭头不标数据/控制流语义，方向画反也无从发现。
4. **想象图冒充真实架构** —— 用 `generate_image` 凭空生成"看起来像"的系统图，与论文真实方法不符（属于伪证据）。

本 skill 用**确定性、约束驱动**的流程替代自由发挥：先定单一主张与信息层级，再选图类型，最后在严格预算内绘制。它是 dsh（DeepSeek Harness）的**纯提示词 skill**，针对 V4.1 的强指令遵循做了强化。

## 核心特性

- **层级先行** —— 动笔前必答"三问"；一图一主张；先产出两级主线分解（大环节 → 小环节），再放任何节点。
- **9 条硬约束** —— 未全部满足不得交付：图类型/信息层级已定、正交连线、边有语义标签、节点 ≤9 / 焦点色 ≤2、禁止想象图冒充、图可独立读懂、两级分解已落地、默认竖向（TB）排版、大步骤-小步骤容器化。
- **正交连线** —— 仅圆角直角弯（`r=8`，紧凑 `r=6`），禁止对角线。
- **边语义** —— 每条箭头带 ≤14 字符全大写流向/控制标签且方向正确（方向错＝自动不通过）。
- **信息密度预算** —— 节点 ≤9、箭头 ≤12、焦点色 ≤2；超预算自动拆"总览 + 细节"两张。
- **容器化父子步骤（§10.8 / §10.9）** —— 大步骤包含小步骤必须画成容器（分组框 / 泳道侧标签 / 侧向分叉），禁止拍平成一条链。
- **ISO 5807 图元集** —— 流程图用正确的判定菱形、起止框、处理框。
- **自检门（§8）** —— 机械门 D1–D9 + 24 条逐条清单 + 渲染-回看闭环（硬上限 2 轮）。
- **修订前后对照（§8.7）** —— `build.mjs --diff` 产出结构化对照表 + 彩色对照图（绿=新增、橙=修改/改向、紫=移动、红虚线=删除、灰=不变），直接服务审稿回修图件。
- **配套 Node 工具链** —— 纯标准库 `build.mjs` 生成 drawio / SVG / layout.json，按评分门 `--score` 打分，并产出修订对照；另含 PowerShell 助手支持 Visio/VDX 导出。
- **doc-guard 绑定（§9）** —— 可选与 `dsh-maintainer-doc-guard` 临时作用域绑定，硬约束每轮注入、调用结束清除，零影响主对话文档。

## 支持的图类型

流程图 · 技术路线图/流程 · 系统架构图 · 时序图/泳道 · 状态机 · TikZ（LaTeX 可编译矢量） · 时间线/甘特图。

## 安装（dsh）

```bash
git clone https://github.com/<你>/scientific-diagram-v41.git
# 把 skill 包（仓库根即 skill 包）拷入 dsh 的 skills 目录
cp -r scientific-diagram-v41 ~/.dsh/skills/scientific-diagram-v41
#   或拷入某个 profile：<profile>/skills/scientific-diagram-v41
dsh --dump-config   # 验证已激活；应零 "did not activate" / "waiting for"
```

仅 `SKILL.md` + `references/` 即可纯提示词使用。若要启用 `build.mjs` 工具链，还需拷入 `tools/diagrams/` 并用托管 Node 运行时执行。

## 使用方式

在 dsh 会话中自然调用，例如：

- "画一张 XX 方法的技术路线图"
- "把这段方法框架画成流程图，竖向排版"
- "审稿让我加一个子步骤，对比一下改动" → 触发 `--diff`

skill 会先问"三问"、给出图类型与焦点建议，在预算内交付，并在判 pass 前跑 §8 自检。

## 修订对照示例

```bash
cd tools/diagrams
node build.mjs --diff old.layout.json new.layout.json
# → 终端对照表 + <新图名>-diff.drawio（diagrams.net 直接打开）
```

## 仓库结构

```
scientific-diagram-v41/          # 仓库根即 dsh skill 包
├── SKILL.md                     # skill（提示词）源
├── README.md
├── README_CN.md
├── LICENSE
├── references/
│   ├── brand-logos.md
│   └── shape-catalog.md
└── tools/diagrams/              # 配套 Node 工具链（可选）
    ├── build.mjs                # drawio/SVG/layout 生成、--score、--diff
    ├── specs.mjs / specs-ref.mjs
    ├── shapes/  vendor/
    └── *.ps1                    # Visio / VDX 导出助手
```

## 第三方 / 已内置（vendored）组件

- `tools/diagrams/vendor/svgtovisio/` 是 [svgtovisio](https://github.com/McMarius11/svgtovisio)（MIT，© 2026 McMarius11）的内置副本，其 `LICENSE` 已保留，用于可选的 Visio/VDX 导出。
- `node_modules/` 已被 `.gitignore` 排除、**永不提交**。若需启用 Visio/VDX 导出，请在 `tools/diagrams/vendor/svgtovisio/` 内执行 `npm install`。核心 `build.mjs`（drawio/SVG/layout 生成、`--score`、`--diff`）为纯标准库实现，无需安装任何依赖。

## 方法论与致谢

约束体系综合自 `academic-agent-toolkit` 家族（`diagram-design`、`mermaid-diagram`、`scientific-schematics`、`paper-figure-drawio`）与 `isomoes/creating-figures`（Claude/Codex 生态），按 dsh 三键格式重写并注入 V4.1 硬约束，**非逐字搬运**。修订对照的配色与"视觉自检 ≤2 轮"上限借鉴自 `Agents365-ai/drawio-skill` 的 drawiodiff，以纯标准库 Node 重写，无 draw.io 二进制依赖。

## 免责声明

非官方社区 skill，适配 DeepSeek V4.1 / dsh，与 DeepSeek 公司无隶属关系。已在 dsh `0.1.5-rc.2` 宿主上验证。

## 许可证

MIT
