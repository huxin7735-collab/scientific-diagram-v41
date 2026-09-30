# tools/diagrams/shapes — 官方形状/图标子集与检索

本目录把**官方 draw.io 形状库**与**品牌图标清单**落成本仓可离线检索的静态数据，替代"凭印象拼 `shape=mxgraph.*`"的做法（拼错会静默渲染成空白框）。

## 数据来源与许可（必须随产物保留）

| 数据/脚本 | 来源 | 许可 |
|---|---|---|
| `shape-index.json` | `jgraph/drawio-mcp` 的官方形状索引（由 draw.io 官方形状库生成；上游 `Agents365-ai/drawio-skill` 的 `data\shape-index.json.gz` = 436,148 B → 解压 4,776,086 B、**10,446 条**，单条字段 `{style,w,h,title,tags,type}`，`tags` 是**空格分隔字符串**） | **Apache-2.0** —— 搬运须附 `SHAPE-INDEX-NOTICE.md` |
| `icons.json` | `lobe-icons`（上游 `data\lobe-icons.json`，871 条图标名 / 约 311 个品牌基名）＋ `databricks-architecture-icons`（上游 `data\databricks-icons.json`，71 个产品，按 `pinnedRef` 取不可变 commit）＋ simple-icons 补集（lobe 清单里没有 postgresql / mongodb / docker / kubernetes / databricks / pytorch 等）。**两个上游清单都只有名称、没有图形数据**，故本文件已联网抓回并内嵌最小化 SVG（width/height 归一 48） | **MIT**（lobe）/ **CC0-1.0**（simple-icons）；**图形本身为各品牌商标** |
| `shape-lookup.mjs` / `build-data.mjs` | 本仓自研（口径参考 `Agents365-ai/drawio-skill`，MIT） | 随本仓 |

> **商标口径**：品牌图形**仅可指代**，**不得打包进交付产物**；确需内联时用 `--embed` 生成内嵌 data URI，并在该图 `思考过程.md` 登记且声明"不构成背书"。
> **禁 CDN**：上游自述"CDN 引用在渲染期需联网、离线导出会画成空白框"⇒ 本仓只允许构建期 `--embed` 内联。（`icons.json` 的 `style` 字段默认是 CDN URL，仅用于在线预览；交付件与离线图必须用 `--embed` 生成 data URI —— 内嵌的 `svg` 字段就是为此准备的。）

## 用法

```powershell
node tools\diagrams\shapes\shape-lookup.mjs diamond
node tools\diagrams\shapes\shape-lookup.mjs database --limit 3
node tools\diagrams\shapes\shape-lookup.mjs 判定 --json
node tools\diagrams\shapes\shape-lookup.mjs openai --embed   # 图标改为内嵌 data URI 的 style（离线可用）
```

支持 `--limit N`、`--json`、`--embed`；**零新依赖**（仅 node 内建 `node:fs`/`node:path`/`node:url`）。

## 已复核的真实输出（2026-09-30）

```
=== diamond ===
# 命中 形状 1 / mermaid 0 / 图标 0 条，每类最多显示 8 条，下面列出 1 条
Diamond | rhombus;whiteSpace=wrap;html=1; | core · decision
=== database --limit 4 ===
# 命中 形状 11 / mermaid 0 / 图标 0 条，每类最多显示 4 条，下面列出 4 条
Cube | shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1; | core · storage
Cylinder (数据库) | shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15; | core · storage
Cylinder Stack | shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;lid=0; | core · storage
Data Store | shape=datastore;whiteSpace=wrap;html=1; | core · storage
=== flow --limit 3 ===
# 命中 形状 11 / mermaid 0 / 图标 4 条，每类最多显示 3 条，下面列出 6 条
Arrow | shape=flexArrow;endArrow=classic;html=1; | core · connector
Apache Airflow | shape=image;html=1;imageAspect=0;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;image=https://cdn.simpleicons.org/apacheairflow | icons/simple-icons · https://cdn.simpleicons.org/apacheairflow
=== 无命中样例 ===
未找到 "zzzquux"。
可用的近似项：
  Sequential Data | strokeWidth=2;html=1;shape=mxgraph.flowchart.sequential_data;whiteSpace=wrap; | mxgraph.flowchart · data
```

## 体积与裁剪

| 文件 | 当前字节 | 上限/状态 |
|---|---|---|
| `shape-index.json` | 39,278 | ≤200KB ✔（82 条形状） |
| `icons.json` | 150,413 | ≤150KB ✔（146.9KB，67 条图标；`_meta.finalBytes` 与实际字节数自洽） |
| `shape-lookup.mjs` | 6,826 | — |
| `build-data.mjs` | 44,824 | —（生成器；重跑会联网重抓 SVG，字节数随上游 CDN 浮动） |

**裁剪准则（已逐行复核，2026-09-30）**

- 形状：只保留科研流程图 / 技术路线图会落笔的 12 族共 82 条 —— `terminator` 起止、`process` 流程（含 `Predefined Process` 子流程、`Sub-Process (Collapsed)`）、`decision` 判定、`data` 数据/输入输出、`document` 文档、`manual` 手工、`preparation` 准备、`connector` 连接点与汇聚、`storage` 存储/数据库、`annotation` 注释/便签、`basic` 底盘、`capsule`（mermaid 胶囊，派生）。
- 形状：**整族剔除**领域专用库（AWS / Azure / GCP / 阿里云 / Cisco / Citrix / Office / archimate / mockup / 电气 / P&ID / 网络设备 / 符号图标等）。
- 形状：同名多库条目**按 style 最短者取一条**（`Database` 全库 15 条同名，靠 `shape=mxgraph.flowchart.database` 锁定流程图库那条）；连线额外要求 style **不含 `mxgraph.`**，以排除 UML/BPMN/网络库同名连线。
- 形状：实测 39,278 B（上限 200KB），**远低于门限，故未按命中率二次裁剪**。
- 图标：每品牌只留 1 条（mono/color/text 变体取最常用的一种），minify 后内嵌 SVG；按"高价值品牌白名单优先 + 预算超出时从当前最大一档尾部逐条删"收敛到 150,413 B。
- 图标：上游无图形可取的品牌不入候选（weaviate / pinecone / chroma / dbt / drawio / graphviz / plantuml / oracle / ibm / matplotlib 等）；simple-icons 的 elsevier 单条 54KB 被排除，避免一条吃掉 1/3 预算；`matlab` 实测 404 记入 `_meta.skipped`。

**字段说明（形状）**：`name`（官方 title，同名加括号消歧）/ `nameU`（由 name 派生的驼峰标识，**上游索引无此字段，是本仓派生的**）/ `style`（可直接粘进 draw.io 单元格 style 的原串；`source=derived` 的条目为按 mermaid 语法补齐）/ `w` `h` `type`（vertex/edge）/ `aliases`（英文 tag＋中文别名＋mermaid 记号）/ `category` / `source`（`core`｜`mxgraph.<lib>`｜`derived`）。
**字段说明（图标）**：`slug` / `title` / `category` / `aliases`（含 Databricks 产品的重命名别名，如 DLT）/ `source` / `license` / `url` / `pinnedRef`（Databricks）/ `style`（CDN URL 版）/ `svg`（内嵌最小化 SVG，供 `--embed` 生成离线 data URI）。另有 `_meta.mermaidFlowchartMap`：mermaid flowchart 语法 → 本文件形状名。

## 相关

- 速查册（skill 侧）：`D:\xiazhai\deepseek\.dsh\skills\scientific-diagram-v41\references\shape-catalog.md`
- 使用纪律：`SKILL.md` §10.10（图元集，判定行已用官方 style 串）、§8.2 **D9 门**（待实现：非白名单 style 必须能在索引里命中）、§11 溯源表（已登记 Apache-2.0/MIT）
