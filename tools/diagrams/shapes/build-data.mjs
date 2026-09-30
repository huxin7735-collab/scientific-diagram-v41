#!/usr/bin/env node
/**
 * build-data.mjs — 生成本目录的静态数据 shape-index.json / icons.json。
 *
 * 数据源（只读，不修改参考仓库任何文件）：
 *   Agents365-ai/drawio-skill（MIT，skill 版本 3.4.0 / 2026-09-14）
 *     skills/drawio-skill/data/shape-index.json.gz   ← jgraph/drawio-mcp 官方形状检索索引（Apache-2.0），10446 条
 *     skills/drawio-skill/data/lobe-icons.json       ← lobehub/lobe-icons 静态 SVG 清单（MIT），871 slug
 *     skills/drawio-skill/data/databricks-icons.json ← oieduardorabelo/databricks-architecture-icons 清单（71 product）
 *   补充源（上游 aiicons.py 的同一兜底源，CC0）：
 *     https://cdn.simpleicons.org/<slug>             ← simple-icons，用于 lobe 缺失的数据库/基础设施/科研工具品牌
 *
 * 用法：
 *   node tools/diagrams/shapes/build-data.mjs [--ref-dir <参考仓库 data 目录>] [--offline]
 *
 * 说明：本脚本是"数据可复现"的维护工具，正常运行不需要它——shape-index.json / icons.json
 * 已提交且可离线使用；shape-lookup.mjs 只读这两个 JSON。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REF = 'D:\\xiazhai\\合成skill-准备\\技能参考库\\所有的skill\\Agents365-ai__drawio-skill\\skills\\drawio-skill\\data';
const argv = process.argv.slice(2);
const getFlag = (name, def) => {
  const i = argv.indexOf(name);
  return i === -1 ? def : argv[i + 1];
};
const REF = getFlag('--ref-dir', DEFAULT_REF);
const OFFLINE = argv.includes('--offline');

const SHAPE_CAP = 200 * 1024;   // 200KB 上限（需求）
const ICON_CAP = 150 * 1024;    // 150KB 上限（需求）
const SHAPE_TARGET = 196 * 1024;
const ICON_TARGET = 146 * 1024;

const UPSTREAM = {
  repo: 'https://github.com/Agents365-ai/drawio-skill',
  skillVersion: '3.4.0',
  skillVersionDate: '2026-09-14',
  license: 'MIT',
};
const FETCHED_AT = new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────── shape-index ──

const CAT_DEFAULT_ALIASES = {
  terminator: ['起止', '起止框', '流程', '流程图', 'terminator', 'start', 'end', 'begin', 'finish'],
  process: ['流程', '流程图', '流程步骤', '处理', '步骤', '工序', 'process', 'task', 'step'],
  decision: ['判定', '判断', '条件', '分支', '决策', 'decision', 'condition', 'branch', 'if'],
  data: ['数据', '输入', '输出', '输入输出', '数据流', 'io', 'data', 'input', 'output'],
  document: ['文档', '文件', '报告', 'document', 'file', 'report'],
  manual: ['手工操作', '手工', '人工', '手工输入', 'manual', 'manual input', 'manual operation'],
  preparation: ['准备', '初始化', '预处理', 'preparation', 'init', 'prepare'],
  connector: ['连接点', '连接符', '汇聚', '连接', 'connector', 'junction'],
  storage: ['存储', '数据存储', '数据库', '磁盘', 'storage', 'store', 'database', 'disk'],
  annotation: ['注释', '便签', '批注', '备注', '说明', 'note', 'comment', 'annotation', 'sticky'],
  basic: ['基本形状', '基础图形', 'basic'],
  capsule: ['流程', '起止', 'stadium', 'capsule', '胶囊'],
};

/** mermaid flowchart 语法 → 本文件中的形状 name（生成时校验目标存在）。 */
const MERMAID_MAP = {
  'id[text]': 'Rectangle',
  'id(text)': 'Rounded Rectangle',
  'id([text])': 'Stadium (mermaid 胶囊)',
  'id[[text]]': 'Predefined Process',
  'id[(text)]': 'Cylinder (数据库)',
  'id((text))': 'Circle',
  'id(((text)))': 'Double Circle',
  'id{text}': 'Diamond',
  'id{{text}}': 'Hexagon',
  'id[/text/]': 'Data (平行四边形)',
  'id[\\text\\]': 'Data (平行四边形)',
  'id[/text\\]': 'Trapezoid',
  'id[\\text/]': 'Trapezoid',
  'id>text]': null, // draw.io 无官方"旗帜/非对称"形状，README 已说明
  '-->': 'Directional Connector',
  '---': 'Line',
  '-.->': 'Dashed Line',
  '==>': 'Arrow',
};
/** 附加到形状 aliases 的 mermaid 记号，让人能直接搜 "[(" 这类写法。 */
const MERMAID_ALIASES = {
  'Rectangle': ['mermaid:[ ]'],
  'Rounded Rectangle': ['mermaid:( )'],
  'Stadium (mermaid 胶囊)': ['mermaid:([ ])'],
  'Predefined Process': ['mermaid:[[ ]]'],
  'Cylinder (数据库)': ['mermaid:[( )]'],
  'Circle': ['mermaid:(( ))'],
  'Double Circle': ['mermaid:((( )))'],
  'Diamond': ['mermaid:{ }'],
  'Hexagon': ['mermaid:{{ }}'],
  'Data (平行四边形)': ['mermaid:[/ /]'],
  'Trapezoid': ['mermaid:[/ \\]'],
};

/**
 * 形状白名单规则。t=官方 title；st=style 必须包含的子串（用于从同名条目里锁定正确库，
 * 例如 Database 有 15 条同名，只有 shape=mxgraph.flowchart.database 是流程图库的）；
 * n=输出 name（默认用 title）；cat=category；al=额外别名。
 */
const VERTEX_RULES = [
  // —— 起止 / 终止符 ——
  { t: 'Terminator', st: 'mxgraph.flowchart.terminator', cat: 'terminator', al: ['终止符', '开始结束', '椭圆起止', 'stadium', 'pill'] },
  { t: 'Start', st: 'mxgraph.flowchart.start_1', n: 'Start (oval)', cat: 'terminator', al: ['开始', '起点', '椭圆'] },
  { t: 'Start', st: 'mxgraph.flowchart.start_2', n: 'Start (rounded)', cat: 'terminator', al: ['开始', '起点', '圆角'] },
  { t: 'Rounded Rectangle', st: 'rounded=1;whiteSpace=wrap;html=1;', cat: 'basic', al: ['圆角矩形', 'stadium', 'pill', '起止', '开始结束'] },
  { t: 'Rounded Rectangle', st: 'rounded=1;whiteSpace=wrap;html=1;', n: 'Stadium (mermaid 胶囊)', cat: 'capsule', al: ['胶囊', '两端半圆', 'mermaid 起止'], styleOverride: 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;', derived: true },

  // —— 流程 ——
  { t: 'Process', st: 'shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;', cat: 'process', al: ['处理框', '矩形流程'] },
  { t: 'Rectangle', st: 'rounded=0;whiteSpace=wrap;html=1;', cat: 'process', al: ['矩形', '方框', 'rect', 'box'] },
  { t: 'Predefined Process', st: 'shape=process;whiteSpace=wrap;rounded=1', cat: 'process', al: ['子流程', '子过程', '预定义流程', 'subprocess', 'sub-process', 'predefined'] },
  { t: 'Sub-Process, Collapsed', st: 'mxgraph.bpmn.task2', n: 'Sub-Process (Collapsed)', cat: 'process', al: ['子流程', '折叠子流程', 'subprocess'] },
  { t: 'Step', st: 'shape=step;perimeter=stepPerimeter', cat: 'process', al: ['阶梯', 'step'] },
  { t: 'Trapezoid', st: 'shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;fixedSize=1;', cat: 'process', al: ['梯形'] },
  { t: 'Hexagon', st: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;', cat: 'process', al: ['六边形', 'hexagon'] },

  // —— 判定（菱形）——
  { t: 'Diamond', st: 'rhombus;whiteSpace=wrap;html=1;', cat: 'decision', al: ['菱形', '判定框', 'rhombus', 'diamond'] },
  { t: 'Decision', st: 'mxgraph.flowchart.decision', n: 'Decision (flowchart 库)', cat: 'decision', al: ['菱形', '判断框'] },

  // —— 数据 / 输入输出 ——
  { t: 'Data', st: 'shape=parallelogram;html=1;strokeWidth=2', n: 'Data (平行四边形)', cat: 'data', al: ['平行四边形', 'parallelogram', '数据框'] },
  { t: 'Direct Data', st: 'mxgraph.flowchart.direct_data', cat: 'data', al: ['直接数据'] },
  { t: 'Sequential Data', st: 'mxgraph.flowchart.sequential_data', cat: 'data', al: ['顺序数据'] },
  { t: 'Stored Data', st: 'mxgraph.flowchart.stored_data', cat: 'data', al: ['存储数据'] },

  // —— 文档 ——
  { t: 'Document', st: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;', cat: 'document', al: ['单文档', '波形底边'] },
  { t: 'Document', st: 'mxgraph.flowchart.document2', n: 'Document (flowchart 库)', cat: 'document', al: ['文档框'] },
  { t: 'Multi-Document', st: 'mxgraph.flowchart.multi-document', cat: 'document', al: ['多文档', '文档堆'] },

  // —— 手工操作 ——
  { t: 'Manual Input', st: 'shape=manualInput;boundedLbl=1;whiteSpace=wrap;html=1;', cat: 'manual', al: ['手工输入', '顶边斜'] },
  { t: 'Manual Operation', st: 'shape=trapezoid;perimeter=trapezoidPerimeter', cat: 'manual', al: ['手工处理', '倒梯形'] },

  // —— 准备 ——
  { t: 'Preparation', st: 'shape=hexagon;perimeter=hexagonPerimeter2;arcSize=6', cat: 'preparation', al: ['准备框', '六边形准备'] },

  // —— 连接点 / 汇聚 ——
  { t: 'On-Page Reference', st: 'mxgraph.flowchart.on-page_reference', cat: 'connector', al: ['页内引用', '同页连接点', 'on-page'] },
  { t: 'Off-Page Reference', st: 'shape=offPageConnector;rounded=0;size=0.5;', cat: 'connector', al: ['跨页引用', '跨页连接点', 'off-page'] },
  { t: 'Summing Junction', st: 'mxgraph.flowchart.or;', cat: 'connector', al: ['汇合点', '求和点', '圆加十字', 'summing'] },
  { t: 'Or', st: 'mxgraph.flowchart.summing_function', n: 'Or (流程汇合)', cat: 'connector', al: ['或', '逻辑或汇合'] },
  { t: 'Or', st: 'shape=xor;whiteSpace=wrap;html=1;', n: 'XOR (逻辑异或)', cat: 'connector', al: ['异或', 'xor'] },
  { t: 'Merge or Storage', st: 'mxgraph.flowchart.merge_or_storage', cat: 'connector', al: ['合并或存储', '倒三角'] },
  { t: 'Collate', st: 'shape=collate;whiteSpace=wrap;html=1;', cat: 'connector', al: ['整理', '排序汇聚', 'collate'] },
  { t: 'Sort', st: 'shape=sortShape', cat: 'connector', al: ['排序', 'sort'] },
  { t: 'Extract or Measurement', st: 'mxgraph.flowchart.extract_or_measurement', cat: 'connector', al: ['提取或测量', '三角形底'] },
  { t: 'Delay', st: 'shape=delay;whiteSpace=wrap;html=1;', cat: 'connector', al: ['延时', '等待', 'delay', 'wait'] },
  { t: 'Display', st: 'shape=display;whiteSpace=wrap;html=1;', cat: 'connector', al: ['显示', '展示', 'display', 'screen'] },
  { t: 'Loop Limit', st: 'shape=loopLimit;whiteSpace=wrap;html=1;', cat: 'connector', al: ['循环上限', '循环边界', 'loop limit'] },
  { t: 'Parallel Mode', st: 'mxgraph.flowchart.parallel_mode', cat: 'connector', al: ['并行', '并行模式', 'parallel'] },
  { t: 'Cross', st: 'shape=cross;whiteSpace=wrap;html=1;', cat: 'connector', al: ['十字', 'cross'] },

  // —— 存储 / 数据库 ——
  { t: 'Database', st: 'mxgraph.flowchart.database', n: 'Database (flowchart 库)', cat: 'storage', al: ['数据库', 'db', 'sql'] },
  { t: 'Cylinder', st: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;', n: 'Cylinder (数据库)', cat: 'storage', al: ['圆柱', 'cylinder', '数据库', 'db'] },
  { t: 'Cylinder Stack', st: 'shape=cylinder3;', cat: 'storage', al: ['圆柱堆叠', '多库'] },
  { t: 'Data Store', st: 'shape=datastore;whiteSpace=wrap;html=1;', cat: 'storage', al: ['数据存储', '数据仓库', 'datastore'] },
  { t: 'Internal Storage', st: 'shape=internalStorage;whiteSpace=wrap;html=1;backgroundOutline=1;', cat: 'storage', al: ['内部存储', '内存'] },
  { t: 'Tape', st: 'shape=tape;whiteSpace=wrap;html=1;', cat: 'storage', al: ['磁带', '顺序存储', 'tape'] },
  { t: 'Cube', st: 'shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;', cat: 'storage', al: ['立方体', '数据立方', 'cube', 'olap'] },

  // —— 注释 / 便签 ——
  { t: 'Note', st: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;', cat: 'annotation', al: ['便签', '折角便签', 'note'] },
  { t: 'Note', st: 'shape=note;strokeWidth=2;fontSize=14;size=20', n: 'Note (sticky 便签)', cat: 'annotation', al: ['便签纸', '黄色便签', 'sticky'] },
  { t: 'Callout', st: 'shape=callout;whiteSpace=wrap;html=1;perimeter=calloutPerimeter;', cat: 'annotation', al: ['标注框', '气泡', 'callout', 'speech'] },
  { t: 'Cloud Callout', st: 'mxgraph.basic.cloud_callout', cat: 'annotation', al: ['云标注', '云形批注'] },
  { t: 'Annotation', st: 'mxgraph.flowchart.annotation_1', n: 'Annotation (左对齐线条)', cat: 'annotation', al: ['批注线', '引线注释'] },
  { t: 'Annotation', st: 'mxgraph.flowchart.annotation_2', n: 'Annotation (右标签线条)', cat: 'annotation', al: ['批注线'] },

  // —— 基本形状（技术路线图常用底盘）——
  { t: 'Ellipse', st: 'ellipse;whiteSpace=wrap;html=1;', cat: 'basic', al: ['椭圆', 'oval'] },
  { t: 'Circle', st: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;', cat: 'basic', al: ['圆', '圆形', '连接点'] },
  { t: 'Double Circle', st: 'shape=doubleEllipse', cat: 'basic', al: ['双圆', '同心圆', '终态'] },
  { t: 'Text', st: 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;', cat: 'basic', al: ['文本', '标签', 'label', 'text'] },
  { t: 'Card', st: 'shape=card;whiteSpace=wrap;html=1;', cat: 'basic', al: ['卡片', 'card'] },
  { t: 'Cloud', st: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;', cat: 'basic', al: ['云', 'cloud'] },
  { t: 'Actor', st: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;', cat: 'basic', al: ['角色', '用户', '研究者', 'actor', 'user'] },
  { t: 'Module', st: 'shape=module;align=left', cat: 'basic', al: ['模块', 'module'] },
  { t: 'Package', st: 'shape=folder;fontStyle=1;spacingTop=10', n: 'Folder / Package', cat: 'basic', al: ['文件夹', '包', '目录', 'folder'] },
];

/** 连线白名单：title 精确匹配 + style 不含 mxgraph.（排除 UML/BPMN/网络领域库的同名连线）。 */
const EDGE_TITLES = [
  'Arrow', 'Bidirectional Arrow', 'Line', 'Dashed Line', 'Dotted Line', 'Bidirectional Connector',
  'Directional Connector', 'Link', 'Manual Line', 'Filled Edge', 'Horizontal Elbow', 'Vertical Elbow',
  'Control Flow', 'Dependency', 'Generalization', 'Association', 'Sequence Flow',
  'Conditional Sequence Flow', 'Default Sequence Flow', 'Message Flow', 'Data Flow', 'Bidirectional Data Flow',
];
const EDGE_ALIASES = {
  'Arrow': ['箭头', '实心箭头', '流向', 'arrow', 'flow'],
  'Bidirectional Arrow': ['双向箭头', '双向', 'bidirectional'],
  'Line': ['直线', '无箭头线', 'line', 'plain'],
  'Dashed Line': ['虚线', 'dashed'],
  'Dotted Line': ['点线', 'dotted'],
  'Bidirectional Connector': ['双向连接线'],
  'Directional Connector': ['单向连接线', '有向边', 'directed'],
  'Link': ['链接', '关联线', 'link'],
  'Manual Line': ['手工线', '折线'],
  'Filled Edge': ['粗实边', '带状边'],
  'Horizontal Elbow': ['水平肘线', '横向直角折线', 'elbow'],
  'Vertical Elbow': ['垂直肘线', '纵向直角折线'],
  'Control Flow': ['控制流', 'control flow'],
  'Dependency': ['依赖', 'dependency', 'dashed open'],
  'Generalization': ['泛化', '继承', 'generalization'],
  'Association': ['关联', 'association'],
  'Sequence Flow': ['顺序流', 'sequence flow'],
  'Conditional Sequence Flow': ['条件顺序流'],
  'Default Sequence Flow': ['默认顺序流'],
  'Message Flow': ['消息流', 'message flow'],
  'Data Flow': ['数据流', 'data flow'],
  'Bidirectional Data Flow': ['双向数据流'],
};

function camelName(title) {
  const parts = String(title).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/);
  if (!parts[0]) return 'shape';
  return parts[0].toLowerCase() + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}
const uniq = (a) => [...new Set(a.filter(Boolean))];
const inferSource = (style, derived) =>
  derived ? 'derived' : (String(style).match(/mxgraph\.([a-z0-9_]+)\./i)?.[1] ? `mxgraph.${String(style).match(/mxgraph\.([a-z0-9_]+)\./i)[1]}` : 'core');

function buildShapes() {
  const gz = fs.readFileSync(path.join(REF, 'shape-index.json.gz'));
  const raw = zlib.gunzipSync(gz).toString('utf8');
  const all = JSON.parse(raw);
  const warn = [];
  const byStyle = new Map();
  const entries = [];

  const shorter = (a, b) => (String(a.style).length <= String(b.style).length ? a : b);
  for (const r of VERTEX_RULES) {
    const hit = all.filter((e) => e.title === r.t && e.type === 'vertex' && (!r.st || e.style.includes(r.st)));
    if (!hit.length) { warn.push(`rule miss: "${r.t}" ⊄ "${r.st || ''}"`); continue; }
    const pick = hit.reduce(shorter);
    const name = r.n || r.t;
    const style = r.styleOverride || pick.style;
    const key = `${name}\u0000${style}`;
    if (byStyle.has(key)) continue;
    const entry = {
      name,
      nameU: camelName(name),
      style,
      w: pick.w,
      h: pick.h,
      type: 'vertex',
      aliases: uniq([...(CAT_DEFAULT_ALIASES[r.cat] || []), ...(r.al || []), ...(MERMAID_ALIASES[name] || []), name, pick.title]),
      category: r.cat,
      source: inferSource(style, r.derived),
    };
    byStyle.set(key, true);
    entries.push(entry);
  }

  // 连线：同名取最短 style，且必须来自通用库
  for (const t of EDGE_TITLES) {
    const hit = all.filter((e) => e.type === 'edge' && e.title === t && !e.style.includes('mxgraph.'));
    if (!hit.length) { warn.push(`edge miss: "${t}"`); continue; }
    const pick = hit.reduce(shorter);
    entries.push({
      name: t,
      nameU: camelName(t),
      style: pick.style,
      w: pick.w,
      h: pick.h,
      type: 'edge',
      aliases: uniq([...(EDGE_ALIASES[t] || []), ...(CAT_DEFAULT_ALIASES.connector || []), t]),
      category: 'connector',
      source: inferSource(pick.style, false),
    });
  }

  // nameU 去重
  const seen = new Map();
  for (const e of entries) {
    const n = seen.get(e.nameU) || 0;
    seen.set(e.nameU, n + 1);
    if (n) e.nameU = `${e.nameU}${n + 1}`;
  }

  const byCat = {};
  for (const e of entries) byCat[e.category] = (byCat[e.category] || 0) + 1;

  const mermaidChecked = {};
  for (const [k, v] of Object.entries(MERMAID_MAP)) {
    if (v === null) { mermaidChecked[k] = '(无官方等价形状)'; continue; }
    if (!entries.some((e) => e.name === v)) { warn.push(`mermaid map target missing: ${k} -> ${v}`); continue; }
    mermaidChecked[k] = v;
  }

  const meta = {
    _note: '本文件是本仓自用的 draw.io 形状子集索引，由 build-data.mjs 生成；不是官方索引的完整副本。',
    purpose: '科研流程图 / 技术路线图的形状检索：按关键字与中文别名查官方 drawio style 串。',
    generatedBy: 'tools/diagrams/shapes/build-data.mjs',
    fetchedAt: FETCHED_AT,
    upstream: {
      ...UPSTREAM,
      dataFile: 'skills/drawio-skill/data/shape-index.json.gz',
      dataFileOrigin: 'jgraph/drawio-mcp shape-search/search-index.json（由 draw.io 官方形状库生成）',
      dataFileLicense: 'Apache-2.0',
      totalShapes: all.length,
      notice: 'skills/drawio-skill/data/SHAPE-INDEX-NOTICE.md',
    },
    pruningCriteria: [
      '只保留"科研流程图 / 技术路线图"会真正落笔的形状族：起止、流程、判定、子流程、数据/输入输出、文档、手工操作、准备、连接点与汇聚、存储/数据库、注释/便签、基本底盘形状、通用连线。',
      '整族剔除领域专用库：AWS / Azure / GCP / 阿里云 / Cisco / Citrix / Office / Veeam / GCP2 / archimate / mockup / 电气 / P&ID / 网络设备 / iOS 图标 / sysml / salesforce / sitemap 等（命中率极低且 style 串极长）。',
      `同名多库条目按 style 最短者取一条，规避误选（例如 "Database" 全库 15 条同名，仅 shape=mxgraph.flowchart.database 属流程图库）；连线额外要求 style 不含 "mxgraph."，以排除 UML/BPMN/网络库的同名连线。`,
      `体积门限 ${SHAPE_CAP / 1024}KB；实测远低于门限，因此无需按命中率进一步裁剪（见 _meta.counts）。`,
    ],
    fieldNotes: {
      name: '官方 title（个别同名条目加括号后缀以消歧）',
      nameU: '由 name 派生的驼峰唯一标识（上游索引无此字段，供脚本引用）',
      style: '可直接粘进 draw.io 单元格 style 的官方串；derived=true 的条目为本仓按 mermaid 语法补齐的派生 style',
      aliases: '英文 tag + 中文别名 + mermaid 记号，shape-lookup.mjs 的检索依据',
      category: Object.keys(byCat).sort().join(' / '),
      source: 'core = draw.io 核心形状；mxgraph.<lib> = 对应官方形状库；derived = 本仓派生',
    },
    mermaidFlowchartMap: mermaidChecked,
    counts: { total: entries.length, vertices: entries.filter((e) => e.type === 'vertex').length, edges: entries.filter((e) => e.type === 'edge').length, byCategory: byCat },
  };

  return { data: { _meta: meta, shapes: entries }, warn, total: all.length };
}

// ──────────────────────────────────────────────────────────────── icons ──

const LOBE_STYLE = 'shape=image;html=1;imageAspect=0;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;image=';
const DBX_STYLE = LOBE_STYLE;

/** 图标候选表：[slug, title, aliases[], category, source]（按优先级排列，越靠前越先占预算）。 */
const ICON_CANDIDATES = [
  // AI / LLM（lobe-icons，MIT）
  ['openai', 'OpenAI', ['chatgpt', 'gpt', 'openai', 'GPT'], 'ai', 'lobe'],
  ['claude-color', 'Claude', ['anthropic', 'claude', 'claude code'], 'ai', 'lobe'],
  ['gemini-color', 'Gemini', ['google gemini', 'bard', '双子星'], 'ai', 'lobe'],
  ['deepseek-color', 'DeepSeek', ['deepseek', '深度求索'], 'ai', 'lobe'],
  ['qwen-color', 'Qwen', ['通义千问', 'qwen', 'tongyi'], 'ai', 'lobe'],
  ['mistral-color', 'Mistral', ['mistral ai', 'mixtral'], 'ai', 'lobe'],
  ['meta-color', 'Meta', ['llama', 'meta ai'], 'ai', 'lobe'],
  ['huggingface-color', 'Hugging Face', ['hf', 'huggingface', 'transformers'], 'ai', 'lobe'],
  ['ollama', 'Ollama', ['ollama', '本地大模型'], 'ai', 'lobe'],
  ['langchain-color', 'LangChain', ['langchain', 'langgraph'], 'ai', 'lobe'],
  ['llamaindex', 'LlamaIndex', ['llamaindex', 'gpt index'], 'ai', 'lobe'],
  ['nvidia-color', 'NVIDIA', ['nvidia', 'cuda', '英伟达'], 'ai', 'lobe'],
  ['azureai-color', 'Azure AI', ['azure ai', 'azure openai'], 'ai', 'lobe'],
  ['vertexai-color', 'Vertex AI', ['vertex ai', 'google vertex'], 'ai', 'lobe'],
  ['bedrock', 'Amazon Bedrock', ['bedrock', 'aws bedrock'], 'ai', 'lobe'],
  ['baidu-color', 'Baidu', ['baidu', '文心一言', 'ernie', '百度'], 'ai', 'lobe'],
  ['zhipu-color', 'Zhipu', ['zhipu', 'glm', '智谱', 'chatglm'], 'ai', 'lobe'],
  ['moonshot', 'Moonshot', ['moonshot', 'kimi', '月之暗面'], 'ai', 'lobe'],
  ['minimax-color', 'MiniMax', ['minimax', 'abab'], 'ai', 'lobe'],
  ['bytedance-color', 'ByteDance', ['bytedance', 'doubao', '豆包', '字节'], 'ai', 'lobe'],
  ['perplexity-color', 'Perplexity', ['perplexity', 'pplx'], 'ai', 'lobe'],
  ['cohere-color', 'Cohere', ['cohere', 'command r'], 'ai', 'lobe'],
  ['groq', 'Groq', ['groq', 'lpU'], 'ai', 'lobe'],
  ['together-color', 'Together AI', ['together', 'together ai'], 'ai', 'lobe'],
  ['replicate', 'Replicate', ['replicate'], 'ai', 'lobe'],
  ['stability', 'Stability AI', ['stability', 'stable diffusion', 'sd'], 'ai', 'lobe'],
  ['gradio', 'Gradio', ['gradio', 'demo ui'], 'ai', 'lobe'],
  ['tensorflow', 'TensorFlow', ['tensorflow', 'tf', 'keras'], 'ai', 'simpleicons'],
  ['pytorch', 'PyTorch', ['pytorch', 'torch'], 'ai', 'simpleicons'],
  ['huggingface', 'Hugging Face (mono)', ['huggingface mono'], 'ai', 'simpleicons'],

  // 云 / 平台（lobe + simple-icons）
  ['aws-color', 'AWS', ['aws', 'amazon web services', '亚马逊云'], 'cloud', 'lobe'],
  ['azure-color', 'Microsoft Azure', ['azure', 'microsoft cloud', '微软云'], 'cloud', 'lobe'],
  ['googlecloud-color', 'Google Cloud', ['gcp', 'google cloud', '谷歌云'], 'cloud', 'lobe'],
  ['alibabacloud-color', 'Alibaba Cloud', ['aliyun', '阿里云', 'alibabacloud'], 'cloud', 'lobe'],
  ['cloudflare-color', 'Cloudflare', ['cloudflare', 'cf'], 'cloud', 'lobe'],
  ['docker', 'Docker', ['docker', 'container', '容器'], 'cloud', 'simpleicons'],
  ['kubernetes', 'Kubernetes', ['k8s', 'kubernetes', 'k8s 集群'], 'cloud', 'simpleicons'],
  ['terraform', 'Terraform', ['terraform', 'iac'], 'cloud', 'simpleicons'],
  ['nginx', 'Nginx', ['nginx', '反向代理'], 'cloud', 'simpleicons'],
  ['apache', 'Apache', ['apache', 'httpd'], 'cloud', 'simpleicons'],
  ['ubuntu', 'Ubuntu', ['ubuntu', 'linux 发行版'], 'cloud', 'simpleicons'],
  ['vercel', 'Vercel', ['vercel', 'nextjs 部署'], 'cloud', 'simpleicons'],
  ['digitalocean', 'DigitalOcean', ['digitalocean', 'do'], 'cloud', 'simpleicons'],

  // 数据库 / 数据工程
  ['postgresql', 'PostgreSQL', ['postgres', 'postgresql', 'pg', '关系型数据库'], 'database', 'simpleicons'],
  ['mysql', 'MySQL', ['mysql', '关系型数据库'], 'database', 'simpleicons'],
  ['mongodb', 'MongoDB', ['mongodb', 'mongo', '文档数据库'], 'database', 'simpleicons'],
  ['redis', 'Redis', ['redis', '缓存', 'kv 存储'], 'database', 'simpleicons'],
  ['sqlite', 'SQLite', ['sqlite', '嵌入式数据库'], 'database', 'simpleicons'],
  ['duckdb', 'DuckDB', ['duckdb', 'olap 嵌入式'], 'database', 'simpleicons'],
  ['clickhouse', 'ClickHouse', ['clickhouse', 'ck', '列式数据库'], 'database', 'simpleicons'],
  ['elasticsearch', 'Elasticsearch', ['elasticsearch', 'es', '全文检索'], 'database', 'simpleicons'],
  ['neo4j', 'Neo4j', ['neo4j', '图数据库', '知识图谱'], 'database', 'simpleicons'],
  ['apachekafka', 'Apache Kafka', ['kafka', '消息队列', 'mq'], 'database', 'simpleicons'],
  ['apachespark', 'Apache Spark', ['spark', 'pyspark', '大数据计算'], 'database', 'simpleicons'],
  ['apacheairflow', 'Apache Airflow', ['airflow', 'dag 调度', '工作流调度'], 'database', 'simpleicons'],
  ['apachecassandra', 'Apache Cassandra', ['cassandra', '宽表'], 'database', 'simpleicons'],
  ['mariadb', 'MariaDB', ['mariadb'], 'database', 'simpleicons'],
  ['couchbase', 'Couchbase', ['couchbase', 'nosql'], 'database', 'simpleicons'],
  ['supabase', 'Supabase', ['supabase', 'baas'], 'database', 'simpleicons'],
  ['qdrant', 'Qdrant', ['qdrant', '向量数据库'], 'database', 'simpleicons'],
  ['milvus', 'Milvus', ['milvus', '向量数据库'], 'database', 'simpleicons'],
  ['minio', 'MinIO', ['minio', '对象存储', 's3'], 'database', 'simpleicons'],
  ['trino', 'Trino', ['trino', 'presto', '查询引擎'], 'database', 'simpleicons'],
  ['snowflake', 'Snowflake', ['snowflake', '云数仓'], 'database', 'simpleicons'],
  ['databricks', 'Databricks', ['databricks', '湖仓'], 'database', 'simpleicons'],

  // 科研 / 开发工具
  ['python', 'Python', ['python', 'py'], 'science', 'simpleicons'],
  ['julia', 'Julia', ['julia', 'julialang'], 'science', 'simpleicons'],
  ['r', 'R', ['r 语言', 'rlanguage', '统计语言'], 'science', 'simpleicons'],
  ['latex', 'LaTeX', ['latex', 'tex', '排版'], 'science', 'simpleicons'],
  ['overleaf', 'Overleaf', ['overleaf', '在线 latex'], 'science', 'simpleicons'],
  ['pandas', 'pandas', ['pandas', 'dataframe'], 'science', 'simpleicons'],
  ['numpy', 'NumPy', ['numpy', 'ndarray'], 'science', 'simpleicons'],
  ['scipy', 'SciPy', ['scipy', '科学计算'], 'science', 'simpleicons'],
  ['scikitlearn', 'scikit-learn', ['sklearn', 'scikit-learn', '机器学习库'], 'science', 'simpleicons'],
  ['jupyter', 'Jupyter', ['jupyter', 'notebook'], 'science', 'simpleicons'],
  ['anaconda', 'Anaconda', ['anaconda', 'conda'], 'science', 'simpleicons'],
  ['dask', 'Dask', ['dask', '并行计算'], 'science', 'simpleicons'],
  ['opencv', 'OpenCV', ['opencv', 'cv', '视觉库'], 'science', 'simpleicons'],
  ['plotly', 'Plotly', ['plotly', '可视化'], 'science', 'simpleicons'],
  ['weightsandbiases', 'Weights & Biases', ['wandb', 'weights and biases', '实验跟踪'], 'science', 'simpleicons'],
  ['mlflow', 'MLflow', ['mlflow', '实验管理'], 'science', 'simpleicons'],
  ['streamlit', 'Streamlit', ['streamlit', '数据应用'], 'science', 'simpleicons'],
  ['kaggle', 'Kaggle', ['kaggle', '竞赛数据集'], 'science', 'simpleicons'],
  ['googlecolab', 'Google Colab', ['colab', 'google colab'], 'science', 'simpleicons'],
  ['quarto', 'Quarto', ['quarto', '可复现报告'], 'science', 'simpleicons'],
  ['zotero', 'Zotero', ['zotero', '文献管理'], 'science', 'simpleicons'],
  ['mendeley', 'Mendeley', ['mendeley', '文献管理'], 'science', 'simpleicons'],
  ['arxiv', 'arXiv', ['arxiv', '预印本'], 'science', 'simpleicons'],
  ['orcid', 'ORCID', ['orcid', '学术身份'], 'science', 'simpleicons'],
  ['ieee', 'IEEE', ['ieee', '学术出版'], 'science', 'simpleicons'],
  ['acm', 'ACM', ['acm', '学术出版'], 'science', 'simpleicons'],
  ['github', 'GitHub', ['github', 'gh', '代码托管'], 'science', 'lobe'],
  ['gitlab', 'GitLab', ['gitlab', '代码托管'], 'science', 'simpleicons'],
  ['mermaid', 'Mermaid', ['mermaid', '文本绘图'], 'science', 'simpleicons'],
  ['notion', 'Notion', ['notion', '笔记'], 'science', 'lobe'],
  ['obsidian', 'Obsidian', ['obsidian', '双链笔记'], 'science', 'lobe'],
  ['figma', 'Figma', ['figma', '设计'], 'science', 'lobe'],
  ['matlab', 'MATLAB', ['matlab', '矩阵实验室'], 'science', 'simpleicons'], // 上游 404，会在报告里记为 skip
];

/** Databricks 产品图标（community 托管官方 artwork，pinned commit 拉取）。 */
const DBX_SLUGS = [
  ['databricks', 'Databricks', ['databricks', '湖仓平台'], 'platform'],
  ['lakehouse', 'Lakehouse Architecture', ['lakehouse', '湖仓一体'], 'platform'],
  ['apache-spark', 'Apache Spark (Databricks)', ['spark', 'pyspark'], 'platform'],
  ['photon', 'Photon', ['photon', '向量化引擎'], 'platform'],
  ['compute-clusters', 'Compute / Clusters', ['clusters', 'all-purpose compute', '集群'], 'platform'],
  ['serverless-compute', 'Serverless Compute', ['serverless', '无服务器计算'], 'platform'],
  ['delta-lake', 'Delta Lake', ['delta', 'delta lake', '事务表'], 'storage'],
  ['apache-iceberg', 'Apache Iceberg', ['iceberg', '开放表格式'], 'storage'],
  ['lakehouse-storage', 'Lakehouse Storage', ['managed tables', 'delta tables'], 'storage'],
  ['lakebase', 'Lakebase', ['oltp', 'postgres 服务'], 'storage'],
  ['unity-catalog', 'Unity Catalog', ['uc', '统一目录', '数据目录'], 'governance'],
  ['data-lineage', 'Data Lineage', ['lineage', '数据血缘'], 'governance'],
  ['data-quality-monitoring', 'Data Quality Monitoring', ['lakehouse monitoring', '数据质量'], 'governance'],
  ['lakeflow', 'Lakeflow', ['lakeflow', '数据工程'], 'engineering'],
  ['lakeflow-jobs', 'Lakeflow Jobs', ['workflows', 'jobs', '作业调度'], 'engineering'],
  ['spark-declarative-pipelines', 'Spark Declarative Pipelines', ['dlt', 'delta live tables', '声明式管道'], 'engineering'],
  ['auto-loader', 'Auto Loader', ['autoloader', '增量摄取'], 'engineering'],
  ['databricks-sql', 'Databricks SQL', ['dbsql', 'sql 仓库'], 'analytics'],
  ['sql-warehouse', 'SQL Warehouse', ['warehouse', '数仓'], 'analytics'],
  ['ai-bi', 'AI/BI', ['ai bi', '商业智能'], 'analytics'],
  ['genie', 'Genie', ['genie', '自然语言问数'], 'ai'],
  ['genie-agents', 'Genie Agents', ['genie spaces', 'ai/bi genie'], 'ai'],
  ['ai-search', 'Vector Search', ['vector search', '向量检索', 'rag'], 'ai'],
  ['model-serving', 'Model Serving', ['model serving', '模型服务'], 'ai'],
  ['model-training', 'Model Training', ['training', '模型训练'], 'ai'],
  ['mlflow', 'MLflow (Databricks)', ['mlflow', '实验跟踪'], 'ai'],
  ['feature-store', 'Feature Store', ['feature store', '特征平台'], 'ai'],
  ['marketplace', 'Databricks Marketplace', ['marketplace', '数据市场'], 'sharing'],
  ['delta-sharing', 'Delta Sharing', ['delta sharing', '数据共享'], 'sharing'],
  ['notebooks', 'Notebooks', ['notebook', '笔记本'], 'devtools'],
  ['workspace', 'Workspace', ['workspace', '工作区'], 'devtools'],
  ['asset-bundles', 'Asset Bundles', ['dab', 'dabs', '资产包'], 'devtools'],
  ['databricks-cli', 'Databricks CLI', ['cli', '命令行'], 'devtools'],
];

function minifySvg(svgText, size = 48) {
  let s = String(svgText)
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
  s = s.replace(/width="[^"]*"/, `width="${size}"`).replace(/height="[^"]*"/, `height="${size}"`);
  if (!/\swidth=/.test(s)) s = s.replace('<svg', `<svg width="${size}" height="${size}"`);
  if (!/\sheight=/.test(s)) s = s.replace('<svg', `<svg height="${size}"`);
  return s;
}

async function fetchText(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      if (!t.includes('<svg')) throw new Error('not an svg');
      return t;
    } catch (e) { last = e; await new Promise((res) => setTimeout(res, 300 * (i + 1))); }
  }
  throw last;
}

async function buildIcons() {
  const lobe = JSON.parse(fs.readFileSync(path.join(REF, 'lobe-icons.json'), 'utf8'));
  const dbx = JSON.parse(fs.readFileSync(path.join(REF, 'databricks-icons.json'), 'utf8'));
  const lobeSet = new Set(lobe.icons);
  const dbxBySlug = new Map(dbx.products.map((p) => [p.slug, p]));
  const skipped = [];
  const warn = [];

  const jobs = [];
  for (const [slug, title, al, cat, src] of ICON_CANDIDATES) {
    jobs.push({ kind: 'cand', slug, title, al, cat, src });
  }
  for (const [slug, title, al, cat] of DBX_SLUGS) jobs.push({ kind: 'dbx', slug, title, al, cat });

  // 预算用尽时"从各档尾部删"，所以候选表顺序 ≠ 重要性顺序；先把高价值品牌排到前面（V8 sort 稳定，
  // 同优先级内部保持候选表原顺序），否则 pytorch / kubernetes / snowflake / unity-catalog 这类会被裁掉。
  const HIGH_PRIORITY = new Set([
    'openai', 'claude-color', 'gemini-color', 'deepseek-color', 'qwen-color', 'nvidia-color',
    'huggingface-color', 'pytorch', 'tensorflow', 'ollama', 'langchain-color',
    'aws-color', 'azure-color', 'googlecloud-color', 'alibabacloud-color', 'docker', 'kubernetes',
    'postgresql', 'mysql', 'mongodb', 'redis', 'duckdb', 'clickhouse', 'neo4j', 'apachekafka',
    'apachespark', 'apacheairflow', 'snowflake', 'databricks',
    'python', 'jupyter', 'scikitlearn', 'pandas', 'numpy', 'scipy', 'latex', 'overleaf',
    'arxiv', 'zotero', 'github', 'mermaid',
    'databricks', 'lakehouse', 'unity-catalog', 'delta-lake', 'apache-spark', 'compute-clusters',
    'databricks-sql', 'notebooks', 'workspace', 'ai-search', 'model-serving', 'mlflow', 'lakeflow',
  ]);
  jobs.sort((a, b) => (HIGH_PRIORITY.has(a.slug) ? 0 : 1) - (HIGH_PRIORITY.has(b.slug) ? 0 : 1));

  const fetched = [];
  const pool = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const j = jobs[cursor++];
      try {
        if (j.kind === 'cand' && j.src === 'lobe') {
          if (!lobeSet.has(j.slug)) throw new Error('slug not in lobe-icons manifest');
          const url = `${lobe.cdn}${j.slug}.svg`;
          fetched.push({ ...j, url, source: 'lobe-icons', license: 'MIT', sourceUrl: 'https://github.com/lobehub/lobe-icons', https: await fetchText(url) });
        } else if (j.kind === 'cand') {
          const url = `https://cdn.simpleicons.org/${j.slug}`;
          fetched.push({ ...j, url, source: 'simple-icons', license: 'CC0-1.0', sourceUrl: 'https://github.com/simple-icons/simple-icons', https: await fetchText(url) });
        } else {
          const p = dbxBySlug.get(j.slug);
          if (!p) throw new Error('slug not in databricks manifest');
          const url = `${dbx.hostedBase}/icons/svg/${j.slug}.svg`;
          const raw = `https://raw.githubusercontent.com/oieduardorabelo/databricks-architecture-icons/${dbx.pinnedRef}/icons/svg/${j.slug}.svg`;
          fetched.push({
            ...j, url, source: 'databricks-architecture-icons', license: '见上游（Databricks 官方 artwork，社区托管）',
            sourceUrl: dbx.source, ref: dbx.pinnedRef, aliases: [...(j.al || []), ...(p.aliases || [])],
            https: await fetchText(raw),
          });
        }
      } catch (e) { skipped.push(`${j.kind === 'dbx' ? 'dbx:' : ''}${j.slug} (${e.message})`); }
    }
  }
  await Promise.all(Array.from({ length: pool }, worker));

  // 图标预算：按候选优先级（fetched 已按 jobs 顺序完成，用 jobs 顺序重排）稳定排序
  const order = new Map();
  jobs.forEach((j, i) => order.set(`${j.kind}:${j.slug}`, i));
  fetched.sort((a, b) => order.get(`${a.kind}:${a.slug}`) - order.get(`${b.kind}:${b.slug}`));

  // 分档预算：不设硬上限，让末尾的"全局收敛"从当前最大一档逐条删——五档字节数自动均衡，
  // 避免某一档（如 SVG 偏大的 AI 品牌）把预算吃光而饿死数据库/科研/Databricks 档。
  const GROUP_BUDGET = { ai: 64 * 1024, cloud: 64 * 1024, database: 64 * 1024, science: 64 * 1024, databricks: 64 * 1024 };
  const trimmed = [];
  const icons = [];
  const groupUsed = {};
  for (const f of fetched) {
    const svg = minifySvg(f.https, 48);
    const entry = {
      _group: f.kind === 'dbx' ? 'databricks' : f.cat,
      slug: f.slug,
      title: f.title,
      category: f.cat,
      aliases: uniq([...(f.al || []), f.slug, f.title.toLowerCase()]),
      source: f.source,
      license: f.license,
      url: f.url,
      ...(f.ref ? { pinnedRef: f.ref } : {}),
      style: `${f.kind === 'dbx' ? DBX_STYLE : LOBE_STYLE}${f.url}`,
      svg,
    };
    entry._bytes = JSON.stringify(entry).length + 34; // 预留 1 空格缩进 + 换行开销
    const g = entry._group;
    if ((groupUsed[g] || 0) + entry._bytes > (GROUP_BUDGET[g] || 20 * 1024)) {
      trimmed.push(`${f.slug} (分档预算 ${g})`);
      continue;
    }
    groupUsed[g] = (groupUsed[g] || 0) + entry._bytes;
    icons.push(entry);
  }

  const meta = {
    _note: '本文件是本仓自用的品牌图标子集（含内嵌 SVG），由 build-data.mjs 生成。',
    purpose: '把常见 AI / 云 / 数据库 / 科研工具品牌放进 draw.io 图里（shape=image 单元格）。',
    generatedBy: 'tools/diagrams/shapes/build-data.mjs',
    fetchedAt: FETCHED_AT,
    upstream: {
      ...UPSTREAM,
      manifests: [
        { file: 'skills/drawio-skill/data/lobe-icons.json', package: lobe.package, version: lobe.version, license: 'MIT', repo: 'https://github.com/lobehub/lobe-icons', note: '上游清单只含名称列表，不含图形资源；本文件已把 SVG 取回并内嵌。' },
        { file: 'skills/drawio-skill/data/databricks-icons.json', repo: dbx.source, pinnedRef: dbx.pinnedRef, canvas: dbx.canvas, note: '上游清单只含名称与分类，不含图形资源；图标为 Databricks 官方 artwork，社区项目托管，商标归 Databricks, Inc.。' },
      ],
      supplement: { repo: 'https://github.com/simple-icons/simple-icons', license: 'CC0-1.0', cdn: 'https://cdn.simpleicons.org/', reason: 'lobe-icons 清单里没有数据库 / 基础设施 / 科研工具品牌（postgresql、mongodb、docker、kubernetes、databricks、pytorch 等在 871 个 slug 中均不存在），这与上游 aiicons.py 的兜底做法一致。' },
    },
    pruningCriteria: [
      `只保留每个品牌 1 条（mono/color/text 变体只取最能直接用于架构图的那种），AI / 云 / 数据库 / Databricks / 科研工具五档各自设字节预算，超出按优先级丢弃（见 _meta.trimmed）。`,
      `体积门限 ${ICON_CAP / 1024}KB；实际写出字节数见 _meta.finalBytes。分档预算 ai 32KB / cloud 15KB / database 30KB / science 21KB / databricks 30KB，仍超限时从最大一档尾部继续删（见 _meta.trimmed）。`,
      '上游未提供图形的品牌（weaviate / pinecone / chroma / dbt / drawio / graphviz / plantuml / oracle / ibm / matplotlib 等）不在候选表内，直接剔除。',
      '单条超大的特殊图标（simple-icons 的 elsevier 单条 54KB）被排除，避免一条吃掉 1/3 预算。',
    ],
    fieldNotes: {
      slug: '上游清单的品牌标识',
      title: '品牌显示名（draw.io 单元格标签可直接用）',
      aliases: '英文别名 + 中文名 + 上游 aliases（Databricks 产品带重命名别名，如 DLT）',
      style: '可直接粘贴的 draw.io image style（引用 CDN URL；离线渲染请用 shape-lookup.mjs --embed 生成内嵌 data URI）',
      url: 'SVG 原始地址（在线渲染时 draw.io 会去取）',
      pinnedRef: 'Databricks 图标的不可变 commit',
      svg: '已内嵌的最小化 SVG（width/height 归一为 48，去掉 <title>），可离线用；生成 data URI：data:image/svg+xml,<base64>',
    },
    styleTemplate: LOBE_STYLE,
    dataUriNote: "draw.io 以 ';' 分割 style 值，所以内嵌图片必须用无标记 base64（不要写 ';base64,'），draw.io 会按内容识别。",
    counts: { total: icons.length, skipped: skipped.length, trimmed: trimmed.length },
    skipped,
    trimmed,
  };

  // 全局收敛：按"实际序列化字节数"裁剪（缩进与 _meta 开销都计入），每次从当前最大的一档尾部删一条。
  const clean = () => icons.map(({ _group, _bytes, ...rest }) => rest);
  let serialized = '';
  for (let guard = 0; guard < 600; guard++) {
    const byCategory = {};
    for (const e of icons) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    meta.counts = { total: icons.length, byCategory, skipped: skipped.length, trimmed: trimmed.length };
    serialized = JSON.stringify({ _meta: meta, icons: clean() }, null, 1) + '\n';
    const bytes = Buffer.byteLength(serialized);
    meta.finalBytes = bytes;
    if (bytes <= ICON_CAP || icons.length === 0) break;
    const tot = {};
    for (const e of icons) tot[e._group] = (tot[e._group] || 0) + e._bytes;
    const g = Object.keys(tot).sort((a, b) => tot[b] - tot[a])[0];
    let dropped = false;
    for (let i = icons.length - 1; i >= 0; i--) {
      if (icons[i]._group === g) { trimmed.push(`${icons[i].slug} (全局门限)`); icons.splice(i, 1); dropped = true; break; }
    }
    if (!dropped) break;
  }
  // 收尾：finalBytes 是自引用字段（它记录的是"包含它自己"的文件长度），裁剪结束后必须再序列化一次，
  // 否则文件里留下的是上一轮的旧值（实测曾出现 157176 vs 实际 150413 的不自洽）。数字位数影响长度，迭代到不动点。
  {
    const byCategory = {};
    for (const e of icons) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    meta.counts = { total: icons.length, byCategory, skipped: skipped.length, trimmed: trimmed.length };
    for (let i = 0; i < 6; i++) {
      const out = JSON.stringify({ _meta: meta, icons: clean() }, null, 1) + '\n';
      const b = Buffer.byteLength(out);
      serialized = out;
      if (meta.finalBytes === b) break;
      meta.finalBytes = b;
    }
  }
  return { serialized, bytes: Buffer.byteLength(serialized), meta, warn, skipped, trimmed };
}

// ───────────────────────────────────────────────────────────────── main ──

function writeJson(file, data, cap) {
  let out = JSON.stringify(data, null, 1) + '\n';
  if (Buffer.byteLength(out) > cap) out = JSON.stringify(data) + '\n';
  fs.writeFileSync(file, out, 'utf8');
  return Buffer.byteLength(out);
}

const shapes = buildShapes();
const icons = await buildIcons();

const shapeBytes = writeJson(path.join(HERE, 'shape-index.json'), shapes.data, SHAPE_CAP);
fs.writeFileSync(path.join(HERE, 'icons.json'), icons.serialized, 'utf8');
const iconBytes = icons.bytes;

console.log('shape-index.json :', shapeBytes, 'B', `(${(shapeBytes / 1024).toFixed(1)}KB / cap ${SHAPE_CAP / 1024}KB)`,
  '| shapes:', shapes.data.shapes.length, JSON.stringify(shapes.data._meta.counts.byCategory));
console.log('icons.json       :', iconBytes, 'B', `(${(iconBytes / 1024).toFixed(1)}KB / cap ${ICON_CAP / 1024}KB)`,
  '| icons:', icons.meta.counts.total, JSON.stringify(icons.meta.counts.byCategory));
if (shapes.warn.length) console.log('shape warnings  :', shapes.warn.join('; '));
if (icons.skipped.length) console.log('icon skipped    :', icons.skipped.join('; '));
if (icons.trimmed.length) console.log('icon trimmed    :', icons.trimmed.join('; '));
console.log('fetchedAt        :', FETCHED_AT, '| ref:', REF);
if (shapeBytes > SHAPE_CAP || iconBytes > ICON_CAP) { console.error('OVER CAP'); process.exit(1); }
