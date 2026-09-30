#!/usr/bin/env node
/**
 * shape-lookup.mjs — 在 shape-index.json（draw.io 官方形状子集）与 icons.json（品牌图标）里模糊检索。
 *
 * 用法：
 *   node tools/diagrams/shapes/shape-lookup.mjs <关键字>
 *   node tools/diagrams/shapes/shape-lookup.mjs database
 *   node tools/diagrams/shapes/shape-lookup.mjs 判定 --limit 3
 *   node tools/diagrams/shapes/shape-lookup.mjs openai --embed     # 图标改输出内嵌 data URI 的 style（离线可用）
 *   node tools/diagrams/shapes/shape-lookup.mjs 流程 --json
 *
 * 输出：每行 `名称 | drawio style | 来源`（style 可直接粘进 draw.io 单元格的 style 框）。
 * 无命中时打印"未找到"并列出最接近的 3 条。
 * 零依赖：只用 node 内置模块；数据文件与本脚本同目录。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHAPE_FILE = path.join(HERE, 'shape-index.json');
const ICON_FILE = path.join(HERE, 'icons.json');

const argv = process.argv.slice(2);
let limit = 8;
let embed = false;
let asJson = false;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--limit') { limit = Number(argv[++i]) || 8; continue; }
  if (a === '--embed') { embed = true; continue; }
  if (a === '--json') { asJson = true; continue; }
  if (a === '--help' || a === '-h') {
    console.log('用法: node tools/diagrams/shapes/shape-lookup.mjs <关键字> [--limit N] [--embed] [--json]');
    console.log('示例: node tools/diagrams/shapes/shape-lookup.mjs 判定');
    console.log('      node tools/diagrams/shapes/shape-lookup.mjs database --limit 3');
    console.log('      node tools/diagrams/shapes/shape-lookup.mjs openai --embed');
    process.exit(0);
  }
  positional.push(a);
}
const query = positional.join(' ').trim();
if (!query) {
  console.error('缺少关键字。用法: node tools/diagrams/shapes/shape-lookup.mjs <关键字>');
  console.error('例如: node tools/diagrams/shapes/shape-lookup.mjs 判定');
  process.exit(2);
}

const readJson = (file, what) => {
  if (!fs.existsSync(file)) {
    console.error(`缺少数据文件 ${file}（${what}）。请先运行: node ${path.join(HERE, 'build-data.mjs')}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const shapeDoc = readJson(SHAPE_FILE, 'draw.io 形状子集');
const iconDoc = readJson(ICON_FILE, '品牌图标子集');
const shapes = shapeDoc.shapes || [];
const icons = iconDoc.icons || [];

const lower = (s) => String(s ?? '').toLowerCase();
const squish = (s) => lower(s).replace(/[^0-9a-z\u4e00-\u9fff]+/g, '');

/** 打分：完全相等 100 > 前缀 72 > 子串 45 > 反向包含 32。 */
function scoreOf(q, qs, cands) {
  let best = 0;
  for (const c of cands) {
    if (c === undefined || c === null || c === '') continue;
    const s = lower(c);
    const sq = squish(c);
    if (s === q || (sq && sq === qs)) best = Math.max(best, 100);
    else if (s.startsWith(q) || (qs.length >= 2 && sq.startsWith(qs))) best = Math.max(best, 72);
    else if (s.includes(q) || (qs.length >= 2 && sq.includes(qs))) best = Math.max(best, 45);
    else if (q.length >= 2 && s.includes(q) === false && q.includes(s) && s.length >= 2) best = Math.max(best, 32);
  }
  return best;
}

const q = lower(query);
const qs = squish(query);

// ── 形状命中 ──
const shapeHits = shapes
  .map((e) => ({ e, s: scoreOf(q, qs, [e.name, e.nameU, ...(e.aliases || [])]) }))
  .filter((x) => x.s > 0)
  .sort((a, b) => b.s - a.s || String(a.e.name).localeCompare(String(b.e.name)));

// ── mermaid 语法命中（_meta.mermaidFlowchartMap 的键）──
const mmap = shapeDoc._meta?.mermaidFlowchartMap || {};
const mermaidHits = Object.entries(mmap)
  .map(([syn, target]) => ({ syn, target, s: scoreOf(q, qs, [syn]) }))
  .filter((x) => x.s > 0);

// ── 图标命中 ──
const iconHits = icons
  .map((e) => ({ e, s: scoreOf(q, qs, [e.title, e.slug, ...(e.aliases || [])]) }))
  .filter((x) => x.s > 0)
  .sort((a, b) => b.s - a.s || String(a.e.slug).localeCompare(String(b.e.slug)));

const iconStyle = (e) => {
  if (!embed) return e.style;
  if (!e.svg) return e.style;
  return `${(iconDoc._meta?.styleTemplate || 'shape=image;html=1;imageAspect=0;aspect=fixed;image=')}data:image/svg+xml,${Buffer.from(e.svg, 'utf8').toString('base64')}`;
};

const out = [];
for (const { e } of shapeHits.slice(0, limit)) {
  out.push({ kind: 'shape', name: e.name, style: e.style, source: `${e.source} · ${e.category}` });
}
for (const { syn, target } of mermaidHits.slice(0, limit)) {
  const t = shapes.find((s) => s.name === target);
  out.push({ kind: 'mermaid', name: `mermaid ${syn}`, style: t ? t.style : '(无官方等价形状)', source: `mermaid 语法 → ${target}` });
}
for (const { e } of iconHits.slice(0, limit)) {
  out.push({ kind: 'icon', name: e.title, style: iconStyle(e), source: `icons/${e.source} · ${e.url}` });
}

if (asJson) {
  console.log(JSON.stringify({ query, count: out.length, results: out }, null, 2));
  process.exit(0);
}

if (out.length === 0) {
  const lcs = (a, b) => {
    const m = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    let best = 0;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) { m[i][j] = m[i - 1][j - 1] + 1; best = Math.max(best, m[i][j]); }
      }
    }
    return best;
  };
  const overlap = (a, b) => new Set([...a].filter((ch) => b.includes(ch))).size;
  const near = [...shapes.map((e) => ({ e, k: 'shape' })), ...icons.map((e) => ({ e, k: 'icon' }))]
    .map(({ e, k }) => {
      const cands = [e.name || e.title, e.nameU || e.slug, ...(e.aliases || [])];
      const score = Math.max(...cands.map((c) => lcs(qs, squish(c)) * 3 + overlap(qs, squish(c))));
      return { e, k, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  console.log(`未找到 "${query}"。`);
  if (near.length) {
    console.log('可用的近似项：');
    for (const { e, k } of near) {
      if (k === 'shape') console.log(`  ${e.name} | ${e.style} | ${e.source} · ${e.category}`);
      else console.log(`  ${e.title} | ${e.style} | icons/${e.source} · ${e.url}`);
    }
  }
  console.log('提示：形状可试 起止/流程/判定/子流程/文档/手工/准备/连接点/存储/数据库/注释/连线，图标可试 openai/claude/aws/postgresql/databricks。');
  process.exit(0);
}

console.log(`# 命中 形状 ${shapeHits.length} / mermaid ${mermaidHits.length} / 图标 ${iconHits.length} 条，每类最多显示 ${limit} 条，下面列出 ${out.length} 条`);
for (const r of out) console.log(`${r.name} | ${r.style} | ${r.source}`);
