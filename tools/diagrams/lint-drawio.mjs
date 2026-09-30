#!/usr/bin/env node
// lint-drawio.mjs — 交付前对 .drawio 做**确定性**检查（零依赖）。
// 纪律来源（借形不借实现）：Agents365-ai/drawio-skill 的 scripts/validate.py ——
//   诊断对象 {code,severity,subject,message,fix}、有 error 退非零、--strict 时 warning 也退非零、
//   --score 打印加权分；它只检查 XML 里**已写死**的 geometry，不猜自动路由。
// 本仓落地：把"查得到就别手写 shape"变成可跑的 D9 白名单门——凡 style 里的 `shape=` 记号
//   必须能在官方形状索引（tools/diagrams/shapes/shape-index.json）里命中，否则 E-UNKNOWN-SHAPE。
// 用法：
//   node tools/diagrams/lint-drawio.mjs <file.drawio> [more.drawio ...] [--strict] [--json]
// 退出码：有 error（或 --strict 下有 warning）→ 1；否则 0。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const asJson = argv.includes('--json');
const files = argv.filter((a) => !a.startsWith('--'));

// 允许的内建/无 shape= 的 style（draw.io 原生图元，不需索引命中）
const BUILTIN = new Set([
  'rhombus', 'ellipse', 'triangle', 'cylinder', 'cylinder3', 'cube', 'datastore', 'document',
  'note', 'image', 'cloud', 'actor', 'swimlane', 'text', 'rect', 'line', 'arrow', 'callout',
  'step', 'process', 'hexagon', 'parallelogram', 'trapezoid', 'mxgraph.flowchart.terminator',
  'mxgraph.flowchart.decision', 'mxgraph.flowchart.process', 'mxgraph.flowchart.document',
  'mxgraph.flowchart.data', 'mxgraph.flowchart.predefined_process'
]);

function loadIndexTokens() {
  const p = path.join(here, 'shapes', 'shape-index.json');
  const known = new Set(BUILTIN);
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const rows = Array.isArray(data) ? data : Array.isArray(data.shapes) ? data.shapes : [];
    for (const r of rows) {
      const s = String(r.style || '');
      for (const m of s.matchAll(/shape=([A-Za-z0-9_.\-]+)/g)) known.add(m[1]);
      if (r.name) known.add(String(r.name));
    }
  } catch { /* 索引缺失时只按内建判定，并在报告中提示 */ }
  return known;
}

const KNOWN = loadIndexTokens();
const diag = (code, severity, subject, message, fix) => ({ code, severity, subject, message, fix });

function lintOne(file) {
  const findings = [];
  let xml;
  try { xml = fs.readFileSync(file, 'utf8'); }
  catch (e) { findings.push(diag('E-READ', 'error', file, `无法读取：${e.message}`, '确认路径存在且可读')); return findings; }
  const cells = [...xml.matchAll(/<mxCell\b[^>]*>/g)].map((m) => m[0]);
  if (!cells.length) findings.push(diag('E-PAGE-MODEL', 'error', file, '未找到任何 <mxCell>（可能不是 drawio XML）', '确认导出来自本仓 build.mjs'));
  let styled = 0;
  cells.forEach((c, i) => {
    const sm = c.match(/style="([^"]*)"/);
    if (!sm) return;
    styled++;
    const style = sm[1];
    if (!/html=1/.test(style) && /vertex="1"/.test(c)) {
      findings.push(diag('W-NO-HTML', 'warning', `${path.basename(file)}#cell${i}`, '顶点 style 缺 html=1（换行/富文本会失效）', '按 §7 契约补 html=1;whiteSpace=wrap;'));
    }
    for (const m of style.matchAll(/shape=([A-Za-z0-9_.\-]+)/g)) {
      const sh = m[1];
      if (!KNOWN.has(sh)) {
        findings.push(diag('E-UNKNOWN-SHAPE', 'error', `${path.basename(file)}#cell${i}`, `shape=${sh} 不在官方形状索引内（手写猜名字会静默渲染成空白框）`, `用 node tools/diagrams/shapes/shape-lookup.mjs ${sh.split('.').pop()} 检索官方 style 串后替换`));
      }
    }
    if (/shape=image/.test(style)) {
      if (/;base64,/.test(style)) findings.push(diag('E-BASE64-MARKER', 'error', `${path.basename(file)}#cell${i}`, 'image data URI 含 ";base64," 标记（draw.io 会在 ";" 处截断 style）', '去掉 ";base64,"，改为无标记 base64（见 §7 第三条契约）'));
      if (/https?:\/\//.test(style)) findings.push(diag('E-REMOTE-IMAGE', 'error', `${path.basename(file)}#cell${i}`, 'image 引用远程 URL（构建期不确定性 + 离线渲染为空白）', '改用 --embed 内联 data URI，禁止 CDN 引用'));
    }
  });
  if (styled === 0 && cells.length) findings.push(diag('W-NO-STYLE', 'warning', file, '所有 mxCell 都没有 style（可能导出了空图）', '检查导出参数'));
  return findings;
}

let all = [];
for (const f of files) all = all.concat(lintOne(f));
const errors = all.filter((d) => d.severity === 'error');
const warnings = all.filter((d) => d.severity === 'warning');
const score = Math.max(0, 100 - 20 * errors.length - 5 * warnings.length);
const verdict = errors.length || (strict && warnings.length) ? 'fail' : 'pass';

if (asJson) {
  console.log(JSON.stringify({ files, errors: errors.length, warnings: warnings.length, score, verdict, findings: all }, null, 2));
} else {
  for (const d of all) console.log(`${d.severity}: [${d.code}] ${d.subject} — ${d.message} (fix: ${d.fix})`);
  console.log(`\nSCORE ${score}/100 VERDICT ${verdict}  (files=${files.length} errors=${errors.length} warnings=${warnings.length}${strict ? ', strict' : ''})`);
}
process.exit(verdict === 'pass' ? 0 : 1);
