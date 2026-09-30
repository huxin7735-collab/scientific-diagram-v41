# 品牌 logo（brand-logos）— 只用本地内联 SVG，禁 CDN

> 本分册与同目录的 `shape-catalog.md` 同体例（用途 → 用法 → 纪律 → 待补），是其"品牌图形"侧的配套：**logo 一律走"本地 SVG → 构建期内嵌"，绝不在渲染期引用远程 URL。**
> 建立时间：2026-09-30。以下每条读数均由我本人跑命令取得。

## 用途

图里要用品牌图标（云厂商、框架、模型厂商等）时读本册：它给你 **name/slug/别名 → 可直接粘进 draw.io 的 style 串**，且**离线可用**。

## 数据与许可（必须随产物保留）

| 项 | 实测 |
|---|---|
| 数据文件 | `tools\diagrams\shapes\icons.json`，**67 条**（精选子集，非上游全量 871） |
| 字段 | `name, slug, title, category, aliases, source, license, url, style, svg` |
| 内联图形 | **67/67 条都带 `svg`**（⇒ **可离线内嵌**，无需联网） |
| 远程引用 | **67/67 条也带 `url`**（unpkg `@lobehub/icons-static-svg@1.91.0/...`）⇒ **渲染期禁用**（上游自述"联网才出图、离线是空白框"） |
| 许可 | `license: "MIT"`（lobe-icons；图标为**上游商标**） |

**商标纪律**：品牌图形**仅可指代**，**不得打包进交付产物**；确需内联时（`--embed`）须在该图 `思考过程.md` 登记，并声明"**不构成背书**"。

## 用法

```powershell
node tools\diagrams\shapes\shape-lookup.mjs openai --embed   # 输出内置 data URI 的 style（离线）
node tools\diagrams\shapes\shape-lookup.mjs gpt              # 按别名检索（aliases 含 chatgpt/gpt/openai/GPT）
```

`--embed` 的实现口径（源码 `shape-lookup.mjs:104-105`）：**优先取该条目的本地 `svg`**，套 `shape=image;html=1;imageAspect=0;aspect=fixed;image=<data URI>`；无 `svg` 时回退数据里的 `style`。

## 纪律

1. `[禁]` style 里出现 `http(s)://`（渲染期不确定 + 离线为空白）——由 `tools\diagrams\lint-drawio.mjs` 的 **`E-REMOTE-IMAGE`** 把关。
2. data URI **不得带 `;base64,` 标记**（draw.io 会在 `;` 处截断 style，导致图片失效）——由同门的 **`E-BASE64-MARKER`** 把关。
3. `SKILL.md` §7 写 image 图元样式；§8.2 **D9** 要求交付前跑 `node tools\diagrams\lint-drawio.mjs <file.drawio> --strict`；§11 已登记 lobe-icons(MIT)+simple-icons(CC0 补集) 与商标口径。

## 待补

- 上游全量 871 图标未纳入（当前 67 条精选）；扩展时用同目录 `build-data.mjs` 重新生成并**同步核对体积上限**（图标 ≤150KB，现已 153,804 B 超标）。
- `build-data.mjs` 的裁剪准则我尚未逐行复核（未复核不写成结论）。
