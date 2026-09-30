# 形状速查（shape-catalog）— 官方 style 串优先，禁止手写猜形状

> 本分册是 `SKILL.md` §10.10 的补充资料：**凡能检索到官方 style 的图元，一律用检索结果，不手写 `shape=mxgraph.*` 或凭印象拼 style 串。**
> 口径来源（原文）：`Agents365-ai/drawio-skill` 的 `references/shapes.md:9–13` —— "Always prefer a searched style over a hand-written `shape=mxgraph.*` guess"。
> 体例先例：本 harness 已运行的 `agent-reach/references/*.md`（"用途 → 用法/命令 → 纪律"三段式），本册沿用该体例。
> 建立时间：2026-09-30。**本文件内的每一条 style 均由我本人跑命令复核**（命令见下），未复核的一律不写。

## 用途

画流程图/技术路线图时需要**确定某个图元的 drawio `style` 串与默认尺寸**时读本册；它替掉"凭印象拼 `shape=mxgraph.*`"的做法（拼错会静默渲染成空白框）。

## 用法：怎么查

**当前（无需 Python，node 内置 zlib）**：直接查官方形状索引（Apache-2.0，须附其 NOTICE）：

```powershell
$S = 'D:\xiazhai\合成skill-准备\技能参考库\所有的skill\Agents365-ai__drawio-skill\skills\drawio-skill'
node -e "const z=require('zlib'),f=require('fs');const j=JSON.parse(z.gunzipSync(f.readFileSync(process.argv[1])));const q=process.argv[2];for(const r of j.filter(r=>((r.title||'')+' '+(r.tags||'')).toLowerCase().includes(q)).slice(0,5))console.log(r.style+'  |  '+r.w+'x'+r.h+'  |  '+r.title);" "$S\data\shape-index.json.gz" diamond
```

实测该索引：`shape-index.json.gz` **436,148 B** → 解压 **4,776,086 B**、**10,446 条**；单条字段仅 `{style,w,h,title,tags,type}`，`type∈{vertex,edge}`，**`tags` 是空格分隔字符串（不是数组）**（我的复核读数）。

**将来（待落地 T1）**：`node tools\diagrams\shapesearch.mjs "<关键字>"`（索引搬到 `tools\diagrams\data\` 并附 NOTICE；支持别名与音码近似）。

## 已复核的常用图元（我本人读数）

| 语义 | 官方 style 串 | 默认 w×h | title |
|---|---|---|---|
| 判定（菱形） | `rhombus;whiteSpace=wrap;html=1;` | 80×80 | Diamond |
| 数据库/圆柱存储 | `shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;` | 60×80 | Cylinder |
| 数据存储（简化） | `shape=datastore;whiteSpace=wrap;html=1;` | 60×60 | Data Store |
| 文档 | `shape=document;whiteSpace=wrap;html=1;boundedLbl=1;` | 120×80 | Document |
| 文档（备选） | `whiteSpace=wrap;html=1;shape=mxgraph.basic.document` | 100×100 | Document |

## 纪律

1. **先查后写**：图元 `style` 必须来自本册或检索结果；`[禁]` 凭印象拼 `shape=mxgraph.*` 或猜 style 串。
2. **凡 `shape=mxgraph.*` 或非白名单 style，必须能在索引里命中**（拟设为 §8.2 的 **D9 门**；未实现前按本册人肉核）。
3. **尺寸取索引默认 w×h**，再按 §10.5「同类型同尺寸」与 §10.4 对齐口径调整；不得只抄 style 不抄尺寸。
4. **许可与归属**：形状索引 **Apache-2.0**（搬运须附 `SHAPE-INDEX-NOTICE.md`）；品牌 logo 图形为**上游商标，仅可指代、不得打包进产物**（确需内联时按 §8.5 第 7 条在 `思考过程.md` 登记并声明"不构成背书"）。

## 待补

- 同法复核并补入：起止/终止符、流程、子流程、准备、手工操作、输入/输出、注释/便签、连接点、UML 原语、容器、边（REF 的 `references\shapes.md:84–141` 有对应清单，但**其数值与 style 我尚未逐条复核**，不并入本册）。
- 与 `references\brand-logos.md`（logo 清单与商标口径）配套；本册只管形状，不管品牌图形。
