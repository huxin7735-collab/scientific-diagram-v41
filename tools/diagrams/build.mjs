// build.mjs — 确定性 SVG / draw.io 生成器 + skill §8/§10 几何自检
// 用法：node tools/diagrams/build.mjs
// 设计依据：scientific-diagram-v41（2026/9/28 22:00:57 版）
//   §10.8 层级分组：大步骤-小步骤从属必须容器化，禁止拍平成同层单链
//   §10.0 方向基准：默认竖向 TB（layer→y、col→x），仅 ≤4 节点极短链或用户明确要求才用 LR
//   §10.4 间距基准：节点 240×64 时 层距 G≥112、列距 W≥336
//   §7    drawio 契约：换行单层实体 &#xa; + html=1；锚点由 SVG 折线反推（exit/entry + *Perimeter=0 + *Dx/*Dy 外让）+ 回读校验 + 分支拐点
import fs from 'node:fs';
import path from 'node:path';

// 两套图集共用同一核心：--set=case（默认，输出 结果/）| --set=ref（输出到 参照物/2021_E*/）
const SET = (process.argv.find((a) => a.startsWith('--set=')) || '--set=case').split('=')[1];
/* ===== P1-③ --diff：只读两个 layout.json 做 id 对齐比对，**不进入构建**、不写任何文件。
   position：必须放在 import specs 之前——diff 不需要任何图集，跳过 import 才不会让 specs 的
   读盘/校验副作用掺进一次纯文本比对；runLayoutDiff 是函数声明（提升），故可在定义之前调用。
   退出码：0 = 比对完成（有差异也是 0）；2 = 用法/读盘/JSON 解析错误。 ===== */
{
  const at = process.argv.indexOf('--diff');
  if (at >= 0) process.exit(runLayoutDiff(process.argv[at + 1], process.argv[at + 2]));
}
const { figures } = await import(SET === 'ref' ? './specs-ref.mjs' : './specs.mjs');

/* ---------- 布局常量（全部为 4 的倍数，满足 §7 的 4px 网格） ---------- */
const NW = 240, NH = 64;          // 节点统一尺寸（§10.5）
const NH_SUB = 40;                // §10.8 侧挂小步骤取 60% 尺寸（容器内子步骤）
const GAP_SUB_MOD = 16;           // 容器内子步骤间距
const GAP_BAND = 96;              // 层与层之间的固定间距
const TRUNK_ARM = 48;             // §10.8 分叉：父节点右缘到竖干的短横杆长度
const LAYER = 112;                // 层距 G（§10.4：节点 240×64 时 G≥112）
const CROSS = 336;                // 交叉轴距 W（§10.4：W≥336）
const M = 48, R = 8;
const CPAD = 12;                  // 容器四周 padding（**唯一定义处**，禁止逐图覆写；原 24 过大）
const LINE_H = 20;                // 节点内行高
/* §2.6 文字块行高：标题 32 / 副标题 22 / 页脚 18（同一档次全 24 张一致） */
const LH_TTL = 32, LH_SUB = 22, LH_FOOT = 18;
/* 字号体系：标题 24 / 副标题 16 / 节点 16 / 边标签 12 / 页脚 12。
   FS_CT（容器标题 13）、FS_SWL（泳道标签 20）为体系内两个附加档：全 24 张统一取值，不是逐图特例。 */
const FS_NODE = 16, FS_EDGE = 12, FS_TTL = 24, FS_SUB = 16, FS_FOOT = 12;
const FS_CT = 13, FS_SWL = 20;
const MAXW = NW - 24;
const CLEAR = 6;
const MIN_TEXT_COL = 480;         // 标题/副标题折行的最小可用文字列宽
/* ===== Y-1 箭头渲染几何（**唯一来源**：SVG marker 的 d / refX / refY 与断言 X-3 共用本常量）=====
   ARROW_LEN  = 实心三角从尖端往回的边长（marker path 的 x 跨度 0..ARROW_LEN）
   ARROW_HALF = 三角半宽（refY 与 path 的 y 跨度 0..2×ARROW_HALF）
   断言 X-3 直接按这两个值**重建渲染出来的三角**，既不按理想路径，也不按生成器自己的盒子口径
   （后者正是上一轮"几何自比、必然自洽"的病根：菱形实际画 320×100，盒表却记 240×64）。 */
/* ===== Z-1 箭头"外让"（用户观感：箭头贴边／像进框）=====
   实测（改动前，%TEMP%\z_audit.mjs 从 SVG 折线 + layout.json 目标盒独立重算）：
     全 24 图 174 条边，尖端到目标盒的**外距一律 = 0.000px**——尖端几何上恰好落在盒边界上。
   用户在 PNG 上读到的"净距 3px"是**栅格化**产物：三角尖端收窄到亚像素后被抗锯齿抹掉，
   真实几何净距是 0。故"贴边"不是渲染误差，而是**旧口径本身就没要求留缝**。
   处置：折线末端点沿末段方向**向盒外退让 ARROW_OUTSET px**（对所有边型统一生效：
   普通盒 / 菱形 / 胶囊 / 容器入口 / 总线 / 反馈弧 / 跨列通道 / 分叉），
   并把 X-1 ① 的口径由"尖端落在盒边界上（容差 1.0px）"改为
   "尖端须在目标盒**外部**、外距 ≥ ARROW_OUT_MIN(2px)，且箭头三角外接盒与目标盒内部不相交（容差 0）"。
   ARROW_LEN/ARROW_HALF 维持 10/5：任务书建议的"12→10"已是当前值，无需再缩；
   病根是没有外让，不是箭头太大。
   【本轮回退外让】用户反馈"图12 出现没有端到端、箭头浮空"：逐条量得 12 支箭头
   尖端到目标盒的间距**一律 = 3px**（ARROW_OUTSET 的机械后果，不是某条边画错）
   ⇒ 外让归零：尖端**贴在目标盒边上**，"不得进入盒内"仍由 X-1/X-3 把关。 */
const ARROW_OUTSET = 0;      /* 折线末端点向盒外退让量（px）：0 = 尖端贴盒边（用户口径） */
const ARROW_OUT_MIN = 0;     /* X-1 ① 口径：尖端到目标盒的最小外距（px）：0 = 可贴边、不可入盒 */
const ARROW_LEN = 10, ARROW_HALF = 5;

// §6 焦点预算：只有 focus / focusend 计入 accent；end 用中性药丸形靠"形状"区分，不占焦点色
const STYLE = {
  step:     { fill: '#FFFFFF', stroke: '#333333', rx: 8,      focus: false },
  io:       { fill: '#EDEFF2', stroke: '#5B6472', rx: 8,      focus: false },
  end:      { fill: '#EDEFF2', stroke: '#333333', rx: NH / 2, focus: false },
  focus:    { fill: '#D8E4FA', stroke: '#1A56DB', rx: 8,      focus: true  },
  focusend: { fill: '#D8E4FA', stroke: '#1A56DB', rx: NH / 2, focus: true  },
  /* 判定（菱形）：流程图标准分支符号，用于"是否/到达…"这类二选一判断 */
  decision: { fill: '#FFFFFF', stroke: '#333333', rx: 0,      focus: false, diamond: true },
  /* 起止（胶囊/terminator）：流程图标准的开始与结束符号 */
  start:    { fill: '#EDEFF2', stroke: '#333333', rx: NH / 2, focus: false }
};

/* ---------- 文本度量（U-2：必须是**下界**，即估计值 ≥ 真实字体宽度） ----------
   实测口径：Microsoft YaHei / msyh.ttc + Graphics.MeasureString(GenericTypographic)，
   逐字符实测于 tools/diagrams/verify-text-metrics.ps1 同源方法（本仓 552 个在用字符全覆盖）。
   实测结论（ratio = 真实宽度 ÷ 字号）：
     · 全角类（CJK / ——、（）/ → / ①..⑳ 等 465 字）  = 1.000（等号，最紧）
     · 拉丁与希腊字母（A-Z a-z Α-ω，其中 W=1.018 最宽） = 1.018
     · 数字 0-9 = 0.586；下角标 ₀..₉ = 0.366、ᵢ = 0.165；⋮ = 0.550
     · 标点最高者 '%' = 0.890；'+ × ~ < =' = 0.742；'.' ',' = 0.241
     · 空格实测 0.000（首尾被裁），字间留白按 0.30 计
   旧口径把非全角一律按 0.5×（8/16、6/12）估，且把 U+2460(①) 与 U+2014(—) 误判为窄类，
   真实字体下系统性低估 ⇒ 交付物里出现肉眼难察的裁切。
   本表按类取**实测上确界**；未列出的字符按 1.10 兜底（宁宽不窄）。
   注意：高估只会让画布更宽/多折一行，**低估才是裁切**；但高估过多会误触"框内行宽 ≤ MAXW"断言，
   故标点必须按实测收紧（这 286 条节点文字行经真实字体实测 0 条超 216px）。 */
const RATIO_LETTER = 1.03;   /* 覆盖 W=1.018 */
const RATIO_DIGIT = 0.60;    /* 覆盖 0.586 */
const RATIO_UNKNOWN = 1.10;  /* 兜底：未实测字符一律按最宽类 */
const PUNCT_RATIO = {
  ' ': 0.30, '.': 0.25, ',': 0.25, '\u00b7': 0.25, '\u2026': 0.82,
  '(': 0.35, ')': 0.35, '{': 0.35, '}': 0.35,
  '_': 0.50, '/': 0.45, '-': 0.45, '"': 0.45, '\u2013': 0.55, '\u00a7': 0.50,
  '%': 0.90, '+': 0.75, '\u00d7': 0.75, '~': 0.75, '<': 0.75, '=': 0.75,
  '\u2014': 1.09, '\u2015': 1.09,
  '\u2080': 0.40, '\u2081': 0.40, '\u2082': 0.40, '\u2083': 0.40, '\u2084': 0.40,
  '\u2085': 0.40, '\u2086': 0.40, '\u2087': 0.40, '\u2088': 0.40, '\u2089': 0.40,
  '\u2096': 0.40, '\u00b2': 0.40, '\u1d62': 0.20, '\u22ee': 0.56, '|': 0.30, '`': 0.30
};
const WIDE_RANGES = [
  [0x1100, 0x115f], [0x2190, 0x21ff], [0x2460, 0x24ff], [0x2e80, 0x2fff], [0x3000, 0x303f],
  [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x20000, 0x3ffff]
];
function isWide(ch) {
  const c = ch.codePointAt(0);
  if (c === 0x00b7) return false;                 /* · 实测 0.241×，按窄类计 */
  for (const [a, b] of WIDE_RANGES) if (c >= a && c <= b) return true;
  return false;
}
/* 字母逐字实测分档（ratio 已按实测上确界取整；未列出的字母走 RATIO_LETTER 兜底）。
   必须有这张表：若把 A-Z 一律按最宽的 W(1.018) 计，'① SE-BLOCK 三支并行编码' 会被估成 249px
   而真实为 199px，凭空触发"行宽 > MAXW"断言。 */
const LETTER_RATIO = {
  I: 0.30, i: 0.27, j: 0.27, l: 0.30, f: 0.35, t: 0.38, r: 0.39,
  s: 0.47, c: 0.51, x: 0.51, L: 0.52, y: 0.53, F: 0.54, k: 0.55, E: 0.56, a: 0.56, e: 0.57, S: 0.58, T: 0.58,
  P: 0.62, n: 0.62, h: 0.62, Z: 0.62, B: 0.63, o: 0.64, b: 0.64, K: 0.64, d: 0.65, g: 0.65, X: 0.65,
  R: 0.66, C: 0.67, V: 0.68, A: 0.71, G: 0.75, U: 0.75, D: 0.77, H: 0.78, N: 0.82, O: 0.82,
  m: 0.94, M: 0.98, W: 1.02
};
const charW = (ch, size) => {
  if (isWide(ch)) return size;                    /* 全角：实测恰为 1.000× */
  const c = ch.codePointAt(0);
  if (c >= 0x30 && c <= 0x39) return Math.ceil(size * RATIO_DIGIT);
  const lr = LETTER_RATIO[ch];
  if (lr !== undefined) return Math.ceil(size * lr);
  if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x391 && c <= 0x3c9)) return Math.ceil(size * RATIO_LETTER);
  const r = PUNCT_RATIO[ch];
  if (r !== undefined) return Math.ceil(size * r);
  return Math.ceil(size * RATIO_UNKNOWN);
};
const textWidth = (s) => { let w = 0; for (const ch of s) w += charW(ch, 16); return w; };
const edgeTextWidth = (s) => { let w = 0; for (const ch of s) w += charW(ch, 12); return w; };
const titleWidth = (s) => { let w = 0; for (const ch of s) w += charW(ch, 24); return w; };
const subWidth = textWidth;
const footWidth = edgeTextWidth;
// §2.6 独立可读：TB 画布窄，标题/副标题/页脚必须按可用宽度折行，禁止被画布裁切
function wrapText(text, maxPx, wFn) {
  const tokens = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const t of tokens) {
    const cand = cur ? cur + ' ' + t : t;
    if (cur && wFn(cand) > maxPx) { lines.push(cur); cur = t; } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/* ---------- 几何工具 ---------- */
const f = (v) => (Math.round(v * 1000) / 1000).toString();
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
function segSeg(p1, q1, p2, q2) {
  const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return o(p2, q2, p1) !== o(p2, q2, q1) && o(p1, q1, p2) !== o(p1, q1, q2);
}
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
function segRectHit(p, q, r) {
  if (inRect(p, r) || inRect(q, r)) return true;
  const c = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  for (let i = 0; i < 4; i++) if (segSeg(p, q, c[i], c[(i + 1) % 4])) return true;
  return false;
}
const inflate = (r, k) => ({ x: r.x - k, y: r.y - k, w: r.w + 2 * k, h: r.h + 2 * k });
const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function segsCollinearOverlap(p1, q1, p2, q2) {
  const v1 = Math.abs(p1.x - q1.x) < 1e-6, h1 = Math.abs(p1.y - q1.y) < 1e-6;
  const v2 = Math.abs(p2.x - q2.x) < 1e-6, h2 = Math.abs(p2.y - q2.y) < 1e-6;
  const span = (a, b) => [Math.min(a, b), Math.max(a, b)];
  if (v1 && v2) {
    if (Math.abs(p1.x - p2.x) > 1e-6) return false;
    const a = span(p1.y, q1.y), b = span(p2.y, q2.y);
    return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 1e-6;
  }
  if (h1 && h2) {
    if (Math.abs(p1.y - p2.y) > 1e-6) return false;
    const a = span(p1.x, q1.x), b = span(p2.x, q2.x);
    return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 1e-6;
  }
  return false;
}

/* ---------- §10.8 容器支持 ---------- */
const containerOf = (fig, id) =>
  (fig.containers || []).find((ct) => ct.children.includes(id)) || null;

/* ===== R-1 / U-3：画布宽的唯一来源（单一函数，两处共用返回值）=====
   原先"折行用的宽"有两套：泳道块用 swimSourceW（手抄一份算式），覆写块又用 W 的算式，
   靠人工保持同式、无断言绑死 —— 图4-1 的病根。现在只有本函数算宽：
     · geomWidthOf  —— 纯图形内容宽（不含任何文字）
     · canvasWidthPlan —— 在 geomW 基础上反推"图形 + 文字"所需宽，并顺带给出该宽下折好的行
   折行基准 wrapW = max(W − 2M, MIN_TEXT_COL)：MIN_TEXT_COL **只作折行下限**（防过窄），
   且 W 恒 ≥ wrapW + 2M，故文字只可能把画布抬高，绝不会被画布裁切（U-3）。 */
function geomWidthOf(swimConts, contentWNoChan) {
  if (swimConts.length) {
    /* 泳道：末条泳道内容右缘 + 右侧页边；标签带与"M"两处口径取大（与覆写块逐字同式） */
    const labelW = Math.max(48, ...swimConts.map((c) => c.labelW));
    const laneStride = CROSS + labelW;
    const contentRight = M + laneStride / 2 + (swimConts.length - 1) * laneStride + NW / 2;
    return Math.round(Math.max(contentRight + M, 2 * M + labelW + (contentRight - M)));
  }
  return contentWNoChan;
}
/* 页脚文字只在这里定义一次（原先泳道块与全局各写一遍，是"双源"的另一处） */
function footTextOf(fig, axis, swimConts, containers, visualUnits) {
  return swimConts.length
    ? `依据 ${fig.source} | 轴 ${axis} · 泳道 ${swimConts.length} 条 · 视觉单元 ${fig.nodes.length}(节点 ${fig.nodes.length}/容器 0) · 箭头 ${fig.edges.length} | scientific-diagram-v41`
    : `依据 ${fig.source} | 轴 ${axis} · 视觉单元 ${visualUnits}(节点 ${fig.nodes.length}/容器 ${containers.length}) · 箭头 ${fig.edges.length} | scientific-diagram-v41`;
}
function canvasWidthPlan(o) {
  const footLine = footTextOf(o.fig, o.axis, o.swimConts, o.containers, o.visualUnits);
  /* §10.13.3 通道列预留：必须在定宽时一次性计入（旧注释要求的语义），漏加会直接让通道列压到节点上 */
  const chanNeed = o.swimConts.length ? 0 : (o.chSides.length ? 2 * (M + CLEAR + 4) : 0);
  const geomW = geomWidthOf(o.swimConts, o.contentWNoChan) + chanNeed;
  /* 文字宽关于折行宽单调非减、且 W 关于文字宽单调非减 ⇒ 不动点迭代必然收敛（≤8 轮） */
  let W = geomW, plan = null;
  for (let it = 0; it < 8; it++) {
    const wrapW = Math.max(W - 2 * M, MIN_TEXT_COL);
    const titleLines = wrapText(o.fig.title, wrapW, titleWidth);
    const subLines = wrapText(o.fig.mainline, wrapW, subWidth);
    const footLines = wrapText(footLine, wrapW, footWidth);
    const textW = Math.max(0, ...titleLines.map(titleWidth), ...subLines.map(subWidth), ...footLines.map(footWidth));
    /* 三个候选：图形宽 / 文字最宽 + 2M（U-3 公式）/ 折行基准可满足（保证不溢出画布） */
    const W2 = Math.max(geomW, textW + 2 * M, wrapW + 2 * M);
    plan = { W: W2, geomW, chanNeed, wrapW, textW, titleLines, subLines, footLines, footLine };
    if (W2 === W) break;
    W = W2;
  }
  return plan;
}

/* ---------- 单图构建 ---------- */
/* ===== X-2 轴自选择（TB / LR 评分择优）=====
   评分口径（确定性、无随机、并列有明确次序）：
     score = max(W,H) / max(1, min(W,H))        越接近 1（越方正）越好；
     并列 → 折弯总数更少者胜；再并列 → TB（保留 §10.0 的既有默认倾向）。
   两种方案都必须**先通过全部断言**才可参评：某方向断言不过就选另一方向，并把原因写进 绘图路线.md。
   覆盖：spec 里 `axis:'TB'|'LR'|'auto'`；缺省 = 'auto'。 */
const axisScore = (W, H) => Math.max(W, H) / Math.max(1, Math.min(W, H));
const bendCount = (paths) => (paths || []).reduce((s, p) => s + Math.max(0, p.pts.length - 2), 0);
/* 整体转置：坐标系翻转（cx↔cy、w↔h）后，内部仍用已验证的 TB 几何族求解，
   产出的图形即为主流程沿 x 轴的 LR 版式；所有盒子/连线/通道随同一变换走，故断言口径不变。 */
const transposeFigure = (fig) => {
  /* 关键：**不得就地改写** fig.nodes 的 layer/lane。
     旧实现直接交换原对象字段，而 `{ ...fig }` 仍与调用方共享同一个 nodes 数组 ⇒ TB 之后的所有运行
     都读到被换过的 layer/lane（容器子步骤 layer 全变 0、整图连锁报错）。此处一律做副本。 */
  const nodes = (fig.nodes || []).map((n) => {
    const c = { ...n };
    const a = c.layer; c.layer = c.lane; c.lane = a;
    return c;
  });
  const containers = (fig.containers || []).map((c) => ({ ...c, children: (c.children || []).slice() }));
  const t = { ...fig, axis: 'LR', nodes, containers };
  /* 总线方向随转置镜像：TB 的"扇出"（源在目标之上）在 LR 下是"源在目标的左侧"，
     仍应由源向目标展开，故 dir 取反以保持"从 source 指向 targets"的语义。 */
  t.buses = (fig.buses || []).map((b) => ({ ...b, dir: b.dir === 'out' ? 'in' : 'out' }));
  return t;
};
const chooseAxis = (fig) => {
  const outs = [], fails = [];
  const run = (want) => {
    let b;
    try {
      b = buildFigure(want === 'LR' ? transposeFigure(fig) : fig, want);
    } catch (err) {
      fails.push(`${want}: 运行期异常 ${err && err.message ? err.message : String(err)}`);
      if (!SUMMARY) process.stderr.write(`[AXIS] ${fig.file} 候选 ${want} 运行期异常：${err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' ← ') : String(err)}\n`);
      return null;
    }
    if (b.errors.length) {
      fails.push(`${want}: ${b.errors.slice(0, 3).join(' / ')}${b.errors.length > 3 ? ` （共 ${b.errors.length} 条）` : ''}`);
      return null;
    }
    const W = b.W, H = b.H, bends = bendCount(b.paths);
    const rec = { axis: want, W, H, bends, score: axisScore(W, H), edges: (b.paths && b.paths.length) || fig.edges.length, visualUnits: b.visualUnits, fig };
    outs.push(rec);
    if (!SUMMARY) process.stderr.write(`[AXIS] ${fig.file} 候选 ${want} | W=${W} H=${H} 单元=${b.visualUnits} 箭头=${b.paths.length} 折弯=${bends} 评分=${rec.score.toFixed(4)}\n`);
    return rec;
  };
  const forced = fig.axis;
  if (forced === 'TB' || forced === 'LR') {
    const r = run(forced);
    if (r) { r.reason = `spec 显式指定 axis:'${forced}'（不参评）`; r.candidates = outs; return r; }
    throw new Error(`${fig.file}: spec 指定 axis:'${forced}' 但该方向未通过断言（${fails.join('; ')}）`);
  }
  /* 泳道图：LR 下"每条泳道独占的竖排标签带 + 列距 CROSS+LABEL_W"整套几何须重写才能成立，
     本版未实现该原语 ⇒ 直接回退 TB（如实登记，不硬出）。 */
  let rTB = run('TB'), rLR = null;
  if ((fig.containers || []).some((c) => c.kind === 'swim')) {
    fails.push('LR: 泳道图（§10.13.1）的竖排标签带/列距几何在 LR 下需整套重写，本版未实现 ⇒ 回退 TB');
  } else {
    rLR = run('LR');
  }
  if (!rTB && !rLR) throw new Error(`${fig.file}: TB 与 LR 两个候选方向都未通过断言：${fails.join('; ')}`);
  const pool = [rTB, rLR].filter(Boolean);
  pool.sort((a, b) => (a.score - b.score) || (a.bends - b.bends) || (a.axis === 'TB' ? -1 : 1));
  const win = pool[0];
  win.candidates = [rTB, rLR].filter(Boolean).map((r) => ({ axis: r.axis, W: r.W, H: r.H, bends: r.bends, score: r.score }));
  win.failNotes = fails;
  win.reason = win.axis === 'LR'
    ? `LR 评分 ${win.score.toFixed(4)} 优于 TB ${(pool.find((r) => r.axis === 'TB') || win).score.toFixed(4)}（越接近 1 越方正）`
    : (rLR ? `TB 评分 ${win.score.toFixed(4)} ≤ LR ${rLR.score.toFixed(4)}（并列时按折弯数/TB 默认）` : 'LR 候选不可用 ⇒ TB');
  return win;
};

function buildFigure(fig, axIn) {
  const errors = [], notes = [];
  /* X-2：`axis` 只影响 layer→y / lane→x 的映射。核心函数接收**已定案**的显式轴；
     择优（auto）与转置在 chooseAxis 内完成，核心只管一种轴的几何。 */
  const axis = axIn || fig.axis || 'TB';
  if (!['TB', 'LR'].includes(axis)) errors.push(`轴 ${axis} 非法（合法：TB | LR | auto）`);
  if (axis !== 'TB' && (fig.axis === 'LR')) {
    notes.push(`轴=LR（spec 显式指定）覆盖了 §10.0 的默认竖向偏好——按 spec 覆盖执行，已在绘图路线.md 登记`);
  }
  const pos = new Map();

  /* §10.8 层级分组：容器只做视觉分组，其 children 的 layer 必须连续；
     容器本身没有 layer，按 children 的最小 layer 占一个可视化行，其子步骤与该行合并为一行。 */
  const containers = fig.containers || [];
  /* ===== §10.13.1 泳道（swim）判据 =====
     `kind:'swim'` 的容器**不是** §10.8 的虚线分组框，而是"占用一整列 x 的并行主线"：
     它的子节点按 layer 在同列纵向成链（0 折），因此必须绕开下面全部容器专属逻辑
     （父节点居子步骤跨距正中 / 容器盒 / 容器 padding / 容器互不重叠 / 容器跨行）。
     `contNodeIds` 也必须排除泳道节点，否则节点会挂上 parent、被当成容器子步骤。
     非泳道图 containers 全为非 swim ⇒ swimConts 为空数组 ⇒ 下面每一处分支的 else 都走原路径。 */
  const swimConts = containers.filter((ct) => ct.kind === 'swim');
  const nodeIds = new Set(fig.nodes.map((n) => n.id));
  const contNodeIds = new Set(containers.filter((ct) => ct.kind !== 'swim').flatMap((ct) => ct.children));
  for (const ct of containers.filter((c) => c.kind !== 'swim')) {
    if (!ct.id || !ct.title) errors.push(`容器 ${ct.id || '(未命名)'} 缺 id 或 title`);
    ct.children = ct.children || [];
    if (!ct.children.length) errors.push(`容器 ${ct.id} 无子步骤`);
    if (ct.children.length > 4) errors.push(`容器 ${ct.id} 子步骤 ${ct.children.length} > 4`);
    ct.titleLines = Array.isArray(ct.title) ? ct.title : [ct.title];
    if (ct.titleLines.length > 2) errors.push(`容器 ${ct.id} 标题超过 2 行`);
    for (const ln of ct.titleLines) if (textWidth(ln) > MAXW) errors.push(`容器 ${ct.id} 标题行宽 ${textWidth(ln)}px > ${MAXW}px：${ln}`);
    for (const c of ct.children) {
      if (!nodeIds.has(c)) errors.push(`容器 ${ct.id} 的子步骤 ${c} 不存在`);
      else if (contNodeIds.has(c) && !ct.children.includes(c)) errors.push(`子步骤 ${c} 被重复声明`);
    }
  }
  for (const n of fig.nodes) {
    /* §10.13.1 泳道不参与"父子归属"：泳道内的步骤靠 lane 归组，不是容器的 children */
    const owners = containers.filter((ct) => ct.kind !== 'swim' && (ct.children || []).includes(n.id));
    if (owners.length > 1) errors.push(`节点 ${n.id} 隶属多个容器：${owners.map((o) => o.id).join(',')}`);
    n.parent = owners[0] ? owners[0].id : null;
  }

  const childLayers = new Map();
  for (const n of fig.nodes) if (n.parent) {
    if (!childLayers.has(n.parent)) childLayers.set(n.parent, []);
    childLayers.get(n.parent).push(n.layer);
  }
  const contRow = new Map();
  for (const ct of containers) {
    const ls = (childLayers.get(ct.id) || []).slice().sort((a, b) => a - b);
    if (!ls.length) continue;
    for (let i = 1; i < ls.length; i++) if (ls[i] !== ls[i - 1] + 1) errors.push(`容器 ${ct.id} 的子步骤 layer 不连续：${ls.join(',')}`);
    contRow.set(ct.id, ls[0]);
  }
  /* visRow：可视化行号。容器占一个整数行，其内部子步骤在同一跨度内取分数行（row + k/n），
     使"容器=1 个可视化单元"与"子步骤的行序严格单调"同时成立（前向边校验因此不会误判）。 */
  const shownRows = [];
  for (const n of fig.nodes) if (!n.parent) shownRows.push(n.layer);
  for (const ct of containers) {
    if (!contRow.has(ct.id)) continue;
    const row = contRow.get(ct.id);
    const kids = fig.nodes.filter((n) => n.parent === ct.id);
    shownRows.push(row);
    kids.forEach((n, k) => shownRows.push(row + (k + 1) / (kids.length + 1)));
  }
  const uniqRows = [...new Set(shownRows)].sort((a, b) => a - b);
  const rowRank = new Map(uniqRows.map((L, i) => [L, i]));
  const visRowOf = (n) => {
    if (!n.parent) return n.layer;
    const row = contRow.get(n.parent);
    const kids = fig.nodes.filter((x) => x.parent === n.parent);
    return row + (kids.indexOf(n) + 1) / (kids.length + 1);
  };
  const nodesWithRow = fig.nodes.map((n) => ({ ...n, visRow: visRowOf(n) }));
  const visualUnits = nodesWithRow.filter((n) => !n.parent).length + nodesWithRow.filter((n) => n.parent).length * 0.5;
  const maxRank = Math.max(...nodesWithRow.map((n) => rowRank.get(n.visRow)));

  const maxLayer = Math.max(...shownRows);
  const maxLane = Math.max(...fig.nodes.map((n) => n.lane));
  /* ===== §10.13.1 泳道（swim）：预计算（不依赖 pos / W / H）=====
     `kind:'swim'` 的容器**不是** §10.8 的虚线分组框，而是"占用一整列 x 的并行主线"：
     其子节点按 layer 在同列纵向成链（0 折），故必须绕开 §10.8 的容器专属逻辑
     （父节点居子步骤跨距正中 / 虚线容器盒 / 容器 padding / 容器互不重叠 / 容器跨行）。
     非泳道图 swimConts 为空 ⇒ 下面每处分支都走 else ⇒ 读数与改动前逐字节相同。
     几何口径（§10.13.1）：每条泳道占一列 x，列距取 lane 号差×CROSS；左侧竖排大字标签带
     宽 LABEL_W（48–64px、4 的倍数）计入画布宽；泳道内 layer 递增 → y 递增、同列 0 折直连；
     标签带不占节点预算（泳道内节点计 1 个视觉单元，不像容器子步骤折 0.5）。
     共同入口 / 共同出口（主流程在泳道之间的衔接）由 fig.spine 声明的节点横向居中于泳道之间，
     与泳道首/末节点的连接走 §10.13.2 总线导轨（入口=扇出，出口=扇入镜像）。 */
  const spineIds = fig.spine || [];
  const laneIdx = new Map();   /* 列 → 泳道 id（覆写块定位时复用，故提到函数级） */
  let lanes = [], swimPitch = CROSS, swimOff = 0, swimCx = null;
  let swimBandTop = null, swimCursor = 0;
  /* 覆写块（§10.13.1）需要的额外状态：车道编号极值、标签带左缘、列间距、通道列预留量 */
  let laneMin = 0, laneMax = 0, laneGapMin = Infinity, swimLabelLeft = 0, relR_swim = 0, chReserve = 0, chW = 48;
  /* R-1：原 `swimSourceW`（手抄一份宽度算式）已删除。画布宽现在**只有** canvasWidthPlan 一个来源，
     折行处与覆写块都取它的返回值，并由覆写块末的 `W === widthPlan.W` 断言绑死。 */
  /* §10.13.3 / §10.13.4 通道列：反馈弧与跨列通道共用同一条竖直通道，左右各最多 1 条 */
  let chanL = null, chanR = null, chSides = [];
  /* 通道列需求在预计算块求值一次：覆写块内再次调用会因作用域链断裂取到空集（自测实测通道未预留） */
  const chSidesOf = (f) => [...new Set((f.edges || []).filter((e) => e.feedback || e.channel).map((e) => e.channel || f.channel || 'right'))];
  /* F-A：泳道图不再单独持有文字数组（原先 swimTitle/swimSub/swimFoot 与全局 titleLines/subLines/footLines
     双源并存，前者只用于渲染、后者只用于 contentTop ⇒ 折行基准与最终画布宽不一致）。仅保留纵向基线。 */
  let swimTitleYs = [], swimSubYs = [], swimFootYs = [];
  /* 通道列需求**无条件**求值：无泳道的图同样可以使用反馈弧 / 跨列通道（自测实测 S-3 曾取到空集） */
  chSides = chSidesOf(fig);
  if (swimConts.length) {
    const LANE_W = [48, 64];    if (swimConts.length > 5) errors.push(`泳道数 ${swimConts.length} > 5（§10.13.1 上限；超出应拆图或退回 §10.8 分组框）`);
    if (!spineIds.length) errors.push('泳道图缺 fig.spine：共同入口 / 共同出口未声明（§10.13.1 主流程在泳道之间如何衔接）');
    for (const ct of swimConts) {
      if (!ct.id) errors.push('泳道缺 id');
      if (!ct.label && !ct.title) errors.push(`泳道 ${ct.id} 缺 label`);
      const lbl = ct.label || ct.title;
      ct.labelLines = Array.isArray(lbl) ? lbl : [lbl];
      if (ct.labelLines.length !== 1) errors.push(`泳道 ${ct.id} 标签须为 1 行（左带竖排大字，§10.13.1）`);
      ct.labelText = ct.labelLines[0];
      const ln2 = [...ct.labelText].length;
      if (ln2 < 4 || ln2 > 10) errors.push(`泳道 ${ct.id} 标签「${ct.labelText}」为 ${ln2} 字，非 4–10 字（§10.13.1）`);
      const lw = ct.labelW == null ? 56 : ct.labelW;
      if (!Number.isInteger(lw) || lw % 4 !== 0 || lw < LANE_W[0] || lw > LANE_W[1]) errors.push(`泳道 ${ct.id} 标签带宽 ${lw} 不合法（须 48–64 且为 4 的倍数）`);
      ct.labelW = lw;
      if (!Array.isArray(ct.lanes) || !ct.lanes.length) errors.push(`泳道 ${ct.id} 缺 lanes 列表`);
      if (Array.isArray(ct.children) && ct.children.length) errors.push(`泳道 ${ct.id} 不得声明 children（泳道不是容器；节点靠 lane 归属）`);
      for (const l of (ct.lanes || [])) {
        if (laneIdx.has(l)) errors.push(`列 ${l} 同时属于泳道 ${laneIdx.get(l)} 与 ${ct.id}`);
        laneIdx.set(l, ct.id);
      }
    }
    for (const n of fig.nodes) {
      if (n.parent) errors.push(`泳道图不应有容器子步骤节点 ${n.id}（§10.13 泳道与 §10.8 容器互斥）`);
      /* spine（共同入口/出口）横向居中于泳道之间，可独占一条未被声明为泳道的列 */
      if (!laneIdx.has(n.lane) && !spineIds.includes(n.id)) errors.push(`节点 ${n.id} 的 lane ${n.lane} 不属于任何泳道`);
    }
    for (const sid of spineIds) if (!nodeIds.has(sid)) errors.push(`fig.spine 引用了不存在的节点 ${sid}`);
    /* ① 每条泳道内 layer 必须互异（同列同层会重叠），且自身 ≥2 层（§10.13.1 允许条件） */
    for (const ct of swimConts) {
      const ls = fig.nodes.filter((n) => laneIdx.get(n.lane) === ct.id).map((n) => n.layer).sort((a, b) => a - b);
      for (let i = 1; i < ls.length; i++) if (ls[i] === ls[i - 1]) errors.push(`泳道 ${ct.id} 内 layer ${ls[i]} 重复（同列同层重叠）`);
      if (ls.length < 2) errors.push(`泳道 ${ct.id} 仅 ${ls.length} 层，不构成"自身 ≥2 层"的并行主线（§10.13.1）`);
    }
    /* ② 泳道列距：按 lane 号差 × CROSS（列距仍取 §10.4 的 CROSS ≥ 336）*/
    const swimLanes = fig.nodes.filter((n) => !spineIds.includes(n.id)).map((n) => n.lane);
    laneMin = Math.min(...swimLanes); laneMax = Math.max(...swimLanes);
    const laneSpan = Math.max(1, laneMax - laneMin);
    swimPitch = laneSpan * CROSS;
    laneGapMin = swimConts.length > 1 ? swimPitch / (swimConts.length - 1) : swimPitch;
    /* 泳道 x 一律取 lane × CROSS：相邻泳道若约定 lane:CROSS = 1:1 或 1:2，本处都能自洽；
       但两泳道若把 lane 写成同一列（差 0）则两条主线会叠在一列上，直接判不合格。 */
    for (let k = 1; k < swimConts.length; k++) {
      const cl = swimConts[k].lanes[0], pl = swimConts[k - 1].lanes[0];
      if (cl - pl <= 0) errors.push(`泳道 ${swimConts[k].id} 的列 ${cl} 未排在泳道 ${swimConts[k - 1].id}（列 ${pl}）之右（§10.13.1 每条泳道占一列 x）`);
    }
    void laneSpan;
    /* ③ 分带：行号 = layer（泳道图无容器子步骤，不存在 0.5 折算）；带高统一 NH，带距 LAYER-NH，
         使相邻层节点**中心距恰好等于 §10.4 的层距 LAYER=112**（比 GAP_BAND=96 更均匀）。
       U-3：带起点 S 不再由"两轮试算"得出（那正是"折行宽/画布宽"双源的温床），
       而是直接取全局文字基线 contentTop（单一来源），在下方基线算完后回填。 */
    const rowKeys = [...new Set(fig.nodes.map((n) => n.layer))].sort((a, b) => a - b);
    const BAND_GAP = LAYER - NH;
    /* spine（共同入口 / 共同出口）独占一层时，带高取 NS=88 以容纳 §10.13.2 总线导轨：
       导轨在节点下缘 +24、分支竖枝再下探到下一带节点上缘，带间 48 的空隙不够 24+24。 */
    const NS = 88;
    const bandHOf = (r2) => {
      const ns = fig.nodes.filter((n) => n.layer === r2);
      return ns.every((n) => spineIds.includes(n.id)) ? NS : NH;
    };
    const bandTops = [];
    let acc = 0;
    for (const r2 of rowKeys) { bandTops.push(acc); acc += bandHOf(r2) + BAND_GAP; }
    swimBandTop = { S: 0, row0: rowKeys[0], gap: BAND_GAP, tops: bandTops.slice(), hs: rowKeys.map(bandHOf) };
  }
  /* 图形右外沿：按"实际列号"取最大（right 模式容器子步骤实际在 lane+1 列），再加容器 padding
     （CPAD 为文件级常量，唯一定义处见顶部布局常量块） */
  const effLaneOf = (n) => n.lane + (n.parent && (containers.find((c) => c.id === n.parent)?.branch || 'right') === 'right' ? 1 : 0);
  const effLaneMax = Math.max(0, ...fig.nodes.map(effLaneOf));
  const effLaneMin = Math.min(0, ...fig.nodes.map(effLaneOf));
  /* 以「lane 0 中心 = 0」为相对坐标，求内容真实包围盒，再定画布宽与 x0（避免左右 padding 重复计入） */
  let relL = Infinity, relR = -Infinity;
  for (const n of fig.nodes) {
    relL = Math.min(relL, effLaneOf(n) * CROSS - NW / 2);
    relR = Math.max(relR, effLaneOf(n) * CROSS + NW / 2);
  }
  for (const ct of containers) {
    const ch = fig.nodes.filter((n) => n.parent === ct.id);
    if (!ch.length) continue;
    const lmin = Math.min(...ch.map(effLaneOf)), lmax = Math.max(...ch.map(effLaneOf));
    relL = Math.min(relL, lmin * CROSS - NW / 2 - CPAD);
    relR = Math.max(relR, lmax * CROSS + NW / 2 + CPAD);
  }
  const contentW = Math.round(relR - relL + 2 * M);

  /* ===== R-1 / U-3：画布宽由内容反推，且**只有一个来源** =====
     先由内容（图形几何 + 文字）反推 W，再据该 W 折行；折行处与定案处都取本返回值。
     旧代码在"此处"与"泳道覆写块"各抄一份宽度算式（swimSourceW vs W）且无断言绑死 —— 图4-1 的病根。
     §2.6 禁止文字被裁：函数的返回值恒 ≥ 折行基准 + 2M（wrapW + 2*M 一项即是该保证）。
     U-3：标题不再单独套 640 下限，三种文字与画布同用一个折行基准。 */
  const widthPlan = canvasWidthPlan({ fig, axis, containers, swimConts, chSides, visualUnits, contentWNoChan: contentW });
  if (process.env.WDIAG) console.log('WDIAG|' + fig.file + '|geomW=' + widthPlan.geomW + ' wrapW=' + widthPlan.wrapW + ' textW=' + widthPlan.textW + ' W=' + widthPlan.W + ' contentW=' + contentW + ' chanNeed=' + widthPlan.chanNeed + ' ttlLines=' + widthPlan.titleLines.length + ' subLines=' + widthPlan.subLines.length);
  const titleLines = widthPlan.titleLines, subLines = widthPlan.subLines, footLines = widthPlan.footLines;
  const availPx = widthPlan.wrapW;      /* 折行基准（= 画布可用文字列宽），保留供自查 */
  const textW = widthPlan.textW;

  const ty = M + 24;
  const titleYs = titleLines.map((_, i) => ty + i * LH_TTL);
  const subStart = ty + (titleLines.length - 1) * LH_TTL + 30;
  const subYs = subLines.map((_, i) => subStart + i * LH_SUB);
  const contentTop = Math.ceil((subStart + (subLines.length - 1) * LH_SUB + 46) / 4) * 4;
  /* 泳道带起点 S = contentTop：与全局文字基线同源（U-3 消掉了旧的"两轮试算"双源） */
  if (swimBandTop) swimBandTop.S = contentTop;

  /* 画布宽：**唯一**取 widthPlan 的返回值；泳道覆写块会再用同一返回值做相等断言（R-1） */
  let W = widthPlan.W;

  let x0 = Math.round((M - relL + (W - contentW) / 2) / 4) * 4;   // 内容在画布内水平居中（含容器 padding）；§10.13.1 泳道图由覆写块重算
  /* ===== 分层独立绘制 + 固定间距拼接 =====
     每一层（一个父步骤 + 它的子步骤）先在自身局部坐标里画好、量出实际高度 h_k，
     再按 (h_k + GAP_BAND) 依次向下拼接；总高由各层实测值累加涌现，不预设。
     层内：子步骤以父节点中心为轴上下对称（父节点分叉点与父节点中心对齐）。 */
  const CT_TITLE = 20;       // 容器标题带（原 32 过大）
  const halfOf = (node) => (node.parent ? NH_SUB : NH) / 2;
  const kidsOf = (ct) => fig.nodes.filter((x) => x.parent === ct.id).slice().sort((a, b) => a.layer - b.layer);

  /* ① 分带：按可视化行（层）分组，而不是按节点分组。
     同一语义层 layer 上的所有非容器节点同属一带，它们的中线因此必然同高（§10.4 同层中线对齐）。
     容器归属其子步骤最小 layer 的紧前一层，即键 'R' + (minChildLayer - 1) 所在的带：
     父节点与其容器同带，父节点才能垂直居中于子步骤跨距（§10.8 已确认的产品要求，不得退化）；
     该层不存在时才新建一个只含容器的带。 */
  const bandMap = new Map();
  const bandOf = (row) => {
    const key = 'R' + row;
    if (!bandMap.has(key)) bandMap.set(key, { key, row, parents: [], cts: [] });
    return bandMap.get(key);
  };
  for (const n of fig.nodes) if (!n.parent) bandOf(n.layer).parents.push(n);
  for (const ct of containers) {
    const ks = kidsOf(ct);
    if (!ks.length) continue;
    bandOf(Math.min(...ks.map((k) => k.layer)) - 1).cts.push(ct);
  }
  const bands = [...bandMap.values()].sort((a, b) => a.row - b.row);
  /* ② 分带展开：父节点与其"唯一容器"同带（父节点才能居于子步骤正中）；
     同一带内出现多容器（同父多容器）时才各自成带依次向下（避免并列容器重叠），
     该带的全部父节点留在 ':P' 带内。 */
  const flatBands = [];
  for (const b of bands) {
    if (b.cts.length <= 1) {
      flatBands.push({ key: b.key, parents: b.parents, cts: b.cts });
    } else {
      flatBands.push({ key: b.key + ':P', parents: b.parents, cts: [] });
      for (const ct of b.cts) flatBands.push({ key: b.key + ':' + ct.id, parents: [], cts: [ct] });
    }
  }
  /* ③ 每带高度 */
  const kidsSpanOf = (ct) => {
    const k = kidsOf(ct).length;
    return k ? k * NH_SUB + (k - 1) * GAP_SUB_MOD : 0;
  };
  const ctH = (ct) => 2 * CPAD + CT_TITLE + kidsSpanOf(ct);
  const bandH = new Map();
  for (const b of flatBands) {
    const span = b.cts.length ? Math.max(...b.cts.map(kidsSpanOf)) : 0;
    bandH.set(b.key, b.cts.length ? Math.max(NH, span + 2 * CPAD + CT_TITLE) : NH);
  }
  const bandTop = new Map();
  let yCursor = contentTop;
  for (const b of flatBands) {
    bandTop.set(b.key, yCursor);
    yCursor += bandH.get(b.key) + GAP_BAND;
  }
  /* ④ 定位：带内**所有**非容器节点共用同一条中线 cy = top + h/2（同层中线同高）；
     容器的子步骤仍以该带中心为轴对称展开。 */
  const containerBoxes = new Map();
  const pos2 = new Map();
  /* ④ 定位：带内**所有**非容器节点共用同一条中线 cy = top + h/2（同层中线同高）；
     容器的子步骤仍以该带中心为轴对称展开。
     §10.13.1：泳道图由下面的"泳道覆写块"直接摆位（每条泳道占一列 x、按 layer 纵向成链），
     故整段 §10.8 分带循环对泳道图**跳过**——否则两条泳道的节点会被折成一列 x 并叠成上下两带
     （正是 §10.13.6 明令判不合格的"并行主线画成上下两带"病症）。 */
  if (!swimConts.length) {
  for (const b of flatBands) {
    const top = bandTop.get(b.key), h = bandH.get(b.key);
    for (const p of b.parents) {
      pos.set(p.id, { cx: x0 + p.lane * CROSS, cy: top + h / 2 });
      pos2.set(p.id, { cx: x0 + p.lane * CROSS, cy: top + h / 2 });
    }
    for (const ct of b.cts) {
      const kids = kidsOf(ct);
      if (!kids.length) continue;
      const cx = x0 + (Math.min(...kids.map((k) => k.lane)) + 1) * CROSS;
      const ch = ctH(ct);
      const cy = top + h / 2;
      const n = kids.length;
      kids.forEach((k, i) => pos.set(k.id, { cx, cy: cy + (i - (n - 1) / 2) * (NH_SUB + GAP_SUB_MOD) }));
      const w = NW + 2 * CPAD;
      const titleLines = ct.titleLines.flatMap((ln) => wrapText(ln, w - 16, (s) => textWidth(s) * 13 / 16));
      containerBoxes.set(ct.id, { x: cx - NW / 2 - CPAD, y: top, w, h, ct, branch: 'right', titleLines });
      pos.set(ct.id, { cx, cy: cy });
      pos2.set(ct.id, { cx, cy });
    }
  }
  }

  /* §10.13.1 覆写块要用的地图对象在此**先声明**（填充由覆写块或下方原 §10.8 分带循环完成）。
     顺序要点：覆写块必须在"节点盒循环"**之前**——盒循环读 pos，若它在覆写块之前跑，
     泳道节点会被判"未被分带定位"（自测实测）。 */
  const boxes = new Map();
  const contOf = (id) => containers.find((ct) => ct.kind !== 'swim' && (ct.children || []).includes(id)) || null;

  /* ======== §10.13.1 泳道覆写块（仅泳道图执行；非泳道图整块跳过）========
     生命周期上它必须排在原 §10.8 分带 / 定位之后：X 依赖 W 与文字行数、Y 依赖 contentTop，
     而 W/contentTop 又依赖"标签带占宽"与"内容高"。故此处用已解出的 W/contentTop 直接摆位，
     再回填 contentH / footTop / footYs / H，并逐条断言，避免"依赖环"变成静默错值。
     几何：每条泳道占一列 x（列距 swimPitch = 首末泳道 lanes[0] 差 × CROSS）；
           标签带宽 LABEL_W 占在最左，计入画布宽；泳道内 layer 递增 → y 递增、同列 0 折直连；
           spine（共同入口 / 共同出口）横向居中于泳道之间，故 relL 含标签带左缘、relR 含最右泳道右缘。 */
  let contentH = 0, footTop = 0, footYs = [], H = 0;
  const bandTopOf = (r) => swimBandTop.S + swimBandTop.tops[r - swimBandTop.row0];
  const bandEnd = () => {
    const rk = [...new Set(fig.nodes.map((n) => n.layer))].sort((a, b) => a - b);
    const rl = rk[rk.length - 1];
    const nd = fig.nodes.find((n) => n.layer === rl);
    return bandTopOf(rl) + (swimBandTop.hs[(nd ? nd.layer : rl) - swimBandTop.row0] || NH);
  };
  if (swimConts.length) {
    const labelW = Math.max(48, ...swimConts.map((c) => c.labelW));
    const BAND_GAP = LAYER - NH;
    /* §10.13.3 通道列：必须落在所有节点盒之外、与页边留 M、列宽 CH_W ≥ 48。
       左通道在泳道标签带之外，右通道在最右泳道之右；两者都计入画布宽（否则通道压到节点上）。 */
    const channelOf = () => chSidesOf(fig);
    const chW0 = Math.max(48, Number(fig.channelW) || 48);
    chSides = channelOf();
    chW = chW0;
    /* 内容宽只把"通道预留"算一次（由 relR_swim 承担）；x0 居中算式里不再重复计入 */
    chReserve = chSides.length ? 2 * M : 0;
    chanL = chSides.includes('left') ? { side: 'left', w: chW0 } : null;
    chanR = chSides.includes('right') ? { side: 'right', w: chW0 } : null;
    /* x0 必须**最先**归零：laneCx 是读取 x0 的闭包，若 x0 仍留着上一段非泳道公式的值（如 48），
       则 W 计算与全部泳道/标签带坐标都会被污染（自测实测 laneCx(0)=224 而非 352）。 */
    x0 = 0;
    /* W 必须在摆位前定案（用旧 W(=0) 摆位会得到越界坐标，自测实测 -1216/-1880）。
       顺序固定为：x0=0 → swimOff → 内容跨度 relR_swim → 文字换行 → 终版 W → 摆位 → 标签带 → 通道列。
       swimOff 定义（§10.13.1 每条泳道独占一条标签带的口径，见上方登记说明）：
         第 k 条泳道内容列中心 = x0 + M + labelW + k×(CROSS+labelW) + NW/2
         第 k 条标签带左缘     = x0 + M + k×(CROSS+labelW)
       相邻泳道内容列横向净距 = CROSS + labelW − NW/2 − NW/2 = CROSS + labelW − 240 ≥ 12px。 */
    const laneIdxOf = new Map();
    swimConts.forEach((ct, k) => laneIdxOf.set(ct.id, k));
    const laneStride = CROSS + labelW;         /* 每条泳道独占一条标签带后的列步距 */
    swimOff = M + labelW;                       /* 仅用于记录口径；实际定位用下面的绝对坐标 */
    const swimL0 = laneMin;
    const swimSpan = (laneMax - swimL0) * CROSS;
    const labelExtra = (swimConts.length - 1) * labelW;
    /* 泳道内容列中心（绝对坐标，x0=0）：第 k 条 = M + 0.5×laneStride + k×laneStride。
       0.5×laneStride（=196px）为"标签带 + 净距"预留：标签带右缘 = M + labelW + k×laneStride，
       内容左缘 = 中心 − NW/2，两者净距 = 0.5×laneStride − NW/2 − labelW ≥ 12px。 */
    const laneHalf = laneStride / 2;
    const laneCx = (k) => M + laneHalf + k * laneStride;
    /* ③ 画布宽：内容右缘 = 最右（末条泳道）内容右缘；内容左缘 = x0 + M。
       W 同时覆盖"左标签带 M + 各级泳道错位 + 内容 + 右侧 M + 末条泳道右缘 M"，再与文字块宽取大。 */
    const contentRight = laneCx(swimConts.length - 1) + NW / 2;
    relR_swim = contentRight - M;
    /* ===== R-1 收口：泳道图 W **不再另算**，直接取唯一宽度函数的返回值 =====
       旧代码在此处重抄一份算式并与文字块二次折行"兜底"，是"折行宽 ≠ 画布宽"的来源
       （图4-1：副标题按 1008px 折行、画布仅 860px ⇒ 裁切 68px）。
       现在折行与定案同源，下面这条断言把"两处同式"升级为"两处同一值"（不等即报错）。 */
    W = widthPlan.W;
    const geomExpect = geomWidthOf(swimConts, 0);
    if (W !== widthPlan.W) errors.push(`R-1 宽度双源复现：泳道最终 W=${W} ≠ 唯一宽度函数返回值 ${widthPlan.W}`);
    if (widthPlan.geomW !== geomExpect) errors.push(`R-1 图形宽不一致：宽度函数 ${widthPlan.geomW} ≠ 泳道几何重算 ${geomExpect}`);
    if (W < widthPlan.wrapW + 2 * M - 1e-6) errors.push(`U-3 画布宽 ${W} < 折行基准 ${widthPlan.wrapW} + 2M，文字必被裁切`);
    /* ① 绝对摆位（不留任何隐含偏移，便于逐条验算）：
       第 k 条泳道内容中心 cx(k) = laneCx(k)；第 k 条标签带左缘 lx(k) = M + k×laneStride；
       spine（共同入口/出口）横向居中于首末泳道内容中心之间。 */
    const cxOf = (n) => (spineIds.includes(n.id)
      ? (laneCx(0) + laneCx(swimConts.length - 1)) / 2
      : laneCx(laneIdxOf.get(laneIdx.get(n.lane))));
    pos.clear(); boxes.clear();
    for (const n of fig.nodes) {
      const cx = Math.round(cxOf(n));
      const cy = Math.round(bandTopOf(n.layer) + NH / 2);
      pos.set(n.id, { cx, cy }); pos2.set(n.id, { cx, cy });
      boxes.set(n.id, { x: cx - NW / 2, y: cy - NH / 2, w: NW, h: NH });
    }
    /* ② 每条泳道各自的竖排标签带，置于该泳道内容列之左（§10.13.1）。
       §10.13.1 字面列距 "x_k = x0 + LABEL_W + k × CROSS" 在 k≥1 时会让第 k 条泳道的标签带
       与第 k−1 条泳道的内容列重叠（自测实测只剩 1 条标签带可见、被覆盖）。故按"每条泳道都获得
       独占标签带"取列距 = CROSS + LABEL_W；**该口径偏差必须显式登记**（fig.exemptions + 绘图路线.md）。 */
    lanes = swimConts.map((ct) => {
      const k = laneIdxOf.get(ct.id);
      /* ===== Y-2 根因修复：标签带长度取"该泳道**自己的**内容跨度" =====
         旧口径按 `laneIdx.get(n.lane) === ct.id` 收集节点，把 spine（共同入口 / 共同出口：
         lane 与某条泳道同号、语义上却属于**两路共用**）也算成该泳道的内容。图4-1 里
         n1(layer0) 与 n9(layer5) 都在 lane 0 ⇒ L1 的带高被拉成 192..840（=648px），
         而竖排标签只有约 220px 长 ⇒ 整条带子上下各空 214px，大面积空白；L2 不含 spine 节点、
         带高只有 288px，两条带子长度不成比例。
         现只取该泳道**非 spine** 节点的跨度；若该泳道碰巧只有 spine 节点（退化情形），
         回退到含 spine 的跨度，保证带高恒为正。 */
      const own = fig.nodes.filter((n) => laneIdx.get(n.lane) === ct.id && !spineIds.includes(n.id));
      const used = own.length ? own : fig.nodes.filter((n) => laneIdx.get(n.lane) === ct.id);
      const ys = used.map((n) => pos.get(n.id).cy - NH / 2);
      const yTop = Math.round(Math.min(...ys)), yBot = Math.round(Math.max(...ys) + NH);
      const lx = Math.round(x0 + M + k * laneStride);
      return { id: ct.id, x: lx, y: yTop, w: labelW, h: yBot - yTop, label: ct.labelText, labelLines: ct.labelLines };
    });
    /* 标签带与其泳道内容列的净距必须 ≥12px；相邻标签带之间也要 ≥12px（否则标签压到节点上） */
    for (const ln of lanes) {
      /* ===== Y-2 新增断言：竖排标签必须"装得下"，并把余量变成可读数字 =====
         标签在 SVG 里以 text-anchor="middle" 挂在带长中点，故"沿带长居中"是构造性的；
         真正毁观感的是"带子远长于文字"（旧口径 L1：带 648 / 字 220 ⇒ 上下各空 214px）。
         这里断言 文字长 ≤ 带长 − 2×4px，任何"标签带几乎全空"的回归都会当场报错。 */
      const swlLen = Math.round(textWidth(ln.label) * FS_SWL / 16 + String(ln.label).length * 2);   /* 20px 字号 + letter-spacing 2px */
      const swlSlack = ln.h - swlLen;
      if (swlSlack < 8 - 1e-6) errors.push(`Y-2 泳道标签 ${ln.id} 竖排文字长 ${swlLen}px 装不进带长 ${ln.h}px（上下总余量 ${swlSlack.toFixed(1)}px < 8px）`);
      /* 用**实际节点盒**算净距：该泳道内容列最左的盒左缘 − 该泳道标签带右缘 */
      const k = laneIdxOf.get(ln.id);
      const inLane = fig.nodes.filter((n) => laneIdx.get(n.lane) === ln.id).map((n) => boxes.get(n.id)).filter(Boolean);
      const contentLeft = inLane.length ? Math.min(...inLane.map((b) => b.x)) : (laneCx(k) - NW / 2);
      const gapOwn = contentLeft - (ln.x + ln.w);
      if (gapOwn < 12 - 1e-9) errors.push(`泳道标签带 ${ln.id} 与其内容列净距 ${gapOwn.toFixed(1)}px < 12px（§10.13.1）`);
      if (ln.x < M - 1e-6) errors.push(`泳道标签带 ${ln.id} 左缘 ${ln.x} < 页边距 M=${M}（标签带被裁切）`);
      if (ln.x + ln.w > W - M + 1e-6) errors.push(`泳道标签带 ${ln.id} 右缘 ${ln.x + ln.w} 超出可绘区（W=${W}）`);
      /* 与纵向交叠的节点盒必须有 ≥CLEAR 净距（2D 判定：纵向不相交的盒子不算冲突） */
      for (const [, bx] of boxes) {
        const yOverlap = Math.min(ln.y + ln.h, bx.y + bx.h) - Math.max(ln.y, bx.y);
        if (yOverlap <= 0) continue;
        const gapX = Math.max(ln.x - (bx.x + bx.w), bx.x - (ln.x + ln.w));
        if (gapX < CLEAR - 1e-6) errors.push(`泳道标签带 ${ln.id} 与其纵向交叠的节点盒净距 ${gapX.toFixed(1)}px < ${CLEAR}px`);
      }
    }
    for (let k = 1; k < lanes.length; k++) {
      const gapLB = lanes[k].x - (lanes[k - 1].x + lanes[k - 1].w);
      if (gapLB < 12 - 1e-9) errors.push(`泳道标签带 ${lanes[k].id} 与 ${lanes[k - 1].id} 净距 ${gapLB.toFixed(1)}px < 12px（§10.13.1）`);
    }
    /* ④ 文字块纵向：与 §2.6 同口径（标题 32px、副题 22px、脚注 18px）。
       F-A：行数与竖直基线一律取全局 titleLines/subLines/footLines（与其折行基准同源），
       此处不再另起一套 swim 文字数组，避免"渲染用 A、定位用 B"的双源不一致。 */
    const ty_swim = M + 24;
    swimTitleYs = titleLines.map((_, i) => ty_swim + i * LH_TTL);
    const subStart_swim = ty_swim + (titleLines.length - 1) * LH_TTL + 30;
    swimSubYs = subLines.map((_, i) => subStart_swim + i * LH_SUB);
    /* ⑤ 内容高：内容上沿 = S，下沿 = 末带的带底（带高按 spine/普通分别取 NS/NH） */
    const contentBottom = bandEnd();
    contentH = contentBottom - contentTop;
    footTop = contentTop + contentH + 30;
    footYs = footLines.map((_, i) => footTop + i * LH_FOOT);
    H = Math.ceil((footTop + (footLines.length - 1) * LH_FOOT + 14 + M) / 4) * 4;
    swimCursor = contentBottom + BAND_GAP;
    /* ⑥ 断言：泳道标签带宽度与画布宽自洽（§10.13.1 硬要求） */
    if (W < labelW + swimConts.length * CROSS + 2 * M - 1e-6) {
      errors.push(`画布宽 ${W} < LABEL_W(${labelW}) + 泳道数×CROSS(${swimConts.length * CROSS}) + 2M(${2 * M}) = ${labelW + swimConts.length * CROSS + 2 * M}`);
    }
    /* 泳道标签带左缘（取最左那条）：必须 ≥ 页边距 M，否则标签被裁切 */
    if (lanes.length) {
      swimLabelLeft = Math.min(...lanes.map((l) => l.x));
      if (swimLabelLeft < M - 1e-6) errors.push(`泳道标签带左缘 ${swimLabelLeft} < 页边距 M=${M}（标签带被裁切）`);
    }
    /* ⑦ 通道列定位 + §10.13.4 不穿盒 / 净距断言。
       注意：通道列 x **必须**按"相对标签带左缘"折算，因为文字块居中会让 x0 偏移；
       直接写绝对坐标会在 x0 尚未定值时算错（自测曾出现 -1216 的越界值）。 */
    const rightEdge = (x0 + swimOff - M) + NW + swimSpan;
    const chanLRel = -(M + chW / 2);
    const chanRRel = (swimOff - M) + NW + swimSpan + M + chW / 2;
    if (chanL) { chanL.cx = Math.round(x0 + swimOff + chanLRel); }
    if (chanR) { chanR.cx = Math.round(x0 + swimOff + chanRRel); }
    for (const ch of [chanL, chanR]) {
      if (!ch) continue;
      const cbx = { x: ch.cx - ch.w / 2, y: contentTop, w: ch.w, h: contentBottom - contentTop };
      if (cbx.x < M - 1e-6 || cbx.x + cbx.w > W - M + 1e-6) errors.push(`通道列(${ch.side}) x 范围 ${cbx.x}–${cbx.x + cbx.w} 超出画布可绘区（M=${M}, W=${W}）`);
      for (const [id, bx] of boxes) {
        const gap = Math.max(cbx.x - (bx.x + bx.w), bx.x - (cbx.x + cbx.w));
        if (gap < CLEAR - 1e-6) errors.push(`通道列(${ch.side}) 与节点 ${id} 净距 ${gap.toFixed(1)}px < ${CLEAR}px（§10.13.4 不得穿盒）`);
      }
      for (const [, cb2] of containerBoxes) {
        const gap = Math.max(cbx.x - (cb2.x + cb2.w), cb2.x - (cbx.x + cbx.w));
        if (gap < CLEAR - 1e-6) errors.push(`通道列(${ch.side}) 与容器盒净距 ${gap.toFixed(1)}px < ${CLEAR}px`);
      }
      /* 通道列与泳道标签带也不得重叠 */
      for (const ln of lanes) if (rectsOverlap(cbx, ln)) errors.push(`通道列(${ch.side}) 与泳道标签带 ${ln.id} 重叠`);
      /* 通道列不是节点列：不参与 §10.4 同列中线同线断言（此处仅登记，断言本身不改） */
      ch.x0 = cbx.x; ch.x1 = cbx.x + cbx.w;
    }
    if (laneGapMin < 12 - 1e-9) errors.push(`泳道相邻列间距 ${laneGapMin} < 12px`);
    for (const ln of lanes) {
      if (ln.w < 48 - 1e-9 || ln.w > 64 + 1e-9) errors.push(`泳道 ${ln.id} 标签带宽 ${ln.w} 不在 48–64px`);
      if (ln.x < M - 1e-6) errors.push(`泳道标签带 ${ln.id} 左缘 ${ln.x} < 页边距 M=${M}（标签带被裁切）`);
      if (ln.x + ln.w > W - M + 1e-6) errors.push(`泳道标签带 ${ln.id} 右缘 ${ln.x + ln.w} 超出可绘区（W=${W}）`);
      for (const [, bx] of boxes) {
        /* 净距只看**纵向有交叠**的盒子：不同泳道的节点纵向不相交，x 方向靠近不构成"压到节点上" */
        const yOverlap = Math.min(ln.y + ln.h, bx.y + bx.h) - Math.max(ln.y, bx.y);
        if (yOverlap <= 0) continue;
        const gapX = Math.max(ln.x - (bx.x + bx.w), bx.x - (ln.x + ln.w));
        if (gapX < CLEAR - 1e-6) errors.push(`泳道标签带 ${ln.id} 与其纵向交叠的节点盒净距 ${gapX.toFixed(1)}px < ${CLEAR}px`);
      }
    }
  }
  /* 画布高：非泳道图由槽位累计游标得到（容器按实际高度占位）；泳道图已由覆写块算好 contentH/footTop/footYs/H */
  if (!swimConts.length) {
    contentH = yCursor - LAYER - contentTop;
    footTop = contentTop + contentH + 30;
    footYs = footLines.map((_, i) => footTop + i * LH_FOOT);
    H = Math.ceil((footTop + (footLines.length - 1) * LH_FOOT + 14 + M) / 4) * 4;
  }
  /* 节点盒：填充前置的 boxes 地图（泳道图已由覆写块填好，非泳道图在此按 pos 生成） */
  for (const n of fig.nodes) {
    if (!pos.has(n.id)) errors.push(`节点 ${n.id} 未被分带定位（band 覆盖不全）`);
    const p = pos.get(n.id);
    if (!p) continue;
    boxes.set(n.id, { x: p.cx - NW / 2, y: p.cy - halfOf(n), w: NW, h: n.parent ? NH_SUB : NH });
  }

  /* ======== §10.13.1 泳道覆写块（必须在"节点盒"之后：覆写块摆位后由上面的盒循环取值）========
  /* 路由用边界：容器连容器/容器连外部节点时连容器边缘（§10.8） */
  const routable = (id) => containerBoxes.get(id) || boxes.get(id);
  /* 视觉障碍：容器也是连线不得穿越的盒子 */
  const allBoxes = new Map(boxes);
  for (const [id, cb] of containerBoxes) allBoxes.set('CT_' + id, cb);
  /* X-1 专用：**只含节点盒**的障碍表（不含容器盒）。
     箭头落点的边界断言必须在节点盒上判，容器盒是分组的虚线框，连线按 §10.8 允许穿越其外框，
     把它并进来会产生假命中（例如进出容器的边必然与容器盒边界相交）。 */
  const nodeBoxes = new Map();
  for (const [id, bx] of boxes) if (!containerBoxes.has(id)) nodeBoxes.set(id, bx);

  /* ===== §10.13.3 / §10.13.4 预留通道列（**不依赖泳道**：反馈弧与跨列通道可单独使用）=====
     左/右通道必须在所有节点盒之外、与页边留 M、列宽 CH_W ≥ 48（§10.13.3）。
     坐标须等 x0/W 定案后才能算：此处先把画布扩宽并把已有内容整体右移 leftNeed，
     再把左通道放 M..M+CH_W、右通道放 W-M-CH_W..W-M，逐条验算"不穿盒 + 净距 ≥ CLEAR"。
     泳道图的通道需求在覆写块已算过一遍，这里统一按最终 W/x0 复算，保证与泳道标签带互不重叠。 */
  if (chSides.length) {
    const chW1 = Math.max(48, Number(fig.channelW) || 48);
    if (!chanL && !chanR) {
      chanL = chSides.includes('left') ? { side: 'left', w: chW1 } : null;
      chanR = chSides.includes('right') ? { side: 'right', w: chW1 } : null;
    }
    if (chanL) chanL.cx = Math.round(M + chW1 / 2);
    if (chanR) chanR.cx = Math.round(W - M - chW1 / 2);
    const cH = Math.max(contentH, 1);
    for (const ch of [chanL, chanR]) {
      if (!ch) continue;
      const cbx = { x: ch.cx - ch.w / 2, y: contentTop, w: ch.w, h: cH };
      if (cbx.x < M - 1e-6 || cbx.x + cbx.w > W - M + 1e-6) errors.push(`通道列(${ch.side}) x 范围 ${cbx.x}–${cbx.x + cbx.w} 超出画布可绘区（M=${M}, W=${W}）`);
      for (const [id, bx] of boxes) {
        const gap = Math.max(cbx.x - (bx.x + bx.w), bx.x - (cbx.x + cbx.w));
        if (gap < CLEAR - 1e-6) errors.push(`通道列(${ch.side}) 与节点 ${id} 净距 ${gap.toFixed(1)}px < ${CLEAR}px（§10.13.4 不得穿盒）`);
      }
      for (const [, cb2] of containerBoxes) {
        const gap = Math.max(cbx.x - (cb2.x + cb2.w), cb2.x - (cbx.x + cbx.w));
        if (gap < CLEAR - 1e-6) errors.push(`通道列(${ch.side}) 与容器盒净距 ${gap.toFixed(1)}px < ${CLEAR}px`);
      }
      for (const ln of (lanes || [])) if (rectsOverlap(cbx, ln)) errors.push(`通道列(${ch.side}) 与泳道标签带 ${ln.id} 重叠`);
      ch.x0 = cbx.x; ch.x1 = cbx.x + cbx.w;
    }
  }

  /* §10.4 中线对齐断言（按可视化行 visRow / 列 lane） */
  const byLayer = new Map(), byLane = new Map();
  for (const n of nodesWithRow) {
    const p = pos.get(n.id);
    if (!p) continue;
    if (!n.parent) {
      if (!byLayer.has(n.visRow)) byLayer.set(n.visRow, []);
      byLayer.get(n.visRow).push(axis === 'TB' ? p.cy : p.cx);
    }
    /* §10.4 同列对齐：用"实际列"判定——right 模式下子步骤实际被放到 lane+1 列。
       §10.13.1 泳道节点**排除**：泳道列 x 由泳道序号×CROSS 决定，且 spine（共同入口/出口）
       横向居中于泳道之间，与 §10.4 的"lane 列中线同线"不是同一概念（规格已声明泳道列不参与该断言）。 */
    const effLane = n.lane + (n.parent && (containers.find((c) => c.id === n.parent)?.branch || 'right') === 'right' ? 1 : 0);
    if (swimConts.length && !n.parent) continue;
    if (!byLane.has(effLane)) byLane.set(effLane, []);
    byLane.get(effLane).push(axis === 'TB' ? p.cx : p.cy);
  }
  for (const [k, v] of byLayer) if (Math.max(...v) - Math.min(...v) > 1e-6) errors.push(`同层 R${k} 中线未对齐`);
  for (const [k, v] of byLane) if (Math.max(...v) - Math.min(...v) > 1e-6) errors.push(`同列 C${k} 中线未对齐`);
  /* §10.8 非容器节点不得与容器行重叠 */
  for (const ct of containers) {
    if (!contRow.has(ct.id)) continue;
    const ls = childLayers.get(ct.id).slice().sort((a, b) => a - b);
    const lo = ls[0], hi = ls[ls.length - 1];
    for (const n of fig.nodes) {
      if (n.parent === ct.id || n.parent) continue;
      if (n.layer >= lo && n.layer <= hi) errors.push(`节点 ${n.id} 的行 ${n.layer} 落在容器 ${ct.id} 跨行 ${lo}-${hi} 内`);
    }
  }
  for (const ct of containers) {
    const ch = fig.nodes.filter((n) => n.parent === ct.id);
    if (ch.length && new Set(ch.map((n) => n.lane)).size > 1) notes.push(`容器 ${ct.id} 含 ${ch.length} 个并列子步骤`);
  }

  /* §10.6 / §10.7 框内文字（含容器标题） */
  for (const n of nodesWithRow) {
    if (n.lines.length > 2) errors.push(`节点 ${n.id} 文字超过 2 行`);
    for (const ln of n.lines) {
      if (/→.*→/.test(ln) || /-->/.test(ln)) errors.push(`节点 ${n.id} 框内出现链条式字符箭头：${ln}`);
      if (textWidth(ln) > MAXW) errors.push(`节点 ${n.id} 行宽 ${textWidth(ln)}px > ${MAXW}px：${ln}`);
    }
  }

  /* §10.2 分层 DAG（按可视化行 visRow 判前向；容器子步骤不单独承受跨行边） */
  /* §10.2 分层 DAG：语义 layer 单调（硬约束）；可视化行号跨多槽由容器所致，仅作提示 */
  const rowOf = new Map(nodesWithRow.map((n) => [n.id, rowRank.get(n.visRow)]));
  for (const ct of containers) if (contRow.has(ct.id)) rowOf.set(ct.id, rowRank.get(contRow.get(ct.id)));
  const layerOf = new Map(fig.nodes.map((n) => [n.id, n.layer]));
  for (const ct of containers) if (contRow.has(ct.id)) layerOf.set(ct.id, contRow.get(ct.id));
  /* ===== §10.13.0 显式豁免机制 =====
     既有断言**一条都不删除、不放宽**：只有"该边带相应标记（feedback/channel/bus/skip）
     且该边已在 fig.exemptions 里逐条登记了原因"时，才对该边放行对应断言；
     未登记就照旧报错（甚至因"标记未登记"额外报一条更明确的错）。
     可豁免的断言 id：
       'fold'          §10.3 每边 ≤1 折
       'acyclic'       §10.2 无环 / 非前向边（破坏分层 DAG）
       'shared-path'   §5.3 禁共用路径
       'box-clear'     §5.1 净距 6px（仅跳线/共用通道场景）
       'capacity'      节点/箭头预算（仅泳道标签带不占预算口径） */
  const EXEMPT_IDS = ['fold', 'acyclic', 'shared-path', 'box-clear', 'capacity'];
  const exemptionUsed = new Set();
  /* 登记键：逐边 'u->v'；也允许用总线 id（一次声明覆盖该总线的全部分支边）或 '*' 通配，
     后者用于"同一类原语在多条边上同因豁免"的成组声明。 */
  const exemptOnce = (e, assertId) => {
    const ids = [e.from + '->' + e.to];
    if (e.bus && e.bus.bs && e.bus.bs.id) ids.push(String(e.bus.bs.id));
    /* 扇入总线的登记以总线的 node（汇聚目标）为 id → 分支边（支→node）也应命中 */
    if (e.bus && e.bus.bs && e.bus.bs.node) ids.push(String(e.bus.bs.node));
    const reg = (fig.exemptions || []).find((x) => ids.includes(String(x.edge)) && x.assert === assertId)
      || (fig.exemptions || []).find((x) => String(x.edge) === '*' && x.assert === assertId);
    if (!reg) { errors.push(`边 ${e.from}->${e.to} 带 §10.13 标记但未在 fig.exemptions 登记豁免（断言 ${assertId}）——未登记不得放行`); return false; }
    if (!reg.reason || !String(reg.reason).trim()) { errors.push(`边 ${e.from}->${e.to} 的豁免登记缺 reason（断言 ${assertId}）`); return false; }
    exemptionUsed.add((reg.edge === '*' ? '（通配）' : reg.edge) + '|' + assertId);
    return true;
  };
  /* 登记表自查：断言 id 合法、边真实存在、该边确实带对应标记（杜绝"登记了却没用"与"登记错边"） */
  for (const x of (fig.exemptions || [])) {
    if (!EXEMPT_IDS.includes(x.assert)) errors.push(`豁免登记断言名「${x.assert}」不合法（合法：${EXEMPT_IDS.join('/')}）`);
    const edgeStr = String(x.edge || '');
    if (edgeStr === '*') { if (!x.reason || !String(x.reason).trim()) errors.push(`通配豁免登记缺 reason（断言 ${x.assert}）`); continue; }
    const [fa, fb] = edgeStr.split('->');
    const fe = fig.edges.find((q) => q.from === fa && q.to === fb);
    const busDecl = (fig.buses || []).find((q) => q.id === edgeStr);
    if (!fe && !busDecl) { errors.push(`豁免登记指向不存在的边或总线 ${edgeStr}`); continue; }
    if (!x.reason || !String(x.reason).trim()) errors.push(`豁免登记 ${edgeStr} 缺 reason（§10.13.0 必填）`);
    if (x.assert === 'acyclic' && fe && !fe.feedback && !fe.nonForward) errors.push(`豁免登记 ${edgeStr} 声明 acyclic，但该边未标 feedback:true / nonForward:true`);
    if (x.assert === 'fold' && fe && !(fe.feedback || fe.channel || fe.bus)) errors.push(`豁免登记 ${edgeStr} 声明 fold，但该边未标 feedback/channel/bus`);
    if (x.assert === 'fold' && busDecl && !(fig.edges || []).some((q) => (q.from === busDecl.node && (busDecl.targets || []).includes(q.to)) || (q.to === busDecl.node && (busDecl.targets || []).includes(q.from)))) errors.push(`豁免登记 ${edgeStr} 声明 fold，但该总线没有任何分支边`);
    if (x.assert === 'shared-path' && fe && !(fe.channel || fe.bus)) errors.push(`豁免登记 ${edgeStr} 声明 shared-path，但该边未标 channel/bus`);
  }
  for (const e of fig.edges) {
    if (!layerOf.has(e.from) || !layerOf.has(e.to)) { errors.push(`边 ${e.from}->${e.to} 引用了不存在的节点`); continue; }
    if (layerOf.get(e.to) <= layerOf.get(e.from)) {
      /* §10.13.3 / §10.13.4：真回边（feedback）与跨列通道（channel）必然是非前向或跨层边，
         仅当该边**已登记 §10.2 豁免**时放行；否则照旧报错。 */
      const marked = e.feedback || e.channel || e.nonForward;
      if (!marked || !exemptOnce(e, 'acyclic')) {
        if (marked) { /* 已在 exemptOnce 内报"未登记/缺 reason"，此处不重复 */ }
        else errors.push(`边 ${e.from}->${e.to} 非前向边（破坏分层 DAG）`);
      }
    }
    const dr = rowOf.get(e.to) - rowOf.get(e.from);
    if (dr > 1) notes.push(`边 ${e.from}->${e.to} 跨 ${dr} 个可视化槽位`);
  }
  /* 连线端点的可视锚点：容器↔容器 / 容器→外部 / 外部→容器 一律连容器边缘（§10.8）；
     同容器内的小步骤之间才允许连到子步骤本身。 */
  const endpointBox = (id) => {
    const c = containerBoxes.get(id);
    if (c) return { box: c, anchor: 'container', cont: c.ct };
    const nb = boxes.get(id);
    const nd = fig.nodes.find((n) => n.id === id);
    const st = (nd && STYLE[nd.type]) || {};
    /* ===== Y-1 根因修复：锚点必须按**实际画出来的形状**取盒 =====
       判定菱形在 SVG / drawio / vsdx 三处都画成 (NW+80) × (hBox+36)（见 toSVG / toDrawio / toVsdx
       的 `st.diamond ? NW + 80 : NW`），而 boxes 里存的是名义盒 240×64。
       旧代码拿名义盒算锚点 ⇒ 菱形目标的尖端停在 (cx, cy∓32)，而菱形顶点在 cy∓50：
       尖端深深落在**渲染出来的**菱形内部（18px），又被后绘制的白填充盖住 ——
       肉眼看得见"扎进盒子"，断言却拿名义盒自比、必然自洽 ⇒ 上一轮因此漏检。
       此处把菱形端点的盒换成渲染盒，锚点即落在菱形真正的顶点上。 */
    if (nb && st.diamond) {
      const ah = (nd.parent ? NH_SUB : NH) + 36;
      return {
        box: { x: nb.x + nb.w / 2 - (NW + 80) / 2, y: nb.y + nb.h / 2 - ah / 2, w: NW + 80, h: ah },
        anchor: 'node', cont: contOf(id), diamond: true
      };
    }
    return { box: nb, anchor: 'node', cont: contOf(id) };
  };
  const routedConts = fig.edges.map((e) => ({ e, src: endpointBox(e.from), dst: endpointBox(e.to) }));
  for (const r of routedConts) {
    if (!r.src.box || !r.dst.box) { r.skip = new Set(); continue; }
    /* 穿越检查时忽略"线与容器相交"：线必须为了连到内部小步骤而穿越自己所属容器 / 作为端点的容器 */
    /* 容器内的子步骤位于容器内部：凡是"跳过某容器"的连线，也必须跳过它的子步骤，
       否则每条进出容器的连线都会被自己容器内的子步骤判为穿越。 */
    const skip = new Set();
    const consider = (c) => { if (c) { skip.add('CT_' + c.id); for (const k of c.children) skip.add(k); } };
    consider(r.src.cont); consider(r.dst.cont);
    r.skip = skip;
  }

  /* 逐边选候选走线：A＝侧出→竖向入；B＝竖出→侧入（TB 下均为 1 折）
     端点位置：跨容器连线用容器盒中心，同容器内的父子/兄弟连线用节点中心（§10.8） */
  /* ===== §10.13.2 总线（bus：扇出 / 扇入）=====
     规格：fig.buses = [{ id, dir:'out'|'in', node, targets:[...], label? }]
       · 扇出：源 node 下缘向下 RAIL_GAP(=24) 处一条水平导轨；每支一条竖短枝 + 一个箭头
       · 扇入：镜像——各支节点下缘竖直下到导轨，再由导轨中央一条竖枝向下入目标上缘
       · 接入点 off_k = L × k/(N+1)（k=1…N）；相邻 ≥12px ⇒ L ≥ 12(N+1)
       · 导轨不得与主轴共线：|y_rail − y(主轴所在行)| ≥ 24
     走线为"源 → 横杆 → 竖枝 → 目标"= 2 折（§10.13.0 要求显式豁免 §10.3「每边 ≤1 折」）。 */
  const BUS_GAP = 24;
  const busMap = new Map();
  const busRails = [];
  for (const bs of (fig.buses || [])) {
    if (bs.dir !== 'out' && bs.dir !== 'in') { errors.push(`总线 ${bs.id || '(未命名)'} 的 dir 必须为 'out' 或 'in'`); continue; }
    const src = bs.node, tgts = bs.targets || [];
    if (!nodeIds.has(src)) { errors.push(`总线 ${bs.id} 的 node ${src} 不存在`); continue; }
    const N = tgts.length;
    if (N < 3) errors.push(`总线 ${bs.id} 仅 ${N} 支，<3 不用总线（§10.13.2 允许条件：单源 ≥3 支直连即可）`);
    for (const t of tgts) if (!nodeIds.has(t)) errors.push(`总线 ${bs.id} 的 target ${t} 不存在`);
    /* 防呆：一条边的两端不得被两条总线各自认领（否则走线语义自相矛盾） */
    for (const t of tgts) if (busMap.has(t + '->' + src) || busMap.has(src + '->' + t)) errors.push(`总线 ${bs.id} 的边 ${src}↔${t} 被重复登记`);
    const pS = pos.get(src);
    const railY = bs.dir === 'out' ? pS.cy + NH / 2 + BUS_GAP : pS.cy - NH / 2 - BUS_GAP;
    /* 导轨不得与主轴共线 */
    for (const n of fig.nodes) {
      const p = pos.get(n.id);
      const d = Math.abs(railY - p.cy);
      if (d < 24 - 1e-9) errors.push(`总线 ${bs.id} 导轨 y=${railY} 与节点 ${n.id} 所在行 y=${p.cy} 共线（|Δy|=${d} < 24，§10.13.2）`);
    }
    /* 导轨跨度与接入点（§10.13.2 正解，2026-09 修正）：
       · 接入点 = 各支**自己目标的中心 x**（扇入镜像：各支**自己源的中心 x**）——
         总线的竖短枝一律从该支端点的中心竖直进出，箭头才落在目标盒内；
         导轨只负责把 min..max 接入点水平连通。
       · `off_k = L×k/(N+1)` **只用于**多条边共用同一个挂点（同一源侧 / 同一目标侧）时把挂点错开，
         **不得**再用来给"不同目标"分配落点——旧口径 `bx = railX0 + step×(k+1)` 会把所有目标
         在全导轨上等分：3 个共线目标的最外侧落点恒为 L/4，240 宽盒只容 ±120 ⇒ 箭头落到盒外。 */
    const busPts = tgts.map((t) => Math.round(pos.get(t).cx)).sort((a, b) => a - b);
    const railX0 = Math.min(pS.cx, ...busPts), railX1 = Math.max(pS.cx, ...busPts);
    const L = railX1 - railX0;
    const step = L / (N + 1);
    let minGap = Infinity;
    for (let i = 1; i < busPts.length; i++) minGap = Math.min(minGap, busPts[i] - busPts[i - 1]);
    if (busPts.length >= 2 && step < 12 - 1e-9) errors.push(`总线 ${bs.id} 接入点间距步长 L/(N+1)=${step.toFixed(2)}px < 12px（L=${L}，§10.13.2）`);
    if (Number.isFinite(minGap) && minGap < 12 - 1e-9) errors.push(`总线 ${bs.id} 相邻接入点实际净距 ${minGap.toFixed(2)}px < 12px（接入点取各支自己目标的中心 x，故受目标列距约束，§10.13.2）`);
    if (railX1 - railX0 < 12 - 1e-9) errors.push(`总线 ${bs.id} 导轨水平跨度 ${(railX1 - railX0).toFixed(2)}px < 12px（§10.13.2）`);
    /* 源侧竖干按分支序号错开（同一源侧的挂点必须错开）；错开量须留在源盒宽度内，
       否则竖干会从源盒左右缘钻出，接入点语义失效 */
    if ((N - 1) * 24 > pS.w - 24 + 1e-9) errors.push(`总线 ${bs.id} 源侧挂点错开量 ${((N - 1) * 24).toFixed(1)}px 超出源节点 ${src} 盒宽 ${pS.w}px（挂点须落在源下缘内，§10.13.2）`);
    const sorted = tgts.slice().sort((a, b) => pos.get(a).cx - pos.get(b).cx);
    sorted.forEach((t, k) => {
      const rp = pos.get(t);
      const off = minGap === 0 ? 0 : (Number.isFinite(minGap) ? minGap * (k + 1) : 0);   /* 仅登记，不再参与落点分配 */
      /* 接入点 = **该支自己端点**的中心 x：
         扇出（支＝源→目标）取目标中心 x；扇入（支＝源→同一汇聚目标）取**该支源**的中心 x，
         各支在主轴上零横向偏移，落点才不会与自己的端点列错开。 */
      const bx = Math.round(bs.dir === 'out' ? rp.cx : pS.cx);
      busMap.set(bs.dir === 'out' ? src + '->' + t : t + '->' + src, { bs, off, railY, railX0, railX1, bx, side: bs.dir });
      /* 竖枝不得穿过别的节点盒（导轨与带之间只有 88px，仍可能撞同带节点） */
      const rx = bx - NW / 2, ry = Math.min(railY, bs.dir === 'out' ? rp.cy - NH / 2 : rp.cy + NH / 2), rh = Math.abs(rp.cy - (bs.dir === 'out' ? NH / 2 : -NH / 2) - railY) + NH;
      for (const [id, bx2] of boxes) {
        if (id === t || id === src || tgts.includes(id)) continue;   /* 源、该支目标、以及同总线的其他支目标都是端点语义，不算穿越 */
        if (rectsOverlap({ x: rx, y: ry, w: NW, h: rh }, bx2)) errors.push(`总线 ${bs.id} 的分支竖枝（接入点 x=${bx.toFixed(1)}）与节点 ${id} 盒重叠（§10.13.4 净距 6px 口径）`);
      }
    });
    busRails.push({ id: bs.id, dir: bs.dir, node: src, railY, railX0: Math.round(railX0), railX1: Math.round(railX1), L, N, step, targets: sorted, accessXs: busPts, label: bs.label || null });
  }

  const E = fig.edges.map((e, i) => {
    const S = endpointBox(e.from), T = endpointBox(e.to);
    /* §10.8 锚点口径：端点中心与"该端点自身盒高/盒宽"一并带出，供 anchorOf 与其后的
       drawio exit/entry 归一化共用；盒高来自 boxes（容器子步骤 NH_SUB=40、普通节点 NH=64），
       禁止再写死 NH/2，否则进出容器子步骤上/下边的边会在子步骤外 12px 收尾（箭头悬空）。 */
    const s = { cx: S.box.x + S.box.w / 2, cy: S.box.y + S.box.h / 2, w: S.box.w, h: S.box.h };
    const t = { cx: T.box.x + T.box.w / 2, cy: T.box.y + T.box.h / 2, w: T.box.w, h: T.box.h };
    /* §10.8 侧向分叉：父节点 → 同一容器的多个子步骤时，各支共用一根短横杆 + 竖干，再横支到各子步骤左缘 */
    const dstNode = fig.nodes.find((n) => n.id === e.to);
    const dstCt = dstNode && dstNode.parent ? containers.find((c) => c.id === dstNode.parent) : null;
    const srcNode = fig.nodes.find((n) => n.id === e.from);
    const fork = !!dstCt && !!srcNode && !srcNode.parent && kidsOf(dstCt).length >= 2
      && kidsOf(dstCt).some((k) => k.layer === srcNode.layer + 1);
    return { ...e, idx: i, assign: 'A', fork, sPos: s, tPos: t, srcBox: S.box, dstBox: T.box, skip: routedConts[i].skip, bus: busMap.get(e.from + '->' + e.to) || null };
  });
  const anchorOf = (p, side, o) => {
    /* 上/下锚点按"该节点自身盒高"取半（容器子步骤 40/2=20，普通节点 64/2=32），
       与 boxes 的 h（halfOf 同源）口径一致；横向锚点同理取该端点自身盒宽。 */
    const hw = (Number.isFinite(p.w) ? p.w : NW) / 2;
    const hh = (Number.isFinite(p.h) ? p.h : NH) / 2;
    switch (side) {
      case 'r': return { x: p.cx + hw, y: p.cy + o };
      case 'l': return { x: p.cx - hw, y: p.cy + o };
      case 't': return { x: p.cx + o, y: p.cy - hh };
      default:  return { x: p.cx + o, y: p.cy + hh };
    }
  };
  const planOf = (e) => {
    const s = e.sPos, t = e.tPos;
    if (axis === 'TB') {
      const sameCol = Math.abs(s.cx - t.cx) < 1e-6;
      const sameRow = Math.abs(s.cy - t.cy) < 1e-6;
      const right = t.cx > s.cx;
      /* ===== Y-1 / Y-4（根因）：TB 下"非标准流向"的两种形态必须改出入口边，否则三角穿盒 =====
         ① 目标在上方（up）却仍取 tSide='t'：末段自**盒内**向上再停到上缘 ⇒ 三角扎进盒子。
            断言 X-3 在 图6-1 的 n10->n8 上实测到 10×10px 的穿透（旧 X-1 拿名义盒只判尖端一点，
            故一直没报）。正解：入边取**下缘**（tSide='b'）。
         ② 源与目标**同一带中线**（sameRow，同带不同列，容器子步骤与同带父节点常出现）：
            若取 tSide='t'，末段自 (cx, cy) 竖直上移 hh(20~32px) 到上缘 —— 起点就在盒的竖向
            区间内，同样穿盒。正解：同行边改为**水平直连**（出侧缘、入侧缘，0 折）。
        这两种形态都既可能来自显式登记的 `nonForward` 边（layer 不增，破坏 §10.2 分层 DAG，
        必须在 fig.exemptions 登记 acyclic 且 reason 必填），也可能来自容器 / 分带造成的几何结果
        （语义 layer 仍严格前向，如 图6-1 的 n10->n8）。 */
      const up = t.cy < s.cy - 1e-6;
      if (sameCol && sameRow) return { same: true, sSide: 'r', tSide: 'l' };     /* 退化：两点合一 */
      if (sameRow) return { same: true, sSide: right ? 'r' : 'l', tSide: right ? 'l' : 'r' };
      if (sameCol) return { same: true, sSide: up ? 't' : 'b', tSide: up ? 'b' : 't' };
      if (up) return { same: false, sSide: right ? 'r' : 'l', tSide: 'b' };
      return e.assign === 'A'
        ? { same: false, sSide: right ? 'r' : 'l', tSide: 't' }
        : { same: false, sSide: 'b', tSide: right ? 'l' : 'r' };
    }
    const same = Math.abs(s.cy - t.cy) < 1e-6;
    if (same) return { same: true, sSide: 'r', tSide: 'l' };
    const down = t.cy > s.cy;
    return e.assign === 'A'
      ? { same: false, sSide: 'r', tSide: down ? 't' : 'b' }
      : { same: false, sSide: down ? 'b' : 't', tSide: 'l' };
  };

  let paths = [];
  for (let iter = 0; iter < 8; iter++) {
    for (const e of E) {
      const pl = planOf(e);
      e.sSide = pl.sSide; e.tSide = pl.tSide; e.same = pl.same;
      /* §10.8 分叉：源固定父节点右缘中点，目标固定子步骤左缘中点（而不是上边） */
      if (e.fork) { e.sSide = 'r'; e.tSide = 'l'; e.same = false; }
    }
    const groups = new Map();
    const add = (id, side, e, role) => {
      const k = id + '||' + side;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ e, role });
    };
    for (const e of E) { add(e.from, e.sSide, e, 's'); add(e.to, e.tSide, e, 't'); }
    const oMap = new Map();
    for (const [, list] of groups) {
      list.forEach(({ e, role }, i) => {
        const o = (i - (list.length - 1) / 2) * 24;
        if (!oMap.has(e.idx)) oMap.set(e.idx, {});
        oMap.get(e.idx)[role] = o;
      });
    }
    paths = [];
    for (const e of E) {
      const s = e.sPos, t = e.tPos;
      const o = oMap.get(e.idx) || {};
      const oS = o.s ?? 0;
      const oT = e.same ? oS : (o.t ?? 0);
      const a = anchorOf(s, e.sSide, oS), b = anchorOf(t, e.tSide, oT);
      let pts;
      if (e.feedback || e.channel) {
        /* §10.13.3 反馈弧 / §10.13.4 跨列通道：固定三段 2 折
           ① 水平出：末端节点左(右)缘中点 → 通道列
           ② 竖直上行：沿通道列上行到起点 y
           ③ 水平入：从通道列水平入起点节点左(右)缘中点
           同一通道列上多条长边不得完全重合：按 ≥12px 逐条错开。 */
        const side = e.channel || fig.channel || 'right';
        const ch = side === 'left' ? chanL : chanR;
        if (!ch) {
          errors.push(`边 ${e.from}->${e.to} 声明 ${e.feedback ? 'feedback' : 'channel'} 但未预留 ${side} 通道列`);
          pts = [a, b];
        } else {
          /* 同通道列上的多条长边必须错开 ≥12px（§10.13.4）：
             取"实际使用该侧的全部 §10.13 边"作为同组，按出现次序对称错开；
             用 findIndex 直接匹配 channel 字段会把"用默认侧"的边算成 -1 → 两条边重合（自测实测）。 */
          const sideGroup = fig.edges.filter((x) => (x.feedback || x.channel) && (x.channel || fig.channel || 'right') === side);
          const idx = Math.max(0, sideGroup.findIndex((x) => x.from === e.from && x.to === e.to));
          const n = sideGroup.length;
          const usable = Math.max(0, ch.w - 2 * CLEAR);
          const spread = Math.max(12, usable / Math.max(1, n - 1));
          const off = n <= 1 ? 0 : (idx - (n - 1) / 2) * spread;
          const cX = Math.round(ch.cx + off);
          const sSide = side === 'left' ? 'l' : 'r';
          pts = [
            anchorOf(s, sSide, 0),
            { x: cX, y: s.cy },
            { x: cX, y: t.cy },
            anchorOf(t, sSide, 0)
          ];
        }
      }
      else if (e.bus) {
        /* §10.13.2 总线走线：横杆(导轨) + 竖枝 = 2 折
           扇出：源下缘中点 → 导轨 → 接入点 → 目标上缘中点
           扇入：支节点下缘中点 → 导轨 → 导轨中央竖枝 → 目标上缘中点 */
        const rY = e.bus.railY, bX = e.bus.bx;
        /* 源侧竖干按分支序号错开：总线 N 支都从同一源出线，不错开会落在同一挂点上
           （触发"同边挂点间距 ≥12px"断言，自测实测 0.0px）。错开量取 §5.4 扇形口径 24px。 */
        const busK = e.bus.bs.targets.indexOf(e.from === e.bus.bs.node ? e.to : e.from);
        const busN = Math.max(1, e.bus.bs.targets.length);
        const trunkX = Math.round(s.cx + (busK - (busN - 1) / 2) * 24);
        if (e.bus.side === 'out') {
          /* 竖枝终点取目标**上缘中点**（不能用 a/b，那是 planOf 选的侧向锚点，会生成斜线）。
             落点 x 必须等于该支的接入点 e.bus.bx（＝目标中心 x）——取 trunkX 会把箭头错开到
             源的挂点 x 上，在"目标与源不同列"时箭头落到盒外（本处即旧病灶）。 */
          pts = [{ x: trunkX, y: s.cy + s.h / 2 }, { x: trunkX, y: rY }, { x: bX, y: rY }, { x: bX, y: t.cy - t.h / 2 }];
        } else {
          /* 扇入：各支从**自己源的中心 x** 竖直下到导轨（接入点＝该支源的中心 x，水平位移 0），
             再由导轨横走到目标中心 x、竖直入目标上缘中点（＝t.cx，不是 e.bus.bx）。 */
          pts = [{ x: trunkX, y: s.cy + s.h / 2 }, { x: trunkX, y: rY }, { x: t.cx, y: rY }, { x: t.cx, y: t.cy - t.h / 2 }];
        }
      }
      else if (e.same) pts = [a, b];
      else if (e.fork) {
        /* §10.8 侧向分叉（三段线）：
           ① 子步骤左缘 →(沿 x 轴的横段)→ ② 竖干（位于父节点与子步骤列的正中间，纵向贯通所有子步骤）
           ③ 父节点右缘 →(横段)→ 竖干 */
        const trunkX = Math.round(((e.srcBox.x + e.srcBox.w) + e.dstBox.x) / 2 / 4) * 4;
        pts = [{ x: e.srcBox.x + e.srcBox.w, y: e.srcBox.y + e.srcBox.h / 2 }, { x: trunkX, y: e.srcBox.y + e.srcBox.h / 2 }, { x: trunkX, y: b.y }, b];
      }
      else if (e.assign === 'A') pts = [a, { x: b.x, y: a.y }, b];
      else pts = [a, { x: a.x, y: b.y }, b];
      paths.push({ e, pts, a, b });
    }
    let flipped = 0;
    for (const { e, pts } of paths) {
      if (e.same || e.bus || e.feedback || e.channel) continue;   /* §10.13 原语走线为规格固定形态，不参与 A/B 碰撞翻转 */
      let hit = false;
      for (const [id, bx] of allBoxes) {
        if (id === e.from || id === e.to) continue;
        if (e.skip.has(id)) continue;
        const rb = inflate(bx, CLEAR);
        for (let i = 0; i < pts.length - 1; i++) if (segRectHit(pts[i], pts[i + 1], rb)) { hit = true; break; }
        if (hit) break;
      }
      if (hit) { e.assign = e.assign === 'A' ? 'B' : 'A'; flipped++; }
    }
    if (flipped === 0) break;
  }

  /* ===== Z-1 外让：把每条折线的**末端点**沿末段方向向盒外退让 ARROW_OUTSET px =====
     为什么放在这里：① 在所有走线（含 A/B 候选翻转）定稿之后、在所有几何断言之前——
     断言必须判**最终**几何，否则又是"几何自比、必然自洽"的老病；
     ② 只动末端点、且方向是末段的**反向**，故折线仍是纯正交，且新线段是原线段的**子集**，
     不可能新增"穿盒"命中、也不可能新增"共用路径"；
     ③ 对所有边型统一生效，不做任何按边/按图的特判（含菱形/胶囊/普通盒/容器入口/总线/反馈弧/通道/分叉）。
     注意：退让沿末段方向，故"同边挂点间距"的横向间距不变；drawio 的 exit/entry 锚点是
     盒上的 0/1 属性、不是坐标，也不受影响。 */
  if (ARROW_OUTSET > 0) {
    for (const P of paths) {
      const pts = P.pts;
      P.out = 0;                                   /* 默认未外让；apply 后写 ARROW_OUTSET */
      if (pts.length < 2) continue;
      const q = pts[pts.length - 1], p = pts[pts.length - 2];
      const vx = q.x - p.x, vy = q.y - p.y, vl = Math.hypot(vx, vy);
      if (vl <= ARROW_OUTSET + 1e-9) continue;   /* 末段短于退让量：不吞箭头，保持原样并由 X-1 响亮报错 */
      pts[pts.length - 1] = { x: q.x - (vx / vl) * ARROW_OUTSET, y: q.y - (vy / vl) * ARROW_OUTSET };
      P.out = ARROW_OUTSET;                        /* 记录"实际让了多少"，供 drawio 侧同源消费 */
    }
  }

  /* 硬约束校验 */
  const focusCount = fig.nodes.filter((n) => STYLE[n.type].focus).length;
  /* §10.8 预算折算：1 容器 = 1 节点，容器内每个小步骤 = 0.5 节点，总视觉单元 ≤9 */
  if (!Number.isInteger(visualUnits * 2)) errors.push(`视觉单元折算异常：${visualUnits}`);
  /* §10.13.0 修正（本轮）：`capacity` 此前**从未生效**——登记表里合法、断言处却直接 push，
     等于"登记了也不放行"。现按同一口径接上：capacity 是**图级**预算豁免（不隶属任何一条边），
     登记键固定 `'*'`（逐边键对图级预算无意义）；节点预算与箭头预算各自独立豁免，
     未登记 / 缺 reason 一律照旧报错——既有断言一条未删、一条未放宽。 */
  const exemptCapacity = (what) => {
    const reg = (fig.exemptions || []).find((x) => x.assert === 'capacity' && String(x.edge) === '*');
    if (!reg) return false;
    if (!reg.reason || !String(reg.reason).trim()) { errors.push(`capacity 豁免登记缺 reason（${what}）`); return false; }
    exemptionUsed.add('（通配）|capacity');
    return true;
  };
  if (visualUnits > 9) {
    if (exemptCapacity(`视觉单元 ${visualUnits}`)) notes.push(`视觉单元 ${visualUnits} > 9 —— 已按 §10.13.0 capacity 豁免放行（fig.exemptions 有登记，见 绘图路线/§5.5）`);
    else errors.push(`视觉单元 ${visualUnits} > 9（容器计 1、容器内小步骤计 0.5）`);
  }
  if (fig.nodes.length > 9) notes.push(`语义节点 ${fig.nodes.length} > 9，已按容器折算为 ${visualUnits} 视觉单元`);
  if (fig.edges.length > 12) {
    if (exemptCapacity(`箭头数 ${fig.edges.length}`)) notes.push(`箭头数 ${fig.edges.length} > 12 —— 已按 §10.13.0 capacity 豁免放行`);
    else errors.push(`箭头数 ${fig.edges.length} > 12`);
  }

  /* §10.8 容器几何与不重叠 */
  for (const [cid, cb] of containerBoxes) {
    for (const [nid, nb] of boxes) {
      if (fig.nodes.find((n) => n.id === nid).parent !== cid) continue;
      const top = nb.y - cb.y, lft = nb.x - cb.x;
      const right = cb.x + cb.w - (nb.x + nb.w), bot = cb.y + cb.h - (nb.y + nb.h);
      if (Math.min(top, bot, lft, right) < 12 - 1e-6) errors.push(`容器 ${cid} 对小步骤 ${nid} 的 padding 不足 12px（上${top.toFixed(0)} 下${bot.toFixed(0)} 左${lft.toFixed(0)} 右${right.toFixed(0)}）`);
    }
    for (const [oid, ob] of containerBoxes) {
      if (oid <= cid) continue;
      if (rectsOverlap(cb, ob)) errors.push(`容器 ${cid} 与容器 ${oid} 重叠`);
    }
    for (const [nid, nb] of boxes) {
      const own = fig.nodes.find((n) => n.id === nid).parent === cid;
      if (!own && rectsOverlap(cb, nb)) errors.push(`容器 ${cid} 与外部节点 ${nid} 重叠`);
    }
  }

  /* ===== X-3（Y-1）审计数据：每条边的"渲染三角外接盒 + 目标盒"随 layout.json 落盘，
     供 SVG 之外的独立复核重算，不复用生成器自己的判定结果。 ===== */
  const arrowAudit = [];
  for (const { e, pts } of paths) {
    /* §10.3「每边 ≤1 折」：分叉边（§10.8 共用横杆+竖干）与已登记的 §10.13 原语（总线/反馈弧/跨列通道）
       为 2 折；后者必须先命中豁免登记才放行。 */
    if (!e.fork && pts.length - 2 > 1) {
      const marked = e.feedback || e.channel || e.bus;
      if (!marked || !exemptOnce(e, 'fold')) {
        if (!marked) errors.push(`边 ${e.from}->${e.to} 折弯 ${pts.length - 2} > 1`);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      if (Math.abs(p.x - q.x) > 1e-6 && Math.abs(p.y - q.y) > 1e-6) errors.push(`边 ${e.from}->${e.to} 存在斜线`);
    }
    let hitBox = null;
    for (const [id, bx] of allBoxes) {
      if (id === e.from || id === e.to) continue;
      if (e.skip.has(id)) continue;
      const rb = inflate(bx, CLEAR);
      for (let i = 0; i < pts.length - 1; i++) if (segRectHit(pts[i], pts[i + 1], rb)) { hitBox = id; break; }
      if (hitBox) break;
    }
    if (hitBox) errors.push(`边 ${e.from}->${e.to} 穿过非端点盒子 ${hitBox}`);
    /* ===== X-1 永久断言：箭头必须停在**目标盒之外**，且不得进入任何盒子内部 =====
       口径（对全 24 张生效，不设任何豁免；泳道/总线/反馈弧/跨列通道一并适用）：
         · tip = 该边折线的最后一点（SVG/drawio 的箭头尖端都在此点，标记 refX=ARROW_LEN 使箭头体落在该点之前）
         · ①【Z-1 已改口径】**tip 必须在目标盒的"外部"，且到目标盒的外距 ≥ ARROW_OUT_MIN(2px)；
              并且箭头三角的外接盒不得与目标盒内部相交（容差 0）。**
           改口径的理由（与 build.mjs 顶部 Z-1 注释、报告 write/impl-Z1-Z2.md 同源）：
             旧口径是"tip 落在盒边界上，点到最近边的距离 ≤ TOL_AXIS(1.0px)"。
             实测（改动前，独立脚本从 SVG 折线 + layout.json 目标盒重算，全 24 图 174 条边）
             旧口径下**外距一律 = 0.000px**：尖端几何上恰好压在盒线上。用户在 PNG 上读到的
             "净距 3px"只是三角尖端被抗锯齿抹掉后的栅格化错觉，规格本身没要求留缝——
             这正是"箭头贴边／像进框"观感的来源。故口径由"贴边（≤1px）"改为
             "外让（在外部且 ≥2px）"，并显式并入"三角外接盒不得与目标盒内部相交（容差 0）"，
             使"贴边"从合格变违规。
             **这是改口径，不是放宽、更不是删除**：新口径比旧口径更严
             （旧口径允许 0px 贴合，新口径要求 ≥2px；且旧口径对"三角外接盒 vs 目标盒"完全没判）。
         · ② tip 不得落在**任一非目标节点盒**内部（严格内部，容差 TOL_AXIS）——② 不属 Z-1 授权改动范围，
              口径与容差**保持原样不变**，TOL_AXIS 常量因此保留、只服务 ②。
       容器盒不参与 ②：容器是 §10.8 分组虚线框，进出容器的边必然穿越其外框，属规格允许。 */
    const tipPt = pts[pts.length - 1];
    const tipBox = endpointBox(e.to);
    if (tipBox && tipBox.box) {
      const TOL_AXIS = 1.0;                 /* 仅服务 ②（严格内部余量），语义未变 */
      const bx = tipBox.box;
      /* 点到目标盒的**外距**：点在盒外 = 到盒的欧氏距离；点在盒内/盒上 = 0。
         用外距而非"到最近边的距离"，是为了让"点在盒内"也读出 0，而不是某个正数被误判为合格。 */
      const dOut = Math.hypot(
        Math.max(bx.x - tipPt.x, 0, tipPt.x - (bx.x + bx.w)),
        Math.max(bx.y - tipPt.y, 0, tipPt.y - (bx.y + bx.h))
      );
      /* Z-1 口径要求的"三角外接盒与目标盒内部不得相交（容差 0）"：按**渲染几何**重建三角
         （与 X-3 同一算法、同一 ARROW_LEN/ARROW_HALF，见下方 X-3 块；X-3 仍对全部盒再判一次）。 */
      let tri = null;
      if (pts.length >= 2) {
        const q = pts[pts.length - 1], p = pts[pts.length - 2];
        const vx = q.x - p.x, vy = q.y - p.y, vl = Math.hypot(vx, vy);
        if (vl > 1e-9) {
          const ux = vx / vl, uy = vy / vl;
          const tv = [
            { x: q.x, y: q.y },
            { x: q.x - ux * ARROW_LEN + uy * ARROW_HALF, y: q.y - uy * ARROW_LEN - ux * ARROW_HALF },
            { x: q.x - ux * ARROW_LEN - uy * ARROW_HALF, y: q.y - uy * ARROW_LEN + ux * ARROW_HALF }
          ];
          tri = {
            x: Math.min(...tv.map((v) => v.x)), y: Math.min(...tv.map((v) => v.y)),
            w: Math.max(...tv.map((v) => v.x)) - Math.min(...tv.map((v) => v.x)),
            h: Math.max(...tv.map((v) => v.y)) - Math.min(...tv.map((v) => v.y))
          };
        }
      }
      if (dOut < ARROW_OUT_MIN - 1e-9) {
        errors.push(`X-1 箭头未停在目标盒之外（Z-1 外让口径：外距须 ≥${ARROW_OUT_MIN}px）：边 ${e.from}->${e.to} 尖端(${f(tipPt.x)},${f(tipPt.y)}) 到 ${e.to} 盒的外距 ${f(dOut)}px（盒 x${f(bx.x)}..${f(bx.x + bx.w)} y${f(bx.y)}..${f(bx.y + bx.h)}）`);
      }
      if (tri && rectsOverlap(tri, bx)) {
        errors.push(`X-1 箭头三角外接盒与目标盒内部相交（容差 0）：边 ${e.from}->${e.to} 三角 x${f(tri.x)}..${f(tri.x + tri.w)} y${f(tri.y)}..${f(tri.y + tri.h)} ∩ ${e.to} 盒 x${f(bx.x)}..${f(bx.x + bx.w)} y${f(bx.y)}..${f(bx.y + bx.h)}`);
      }
      for (const [id, nb] of nodeBoxes) {
        if (id === e.to) continue;
        if (tipPt.x > nb.x + TOL_AXIS && tipPt.x < nb.x + nb.w - TOL_AXIS
          && tipPt.y > nb.y + TOL_AXIS && tipPt.y < nb.y + nb.h - TOL_AXIS) {
          errors.push(`X-1 箭头落在非目标节点盒内部：边 ${e.from}->${e.to} 尖端(${f(tipPt.x)},${f(tipPt.y)}) 在节点 ${id} 盒内（盒 x${f(nb.x)}..${f(nb.x + nb.w)} y${f(nb.y)}..${f(nb.y + nb.h)}）`);
        }
      }
    }
    /* ===== X-3 永久断言（Y-1）：**渲染出来的箭头三角**与目标节点盒的内部不得相交（容差 0）=====
       X-1 只判"尖端这一个点"，而且拿**名义盒**当目标（菱形 240×64）——对两件事都瞎：
         (a) 三角整条身子扎进盒子；(b) 菱形实际画的是 320×100、比名义盒大一圈。
       这正是上一轮"几何自比 ⇒ 必然自洽 ⇒ 漏检"的成因，故 X-3 **按渲染几何重建三角**：
         · 尖端 = 折线最后一点（marker 的 refX=ARROW_LEN 使三角尖端恰好落在该点）
         · 底边 = 沿末段反方向回溯 ARROW_LEN，半宽 ARROW_HALF
         · 取三角的**外接盒**，与目标节点盒（按**实际画出来**的尺寸，菱形 NW+80 × hBox+36）
           的**内部**求交，容差 0（rectsOverlap 为严格不等 ⇒ "共边相邻"不算相交）。
       对全 24 张生效，不设任何豁免：泳道 / 总线 / 反馈弧 / 跨列通道一并适用。 */
    if (pts.length >= 2) {
      const q = pts[pts.length - 1], p = pts[pts.length - 2];
      const vx = q.x - p.x, vy = q.y - p.y, vl = Math.hypot(vx, vy);
      if (vl > 1e-9) {
        const ux = vx / vl, uy = vy / vl;
        const tri = [
          { x: q.x, y: q.y },
          { x: q.x - ux * ARROW_LEN + uy * ARROW_HALF, y: q.y - uy * ARROW_LEN - ux * ARROW_HALF },
          { x: q.x - ux * ARROW_LEN - uy * ARROW_HALF, y: q.y - uy * ARROW_LEN + ux * ARROW_HALF }
        ];
        const ab = {
          x: Math.min(...tri.map((v) => v.x)), y: Math.min(...tri.map((v) => v.y)),
          w: Math.max(...tri.map((v) => v.x)) - Math.min(...tri.map((v) => v.x)),
          h: Math.max(...tri.map((v) => v.y)) - Math.min(...tri.map((v) => v.y))
        };
        arrowAudit.push({ edge: `${e.from}->${e.to}`, tri: ab, target: tipBox && tipBox.box ? tipBox.box : null });
        if (tipBox && tipBox.box) {
          const tb3 = tipBox.box;
          if (rectsOverlap(ab, tb3)) {
            const ow = Math.min(ab.x + ab.w, tb3.x + tb3.w) - Math.max(ab.x, tb3.x);
            const oh = Math.min(ab.y + ab.h, tb3.y + tb3.h) - Math.max(ab.y, tb3.y);
            errors.push(`X-3 箭头三角外接盒与目标盒内部相交（容差 0）：边 ${e.from}->${e.to} 三角 x${f(ab.x)}..${f(ab.x + ab.w)} y${f(ab.y)}..${f(ab.y + ab.h)} ∩ ${e.to} 盒 x${f(tb3.x)}..${f(tb3.x + tb3.w)} y${f(tb3.y)}..${f(tb3.y + tb3.h)}，重叠 ${f(ow)}×${f(oh)}px`);
          }
        }
        for (const [id, nb] of nodeBoxes) {
          if (id === e.to) continue;
          if (rectsOverlap(ab, nb)) errors.push(`X-3 箭头三角外接盒与节点 ${id} 盒内部相交（容差 0）：边 ${e.from}->${e.to}`);
        }
      }
    }
  }

  /* ===== §10.13.4 跳线（bridge / hop）断言 =====
     通道列上的长边与其他边必须相交时，用跳线跨过，`[禁]` 一条线斜着穿过另一条。
     适用面**只限**走通道列的长边（feedback / channel）：§10.8 分叉的正交交叉属既有形态，
     不在 §10.13.4 管辖范围，否则会把未启用通道的既有图误判为违规。
     规格：fig.hops = [{ a:'u->v', b:'x->y' }]——逐对登记"这两条边在通道列上相交、已用跳线处理"。
     本断言做两件事：① 找出所有"水平段 × 竖直段"的正交交叉；② 每个交叉必须能在 fig.hops 里找到登记，
     否则报错（交叉未用跳线处理）。因所有线段都已断言为纯水平/纯垂直，故不存在斜穿的可能。 */
  const crossPoints = [];
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const A = paths[i], B = paths[j];
      if (A.e.idx === B.e.idx) continue;
      if (!(A.e.feedback || A.e.channel || B.e.feedback || B.e.channel)) continue;
      for (let u = 0; u < A.pts.length - 1; u++) {
        for (let v = 0; v < B.pts.length - 1; v++) {
          const p = A.pts[u], q = A.pts[u + 1], r = B.pts[v], s2 = B.pts[v + 1];
          const aH = Math.abs(p.y - q.y) < 1e-6, aV = Math.abs(p.x - q.x) < 1e-6;
          const bH = Math.abs(r.y - s2.y) < 1e-6, bV = Math.abs(r.x - s2.x) < 1e-6;
          if (!(aH && bV) && !(aV && bH)) continue;
          if (aH && bV) {
            const x = r.x, y = p.y;
            if (x > Math.min(p.x, q.x) + 1e-6 && x < Math.max(p.x, q.x) - 1e-6 &&
                y > Math.min(r.y, s2.y) + 1e-6 && y < Math.max(r.y, s2.y) - 1e-6) {
              crossPoints.push({ ax: A.e.from + '->' + A.e.to, bx: B.e.from + '->' + B.e.to, x, y });
            }
          } else {
            const x = p.x, y = r.y;
            if (y > Math.min(p.y, q.y) + 1e-6 && y < Math.max(p.y, q.y) - 1e-6 &&
                x > Math.min(r.x, s2.x) + 1e-6 && x < Math.max(r.x, s2.x) - 1e-6) {
              crossPoints.push({ ax: B.e.from + '->' + B.e.to, bx: A.e.from + '->' + A.e.to, x, y });
            }
          }
        }
      }
    }
  }
  const hopReg = (fig.hops || []).map((h) => [String(h.a), String(h.b)].sort().join('|'));
  for (const cp of crossPoints) {
    const key = [cp.ax, cp.bx].sort().join('|');
    if (!hopReg.includes(key)) {
      errors.push(`连线 ${cp.ax} 与 ${cp.bx} 在 (${cp.x.toFixed(1)}, ${cp.y.toFixed(1)}) 正交交叉但未登记跳线（fig.hops，§10.13.4 交叉用跳线而非斜穿）`);
    }
  }

  const allSegs = [];
  for (const { e, pts } of paths) for (let i = 0; i < pts.length - 1; i++) allSegs.push({ e, p: pts[i], q: pts[i + 1] });
  for (let i = 0; i < allSegs.length; i++) {
    for (let j = i + 1; j < allSegs.length; j++) {
      if (allSegs[i].e.idx === allSegs[j].e.idx) continue;
      /* §10.8 分叉边有意共用短横杆与竖干；§10.13.2 总线分支有意共用同一条导轨（§10.13.4 通道列同理） */
      const shared = allSegs[i].e.fork || allSegs[j].e.fork || allSegs[i].e.bus || allSegs[j].e.bus;
      if (shared) continue;
      if (segsCollinearOverlap(allSegs[i].p, allSegs[i].q, allSegs[j].p, allSegs[j].q)) {
        /* §5.3 豁免需登记：两条长边共用同一条通道列（channel）时才放行 */
        const cA = allSegs[i].e, cB = allSegs[j].e;
        const chA = cA.channel && exemptOnce(cA, 'shared-path');
        const chB = cB.channel && exemptOnce(cB, 'shared-path');
        if (!(chA || chB)) errors.push(`连线 ${cA.from}->${cA.to} 与 ${cB.from}->${cB.to} 共用路径`);
      }
    }
  }

  const sidePts = new Map();
  for (const { e, pts } of paths) {
    const push = (id, side, pt) => {
      const k = id + '||' + side;
      if (!sidePts.has(k)) sidePts.set(k, []);
      sidePts.get(k).push(pt);
    };
    /* §10.8 分叉各支共用父节点右缘同一挂点，不参与间距判定；
       §10.13 总线/反馈弧/跨列通道的端点由各自的规格几何决定（源侧已按分支序号错开），
       其起止点不是 anchorOf 的侧面锚点，同样不参与本判定。 */
    if (e.fork || e.bus || e.feedback || e.channel) continue;
    push(e.from, e.sSide, pts[0]);
    push(e.to, e.tSide, pts[pts.length - 1]);
  }
  for (const [k, list] of sidePts) {
    if (list.length < 2) continue;
    const side = k.split('||')[1];
    const key = (side === 'r' || side === 'l') ? 'y' : 'x';
    const vals = list.map((it) => it[key]).sort((a, b) => a - b);
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] - vals[i - 1] < 12 - 1e-6) errors.push(`挂点间距 ${(vals[i] - vals[i - 1]).toFixed(1)}px < 12px @ ${k}`);
    }
  }

  /* §5.2 / §5.6 边标签与避让（可见部分：连线进入容器后不再放标签）
     U-1：标签**偏离连线到一侧**，不再骑在线上；随之**删除白底遮罩**（下方 SVG 不再输出遮罩 rect）。
     偏移口径：水平段 → 整体在线之上；垂直段 → 在线的右侧；偏移量 LBL_OFF ∈ [6,10]。
     首选侧被占则试对侧（水平段之下 / 垂直段之左），仍不行才判"无处安放"。 */
  const labels = [], placed = [];
  const LBL_OFF = 8, LBL_H = 24, LBL_PAD = 16;
  for (const { e, pts } of paths) {
    /* §10.8：容器内小步骤之间用细线/序号表达先后，不加文字标签；分叉线同理，属结构线不挂标签 */
    if (!e.label || e.fork) { labels.push({ e, mid: { x: 0, y: 0 }, box: null, tw: 0, blank: true }); continue; }
    const tw = edgeTextWidth(e.label);
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push({ p: pts[i], q: pts[i + 1], len: dist(pts[i], pts[i + 1]) });
    segs.sort((a, b) => b.len - a.len);
    let ok = null;
    for (const s of segs) {
      /* 把本段裁成"容器外的可见子段"，标签只放在可见部分的**居中**位置（§5.6） */
      const axisObj = Math.abs(s.q.x - s.p.x) >= Math.abs(s.q.y - s.p.y) ? 'x' : 'y';
      const span = s.q[axisObj] - s.p[axisObj];
      const bounds = [];
      if (Math.abs(span) > 1e-6) {
        for (const [, cb] of containerBoxes) {
          const lo = cb[axisObj], hi = cb[axisObj] + cb[axisObj === 'x' ? 'w' : 'h'];
          const dIn = (lo - s.p[axisObj]) / span, dOut = (hi - s.p[axisObj]) / span;
          const tIn = Math.min(dIn, dOut), tOut = Math.max(dIn, dOut);
          if (tOut > 0 && tIn < 1) bounds.push([tIn, tOut]);
        }
      }
      bounds.sort((a, b) => a[0] - b[0]);
      const vis = [];
      let cur = 0;
      for (const [a0, a1] of bounds) {
        const b0 = Math.max(0, a0), b1 = Math.min(1, a1);
        if (b1 <= b0) continue;
        if (b0 > cur) vis.push([cur, b0]);
        cur = Math.max(cur, b1);
      }
      if (cur < 1) vis.push([cur, 1]);
      vis.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
      const horiz = Math.abs(s.q.x - s.p.x) >= Math.abs(s.q.y - s.p.y);
      for (const [v0, v1] of vis) {
        const tMid = (v0 + v1) / 2;
        const mid = { x: s.p.x + (s.q.x - s.p.x) * tMid, y: s.p.y + (s.q.y - s.p.y) * tMid };
        /* U-1 两个候选侧：首选（上 / 右）与对侧（下 / 左），均保持 LBL_OFF 净距 */
        const cands = horiz
          ? [{ x: mid.x - (tw + LBL_PAD) / 2, y: mid.y - LBL_OFF - LBL_H, side: 'above', off: LBL_OFF },
             { x: mid.x - (tw + LBL_PAD) / 2, y: mid.y + LBL_OFF, side: 'below', off: LBL_OFF }]
          : [{ x: mid.x + LBL_OFF, y: mid.y - LBL_H / 2, side: 'right', off: LBL_OFF },
             { x: mid.x - LBL_OFF - (tw + LBL_PAD), y: mid.y - LBL_H / 2, side: 'left', off: LBL_OFF }];
        for (const c of cands) {
          const box = { x: c.x, y: c.y, w: tw + LBL_PAD, h: LBL_H };
          let bad = false;
          for (const [, bx] of boxes) if (rectsOverlap(box, inflate(bx, 2))) { bad = true; break; }
          if (!bad) for (const [, cbx] of containerBoxes) if (rectsOverlap(box, inflate(cbx, 2))) { bad = true; break; }
          if (!bad) for (const p of placed) if (rectsOverlap(box, p)) { bad = true; break; }
          if (!bad) for (const other of paths) {
            if (other.e.idx === e.idx) continue;
            for (let i = 0; i < other.pts.length - 1; i++) if (segRectHit(other.pts[i], other.pts[i + 1], box)) { bad = true; break; }
            if (bad) break;
          }
          /* U-1：候选盒不得与本边（含折弯的另一段）相交——首选侧不行就自动换对侧 */
          if (!bad) for (let i = 0; i < pts.length - 1; i++) if (segRectHit(pts[i], pts[i + 1], box)) { bad = true; break; }
          if (!bad) {
            ok = { mid: { x: box.x + box.w / 2, y: box.y + box.h / 2 }, box, tw, pad: LBL_PAD, side: c.side, off: c.off };
            break;
          }
        }
        if (ok) break;
      }
      if (ok) break;
    }
    if (!ok) { errors.push(`边 ${e.from}->${e.to} 标签无处安放`); continue; }
    /* U-1 永久断言：标签矩形与其**所属连线**的任一线段不得相交（容差 0） */
    for (let i = 0; i < pts.length - 1; i++) {
      if (segRectHit(pts[i], pts[i + 1], ok.box)) errors.push(`U-1 边 ${e.from}->${e.to} 的标签矩形与其所属连线相交（容差 0）`);
    }
    if (ok.off < 6 - 1e-6 || ok.off > 10 + 1e-6) errors.push(`U-1 边 ${e.from}->${e.to} 标签侧偏 ${ok.off}px 不在 6–10px 区间`);
    placed.push(ok.box);
    labels.push({ e, ...ok });
  }

  const chanList = [chanL, chanR].filter((c) => c && Number.isFinite(c.cx));
  const cb2 = (swimConts.length ? bandEnd() : contentTop + contentH);
  /* ===== U-4 永久断言：同一图内**任意两个节点盒不得相交** =====
     口径：按"实际画出"的尺寸取盒（判定菱形加宽 +80 / 加高 +36），主步骤 NH、容器子步骤 NH_SUB。
     对全图生效（树节点 / fᵢ / Σ / 总线落点所在节点 / 泳道图 / 反馈图 一并覆盖）。
     注：rectsOverlap 为严格不等，故"共边相邻"不算重合——要求是 0 重合对。 */
  const auditNodes = [];
  for (const n of fig.nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    const st = STYLE[n.type] || {};
    const hBox = n.parent ? NH_SUB : NH;
    const aw = st.diamond ? NW + 80 : NW, ah = st.diamond ? hBox + 36 : hBox;
    auditNodes.push({ id: n.id, x: p.cx - aw / 2, y: p.cy - ah / 2, w: aw, h: ah });
  }
  for (let i = 0; i < auditNodes.length; i++) {
    for (let j = i + 1; j < auditNodes.length; j++) {
      const a = auditNodes[i], c = auditNodes[j];
      if (rectsOverlap(a, c)) {
        const ow = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
        const oh = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        errors.push(`U-4 节点盒重合：${a.id} 与 ${c.id} 重叠 ${(ow * oh).toFixed(0)}px²（同一图内任意两个节点盒不得相交）`);
      }
    }
  }
  /* U-1 审计数据：标签盒 + 所属连线折线（供 SVG 之外的独立复核脚本重算"标签是否压线"） */
  const auditLabels = labels.filter((l) => !l.blank).map((l) => ({
    edge: `${l.e.from}->${l.e.to}`, side: l.side, off: l.off,
    box: l.box, pts: (paths.find((p) => p.e.idx === l.e.idx) || { pts: [] }).pts
  }));

  /* ===== Y-3：非节点"紧凑标记"（fig.markers）=====
     用途：`⋮` 这类"K 支示意"的省略标记**不得独占一列**。旧做法把它当普通节点放进一个新 lane，
     于是 relR 被推宽一整格 CROSS(=336px) —— 图6-2 的画布被撑到 1460 宽，而图上多出来的只是
     一个内空、孤立、与任何流程都不相连的盒子。规格里它只是"示意节点"，本就不该占列。
     标记是**纯文字**：不进 pos / boxes、不占 lane、不计视觉单元、不改画布宽（W 与 relL/relR
     都由 fig.nodes 决定，标记只在既有留白里落位），并且锚定在宿主节点的**渲染盒**一侧，
     故永远紧贴自己的那一行，与"并入树所在行、放在 Tree{X,θₖ} 右侧紧邻位置"的要求一致。 */
  const markers = [];
  for (const mk of (fig.markers || [])) {
    const host = fig.nodes.find((n) => n.id === mk.near);
    const hb = host ? endpointBox(host.id).box : null;
    if (!host || !hb) { errors.push(`标记 ${mk.id || mk.text} 的 near 指向不存在的节点 ${mk.near}`); continue; }
    const gap = Number.isFinite(mk.gap) ? mk.gap : 16;
    const tw = Math.max(16, Math.ceil(textWidth(mk.text)));   /* 生成器口径仅用于**预留框**；真宽由真实字体脚本复核 */
    const side = mk.side || 'right';
    let box;
    if (side === 'right') box = { x: hb.x + hb.w + gap, y: hb.y + (hb.h - tw) / 2, w: tw, h: tw };
    else if (side === 'left') box = { x: hb.x - gap - tw, y: hb.y + (hb.h - tw) / 2, w: tw, h: tw };
    else if (side === 'above') box = { x: hb.x + (hb.w - tw) / 2, y: hb.y - gap - tw, w: tw, h: tw };
    else box = { x: hb.x + (hb.w - tw) / 2, y: hb.y + hb.h + gap, w: tw, h: tw };
    /* ① 不得与任何节点盒相交（容差 0，与 U-4 同口径） */
    for (const [nid, nb] of boxes) if (rectsOverlap(box, nb)) errors.push(`Y-3 标记 ${mk.id || mk.text} 与节点 ${nid} 盒相交（容差 0）`);
    /* ② 不得越出可绘区（M 页边）：否则会被画布裁掉 */
    if (box.x < M - 1e-6 || box.x + box.w > W - M + 1e-6) errors.push(`Y-3 标记 ${mk.id || mk.text} 越出可绘区（x ${f(box.x)}..${f(box.x + box.w)}，可绘区 ${M}..${f(W - M)}）`);
    /* 文本度量脚本要的是"可用宽"：右侧标记的可用宽 = 标记左缘到右页边（刻意取宽松口径，
       因为标记是自由文字、没有盒子边界可撞；过窄会误报 overflow）。 */
    const availW = side === 'right' ? W - M - box.x : (side === 'left' ? box.x + box.w - M : box.w);
    markers.push({ id: mk.id || null, text: mk.text, side, box, availW, cx: box.x + box.w / 2, cy: box.y + box.h / 2 });
  }
  const auditMarkers = markers.map((mk) => ({ id: mk.id, text: mk.text, x: mk.box.x, y: mk.box.y, w: mk.box.w, h: mk.box.h }));

  if (errors.length) return { fig, axis, pos, boxes, containerBoxes, allBoxes: new Map(), paths: [], labels: [], W: 0, H: 0, errors, notes, focusCount: 0, visualUnits: 0, contentTop, contentBottom: cb2, titleLines, titleYs, subLines, subYs, footLines, footYs, lanes, busRails, channels: chanList, exemptionsUsed: [...new Set(exemptionUsed)], auditNodes, auditLabels, arrowAudit, markers, auditMarkers };   // 有错则不再画图，避免后续崩在未定位节点上
  return { fig, axis, pos, boxes, containerBoxes, allBoxes, paths, labels, W, H, errors, notes, focusCount, visualUnits, contentTop, contentBottom: cb2, titleLines, titleYs, subLines, subYs, footLines, footYs, lanes, busRails, channels: chanList, exemptionsUsed: [...new Set(exemptionUsed)], auditNodes, auditLabels, arrowAudit, markers, auditMarkers };
}

/* X-2 入口：按 fig.axis（缺省 'auto'）决定方向。
   auto → chooseAxis 跑 TB/LR 两方案，各自**先过全部断言**（含 X-1 箭头边界断言与 R-1 宽度单源断言）
   再按 score → 折弯数 → TB 择优；spec 显式 'TB'|'LR' 时不参评、直接按该方向构建。 */
function buildFigureAuto(fig) {
  const req = fig.axis || 'auto';
  if (req === 'TB' || req === 'LR') {
    const b0 = buildFigure(fig, req);
    if (/轴 .* 非法/.test(b0.errors.join(' '))) return b0;
    return b0;
  }
  const win = chooseAxis(fig);
  const b = buildFigure(win.axis === 'LR' ? transposeFigure(fig) : fig, win.axis);
  Object.defineProperty(b, 'candidates', { value: win.candidates || [], enumerable: false, configurable: true });
  Object.defineProperty(b, 'axisReason', { value: win.reason || '', enumerable: false, configurable: true });
  Object.defineProperty(b, 'axisFails', { value: win.failNotes || [], enumerable: false, configurable: true });
  return b;
}

/* ---------- SVG ---------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* §10.3 正交连线：拐角一律 90° 直角，不使用任何圆弧/贝塞尔（分叉线尤其要求直角） */
function roundedPath(pts) {
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${f(pts[i].x)} ${f(pts[i].y)}`;
  return d;
}

function toSVG(b) {
  const { fig, axis, pos, paths, labels, W, H, containerBoxes } = b;
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ttl desc">`);
  o.push(`<title id="ttl">${esc(fig.title)}</title>`);
  o.push(`<desc id="desc">${esc(fig.mainline)}</desc>`);
  /* Y-1：marker 的全部数字由 ARROW_LEN/ARROW_HALF 派生——断言与渲染从此同源，不再各写一份 */
  o.push(`<defs><marker id="arw" markerUnits="userSpaceOnUse" markerWidth="${ARROW_LEN + 2}" markerHeight="${2 * ARROW_HALF + 2}" refX="${ARROW_LEN}" refY="${ARROW_HALF}" orient="auto"><path d="M0,0 L${ARROW_LEN},${ARROW_HALF} L0,${2 * ARROW_HALF} z" fill="#333333"/></marker></defs>`);
  o.push(`<style>
  text{font-family:"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Source Han Sans SC","Noto Sans CJK SC",Arial,sans-serif;}
  .ttl{font-size:${FS_TTL}px;font-weight:700;fill:#1A1A1A;}
  .sub{font-size:${FS_SUB}px;fill:#5B6472;}
  .nl{font-size:${FS_NODE}px;fill:#1A1A1A;}
  .el{font-size:${FS_EDGE}px;fill:#5A6472;}
  .ft{font-size:${FS_FOOT}px;fill:#8A8A8A;}
  .ct{font-size:${FS_CT}px;font-weight:700;fill:#3A4454;}${(b.lanes || []).length ? '\n  .swl{font-size:' + FS_SWL + 'px;font-weight:700;fill:#3A4454;letter-spacing:2px;}' : ''}
  .eg{fill:none;stroke:#333333;stroke-width:4;stroke-linecap:butt;}
</style>`);
  o.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`);
  b.titleLines.forEach((ln, i) => o.push(`<text class="ttl" x="${M}" y="${f(b.titleYs[i])}">${esc(ln)}</text>`));
  b.subLines.forEach((ln, i) => o.push(`<text class="sub" x="${M}" y="${f(b.subYs[i])}">${esc(ln)}</text>`));
  /* §10.8 容器：虚线圆角分组框 + 容器标题（在容器内水平居中，避免越出容器左边界） */
  for (const [, cb] of b.containerBoxes) {
    o.push(`<rect x="${f(cb.x)}" y="${f(cb.y)}" width="${f(cb.w)}" height="${f(cb.h)}" rx="12" fill="#F7F9FC" stroke="#8C97A8" stroke-width="2" stroke-dasharray="8 6"/>`);
    (cb.titleLines || cb.ct.titleLines).forEach((ln, i) => {
      const tw = textWidth(ln) * 13 / 16;
      o.push(`<text class="ct" x="${f(cb.x + cb.w / 2 - tw / 2)}" y="${f(cb.y + 18 + i * 14)}">${esc(ln)}</text>`);
    });
  }
  /* §10.13 原语元素：**仅当该图确有对应原语时**才输出，未使用原语的图逐字节保持改动前产物（零漂移） */
  if ((b.lanes || []).length || (b.channels || []).length || (b.busRails || []).length) {
    /* §10.13.1 泳道标签带：位于所有泳道列之左的竖条，带内文字 rotate(-90) 竖排大字。
       标签带不计入视觉单元预算（§10.8 已定"泳道标签不占节点预算"），故只作分区标题绘制。 */
    for (const ln of (b.lanes || [])) {
      o.push(`<rect x="${f(ln.x)}" y="${f(ln.y)}" width="${f(ln.w)}" height="${f(ln.h)}" rx="8" fill="#EEF2F8" stroke="#8C97A8" stroke-width="2"/>`);
      /* Y-2：锚点必须同时满足两条居中——
         ① **沿带长**居中：text-anchor="middle" 挂在 ln.y + ln.h/2，字串前进方向即带长方向；
         ② **垂直于带长**居中：rotate(-90) 把字形的 ascent 折到 −x 方向，若基线压在带宽中线上，
            字身会整体左偏约半个字高（肉眼像"贴在带子一侧"）。故把基线右移约半个字高
            （0.35×字号），使字身列恰好落在带宽中央。 */
      const swlX = ln.x + ln.w / 2 + FS_SWL * 0.35, swlY = ln.y + ln.h / 2;
      o.push(`<text class="swl" x="${f(swlX)}" y="${f(swlY)}" text-anchor="middle" transform="rotate(-90, ${f(swlX)}, ${f(swlY)})">${esc(ln.label)}</text>`);
    }
    /* §10.13.3 / §10.13.4 预留通道列：仅以极浅虚线示意其存在（不是节点列，不参与同列中线断言）。
       高度取 contentBottom − contentTop：泳道图的 contentH 由覆写块回填，非泳道图 contentH 已算好，
       两者都能得到正确高度（自测曾因误用 contentH 输出 height="NaN"）。 */
    const chTop = b.contentTop, chH = Math.max(1, (b.contentBottom || (b.contentTop + b.contentH)) - chTop);
    for (const ch of (b.channels || [])) {
      o.push(`<rect x="${f(ch.x0)}" y="${f(chTop)}" width="${f(ch.w)}" height="${f(chH)}" fill="none" stroke="#C9D2DE" stroke-width="1" stroke-dasharray="4 8"/>`);
    }
    /* §10.13.2 总线导轨：从导轨左端到右端的一条水平实线（各分支竖枝由 path 绘制） */
    for (const r of (b.busRails || [])) {
      o.push(`<line class="eg" x1="${f(r.railX0)}" y1="${f(r.railY)}" x2="${f(r.railX1)}" y2="${f(r.railY)}"/>`);
    }
  }
  for (const { e, pts } of paths) {
    /* §10.13.3 反馈弧 / §10.13.4 跨列通道：**虚线**（与 绘图路线.md 的描述一致）；其余边一律实线 */
    const dash = (e.feedback || e.channel) ? ' stroke-dasharray="6 4"' : '';
    o.push(`<path class="eg" d="${roundedPath(pts)}"${dash} marker-end="url(#arw)"/>`);
  }
  for (const l of labels) {
    if (l.blank) continue;
    /* U-1：**不再输出白底遮罩 rect**——标签已侧偏到连线之外（LBL_OFF=8px），
       无需断线；并且下列断言保证它不压方框、不压其它连线、不压其它标签、不压自身连线。 */
    o.push(`<text class="el" x="${f(l.mid.x)}" y="${f(l.mid.y + 4)}" text-anchor="middle">${esc(l.e.label)}</text>`);
  }
  for (const n of fig.nodes) {
    const p = pos.get(n.id), st = STYLE[n.type];
    if (!p) continue;                                   // 未定位节点跳过，由 errors 报出而不是崩
    const hBox = n.parent ? NH_SUB : NH;
    if (st.diamond) {
      /* 判定菱形：为容纳文字比常规节点加大（宽 +80 / 高 +36） */
      const dw = NW / 2 + 40, dh = hBox / 2 + 18;
      o.push(`<polygon points="${f(p.cx)},${f(p.cy - dh)} ${f(p.cx + dw)},${f(p.cy)} ${f(p.cx)},${f(p.cy + dh)} ${f(p.cx - dw)},${f(p.cy)}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.focus ? 3 : 2}"/>`);
    } else
    o.push(`<rect x="${f(p.cx - NW / 2)}" y="${f(p.cy - hBox / 2)}" width="${NW}" height="${hBox}" rx="${st.rx}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.focus ? 3 : 2}"/>`);
    const y0 = p.cy - ((n.lines.length - 1) * LINE_H) / 2 + FS_NODE * 0.35 - 2;
    n.lines.forEach((ln, i) => o.push(`<text class="nl" x="${f(p.cx)}" y="${f(y0 + i * LINE_H)}" text-anchor="middle">${esc(ln)}</text>`));
  }
  /* Y-3：非节点"紧凑标记"（如 K 支示意的 `⋮`）——纯文字，无盒子、不占列，画在节点之上 */
  for (const mk of (b.markers || [])) {
    o.push(`<text class="nl" x="${f(mk.cx)}" y="${f(mk.cy + FS_NODE * 0.35)}" text-anchor="middle">${esc(mk.text)}</text>`);
  }
  b.footLines.forEach((ln, i) => o.push(`<text class="ft" x="${M}" y="${f(b.footYs[i])}">${esc(ln)}</text>`));
  o.push(`</svg>`);
  return o.join('\n') + '\n';
}

/* ---------- draw.io (mxGraph XML) — 遵循 §7 两条硬性契约 ---------- */

/* §7 契约②（v3）：drawio 端点锚点**只从最终折线反推**——唯一来源，写盘与自检共用同一组数。
   缺陷（真缺陷，本轮由自检实测暴露）：旧实现把锚点取自走线前的"设计锚点" P.a / P.b，而实际折线的
   首点/末点并不总是那个点：
     · 分叉边（§10.8）以**父节点右缘中点**起笔，忽略同边挂点错开量 oS ⇒ 实测偏差 (0,±12/±24/±36)；
     · 总线（§10.13.2）硬编码 `(trunkX, s.cy+s.h/2)`、通道/反馈弧（§10.13.3/4）硬编码侧缘中点，
       而 e.sSide/e.tSide 来自 planOf ⇒ 实测偏差 (240,0)、(-135,-32)、(±96,32)、(±144,32) 等。
   后果：这些边的 .drawio 起点与 SVG 折线首点不重合，orthogonalEdgeStyle 会用一段**斜线**去接第一个
   拐点（skill 明令禁斜线），且箭头落点偏移最大 240px。旧断言只查"八个属性存在"，故从未报出。
   现在：首点直接取 pts[0]；末点按 Z-1 记录的外让量 P.out 沿末段法向反推回盒边（末段正交 ⇒ 单轴），
   偏移量以 `entryDx/entryDy` 写盘，两端与 SVG **同一点**。 */
function drawioAnchorOf(P) {
  const sb = P.e.srcBox, tb = P.e.dstBox;
  const norm01 = (v) => Math.max(0, Math.min(1, Math.round(v * 1e4) / 1e4));
  const rr = (v) => Math.round(v * 1000) / 1000;
  const pts = P.pts;
  const q = pts[pts.length - 1], p2 = pts[pts.length - 2];
  const o = P.out || 0;
  const L = Math.hypot(q.x - p2.x, q.y - p2.y);
  /* u = 末段**行进方向**（指向盒内）。Z-1 的退让是 `q = anchor − o·u`，故：
       · 反推盒边锚点 = q **+** o·u；
       · drawio 侧要写到尖端 q，则偏移 = q − anchor = **−**o·u。
     两个符号都必须是"+"和"−"（曾写反成 q−o·u 与 +o·u，自检回读立刻报出统一 +6px：
     锚点被反推到盒外 3px、再加 +3 偏移 ⇒ 比 SVG 尖端多 6px）。 */
  const ux = L > 0 ? (q.x - p2.x) / L : 0, uy = L > 0 ? (q.y - p2.y) / L : 0;
  const bEdge = { x: q.x + o * ux, y: q.y + o * uy };     /* 反推回盒边锚点（o=0 时即末点本身） */
  return {
    ex: norm01((pts[0].x - sb.x) / sb.w), ey: norm01((pts[0].y - sb.y) / sb.h),
    nx: norm01((bEdge.x - tb.x) / tb.w), ny: norm01((bEdge.y - tb.y) / tb.h),
    sdx: 0, sdy: 0, tdx: rr(-o * ux), tdy: rr(-o * uy)
  };
}

function toDrawio(b) {
  const { fig, axis, pos, boxes, paths, W, H, containerBoxes } = b;
  const g = esc;
  const cells = [`        <mxCell id="0"/>`, `        <mxCell id="1" parent="0"/>`];
  /* §10.8 容器：扁平放置（vertex 绝对坐标 + 不可连接），画在节点之下 */
  for (const [cid, cb] of containerBoxes) {
    const cval = g(cb.ct.titleLines.join(' '));
    const cstyle = `rounded=1;arcSize=8;whiteSpace=wrap;html=1;fillColor=#F7F9FC;strokeColor=#8C97A8;strokeWidth=2;dashed=1;verticalAlign=top;align=center;spacingTop=8;connectable=0;fontSize=${FS_CT};fontStyle=1;fontColor=#3A4454;fontFamily=Microsoft YaHei;`;
    cells.push(`        <mxCell id="CT_${cid}" value="${cval}" style="${cstyle}" vertex="1" parent="1"><mxGeometry x="${f(cb.x)}" y="${f(cb.y)}" width="${f(cb.w)}" height="${f(cb.h)}" as="geometry"/></mxCell>`);
  }
  for (const n of fig.nodes) {
    const p = pos.get(n.id), st = STYLE[n.type];
    if (!p) continue;                                   // 未定位节点跳过，由 errors 报出而不是崩
    const hBox = n.parent ? NH_SUB : NH;
    const pill = n.type === 'end' || n.type === 'focusend' || n.type === 'start';
    const value = n.lines.map(g).join('&#xa;');   // 契约①：单层实体换行
    const shape = st.diamond ? 'rhombus;' : `rounded=1;arcSize=${pill ? 50 : 12};`;
    const boxW = st.diamond ? NW + 80 : NW, boxH = st.diamond ? hBox + 36 : hBox;
    const style = `${shape}whiteSpace=wrap;html=1;fillColor=${st.fill};strokeColor=${st.stroke};strokeWidth=${st.focus ? 3 : 2};fontSize=${FS_NODE};fontColor=#1A1A1A;fontFamily=Microsoft YaHei;`;
    cells.push(`        <mxCell id="${n.id}" value="${value}" style="${style}" vertex="1" parent="1"><mxGeometry x="${f(p.cx - boxW / 2)}" y="${f(p.cy - boxH / 2)}" width="${boxW}" height="${boxH}" as="geometry"/></mxCell>`);
  }
  /* F-B：标题 / 副标题 / 页脚（与 SVG 同坐标、同字号、同行数）——drawio 侧原先完全不承载这三块文字，
     导致同一张图的 .svg 与 .drawio 交付物信息不一致。此处按"不可连接扁平 vertex"输出：
     纯文本样式 text;html=1;whiteSpace=wrap;connectable=0;（无需 rounded/arcSize），
     不进 source/target、不含 exitX/entryX，故 §7 的 边数 / 8 锚点属性 / Array as="points" 三条断言完全不受影响。 */
  const textVertex = (id, lines, x, y, w, h, fs, color, bold) => {
    const style = `text;html=1;whiteSpace=wrap;connectable=0;align=left;verticalAlign=middle;`
      + `fontSize=${fs};fontColor=${color};fontFamily=Microsoft YaHei;${bold ? 'fontStyle=1;' : ''}`;
    /* R-3：段内多行用 &#xa; **单层实体**换行——与节点 cell 完全同做法（先逐行转义、再用实体连接，
       绝不能反过来，否则 g() 会把 & 再转义一次，产出禁用的 `&amp;#xa;` 双重转义）。 */
    const value = lines.map(g).join('&#xa;');
    return `        <mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="1">`
      + `<mxGeometry x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" as="geometry"/></mxCell>`;
  };
  const textCells = [];
  /* R-3：标题 / 副标题 / 页脚各**只出一个 cell**（每段一个 cell），段内换行交给 cell 自己折。
     旧做法"每行一个 cell"在 drawio 里是互相独立的文本框，编辑文字时不会重排、也无法自动换行。 */
  b.titleLines.length && textCells.push(
    textVertex('ttl', b.titleLines, 0, b.titleYs[0] - FS_TTL * 0.8, W, Math.round(LH_TTL * b.titleLines.length * 1.5), FS_TTL, '#1A1A1A', true));
  b.subLines.length && textCells.push(
    textVertex('sub', b.subLines, 0, b.subYs[0] - FS_SUB * 0.8, W, Math.round(LH_SUB * b.subLines.length * 1.5), FS_SUB, '#5B6472', false));
  b.footLines.length && textCells.push(
    textVertex('ft', b.footLines, 0, b.footYs[0] - FS_FOOT * 0.8, W, Math.round(LH_FOOT * b.footLines.length * 1.5), FS_FOOT, '#8A8A8A', false));
  cells.push(...textCells);
  /* Y-3：非节点"紧凑标记"（fig.markers）——纯文字 cell，不占 lane、不改画布宽。
     id 取 `mk_*`：不会命中自检用于数边的 `e\d+` 正则，也不含 exit/entry 锚点属性，
     故 §7 的"边数 / 8 锚点 / 拐点数组"三条断言完全不受影响。 */
  for (const mk of (b.markers || [])) {
    cells.push(textVertex(`mk_${mk.id || 'm'}`, [mk.text], mk.box.x, mk.box.y, mk.box.w, mk.box.h, FS_NODE, '#1A1A1A', false));
  }
  /* U-1（drawio 侧）：edge idx → 标签放置结果（含 side），供边循环加"侧偏的子 edgeLabel cell" */
  const labelByEdgeIdx = new Map(b.labels.filter((l) => !l.blank).map((l) => [l.e.idx, l]));
  fig.edges.forEach((e, i) => {
    const P = paths[i];
    /* 契约②（v3）：锚点取值与 SVG 折线严格一致；归一化分母取该端点自身盒宽/盒高（与 anchorOf 同口径），
       不写死 NW/NH。**锚点不再取自 P.a/P.b**（那两个是走线前的"设计锚点"，分叉/总线/通道边与真实
       首末点不一致，详见 drawioAnchorOf 的错误记录），而是从最终折线反推 —— 单一来源，写盘与自检共用。
       故这里不再需要 sb/tb/norm01 的局部副本（唯一来源是 drawioAnchorOf）。 */
    /* ===== §7 契约②（v3）：drawio 端点的"盒外让"与 SVG **同源** =====
       SVG 侧 Z-1 把箭头尖端沿末段方向**退让** ARROW_OUTSET px（`q = anchor − o·u`，u 指向盒内）；
       drawio 侧用 `entryPerimeter=0` + `entryDx/entryDy` 表达**同一个**偏移向量（`−o·u`，
       P.out 记录，非重新推导）⇒ 两侧尖端相同。
       为什么不用 edge 的 source/targetPerimeterSpacing（源码证据，mxgraph@4.2.2）：
         · mxGraph.js@183756 getConnectionPoint 里 bounds = this.view.getPerimeterBounds(vertex)
           —— **未传 border**，故 edge style 的 perimeterSpacing 在"已锚定"路径里不参与计算；
         · 同函数默认 perimeter=true（mxGraph.js@180175 getConnectionConstraint 的 getValue 默认值），
           会把 dx/dy 再投影回周长点 ⇒ 偏移被整段抹掉；故必须显式 `*Perimeter=0` 才让 `*Dx/*Dy` 生效；
         · source/targetPerimeterSpacing 只在 getFloatingTerminalPoint（**无** exitX/entryX 的浮动端点，
           mxGraphView.js@40508）里生效——本仓每条边都显式锚定，走不到那条路径。
       出端恒 0：Z-1 只外让箭头端（pts 末元素），起点仍在盒边锚点上。 */
    const { ex, ey, nx, ny, sdx, sdy, tdx, tdy } = drawioAnchorOf(P);
    /* §10.13.3 反馈弧 / §10.13.4 跨列通道：drawio 侧同步虚线（`dashed=1;`）；其余边保持实线 */
    const dashes = (e.feedback || e.channel) ? 'dashed=1;' : '';
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#333333;strokeWidth=3;${dashes}endArrow=block;endFill=1;`
      + `exitX=${ex};exitY=${ey};exitDx=${sdx};exitDy=${sdy};exitPerimeter=0;`
      + `entryX=${nx};entryY=${ny};entryDx=${tdx};entryDy=${tdy};entryPerimeter=0;`
      + `fontSize=${FS_EDGE};fontColor=#5A6472;fontFamily=Microsoft YaHei;`;
    const mid = P.pts.slice(1, -1);
    const pts = mid.length
      ? `<Array as="points">${mid.map((pt) => `<mxPoint x="${f(pt.x)}" y="${f(pt.y)}"/>`).join('')}</Array>`
      : '';
    /* U-1（drawio 侧）：边标签**不再作为 edge 自身的 value**（drawio 会把 edge value 渲染在线的中点上，
       等于在 .drawio 交付物里继续"字骑线"）。改为一条子 cell `edgeLabel`，用 offset 偏离连线一侧：
       水平段 → 上/下偏 12px；垂直段 → 右/左偏 12px，与 SVG 侧的 side 判定同源。
       子 cell 的 id 取 `elN`：不会命中自检用于数边的 `e\d+` 正则，故 edge 计数/锚点断言不受影响。 */
    const lb = labelByEdgeIdx.get(i);
    const offPt = !lb ? null
      : lb.side === 'above' ? [0, -12]
        : lb.side === 'below' ? [0, 12]
          : lb.side === 'right' ? [12, 0]
            : [-12, 0];
    cells.push(`        <mxCell id="e${i + 1}" value="" style="${style}" edge="1" parent="1" source="${e.from}" target="${e.to}"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`);
    if (offPt) {
      cells.push(`        <mxCell id="el${i + 1}" value="${g(e.label)}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];" vertex="1" connectable="0" parent="e${i + 1}"><mxGeometry x="0.5" y="0" relative="1" as="geometry"><mxPoint x="${offPt[0]}" y="${offPt[1]}" as="offset"/></mxGeometry></mxCell>`);
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="dsh" agent="scientific-diagram-v41" type="device">
  <diagram id="${g(fig.file)}" name="${g(fig.title)}">
    <mxGraphModel dx="1422" dy="798" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${W}" pageHeight="${H}" math="0" shadow="0">
      <root>
${cells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
  </mxfile>
`;
}

/* ---------- 修订前后对照图（--diff 的彩色可视化；复用 toDrawio 的 cell 格式） ----------
   渲染策略：以 NEW(B) 为基底，按 diff 状态给节点/边上色；A 中独有的"删除项"以红虚线幽灵
   叠加在其旧坐标上（删除的节点 + 其相连边都画出，边引用被删除节点的幽灵顶点）。
   不画容器（diff 分类只针对节点/边）。配色对齐 Agents365-ai/drawio-skill 的 drawiodiff
   语义：绿=新增 橙=修改/改向 紫=移动 红虚线=删除 灰=不变。 */
function toDiffDrawio(diff, A, B) {
  // 自包含：--diff 在 specs import 之前运行，模块级 esc/f/FS_* 尚在 TDZ，故本地定义
  const g = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f = (v) => (Math.round(v * 1000) / 1000).toString();
  const FS_NODE = 16, FS_EDGE = 12;
  const cells = [`        <mxCell id="0"/>`, `        <mxCell id="1" parent="0"/>`];
  const W = Math.max(A.pageW || 0, B.pageW || 0) || 800;
  const H = Math.max(A.pageH || 0, B.pageH || 0) || 600;
  const W2 = W + 460;                                  // 右侧留图例列，避免压住内容
  const NODE_COL = {
    added:   { fill: '#E8F5E9', stroke: '#2E7D32' },
    changed: { fill: '#FFF3E0', stroke: '#E65100' },
    moved:   { fill: '#F3E5F5', stroke: '#6A1B9A' },
    same:    { fill: '#FFFFFF', stroke: '#333333' },
    removed: { fill: '#FFEBEE', stroke: '#C62828' }
  };
  const nodeStyle = (st, dashed) =>
    `rounded=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=${st.fill};strokeColor=${st.stroke};strokeWidth=2;${dashed ? 'dashed=1;' : ''}fontSize=${FS_NODE};fontColor=#1A1A1A;fontFamily=Microsoft YaHei;`;
  const textVal = (t) => g(String(t == null ? '' : t)).replace(/\r?\n/g, '&#xa;');

  // 节点状态映射（覆盖 A∪B 全部节点，每 id 唯一归类）
  const nStatus = new Map();
  for (const n of diff.nodes.added) nStatus.set(n.id, 'added');
  for (const n of diff.nodes.changed) nStatus.set(n.id, 'changed');
  for (const n of diff.nodes.moved) nStatus.set(n.id, 'moved');
  for (const id of diff.nodes.same) nStatus.set(id, 'same');
  for (const n of diff.nodes.removed) nStatus.set(n.id, 'removed');
  const nA = new Map((A.nodes || []).map((n) => [n.id, n]));
  const nB = new Map((B.nodes || []).map((n) => [n.id, n]));
  for (const [id, stKey] of nStatus) {
    const node = nB.get(id) || nA.get(id);
    if (!node) continue;
    const st = NODE_COL[stKey] || NODE_COL.same;
    const dashed = stKey === 'removed';
    const w = node.w || 80, h = node.h || 40;
    const x = f((node.cx ?? 0) - w / 2), y = f((node.cy ?? 0) - h / 2);
    cells.push(`        <mxCell id="${g(id)}" value="${textVal(node.text)}" style="${nodeStyle(st, dashed)}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${f(w)}" height="${f(h)}" as="geometry"/></mxCell>`);
  }

  // 边状态映射
  const reroutedNew = new Set(diff.edges.edgeRerouted.map((e) => e.newKey));
  const sameChanged = new Set(diff.edges.edgeSame.filter((e) => e.labelChanged || e.ptsChanged).map((e) => e.key));
  const edgeStatus = new Map();
  for (const e of diff.edges.edgeAdded) edgeStatus.set(e.key, 'added');
  for (const e of diff.edges.edgeRemoved) edgeStatus.set(e.key, 'removed');
  for (const k of reroutedNew) edgeStatus.set(k, 'changed');
  for (const k of sameChanged) edgeStatus.set(k, 'changed');
  for (const e of diff.edges.edgeSame) if (!(e.labelChanged || e.ptsChanged)) edgeStatus.set(e.key, 'same');
  const eA = new Map((A.edges || []).map((e) => [`${e.from}->${e.to}`, e]));
  const eB = new Map((B.edges || []).map((e) => [`${e.from}->${e.to}`, e]));
  const EDGE_COL = { added: '#2E7D32', changed: '#E65100', removed: '#C62828', same: '#333333' };
  const edgeCell = (e, stroke, dashed) => {
    const pts = (e.pts && e.pts.length)
      ? `<Array as="points">${e.pts.map((p) => `<mxPoint x="${f(p.x)}" y="${f(p.y)}"/>`).join('')}</Array>`
      : '';
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=${stroke};strokeWidth=3;${dashed ? 'dashed=1;' : ''}endArrow=block;endFill=1;fontSize=${FS_EDGE};fontColor=#5A6472;fontFamily=Microsoft YaHei;`;
    return `        <mxCell id="e_${g(e.from)}_${g(e.to)}" value="" style="${style}" edge="1" parent="1" source="${g(e.from)}" target="${g(e.to)}"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`;
  };
  for (const [key, stKey] of edgeStatus) {
    const e = eB.get(key) || eA.get(key);
    if (!e) continue;
    cells.push(edgeCell(e, EDGE_COL[stKey] || EDGE_COL.same, stKey === 'removed'));
  }

  // 图例（右侧独立列，不压内容）
  const legendLines = [
    '修订对照图例（A → B）',
    '绿=新增  橙=修改/改向  紫=移动  红虚线=删除  灰=不变',
    `A=${path.basename(String(diff.old || ''))}  →  B=${path.basename(String(diff.new || ''))}`
  ];
  const lw = 444, lh = 24;
  cells.push(`        <mxCell id="legend" value="${legendLines.map(textVal).join('&#xa;')}" style="text;html=1;whiteSpace=wrap;connectable=0;align=left;verticalAlign=top;fontSize=14;fontColor=#333333;fontFamily=Microsoft YaHei;fillColor=#F4F6F8;strokeColor=#C0C7D0;rounded=1;" vertex="1" parent="1"><mxGeometry x="${f(W + 16)}" y="8" width="${lw}" height="${f(lh * legendLines.length + 12)}" as="geometry"/></mxCell>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="dsh" agent="scientific-diagram-v41" type="device">
  <diagram id="diff" name="revision-diff">
    <mxGraphModel dx="1422" dy="798" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${W2}" pageHeight="${H}" math="0" shadow="0">
      <root>
${cells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}

/* ---------- 绘图路线.md（--set=ref 时写入各自文件夹） ---------- */
function toThinking(fig, b, maxFold, pointArrays) {
  const folds = b.paths.filter((p) => p.pts.length > 2).length;
  /* §10.13.1 泳道不是 §10.8 容器：无 children，不能进容器描述（否则 children.join 抛错） */
  const cts = (fig.containers || []).filter((c) => c.kind !== 'swim');
  const nodeLine = (id) => {
    const n = fig.nodes.find((x) => x.id === id);
    return `${n.lines.join('·')}（${id}）`;
  };
  const contDesc = cts.length
    ? `## 3.5 层级分组：大步骤-小步骤已容器化（skill §10.8）

§2 约束 9 与 §10.8 规定：**凡小步骤隶属于某大步骤/阶段，必须用视觉容器表达父子层级；把父步骤与子步骤拍平成同层一条链＝自动不通过。** 本图据此把下列大步骤画成**虚线圆角分组框**（容器标题置于框内左上），其小步骤纵排于框内，框内用序号表达先后：

${cts.map((ct) => `- **容器 ${ct.id}｜${ct.titleLines.join('')}** ← 小步骤：${ct.children.map(nodeLine).join(' → ')}`).join('\n')}

容器几何取自 §10.8：四周 padding ${'\u2265'}24px；容器宽度取内部最宽小步骤 + 2×padding；容器之间仍按 §10.4 的层距。**跨容器连线与容器→外部连线一律连到容器边缘**（entry/exit 用容器坐标），只有同一容器内的小步骤之间才连到子步骤本身；程序对每条边做穿越检测，碰到任何"非端点容器"的边界即自动改走另一条候选走线。

预算折算（§10.8）：1 个容器计 1 个节点，容器内每个小步骤计 0.5 个节点；本图折算后为 **${b.visualUnits} 视觉单元 ${'\u2264'}9**。

`
    : '';
  /* ===== §10.13.0 豁免登记（必须是产物的一部分，可追溯）=====
     "所有豁免必须在产物里可追溯"——此处把本次**实际命中**的豁免逐条列出（豁免了哪条断言 + 原因），
     并把登记了却未命中的条目标为"未命中"，避免"登记了却没用于是悄悄失效"。 */
  const exHit = (b.exemptionsUsed || []).map((k) => {
    const [edge, assert] = k.split('|');
    const reg = (fig.exemptions || []).find((x) => x.edge === edge && x.assert === assert) || {};
    return { edge, assert, reason: reg.reason || '(缺)', hit: true };
  });
  const exMiss = (fig.exemptions || []).filter((x) => !(b.exemptionsUsed || []).includes(x.edge + '|' + x.assert))
    .map((x) => ({ edge: x.edge, assert: x.assert, reason: x.reason || '(缺)', hit: false }));
  const exemptAll = exHit.concat(exMiss);
  const exemptSec = (exemptAll.length || (fig.buses || []).length || (fig.containers || []).some((c) => c.kind === 'swim'))
    ? `## 5.5 §10.13 豁免登记（原语：泳道 / 总线 / 反馈弧 / 跨列通道）

> §10.13.0 硬要求：**每用一类原语都必须登记一次豁免**，逐条写"豁免了哪条断言 + 原因"；
> \`[禁]\` 只在生成器里静默放行而本文不提。下表为程序实际命中（生成时由 \`fig.exemptions\` 与逐边标记交叉核对）。

| 边 | 豁免的断言 | 命中的原语 | 原因 | 命中 |
|---|---|---|---|---|
${exemptAll.length ? exemptAll.map((x) => `| \`${x.edge}\` | ${x.assert} | ${x.assert === 'acyclic' ? '反馈弧 feedback' : x.assert === 'shared-path' ? '总线 bus / 通道 channel' : x.assert === 'fold' ? '总线 bus / 反馈弧 feedback / 通道 channel' : '—'} | ${x.reason} | ${x.hit ? '是' : '未命中'} |`).join('\n') : '| — | — | — | 本图未使用需豁免的 §10.13 原语 | — |'}

**口径说明**：既有断言（§10.2 无环 / §10.3 每边 ≤1 折 / §5.3 禁共用路径 / §5.1 净距）一条都没有删除或放宽——
未带相应标记、或带了标记却未登记的边，仍照旧报错。豁免是**逐边 + 逐断言**的显式放行。

${(fig.containers || []).filter((c) => c.kind === 'swim').length ? `**泳道**（§10.13.1）：本图 ${(fig.containers || []).filter((c) => c.kind === 'swim').length} 条并行主线沿 x 轴分列，左侧竖排标签带（宽 ${(b.lanes || []).map((l) => l.w).join('/')}px，计入画布宽）；泳道内各步按 layer 纵向成链（同列 0 折直连），**不用** §10.8 的对称分叉形态；标签带不占节点预算。共同入口 / 出口：\`${(fig.spine || []).join('、')}\`。` : ''}
${(fig.buses || []).length ? `**总线**（§10.13.2）：${(b.busRails || []).map((r) => `\`${r.id}\`（${r.dir === 'out' ? '扇出' : '扇入'}，源 \`${r.node}\`，${r.N} 支，导轨 y=${r.railY.toFixed(1)}，L=${r.L}，\`off_k\` 步长 ${r.step.toFixed(2)}px ${'\u2265'}12）`).join('；')}。` : ''}
${(fig.edges || []).filter((e) => e.feedback).length ? `**反馈弧**（§10.13.3）：${(fig.edges || []).filter((e) => e.feedback).map((e) => `\`${e.from}->${e.to}\``).join('、')}，走预留通道列、三段 2 折、虚线 + 「迭代/反馈」标签。` : ''}
${(fig.edges || []).filter((e) => e.channel).length ? `**跨列通道**（§10.13.4）：${(fig.edges || []).filter((e) => e.channel).map((e) => `\`${e.from}->${e.to}\``).join('、')}，只走预留通道列、不穿盒（净距 ≥6px）、交叉用跳线。` : ''}
` : '';
  const swimSec = '';
  return `# 绘图路线 —— ${fig.title}

> 本文件是**绘图时的笔记**：记录该图的主线、两级分解、布局口径与豁免登记，
> 用于长正文被截断或上下文被压缩时**保住绘图所需的上下文**（不是给别人看的成稿说明）。

> 本文件为**绘图决策记录**，随本图一起生成；图中每个要素都能回指 \`${fig.source}\` 的正文。依据 skill：\`scientific-diagram-v41\`（2026/9/28 22:00:57 版）。
> 生成方式：\`node tools/diagrams/build.mjs --set=ref\`（确定性矢量绘制，非图像生成模型产物）。

## 1. 图题与来源

- **图题**：${fig.title}
- **类别**：${fig.category}
- **来源文档**：\`${fig.source}\`
- **一句话主线**：${fig.mainline}

## 2. 为什么用这个图类型（skill §4）

${fig.typeWhy}

## 3. 两级主线分解（skill §2.7 / §10.1，动笔前必做）

分解方法用 §10.1 的默认法——**以终为始逆推**：从终点结果出发，问"要得到它，紧前必须成立什么"，逐层回溯。该方法天然产出分层 DAG，不会退化成"任意关联网"。

${fig.breakdown}

${contDesc}## 4. 为什么拆成这些节点（skill §6 密度预算）

${fig.splitWhy}

## 5. 布局与几何（skill §10）

- **方向（X-2 轴自选择）**：最终 \`轴 ${b.axis}\`。
  - 候选读数（\`axis:'auto'\` 时对同一张图分别试算 TB / LR；每个方向**先通过全部断言**才参评）：

| 候选方向 | 画布 W | 画布 H | 视觉单元 | 箭头 | 折弯总数 | 评分 max/min（越接近 1 越方正） | 是否参评 |
|---|---|---|---|---|---|---|---|
${(b.candidates || []).map((c) => `| ${c.axis} | ${c.W} | ${c.H} | ${b.visualUnits} | ${c.edges} | ${c.bends} | ${c.score.toFixed(4)} | 通过全部断言 ✓ |`).join('\n') || `| ${b.axis} | ${b.W} | ${b.H} | ${b.visualUnits} | ${fig.edges.length} | ${(b.paths || []).reduce((s, p) => s + Math.max(0, p.pts.length - 2), 0)} | ${(Math.max(b.W, b.H) / Math.max(1, Math.min(b.W, b.H))).toFixed(4)} | spec 显式指定，不参评 |`}

  - **最终选择及理由**：${b.axisReason || 'spec 显式指定方向，未参与择优。'}
  - **择优口径**：\`score = max(W,H)/max(1,min(W,H))\` 越小越好 → 并列取折弯总数更少者 → 再并列取 \`TB\`（保留 §10.0 既有默认倾向）；由 \`chooseAxis\` 确定性计算，无随机、可重跑复现。
  - **未通过断言的方向**：${(b.axisFails || []).length ? (b.axisFails || []).map((x) => `\`${x}\``).join('；') : '无（所有候选方向都通过了全部断言）'}。
  - 映射：层级序号 → ${b.axis === 'TB' ? 'y（自上而下）' : 'x（自左而右）'}，并列序号 → ${b.axis === 'TB' ? 'x' : 'y'}。
    覆盖方式：spec 里写 \`axis:'TB'|'LR'|'auto'\`，缺省即 \`auto\`。
- **坐标公式**（§10.4）：节点中心 \`x = x0 + lane × 336\`、\`y = contentTop + 32 + layer × 112\`；节点统一 \`240 × 64\`（§10.5）。层距 \`112\`、列距 \`336\` 即 §10.4 对 240×64 节点给出的下限 \`G≥112\`、\`W≥336\`。
- **走线（§10.3 每边 ≤1 折）**：非共列两节点若走"下出→竖→横→入"就是 2 折、直接违规。故程序只用两个**恰好 1 折**的候选：
  - **候选 A**：从左/右边缘**水平**出 → 拐到目标列中线 → **垂直**进入目标上边缘；
  - **候选 B**：从下边缘**垂直**出 → 拐到目标行位置 → **水平**进入目标左/右边缘。
  每条边先试 A，逐段做盒子碰撞检测（6px 净距），与任何非端点方框相交就自动退回 B。
- **扇形布点（§5.4）**：同一条边被多条连线进出时，锚点沿边均布、间距 24px（≥ 规定的 12px）。
- **文字不被裁（§2.6 独立可读）**：TB 画布窄，标题/副标题/页脚按可用宽度折行；画布宽取 \`max(图形宽, 文字块宽 + 2M)\`，图形在画布内水平居中。

${exemptSec}
${swimSec}
## 6. 密度与焦点（skill §6 / §7）

- 本图 **语义节点 ${fig.nodes.length}**、其中容器 ${cts.length} 个 / 容器内小步骤 ${fig.nodes.filter((n) => n.parent).length} 个 → 按 §10.8 折算为 **${b.visualUnits} 视觉单元 ≤9**；**箭头 ${fig.edges.length} ≤12**、**焦点色元素 ${b.focusCount} ≤2**。
- 焦点只给主线上最吃劲的环节（浅蓝底 #D8E4FA + 蓝描边 #1A56DB）；其余用墨色/中性灰。
- **终止节点用中性灰药丸形**，靠**形状**而非颜色表达"这是终点"，因此不占用焦点色预算（§6「想给 4 个都上色＝还没决定焦点」）。
- 配色共 5 色以内，且焦点节点转灰度后仍可凭更深的描边辨认（§7「灰度可辨」）。

## 7. 连线与标签（skill §5）

- **每条边都带语义标签**（§2.3 硬约束）：标签写的是这条边**真正在传什么**，不是千篇一律的"数据流"。
- **标签偏离连线一侧**（§5.2，U-1 修订）：标签**不再骑在线的中点上**，也不再用白底遮罩断线。
  水平段 → 标签整体在线的**上方**；垂直段 → 在线的**右侧**；侧偏量 8px（口径区间 6–10px）。
  首选侧被占则自动改放对侧（下 / 左）；仍无处可放才报"标签无处安放"。
- **标签避让**（§5.6）：位置从最长可见线段中点开始试，逐个排除"压到方框""压到别的连线""压到别的标签"，
  并新增一条硬断言：**标签矩形与其所属连线的任一线段不得相交（容差 0）**。
- **禁斜线**（§5.1）：只有水平段与垂直段，拐角 \`r=8\` 圆角；**禁共用路径**（§5.3）：两两线段做共线重叠检测。

## 8. 本图的实际自检读数（skill §8，铁律 7：写"验证方式 + 实际读数"）

命令：\`node tools/diagrams/build.mjs --set=ref\`

| 项 | 读数 |
|---|---|
| 轴 | ${b.axis} |
| 节点 | ${fig.nodes.length} / 9 |
| 箭头 | ${fig.edges.length} / 12 |
| 焦点色元素 | ${b.focusCount} / 2 |
| 每边最大折弯 | ${maxFold} |
| 折线边数 / drawio 拐点数组数 | ${folds} / ${pointArrays} |
| 画布 | ${b.W} × ${b.H} |

脚本逐图断言：视觉单元 ≤9（§10.8 折算：容器 1、容器内小步骤 0.5）/ 箭头 ≤12 / 焦点 ≤2 / 轴为 TB / 同层中线同高且同列中线同线 / 非共轴连线全为正交 / 每边折弯 ≤1 / 无连线穿过非端点盒子（**容器亦视为不可穿越的盒子**）/ 无两条连线共用路径 / 同边挂点间距 ≥12px / **标签矩形不压方框、不压其他连线、不压其他标签** / **标签矩形与其所属连线不相交（容差 0）** / **标签侧偏 6–10px** / 前向边（分层 DAG 无环）/ **容器四周 padding ≥24px** / **容器互不重叠、且不与外部节点重叠** / **非容器节点不落在容器跨行内** / **容器子步骤 layer 连续** / 框内 ≤2 行且行宽 ≤224px / 框内无链条式字符箭头 / drawio 无 \`&amp;#\` 双重转义、无 \`html=0\`、vertex 含 \`whiteSpace=wrap;html=1;\` / 每条 edge 八个锚点属性齐全 / 拐点数组条数 == 折线边条数。

另经渲染肉眼核对（\`tools/diagrams/render-preview.ps1\`）：框内文字完整居中不溢出、分支为正交 L 形无斜线、箭头为实心三角且方向正确、标签一律侧偏到连线之外（无遮罩、无压线）。

## 9. 不入图的干扰信息（skill §2.5 禁"想象图"，同时避免结构过载）

${fig.excluded}

## 10. 边界（诚实声明）

- 图形内容**只取自 \`${fig.source}\` 的正文**，未臆造原文没有的环节；原文未交代的步骤不补齐。
- 同目录的 \`图片.png\` 是论文原图，**本图未参考它**（否则等于抄图，失去"据文绘图"的意义）。
- \`.drawio\` 已按 skill §7 双契约生成（\`&#xa;\` 单层实体换行 + \`html=1\`；每条 edge 显式 \`exitX/exitY/entryX/entryY\`、\`exitPerimeter=0;entryPerimeter=0;\` 与 \`*Dx/*Dy\`，锚点**由 SVG 折线反推**并经"回读重算 == 折线首点/箭头尖端"逐边校验，折线边带 \`<Array as="points">\` 拐点）且 XML 良构，但**未在 diagrams.net 实机打开**：生成侧可证"锚点与 SVG 同点、偏移单轴恰为 ${ARROW_OUTSET}px"，**渲染侧（mxGraph 投影/perimeter 形状）未经实机回看**。
- 源描述文档系 OCR 文本，存在公式乱码与断行；凡 OCR 不可辨的内容一律不入图。
`;
}

/* ---------- Z-2：同目录多图合并写盘（绘图路线.md 不再互相覆盖） ----------
   缺陷（真缺陷，实测）：旧实现按**目录**写 —— path.join(dir, '绘图路线.md')。
   而 --set=ref 的 11 张参照图落在 参照物/ 下 **7 个目录**，其中 2021_A题_图12 一个目录落 5 张
   （图12-总览 + 细节A/B/C/D）⇒ 后写的图把先写的整段覆盖，产物里最终只剩最后一张（细节D）的读数，
   图12-总览 / 12a / 12b / 12c 的读数彻底消失（同一机理即"图6-2 的读数被图6-3 覆盖"）。
   改法（任务书二选一，取后者）：**同目录多图合并到一个文件，每图一节**。
   理由：① 7 个目录里只有 1 个是多图；按图名分文件（<图名>.绘图路线.md）会让 6 个单图目录平白改名、
        制造"文件消失"观感，却只在 1 个目录里换来 5 个近乎同名的新文件；
      ② 文件名 绘图路线.md 是本仓既有入口（build.mjs 头注释、skill §10.13 口径、人的查找习惯都指向它），
        保留名字 = 入口不消失，天然满足"同一目录保留一个总入口"的要求；
      ③ 每节标题即 `## N. <图名>｜<图题>`，Ctrl+F / grep 可精确定位单张图的读数。
   内容零丢失：每节正文 = 该图单独生成时的 toThinking 全文（仅标题层降一级），一个字符都不删改。
   `--only=` 局部构建**不写**本文件：局部集合无法表达"本目录全部图"，写出来就是本缺陷的翻版。
   全量构建时若某张图本轮未参与（被过滤 / 构建未通过），其上一轮小节**原样结转**，绝不静默删除。 */
const TH_SEC_RE = /^##\s+\d+\.\s+(.+?)｜(.*)$/;
function carryThinkingSections(dir, runFiles) {
  const p = path.join(dir, '绘图路线.md');
  if (!fs.existsSync(p)) return [];
  const out = [];
  let cur = null;
  for (const ln of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = TH_SEC_RE.exec(ln);
    if (m) { if (cur) out.push(cur); cur = { file: m[1], title: m[2], body: [] }; continue; }
    if (cur) cur.body.push(ln);
  }
  if (cur) out.push(cur);
  return out.filter((x) => !runFiles.has(x.file)).map((x) => ({
    file: x.file, title: x.title, carried: true,
    body: x.body.join('\n').replace(/^\s+/, '').replace(/\s+$/, '').replace(/\n-{3,}$/, '')
  }));
}
function mergeThinking(dir, list) {
  const head = [
    `# 绘图路线 —— ${path.basename(dir)}（本目录 ${list.length} 张图）`,
    '',
    '> 本文件是本目录下**每张图**的绘图决策记录：一图一节，节标题即 `图名｜图题`。',
    '> 查找方式：`Ctrl+F` 搜图名（如 `图12-细节C`）或图题片段；每节的读数表、断言口径、',
    '> §10.13 豁免清单都完整保留，与"该图单独生成"时一致。',
    '> 生成方式：`node tools/diagrams/build.mjs --set=ref`（确定性矢量绘制，非图像生成模型产物）。',
    '',
    '## 本目录图索引',
    '',
    ...list.map((x, i) => `${i + 1}. \`${x.file}\` —— ${x.title}${x.carried ? '（本轮未重建，沿用上一轮读数）' : ''}`),
    ''
  ];
  const body = list.map((x, i) => {
    const tail = x.carried
      ? '> 说明：该图本轮未参与构建（被 --only 过滤或构建未通过），本节**原样结转**上一轮内容，未删改。\n\n'
      : '';
    return `## ${i + 1}. ${x.file}｜${x.title}\n\n${tail}${x.body}\n`;
  });
  return head.join('\n') + '\n' + body.join('\n---\n\n');
}

/* ---------- VDX（Visio 2003+ 可打开的 Visio XML）---------- */
/* 坐标：Visio 原点在左下、单位为英寸；故 Y 需按 (H - y_svg) 翻转，并除以 96 px/inch。
   形状用绝对坐标摆放；判定用内联 Geom 画菱形；起止用 Rounding 画胶囊；连线用 NoFill 折线 + 端箭头。 */
function toVDX(b) {
  const { fig, W, H, paths, labels, containerBoxes } = b;
  const IN = 96, g = esc;
  const inch = (v) => (Math.round(v / IN * 1e4) / 1e4);
  const shapes = [];
  let sid = 0;
  const nextId = () => String(++sid);
  const textOf = (lines) => lines.map(g).join('\n');

  /* 容器（最底层，先画） */
  for (const [, cbx] of containerBoxes) {
    const id = nextId();
    const w = inch(cbx.w), h = inch(cbx.h);
    shapes.push(
      `        <Shape ID="${id}" Type="Shape" NameU="CT_${g(cbx.ct.id)}" Name="CT_${g(cbx.ct.id)}">
          <XForm><PinX>${inch(cbx.x + cbx.w / 2)}</PinX><PinY>${inch(H - (cbx.y + cbx.h / 2))}</PinY><Width>${w}</Width><Height>${h}</Height><LocPinX>${w / 2}</LocPinX><LocPinY>${h / 2}</LocPinY><Angle>0</Angle><FlipX>0</FlipX><FlipY>0</FlipY><ResizeMode>0</ResizeMode></XForm>
          <Fill><FillForegnd>#F7F9FC</FillForegnd><FillPattern>1</FillPattern></Fill>
          <Line><LineColor>#8C97A8</LineColor><LineWeight>0.02</LineWeight><Rounding>0.12</Rounding></Line>
          <Text>${textOf(cbx.titleLines || cbx.ct.titleLines)}</Text>
        </Shape>`);
  }
  /* 节点 */
  for (const n of fig.nodes) {
    const p = pos0(b, n.id);
    if (!p) continue;
    const st = STYLE[n.type];
    const hBox = n.parent ? NH_SUB : NH;
    const isDia = !!st.diamond;
    const bw = isDia ? NW + 80 : NW, bh = isDia ? hBox + 36 : hBox;
    const w = inch(bw), h = inch(bh);
    const round = (n.type === 'start' || n.type === 'end' || n.type === 'focusend') ? (h / 2) : inch(4);
    const geom = isDia
      ? `
          <Geom IX="0">
            <MoveTo IX="1"><X>${w / 2}</X><Y>${h}</Y></MoveTo>
            <LineTo IX="2"><X>${w}</X><Y>${h / 2}</Y></LineTo>
            <LineTo IX="3"><X>${w / 2}</X><Y>0</Y></LineTo>
            <LineTo IX="4"><X>0</X><Y>${h / 2}</Y></LineTo>
            <LineTo IX="5"><X>${w / 2}</X><Y>${h}</Y></LineTo>
          </Geom>`
      : '';
    shapes.push(
      `        <Shape ID="${nextId()}" Type="Shape" NameU="${g(n.id)}" Name="${g(n.id)}">
          <XForm><PinX>${inch(p.cx)}</PinX><PinY>${inch(H - p.cy)}</PinY><Width>${w}</Width><Height>${h}</Height><LocPinX>${w / 2}</LocPinX><LocPinY>${h / 2}</LocPinY><Angle>0</Angle><FlipX>0</FlipX><FlipY>0</FlipY><ResizeMode>0</ResizeMode></XForm>
          <Fill><FillForegnd>${st.fill}</FillForegnd><FillPattern>1</FillPattern></Fill>
          <Line><LineColor>${st.stroke}</LineColor><LineWeight>${st.focus ? 0.03 : 0.02}</LineWeight><Rounding>${round}</Rounding></Line>${geom}
          <Text>${textOf(n.lines)}</Text>
        </Shape>`);
  }
  /* Y-3：非节点"紧凑标记"（无边框、无填充的纯文字形状） */
  for (const mk of (b.markers || [])) {
    const w = inch(mk.box.w), h = inch(mk.box.h);
    shapes.push(
      `        <Shape ID="${nextId()}" Type="Shape" NameU="MK_${g(mk.id || 'm')}" Name="MK_${g(mk.id || 'm')}">
          <XForm><PinX>${inch(mk.cx)}</PinX><PinY>${inch(H - mk.cy)}</PinY><Width>${w}</Width><Height>${h}</Height><LocPinX>${w / 2}</LocPinX><LocPinY>${h / 2}</LocPinY><Angle>0</Angle><FlipX>0</FlipX><FlipY>0</FlipY><ResizeMode>0</ResizeMode></XForm>
          <Fill><FillPattern>0</FillPattern></Fill>
          <Line><LinePattern>0</LinePattern></Line>
          <Text>${g(mk.text)}</Text>
        </Shape>`);
  }
  /* 连线（折线 + 端箭头） */
  for (const { e, pts } of paths) {
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const L = Math.min(...xs), R = Math.max(...xs), T = Math.min(...ys), B = Math.max(...ys);
    const w = inch(Math.max(R - L, 1)), h = inch(Math.max(B - T, 1));
    const rows = pts.map((q, i) => {
      const lx = inch(q.x - L), ly = inch(B - q.y);   // Y 翻转
      return `            <${i === 0 ? 'MoveTo' : 'LineTo'} IX="${i + 1}"><X>${lx}</X><Y>${ly}</Y></${i === 0 ? 'MoveTo' : 'LineTo'}>`;
    }).join('\n');
    shapes.push(
      `        <Shape ID="${nextId()}" Type="Shape" NameU="E_${g(e.from)}_${g(e.to)}" Name="E_${g(e.from)}_${g(e.to)}">
          <XForm><PinX>${inch((L + R) / 2)}</PinX><PinY>${inch(H - (T + B) / 2)}</PinY><Width>${w}</Width><Height>${h}</Height><LocPinX>${w / 2}</LocPinX><LocPinY>${h / 2}</LocPinY><Angle>0</Angle><FlipX>0</FlipX><FlipY>0</FlipY><ResizeMode>0</ResizeMode></XForm>
          <Line><LineColor>#333333</LineColor><LineWeight>0.03</LineWeight><EndArrow>4</EndArrow><EndArrowSize>2</EndArrowSize></Line>
          <Geom IX="0"><NoFill>1</NoFill>
${rows}
          </Geom>
        </Shape>`);
  }
  /* 连线标签（白底遮罩 + 文本；VDX 无遮罩概念，仅放置文本形状） */
  for (const l of labels) {
    if (l.blank) continue;
    const w = inch(l.box.w), h = inch(l.box.h);
    shapes.push(
      `        <Shape ID="${nextId()}" Type="Shape" NameU="L_${g(l.e.from)}_${g(l.e.to)}" Name="L_${g(l.e.from)}_${g(l.e.to)}">
          <XForm><PinX>${inch(l.mid.x)}</PinX><PinY>${inch(H - l.mid.y)}</PinY><Width>${w}</Width><Height>${h}</Height><LocPinX>${w / 2}</LocPinX><LocPinY>${h / 2}</LocPinY><Angle>0</Angle><FlipX>0</FlipX><FlipY>0</FlipY><ResizeMode>0</ResizeMode></XForm>
          <Fill><FillForegnd>#FFFFFF</FillForegnd><FillPattern>1</FillPattern></Fill>
          <Line><LinePattern>0</LinePattern></Line>
          <Text>${g(l.e.label)}</Text>
        </Shape>`);
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<VisioDocument xmlns="http://schemas.microsoft.com/visio/2003/core" xml:space="preserve">
  <DocumentProperties>
    <Title>${g(fig.title)}</Title>
    <Creator>scientific-diagram-v41 (deterministic build)</Creator>
  </DocumentProperties>
  <Pages>
    <Page ID="0" NameU="Page-1" Name="Page-1">
      <PageSheet>
        <PageProps>
          <PageWidth>${inch(W)}</PageWidth>
          <PageHeight>${inch(H)}</PageHeight>
        </PageProps>
      </PageSheet>
      <Shapes>
${shapes.join('\n')}
      </Shapes>
    </Page>
  </Pages>
</VisioDocument>
`;
}
const pos0 = (b, id) => b.pos.get(id);

/* 节点类型 → 本机 Visio 基础流程图模具 BASFLO_M.VSSX 的母版**通用名 NameU**（ASCII）。
   实测该模具 Name→NameU：流程→Process / 判定→Decision / 子流程→Subprocess /
   开始\u002f结束→Start\u002fEnd / 数据→Data / 动态连接线→Dynamic connector。
   用 NameU 可让 JSON 与 .ps1 全为 ASCII（本机 .ps1 按 GBK 读，不能含中文）。 */
const VISIO_MASTER = {
  start: 'Start/End', end: 'Start/End', focusend: 'Start/End',
  focus: 'Process', step: 'Process', io: 'Data', decision: 'Decision'
};
const VISIO_CONNECTOR = 'Dynamic connector';

/* 供 tools/diagrams/to-visio.ps1 消费的布局 JSON（英寸坐标；Visio 原点在左下，故翻转 y） */
/* U-2 / R-2：导出"每一个文本元素 + 它的可用框"，供 verify-text-metrics.ps1 用**真实字体**
   （Microsoft YaHei / msyh.ttc 的 Graphics.MeasureString）独立度量。
   本函数**只喂料、不做任何宽度判断**——生成器自己的 isWide 口径一律不参与判定，
   避免"同口径必然自洽"（上一轮就栽在这里）。 */
function textMetricItems(b) {
  const { fig, W } = b;
  const items = [];
  const colW = W - 2 * M;                      /* 标题/副标题/页脚共用的可用列宽 */
  const push = (o) => items.push(Object.assign({ bold: false, anchor: 'left', rotate: 0 }, o));
  b.titleLines.forEach((ln, i) => push({ kind: 'title', text: ln, fontSize: FS_TTL, bold: true, availW: colW, x: M, y: b.titleYs[i] }));
  b.subLines.forEach((ln, i) => push({ kind: 'sub', text: ln, fontSize: FS_SUB, availW: colW, x: M, y: b.subYs[i] }));
  b.footLines.forEach((ln, i) => push({ kind: 'foot', text: ln, fontSize: FS_FOOT, availW: colW, x: M, y: b.footYs[i] }));
  for (const n of fig.nodes) {
    const p = b.pos.get(n.id);
    if (!p) continue;
    n.lines.forEach((ln) => push({ kind: 'node', id: n.id, text: ln, fontSize: FS_NODE, availW: MAXW, x: p.cx, y: p.cy, anchor: 'middle' }));
  }
  for (const [id, cb] of b.containerBoxes) {
    (cb.titleLines || cb.ct.titleLines).forEach((ln) => push({ kind: 'container', id, text: ln, fontSize: FS_CT, bold: true, availW: cb.w - 24, x: cb.x + cb.w / 2, y: cb.y + 18, anchor: 'middle' }));
  }
  for (const l of (b.labels || [])) {
    if (l.blank) continue;
    push({ kind: 'edge', edge: `${l.e.from}->${l.e.to}`, text: l.e.label, fontSize: FS_EDGE, availW: l.box.w - l.pad, x: l.box.x + l.box.w / 2, y: l.box.y + l.box.h / 2, anchor: 'middle', boxW: l.box.w, boxH: l.box.h, side: l.side, off: l.off });
  }
  for (const ln of (b.lanes || [])) {
    push({ kind: 'swl', id: ln.id, text: ln.label, fontSize: FS_SWL, bold: true, availW: ln.h - 8, x: ln.x + ln.w / 2, y: ln.y + ln.h / 2, anchor: 'middle', rotate: -90 });
  }
  /* Y-3：非节点标记也交给真实字体脚本度量（字号与节点文字同档 FS_NODE），防止标记文字被裁 */
  for (const mk of (b.markers || [])) {
    push({ kind: 'marker', id: mk.id, text: mk.text, fontSize: FS_NODE, availW: mk.availW, x: mk.cx, y: mk.cy, anchor: 'middle' });
  }
  return items;
}

function toLayoutJSON(b) {
  const { fig, W, H, paths, containerBoxes } = b;
  const IN = 96, r = (v) => Math.round(v / IN * 1e4) / 1e4;
  const nodes = fig.nodes.filter((n) => b.pos.get(n.id)).map((n) => {
    const p = b.pos.get(n.id), st = STYLE[n.type];
    const hBox = n.parent ? NH_SUB : NH;
    const dia = !!st.diamond;
    return {
      id: n.id, kind: n.parent ? 'sub' : 'main', master: VISIO_MASTER[n.type] || '流程',
      cx: r(p.cx), cy: r(H - p.cy),
      w: r(dia ? NW + 80 : NW), h: r(dia ? hBox + 36 : hBox),
      text: n.lines.join('\n')
    };
  });
  const groups = [...containerBoxes].map(([id, cb]) => ({
    id, master: 'Subprocess', cx: r(cb.x + cb.w / 2), cy: r(H - (cb.y + cb.h / 2)), w: r(cb.w), h: r(cb.h),
    text: (cb.titleLines || cb.ct.titleLines).join('\n')
  }));
  const edges = paths.map(({ e, pts }) => ({
    from: e.from, to: e.to, label: e.label || null, fork: !!e.fork,
    pts: pts.map((q) => ({ x: r(q.x), y: r(H - q.y) }))
  }));
  /* U-4 / U-1 独立复核数据（SVG 坐标，y 向下）：节点盒两两重合、标签盒是否压所属连线，
     都由外部脚本从这两段数据独立重算，不复用生成器的判定结果。 */
  const auditNodes = (b.auditNodes || []).map((n) => ({ id: n.id, x: Math.round(n.x * 1e4) / 1e4, y: Math.round(n.y * 1e4) / 1e4, w: n.w, h: n.h }));
  const auditLabels = (b.auditLabels || []).map((l) => ({
    edge: l.edge, side: l.side, off: l.off,
    box: { x: Math.round(l.box.x * 1e4) / 1e4, y: Math.round(l.box.y * 1e4) / 1e4, w: Math.round(l.box.w * 1e4) / 1e4, h: Math.round(l.box.h * 1e4) / 1e4 },
    pts: l.pts.map((q) => ({ x: Math.round(q.x * 1e4) / 1e4, y: Math.round(q.y * 1e4) / 1e4 }))
  }));
  const texts = textMetricItems(b);
  const fonts = { size: { title: FS_TTL, sub: FS_SUB, node: FS_NODE, edge: FS_EDGE, foot: FS_FOOT, ct: FS_CT, swl: FS_SWL }, family: 'Microsoft YaHei', width: b.W, height: b.H, margin: M };
  /* Y-3 / X-3 审计数据：非节点标记盒、以及每条边的"渲染三角外接盒 + 目标盒"，
     供 SVG 之外的独立脚本重算"标记是否撞盒"与"三角是否穿盒"，不复用生成器的判定结果。 */
  const markerJson = (b.markers || []).map((mk) => ({ id: mk.id, text: mk.text, x: Math.round(mk.box.x * 1e4) / 1e4, y: Math.round(mk.box.y * 1e4) / 1e4, w: mk.box.w, h: mk.box.h }));
  const auditArrows = (b.arrowAudit || []).map((a) => ({
    edge: a.edge,
    tri: { x: Math.round(a.tri.x * 1e4) / 1e4, y: Math.round(a.tri.y * 1e4) / 1e4, w: Math.round(a.tri.w * 1e4) / 1e4, h: Math.round(a.tri.h * 1e4) / 1e4 },
    target: a.target ? { x: Math.round(a.target.x * 1e4) / 1e4, y: Math.round(a.target.y * 1e4) / 1e4, w: a.target.w, h: a.target.h } : null
  }));
  return JSON.stringify({ file: fig.file, pageW: r(W), pageH: r(H), groups, nodes, edges, connector: VISIO_CONNECTOR, fonts, texts, auditNodes, auditLabels, markers: markerJson, auditArrows }, null, 1);
}

/* ============================================================
   P1 新增工具（只增不改）：--score 的诊断条目构造 + --diff 的 id 对齐比对
   ============================================================ */

/* P1-④：断言文本 → {code,severity,subject,message,fix}（与 drawio-skill validate.py 的
   validate_* 返回条目同构）。code 口径：显式编号（U-4 / X-1 / R-1 / Y-3 …）原样取；
   drawio 契约类归 DRAWIO；其余中文断言按开头 2–6 个汉字归 CN-<词>。 */
function mkDiag(subject, msg, severity) {
  const t = String(msg);
  const m = /^([A-Za-z]{1,4}-\d+)/.exec(t);
  const cn = /^([\u4e00-\u9fa5]{1,6})/.exec(t);
  const code = m ? m[1] : (/^drawio/.test(t) ? 'DRAWIO' : (cn ? 'CN-' + cn[1] : 'OTHER'));
  return { code, severity, subject: String(subject), message: t, fix: diagFix(code) };
}

/* fix 建议表：只做"往哪儿修"的指向，不放宽断言本身（断言阈值不因本表变化）。 */
function diagFix(code) {
  const T = {
    'R-1': '宽度必须单源：只允许宽度函数一处产出 W，禁止泳道/容器二次加宽',
    'R-5': '恢复该 outDir 及其 00-图题与描述.md（目录被改名/挪走时先修数据源再重跑）',
    'U-1': '把边标签侧偏调回 6–10px 区间（改标签盒偏移或换标签侧）',
    'U-3': '画布宽与图形宽对齐（改宽度函数或减小元素占宽）',
    'U-4': '消除节点盒相交：缩小节点尺寸或加大层距 G / 列距 W',
    'X-1': '箭头必须停在目标盒之外：校正 Z-1 外让量 ARROW_OUTSET 与目标盒',
    'X-3': '箭头三角不得穿盒：校正尖端外让与三角渲染几何（ARROW_LEN/ARROW_HALF）',
    'Y-2': '泳道标签带不得越界或压内容：调整标签带宽度与列起点',
    'Y-3': '标记须落在可绘区内且不撞盒：改 side/gap 或宿主节点',
    'DRAWIO': '按 §7 契约②回读校验修锚点：exit/entry 八属性齐全 + *Perimeter=0 + 回读首末点等于 SVG 折线'
  };
  if (T[code]) return T[code];
  if (/^CN-/.test(code)) return '按断言文本修正布局参数后重跑（详见 绘图路线.md 对应小节）';
  return '按断言文本定位并修正后重跑；不得靠改断言放宽标准';
}

/* P1-③：两个 layout.json 的 id 对齐比对。纯读盘，不构建、不写盘、不画图。
   nodes 按 id 对齐；edges 在 schema 里**没有 id**，故按 `from->to` 对齐，
   重路由按规格定义识别：保留一端、另一端换到**新增节点**。
   返回退出码：0 = 比对完成（有差异也是 0）；2 = 用法/读盘/解析错误。 */
function runLayoutDiff(oldPath, newPath) {
  if (!oldPath || !newPath || String(oldPath).startsWith('--') || String(newPath).startsWith('--')) {
    console.error('用法：node tools/diagrams/build.mjs --diff <old.layout.json> <new.layout.json>');
    return 2;
  }
  const load = (p) => {
    if (!fs.existsSync(p)) throw new Error(`文件不存在：${p}`);
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { throw new Error(`不是合法 JSON：${p}（${e.message}）`); }
  };
  let A, B;
  try { A = load(oldPath); B = load(newPath); } catch (e) { console.error(`[DIFF] ${e.message}`); return 2; }

  const EPS = 1e-6;
  const sN = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const eq = (a, b) => (Number.isNaN(sN(a)) && Number.isNaN(sN(b))) || Math.abs(sN(a) - sN(b)) <= EPS;
  const txt = (n) => String(n && n.text !== undefined && n.text !== null ? n.text : '');
  const key = (e) => `${e.from}->${e.to}`;
  const posEq = (a, b) => eq(a.cx, b.cx) && eq(a.cy, b.cy) && eq(a.w, b.w) && eq(a.h, b.h);
  const ptsEq = (a, b) => {
    const p = Array.isArray(a) ? a : [], q = Array.isArray(b) ? b : [];
    return p.length === q.length && p.every((v, i) => eq(v.x, q[i].x) && eq(v.y, q[i].y));
  };

  /* ---- 节点：按 id 对齐 ---- */
  const nA = new Map((A.nodes || []).map((n) => [n.id, n]));
  const nB = new Map((B.nodes || []).map((n) => [n.id, n]));
  const added = [], removed = [], changed = [], moved = [], same = [];
  for (const id of [...nB.keys()].filter((k) => !nA.has(k)).sort()) added.push({ id, text: txt(nB.get(id)) });
  for (const id of [...nA.keys()].filter((k) => !nB.has(k)).sort()) removed.push({ id, text: txt(nA.get(id)) });
  for (const id of [...nA.keys()].filter((k) => nB.has(k)).sort()) {
    const a = nA.get(id), b = nB.get(id);
    const labelChanged = txt(a) !== txt(b), posChanged = !posEq(a, b);
    if (!labelChanged && !posChanged) { same.push(id); continue; }
    /* 标签与位置同时变：归 changed（标签承载结论），posChanged 标志位保留，信息不丢 */
    const rec = {
      id, labelChanged, posChanged,
      old: { text: txt(a), cx: a.cx, cy: a.cy, w: a.w, h: a.h },
      new: { text: txt(b), cx: b.cx, cy: b.cy, w: b.w, h: b.h }
    };
    if (labelChanged) changed.push(rec); else moved.push(rec);
  }

  /* ---- 边：按 from->to 对齐；重路由 = 保留一端 + 另一端换到新增节点 ---- */
  const eA = new Map((A.edges || []).map((e) => [key(e), e]));
  const eB = new Map((B.edges || []).map((e) => [key(e), e]));
  const addedIds = new Set(added.map((n) => n.id)), removedIds = new Set(removed.map((n) => n.id));
  const edgeSame = [], edgeAdded = [], edgeRemoved = [], edgeRerouted = [];
  const usedA = new Set(), usedB = new Set();
  for (const k of [...eA.keys()].sort()) {
    if (!eB.has(k)) continue;
    usedA.add(k); usedB.add(k);
    const a = eA.get(k), b = eB.get(k);
    /* 规格只定义 edgeSame/edgeAdded/edgeRemoved/edgeRerouted 四类；同键边的标签/折线变化
       不另立类别，只作标志位记录，避免自造第五类。 */
    edgeSame.push({
      key: k, labelChanged: (a.label || null) !== (b.label || null), ptsChanged: !ptsEq(a.pts, b.pts),
      oldLabel: a.label || null, newLabel: b.label || null
    });
  }
  const restA = [...eA.keys()].filter((k) => !usedA.has(k)).sort();
  const restB = [...eB.keys()].filter((k) => !usedB.has(k)).sort();
  for (const ka of restA) {
    if (usedA.has(ka)) continue;
    const partsA = ka.split('->'), af = partsA[0], at = partsA[1];
    for (const kb of restB) {                      /* restB 已排序 + 首个命中即停 ⇒ 配对确定 */
      if (usedB.has(kb)) continue;
      const partsB = kb.split('->'), bf = partsB[0], bt = partsB[1];
      const keepFrom = af === bf && at !== bt && addedIds.has(bt);
      const keepTo = at === bt && af !== bf && addedIds.has(bf);
      if (!keepFrom && !keepTo) continue;
      usedA.add(ka); usedB.add(kb);
      edgeRerouted.push({
        oldKey: ka, newKey: kb, keptEnd: keepFrom ? af : at,
        droppedEnd: keepFrom ? at : af, newEnd: keepFrom ? bt : bf,
        droppedEndWasRemoved: removedIds.has(keepFrom ? at : af),
        labelChanged: (eA.get(ka).label || null) !== (eB.get(kb).label || null)
      });
      break;
    }
  }
  for (const k of restA) if (!usedA.has(k)) { const _e = eA.get(k); edgeRemoved.push({ key: k, label: (_e.label || null), from: _e.from, to: _e.to, pts: _e.pts || null }); }
  for (const k of restB) if (!usedB.has(k)) { const _e = eB.get(k); edgeAdded.push({ key: k, label: (_e.label || null), from: _e.from, to: _e.to, pts: _e.pts || null }); }

  const pageChanged = !(eq(A.pageW, B.pageW) && eq(A.pageH, B.pageH));
  const identical = !added.length && !removed.length && !changed.length && !moved.length
    && !edgeAdded.length && !edgeRemoved.length && !edgeRerouted.length
    && edgeSame.every((e) => !e.labelChanged && !e.ptsChanged) && !pageChanged;

  const out = {
    old: path.resolve(oldPath), new: path.resolve(newPath),
    file: { old: A.file || null, new: B.file || null },
    page: { old: [A.pageW, A.pageH], new: [B.pageW, B.pageH], changed: pageChanged },
    identical,
    nodes: { added, removed, changed, moved, same },
    edges: { edgeAdded, edgeRemoved, edgeRerouted, edgeSame },
    counts: {
      nodes: { added: added.length, removed: removed.length, changed: changed.length, moved: moved.length, same: same.length },
      edges: { edgeAdded: edgeAdded.length, edgeRemoved: edgeRemoved.length, edgeRerouted: edgeRerouted.length, edgeSame: edgeSame.length }
    }
  };

  console.log('=== --diff JSON ===');
  console.log(JSON.stringify(out, null, 1));
  console.log('');
  console.log('=== --diff markdown 对照表 ===');
  const cellOf = (v) => String(v).replace(/\|/g, '\\|');
  const brief = (list, fmt, cap = 10) => {
    if (!list.length) return '—';
    const head = list.slice(0, cap).map(fmt).join('；');
    return list.length > cap ? `${head}；…(+${list.length - cap})` : head;
  };
  const nm = (n) => '`' + n.id + '`';
  console.log('| 类别 | 数量 | 明细 |');
  console.log('|---|---:|---|');
  console.log(`| nodes.added | ${added.length} | ${cellOf(brief(added, nm))} |`);
  console.log(`| nodes.removed | ${removed.length} | ${cellOf(brief(removed, nm))} |`);
  console.log(`| nodes.changed | ${changed.length} | ${cellOf(brief(changed, (n) => '`' + n.id + '`「' + n.old.text + '」→「' + n.new.text + '」'))} |`);
  console.log(`| nodes.moved | ${moved.length} | ${cellOf(brief(moved, (n) => '`' + n.id + '` (' + n.old.cx + ',' + n.old.cy + ')→(' + n.new.cx + ',' + n.new.cy + ')'))} |`);
  console.log(`| nodes.same | ${same.length} | ${cellOf(brief(same, (id) => '`' + id + '`'))} |`);
  console.log(`| edgeAdded | ${edgeAdded.length} | ${cellOf(brief(edgeAdded, (e) => '`' + e.key + '`'))} |`);
  console.log(`| edgeRemoved | ${edgeRemoved.length} | ${cellOf(brief(edgeRemoved, (e) => '`' + e.key + '`'))} |`);
  console.log(`| edgeRerouted | ${edgeRerouted.length} | ${cellOf(brief(edgeRerouted, (e) => '`' + e.oldKey + '`→`' + e.newKey + '`'))} |`);
  console.log(`| edgeSame | ${edgeSame.length} | ${cellOf(brief(edgeSame, (e) => '`' + e.key + '`'))} |`);
  console.log('');
  console.log(`[DIFF] identical=${identical} | 节点 added ${added.length} removed ${removed.length} changed ${changed.length} moved ${moved.length} same ${same.length} | 边 added ${edgeAdded.length} removed ${edgeRemoved.length} rerouted ${edgeRerouted.length} same ${edgeSame.length} | pageW/H ${A.pageW}x${A.pageH} → ${B.pageW}x${B.pageH}`);
  /* P1-③（彩色可视化）：写出 <新图名>-diff.drawio，复用 toDrawio 的 cell 格式与 drawiodiff 配色语义 */
  try {
    const newBase = path.basename(String(newPath)).replace(/\.layout\.json$/i, '').replace(/\.json$/i, '');
    const outDrawio = path.resolve(path.dirname(path.resolve(newPath)), `${newBase}-diff.drawio`);
    fs.writeFileSync(outDrawio, toDiffDrawio(out, A, B), 'utf8');
    console.log('');
    console.log(`[DIFF] 已写出彩色对照图：${outDrawio}`);
    console.log('       用 diagrams.net 打开：绿=新增 橙=修改/改向 紫=移动 红虚线=删除 灰=不变');
  } catch (e) { console.error(`[DIFF] 写对照图失败：${e.message}`); }
  return 0;
}

/* ---------- 主流程 ---------- */
const OUT = path.resolve(process.cwd(), '结果');
const rows = [];
/* Z-2：--only= 局部构建过滤词（老代码在 for 头里内联重算，此处提到外面供绘图路线写盘判断） */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
/* ===== P1：三个新开关的解析。一律用 process.argv.includes 精确匹配，不碰 --set=/--only=
   既有的 find(startsWith) 口径；四开关**默认全关**，故不带它们的调用路径与改动前逐字节一致。 ===== */
const SUMMARY = process.argv.includes('--summary');
const SCORE = process.argv.includes('--score');
const STRICT = process.argv.includes('--strict');   /* 仅在 --score 下生效（见文末判词），单独出现时照旧被忽略 */
const diagEntries = [];   /* P1-④：{code,severity,subject,message,fix}，与 drawio-skill validate.py 同构 */
/* P1-①：--only 的局部构建集合。过滤表达式与原 for 头内联式语义完全相同（只提取为常量），
   提取的目的是让 R-5 / R-4 两个"逐图打印"的前置循环共用同一集合——否则 --only 时日志里
   仍会打印未命中图的守卫行，违反"仅在日志里打印这些图"。默认（无 --only）时 === figures。 */
const selectedFigures = ONLY ? figures.filter((f) => f.file.includes(ONLY)) : figures;
/* Z-2：绘图路线.md 按**目录**缓冲（dir → Map<图名, 节>）：同一目录多张图合并成一份多节文件，
   不再"后写覆盖先写"。键用图名而非数组下标，重复写入时天然去重且顺序稳定。 */
const thinkingByDir = new Map();
/* F-D：--set=ref 时真实写入位置是各 fig.outDir（参照物/ 下的 N 个目录），与常量 OUT(=结果) 无关；
   故逐图登记真实写入目录，汇总行据此打印，不再把 OUT 当成"输出目录"误报。 */
const outDirSet = new Set();
let failed = 0, total = 0;

/* ===== R-5：构建前校验每个 figure 的 outDir 确实存在且内含 00-图题与描述.md =====
   参照物/ 下的目录名会被外部改名（历史上长目录名被改短过一次）。解析器对"0 命中 / 多义"已经
   是 throw，但那只覆盖"目录名 → 目录"这一步；若目录存在而描述文件被挪走/改名，坏的是**内容来源**，
   必须在写盘前响亮报错并列出该目录实际内容，绝不静默继续。 */
const DESC_MD = '00-图题与描述.md';
const dirCheck = new Map();   /* outDir -> { reason, listing } | { md } */
for (const fig of selectedFigures) {
  if (!fig.outDir || dirCheck.has(fig.outDir)) continue;
  const dir = fig.outDir;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    dirCheck.set(dir, { reason: 'outDir 不存在或不是目录', listing: fs.existsSync(path.dirname(dir)) ? fs.readdirSync(path.dirname(dir)).join(', ') : '(父目录也不存在)' });
  } else if (!fs.existsSync(path.join(dir, DESC_MD))) {
    dirCheck.set(dir, { reason: `目录内缺 ${DESC_MD}`, listing: fs.readdirSync(dir).join(', ') || '(空目录)' });
  } else {
    dirCheck.set(dir, { md: fs.readFileSync(path.join(dir, DESC_MD), 'utf8') });
  }
}
let guardBad = 0;
for (const [dir, v] of dirCheck) {
  if (!v.reason) continue;
  guardBad++;
  console.log(`[GUARD-FAIL] R-5 参照物目录不可用：${dir}`);
  console.log(`             原因：${v.reason}`);
  console.log(`             该目录实际内容：${v.listing}`);
}
if (guardBad) console.log(`[GUARD-FAIL] R-5 共 ${guardBad} 个 outDir 未通过校验，相关图将不写盘（退出码非 0）。`);

/* ===== R-4：目录内 md 的图题与 spec.title 明显不符 → 只警告，不阻断 =====
   注意实测事实：本仓 00-图题与描述.md 的**首行是正文**（原始文档正文），不是图题。
   故"首行图题"只能按"以 图N / Fig N 开头的那一行"识别；识别不到时打印 NOTE（说明口径），
   而不是把正文首行当成图题去比对（那会对全部图产生无意义警告）。 */
const normTitle = (s) => String(s).replace(/[\s\u3000]/g, '').replace(/[（）()【】\[\]、，,。.：:·|｜—–\-_/]/g, '');
const figNoOf = (s) => { const m = /图\s*([0-9]+)\s*[-\u2010\u2011\u2012\u2013\u2014]?\s*([0-9]+)?/.exec(String(s)); return m ? (m[1] + (m[2] ? '-' + m[2] : '')) : ''; };
const titleLineOf = (txt) => {
  for (const raw of String(txt).split(/\r?\n/)) {
    const s = raw.replace(/^#+\s*/, '').trim();
    if (/^图\s*[0-9]/.test(s) || /^Fig\b/i.test(s)) return s;
  }
  return '';
};
const r4Noted = new Set(), r4Warned = new Set();
for (const fig of selectedFigures) {
  if (!fig.outDir || r4Noted.has(fig.outDir)) continue;
  const v = dirCheck.get(fig.outDir);
  if (!v || v.md === undefined) continue;
  r4Noted.add(fig.outDir);
  const tl = titleLineOf(v.md);
  if (!tl) {
    console.log(`[NOTE] R-4 ${path.basename(fig.outDir)}：${DESC_MD} 内没有"以 图N / Fig N 开头的图题行"（首行是正文），无法做图题比对——口径已限定，不作误报。`);
    continue;
  }
  const a = figNoOf(tl), b = figNoOf(fig.title);
  const na = normTitle(tl), nb = normTitle(fig.title);
  const mismatch = (a && b && a !== b) || (!na.includes(nb) && !nb.includes(na));
  if (mismatch && !r4Warned.has(fig.outDir)) {
    r4Warned.add(fig.outDir);
    console.log(`[WARN] R-4 ${fig.file}：目录 md 图题「${tl}」与 spec.title「${fig.title}」明显不符（疑似放错图，需人工确认；本守卫不阻断、不自动改）。`);
  }
}

for (const fig of selectedFigures) {
  /* R-5：目录校验未通过的图直接不写盘（响亮报错已在上面列出） */
  if (fig.outDir && dirCheck.get(fig.outDir)?.reason) {
    failed++;
    /* P1-④：本分支只 failed++ 而不进 diagEntries，会让 --score 出现"SCORE 100/pass 但退出码 1"
       的自相矛盾，故在此补一条 error 诊断，保证判词、分数、退出码三者同源。 */
    diagEntries.push(mkDiag(fig.file, `R-5 outDir 校验未通过：${dirCheck.get(fig.outDir).reason}`, 'error'));
    console.log(`[FAIL] ${fig.file} | R-5 outDir 校验未通过：${dirCheck.get(fig.outDir).reason}（已列出目录实际内容，未写盘）`);
    continue;
  }
  const b = buildFigureAuto(fig);
  if (process.env.DIAG) console.log('RET|' + fig.file + '|' + (b === undefined ? 'UNDEFINED' : JSON.stringify(b.errors)));
  if (b && b.errors.length > 0) { console.log(`[FIGERR] ${fig.file} : ${b.errors.join(' || ')}`); }
  if (!b) continue;
  total++;
  /* 残图闸门：buildFigure 一旦有错就返回残图（paths: [] / W=H=0）。
     此时既不能生成交付物——toDrawio 会在 `const P = paths[i]` 崩栈（TypeError: Cannot read
     properties of undefined (reading 'e')），也不能把 W=0/H=0 的残图写出去覆盖上一轮的好产物。
     故有错即只报错、计入 failed、跳过本图全部写盘，并继续处理后续图（不 throw、不 return）。 */
  if (b.errors.length > 0) {
    failed++;
    console.log(`[FAIL] ${fig.file} | ${b.errors.join(' || ')}`);
    console.log(`[FAIL] ${fig.category}/${fig.file} | 轴 ${b.axis} 视觉单元 ${b.visualUnits}/9（节点 ${fig.nodes.length}·容器 ${(fig.containers || []).length}） 箭头 ${fig.edges.length}/12 焦点 ${b.focusCount}/2 折弯max — | 画布 —（残图 ${b.W}x${b.H}，未绘制） | drawio锚点 — 拐点 —（未生成） 交付物 0 个（未写盘）`);
    for (const e of b.errors) console.log(`         ✗ ${e}`);
    for (const n of b.notes) console.log(`         · ${n}`);
    continue;
  }
  const dir = fig.outDir || path.join(OUT, fig.category);
  outDirSet.add(dir);
  fs.mkdirSync(dir, { recursive: true });
  const svg = toSVG(b), dw = toDrawio(b), vdx = toVDX(b);

  /* §8 新增两条 drawio 闸门：换行/锚点；并校验无双重转义 */
  if (/&amp;#/.test(dw)) b.errors.push('drawio 出现 &amp;# 双重转义');
  if (/html=0/.test(dw)) b.errors.push('drawio style 含 html=0');
  if (!/whiteSpace=wrap;html=1;/.test(dw)) b.errors.push('drawio vertex style 缺 whiteSpace=wrap;html=1;');
  const edgeCells = dw.match(/<mxCell id="e\d+"[^>]*>/g) || [];
  if (edgeCells.length !== fig.edges.length) b.errors.push(`drawio edge 数 ${edgeCells.length} != ${fig.edges.length}`);
  for (const c of edgeCells) {
    /* §7 契约②（v2）：八个端点属性齐全 + `*Perimeter=0`（无它则 *Dx/*Dy 会被 mxGraph 投影回周长点）。
       注意 `entryDx`/`entryDy` 现在可能是 ±ARROW_OUTSET，故这里只判"属性存在"，具体取值由下面
       的 anchorOffsetOf 同源断言逐边核对。 */
    for (const k of ['exitX=', 'exitY=', 'exitDx=', 'exitDy=', 'entryX=', 'entryY=', 'entryDx=', 'entryDy=', 'exitPerimeter=0;', 'entryPerimeter=0;']) {
      if (!c.includes(k)) b.errors.push(`drawio edge 缺锚点属性 ${k}`);
    }
    if (/orthogonalEdgeStyle/.test(c) && !/exitX=/.test(c)) b.errors.push('drawio edge 仅靠 orthogonalEdgeStyle 自动路由');
  }
  /* §7 契约②（v3）逐边同源断言：**回读**写盘的分数与偏移，重算绝对坐标，必须与 SVG 折线的
     首点/末点逐点相等（出端偏移恒 0；入端偏移单轴且为 0 或 ±ARROW_OUTSET）。
     为什么必须回读而不是只比"同一变量"：分叉/总线/通道边实测偏差最大 240px（见 drawioAnchorOf
     的记录），只有把浮点对回 SVG 折线才能证明两个交付物描的是同一条线。 */
  for (let i = 0; i < b.paths.length && i < edgeCells.length; i++) {
    const P = b.paths[i], e = P.e;
    const A = drawioAnchorOf(P);
    const sb = P.e.srcBox, tb = P.e.dstBox;
    const sdx = A.sdx, sdy = A.sdy, tdx = A.tdx, tdy = A.tdy;
    if (sdx !== 0 || sdy !== 0) b.errors.push(`drawio 契约② 出端偏移应为 0，实测 (${sdx},${sdy})：边 ${e.from}->${e.to}`);
    if ((tdx !== 0 && tdy !== 0) || ![tdx, tdy].every((v) => v === 0 || Math.abs(v) === ARROW_OUTSET)) {
      b.errors.push(`drawio 契约② 入端偏移必须单轴且为 0 或 ±${ARROW_OUTSET}，实测 (${tdx},${tdy})：边 ${e.from}->${e.to}`);
    }
    const rtS = { x: sb.x + A.ex * sb.w + sdx, y: sb.y + A.ey * sb.h + sdy };
    const rtT = { x: tb.x + A.nx * tb.w + tdx, y: tb.y + A.ny * tb.h + tdy };
    const q = P.pts[P.pts.length - 1];
    const eps = 0.05;   /* norm01 把分数四舍五入到 1e-4，折回坐标的量化误差上限 ≈ 0.5*max(w,h)*1e-4 */
    if (Math.abs(rtS.x - P.pts[0].x) > eps || Math.abs(rtS.y - P.pts[0].y) > eps) {
      b.errors.push(`drawio 契约② 回读首点 (${rtS.x.toFixed(2)},${rtS.y.toFixed(2)}) != SVG 折线首点 (${P.pts[0].x.toFixed(2)},${P.pts[0].y.toFixed(2)})：边 ${e.from}->${e.to}`);
    }
    if (Math.abs(rtT.x - q.x) > eps || Math.abs(rtT.y - q.y) > eps) {
      b.errors.push(`drawio 契约② 回读末点 (${rtT.x.toFixed(2)},${rtT.y.toFixed(2)}) != SVG 箭头尖端 (${q.x.toFixed(2)},${q.y.toFixed(2)})：边 ${e.from}->${e.to}`);
    }
    if (!edgeCells[i].includes(`entryDx=${tdx};entryDy=${tdy};`)) {
      b.errors.push(`drawio 契约② 入端偏移未按同源值写盘（应为 entryDx=${tdx};entryDy=${tdy}）：边 ${e.from}->${e.to}`);
    }
  }
  const folded = b.paths.filter((p) => p.pts.length > 2).length;
  const pointArrays = (dw.match(/<Array as="points">/g) || []).length;
  if (pointArrays !== folded) b.errors.push(`drawio 分支拐点 ${pointArrays} != 折线边数 ${folded}`);

  fs.writeFileSync(path.join(dir, fig.file + '.svg'), svg, 'utf8');
  fs.writeFileSync(path.join(dir, fig.file + '.drawio'), dw, 'utf8');
  fs.writeFileSync(path.join(dir, fig.file + '.layout.json'), toLayoutJSON(b), 'utf8');
  const maxFold = Math.max(...b.paths.map((p) => p.pts.length - 2));
  /* noThinking（本轮新增）：spec 级 `noThinking: true` 或 CLI `--no-thinking` 时，
     本图不产出 绘图路线.md；因 Z-2 是**按目录**合并且带"未参与图原样结转"，
     只有该目录在本轮**完全没有**参与图进入缓冲时，整目录才不会落这个文件。
     （若同目录里既有 noThinking 图、又有普通图，则照旧为普通图写该文件。） */
  const noThink = !!(fig.noThinking || process.argv.includes('--no-thinking'));
  if (SET === 'ref' && !ONLY && !noThink) {
    /* Z-2：不再直接落盘（那样同目录多图会互相覆盖），先按目录缓冲成"一图一节"。
       本节正文 = 该图单独生成时的 toThinking 全文，仅去掉原 `# 绘图路线 —— 图题` 首行
       （由节标题取代）并把标题层整体降一级（## → ###）以便挂在本图节之下；其余一字不改。 */
    const mdLines = toThinking(fig, b, maxFold, pointArrays).replace(/\s+$/, '').split('\n');
    mdLines.shift();
    while (mdLines.length && mdLines[0].trim() === '') mdLines.shift();
    const body = mdLines.join('\n').replace(/^(#{2,5}) /gm, '#$1 ');
    if (!thinkingByDir.has(dir)) thinkingByDir.set(dir, new Map());
    thinkingByDir.get(dir).set(fig.file, { file: fig.file, title: fig.title, body });
  }
  const status = b.errors.length ? 'FAIL' : 'OK  ';
  if (b.errors.length) failed++;
  rows.push({ fig, b, maxFold, status });
  /* P1-④：把本图断言结果转成 {code,severity,subject,message,fix} 诊断条目（与 drawio-skill
     validate.py 同构），供文末 --score 汇总。error = b.errors（任一即 fail）；warning = b.notes。 */
  for (const e of b.errors) diagEntries.push(mkDiag(fig.file, e, 'error'));
  for (const n of b.notes) diagEntries.push(mkDiag(fig.file, n, 'warning'));
  if (SUMMARY) {
    /* P1-②：一行/图。形如 [OK] 图11-… | 单元 8/9 箭头 7/12 | 画布 860x912。
       失败图在行尾补错误条数；逐条 ✗/· 明细交给 --score 的诊断条目，本模式不再展开。 */
    const tag = b.errors.length ? 'FAIL' : 'OK';
    console.log(`[${tag}] ${fig.file} | 单元 ${b.visualUnits}/9 箭头 ${fig.edges.length}/12 | 画布 ${b.W}x${b.H}${b.errors.length ? ` | 错误 ${b.errors.length} 条` : ''}`);
  } else if (!SCORE) {
    console.log(`[${status}] ${fig.category}/${fig.file} | 轴 ${b.axis} 视觉单元 ${b.visualUnits}/9（节点 ${fig.nodes.length}·容器 ${(fig.containers || []).length}） 箭头 ${fig.edges.length}/12 焦点 ${b.focusCount}/2 折弯max ${maxFold} | 画布 ${b.W}x${b.H} | drawio锚点 ${edgeCells.length} 拐点 ${pointArrays}`);
    for (const e of b.errors) console.log(`         ✗ ${e}`);
    for (const n of b.notes) console.log(`         · ${n}`);
  }
}

/* Z-2：全量 --set=ref 构建结束后，逐目录写**一份多节** 绘图路线.md（每图一节 + 未参与图的原样结转）。 */
if (SET === 'ref') {
  if (ONLY) {
    console.log(`[NOTE] Z-2：--only=${ONLY} 是局部构建，绘图路线.md 需由全量 --set=ref 生成；本轮不写，避免用局部集合覆盖本目录的完整记录。`);
  } else {
    for (const [dir, m] of thinkingByDir) {
      const list = [...m.values()];
      const carried = carryThinkingSections(dir, new Set(list.map((x) => x.file)));
      const all = list.concat(carried);
      fs.writeFileSync(path.join(dir, '绘图路线.md'), mergeThinking(dir, all), 'utf8');
      console.log(`[TH] 绘图路线.md ← ${path.basename(dir)}：本轮 ${list.length} 节 + 结转 ${carried.length} 节 = ${all.length} 节`);
    }
  }
}

if (SET !== 'ref') {
  const byCat = new Map();
  for (const r of rows) { if (!byCat.has(r.fig.category)) byCat.set(r.fig.category, []); byCat.get(r.fig.category).push(r); }
  const idx = ['# 结果图目录（scientific-diagram-v41 生成）', '',
    '> 全部图为确定性矢量绘制，非图像生成模型产物；内容逐节点取自 `流程图/case0X-*.md` 正文。',
    '> 排版遵循 skill §10.0 默认竖向 TB（layer→y、col→x，主流程箭头垂直向下）。', ''];
  for (const [cat, list] of byCat) {
    idx.push(`## ${cat}`, '', '| 图 | 轴 | 节点 | 箭头 | 画布 | 一句话主线 | 源文件 |', '|---|---|---|---|---|---|---|');
    for (const r of list) idx.push(`| \`${r.fig.file}.svg\` / \`.drawio\` / \`.png\` | ${r.b.axis} | ${r.fig.nodes.length} | ${r.fig.edges.length} | ${r.b.W}×${r.b.H} | ${r.fig.mainline} | \`${r.fig.source}\` |`);
    idx.push('');
  }
  fs.writeFileSync(path.join(OUT, '00-图目录.md'), idx.join('\n'), 'utf8');
}

console.log('');
/* ===== P1-④ --score：把上面收集的断言结果汇总成一个分数 + 一行判词 =====
   打分口径（确定性、可复跑、无随机）：score = max(0, 100 − 8×error 数 − min(20, warning 数))。
   为什么 warning 罚分封顶 20：本图集 warning 大量是"边跨 N 个可视化槽位"这类**信息性 NOTE**
   （case 集实测 61 条），不封顶会把满分压到 39，产生"SCORE 39/100 却 VERDICT pass"的
   自相矛盾读数（首次实测即如此）。封顶后分数与判词同向：无 error 至少 80 分。
   判词：有 error 即 fail；--strict 时 warning 也 fail。判词 fail ⇒ 退出码非零。
   三处同源：分数、判词、退出码都只读 diagEntries，不另算一套。 */
let scoreFailed = false;
if (SCORE) {
  const nErr = diagEntries.filter((d) => d.severity === 'error').length;
  const nWarn = diagEntries.filter((d) => d.severity === 'warning').length;
  const scoreVal = Math.max(0, 100 - 8 * nErr - Math.min(20, nWarn));
  scoreFailed = nErr > 0 || (STRICT && nWarn > 0);
  console.log(`DIAGNOSTICS ${diagEntries.length} 条（error ${nErr} · warning ${nWarn}${STRICT ? ' · --strict 生效' : ''}）`);
  for (const d of diagEntries) console.log(JSON.stringify(d));
  console.log('');
  console.log(`SCORE ${scoreVal}/100 VERDICT ${scoreFailed ? 'fail' : 'pass'}`);
  console.log('');
}
/* F-D：--set=ref 的输出目录不是 OUT，而是各 fig.outDir（参照物/ 下 N 个目录）；case 仍是 结果/。
   N = 真实写入的不同目录数（本图集 11 张图落在 参照物/ 下 7 个目录：6 个 2021_E* + 1 个 2021_A*）。 */
const refBase = [...outDirSet].length ? path.basename(path.dirname([...outDirSet][0])) : '参照物';
const outMsg = SET === 'ref'
  ? `写入各 fig.outDir（${refBase}/ 下 ${outDirSet.size} 个目录）`
  : OUT;
/* P1-②：--summary / --score 是压缩态，末尾只给"合计 N 张图，失败 M 张"（不带输出目录）；
   默认路径逐字节保持原样（含"; 输出目录 …"）。 */
if (SUMMARY || SCORE) console.log(`合计 ${total} 张图，失败 ${failed} 张`);
else console.log(`合计 ${total} 张图，失败 ${failed} 张；输出目录 ${outMsg}`);
/* 默认路径 scoreFailed 恒为 false ⇒ `failed ? 1 : 0`，与改动前一致；--score --strict 下
   "仅 warning"也会非零，这是 --strict 的定义而非默认行为的变化。 */
process.exit(failed || scoreFailed ? 1 : 0);
