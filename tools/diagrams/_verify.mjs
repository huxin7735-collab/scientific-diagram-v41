// 临时验收脚本：核对流程图标准图元（起止胶囊 / 判定菱形 / 直角连线）
import fs from 'node:fs';
import path from 'node:path';
const m = await import('./specs-ref.mjs');
for (const f of m.figures) {
  const dir = f.outDir;
  const read = (ext) => fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((n) => n.endsWith(ext) && !n.startsWith('图片'))), 'utf8');
  const svg = read('.svg'), dw = read('.drawio');
  const first = f.nodes.find((n) => n.layer === 0) || {};
  const term = f.nodes.filter((n) => ['start', 'end', 'focusend'].includes(n.type)).length;
  const dia = f.nodes.filter((n) => n.type === 'decision').length;
  const cap = (svg.match(/rx="120"/g) || []).length;
  const rh = (dw.match(/rhombus;/g) || []).length;
  const a50 = (dw.match(/arcSize=50/g) || []).length;
  const Q = (svg.match(/Q /g) || []).length;
  console.log(`${f.file} | 首节点=${first.type} | 起止节点=${term} | 菱形=${dia} | SVG胶囊=${cap} | drawio胶囊=${a50} | rhombus=${rh} | Q=${Q}`);
}
