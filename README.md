# scientific-diagram-v41

> A DeepSeek V4.1 (dsh) native skill for drawing scientific flowcharts, technical roadmaps, architecture, method-framework, algorithm, state-machine and sequence diagrams — with hierarchy-first discipline, orthogonal routing, focus restraint, and anti-hallucination guarantees. Ships with a stdlib-only Node toolkit for drawio/SVG generation, rubric scoring, and colored revision-diff.

## Why this exists

When asked for a "research figure", AI drawing tools produce four recurring pathologies:

1. **Structural overload** — 15+ nodes, spaghetti crossings, no readable main line.
2. **Diagonal mess** — slanted `<line>` connectors instead of orthogonal routing.
3. **Unclear flow / semantics** — arrows without data/control-flow labels; reversed directions go unnoticed.
4. **Hallucinated "imagination diagrams"** — `generate_image` fabricating a system that does not match the real paper (a form of fabricated evidence).

This skill replaces free-form drawing with a **deterministic, constraint-driven** workflow: define the single claim and information hierarchy first, select a visual type, then draw within a strict budget. It is a *prompt skill* for dsh (DeepSeek Harness), reinforced for V4.1's strong instruction-following.

## Features

- **Hierarchy-first** — must answer 3 pre-draw questions; one claim per figure; a two-level main-line decomposition (big steps → small steps) before any node is placed.
- **9 hard constraints** — drawing is forbidden until all are satisfied: type/hierarchy set, orthogonal routing, labeled edges, ≤9 nodes / ≤2 focus colors, no hallucinated architecture, independent readability, two-level decomposition, vertical (TB) layout by default, and containerized parent/child steps.
- **Orthogonal routing** — rounded right-angle connectors only (`r=8`, compact `r=6`); no diagonal lines.
- **Edge semantics** — every arrow carries a ≤14-char uppercase flow/control label with correct direction (wrong direction = automatic fail).
- **Information-density budget** — ≤9 nodes, ≤12 arrows, ≤2 accent colors; over-budget auto-splits into overview + detail.
- **Containerization (§10.8 / §10.9)** — big-step / small-step parent-child relations MUST be drawn as containers (group box / swimlane side-label / lateral fork), never flattened into one chain.
- **ISO 5807 shape vocabulary** — correct decision diamonds, terminals, process boxes for flowcharts.
- **Self-check rubric (§8)** — mechanical gates D1–D9 + a 24-item checklist + a render-review loop capped at 2 rounds.
- **Revision diff (§8.7)** — `build.mjs --diff` produces a structured table plus a colored drawio diff (green = added, orange = changed/rerouted, purple = moved, red-dashed = removed, gray = same), directly serving peer-review figure revision.
- **Companion Node toolkit** — stdlib-only `build.mjs` emits drawio / SVG / layout.json, scores a diagram against the rubric (`--score`), and produces the revision diff; optional Visio/VDX export via the bundled PowerShell helpers.
- **doc-guard binding (§9)** — optionally binds to `dsh-maintainer-doc-guard` temp scope; hard constraints are injected per round and cleared on exit, with zero impact on the main conversation docs.

## Supported visual types

Flowchart · Process / Technical roadmap · Architecture · Sequence / Swimlane · State machine · TikZ (LaTeX-compilable vector) · Timeline / Gantt.

## Installation (dsh)

```bash
git clone https://github.com/<you>/scientific-diagram-v41.git
# copy the skill package (repo root = skill package) into your dsh skills dir
cp -r scientific-diagram-v41 ~/.dsh/skills/scientific-diagram-v41
#   or into a profile: <profile>/skills/scientific-diagram-v41
dsh --dump-config   # verify it activates; expect zero "did not activate" / "waiting for"
```

The `SKILL.md` + `references/` are sufficient for pure-prompt usage. To enable the `build.mjs` toolkit, also copy `tools/diagrams/` and run it with the managed Node runtime.

## Usage

Invoke naturally inside a dsh session, for example:

- "画一张 XX 方法的技术路线图"
- "把这段方法框架画成流程图，竖向排版"
- "审稿让我加一个子步骤，对比一下改动" → triggers `--diff`

The skill first asks the three pre-draw questions, proposes a type and focus, then delivers within budget and runs the §8 self-check before declaring pass.

## Revision diff (example)

```bash
cd tools/diagrams
node build.mjs --diff old.layout.json new.layout.json
# → terminal table + <new>-diff.drawio (open in diagrams.net)
```

## Repository structure

```
scientific-diagram-v41/          # repo root = the dsh skill package
├── SKILL.md                     # the skill (prompt) source
├── README.md
├── README_CN.md
├── LICENSE
├── references/
│   ├── brand-logos.md
│   └── shape-catalog.md
└── tools/diagrams/              # companion Node toolkit (optional)
    ├── build.mjs                # drawio/SVG/layout generation, --score, --diff
    ├── specs.mjs / specs-ref.mjs
    ├── shapes/  vendor/
    └── *.ps1                    # Visio / VDX export helpers
```

## Third-party / vendored components

- `tools/diagrams/vendor/svgtovisio/` is a vendored copy of [svgtovisio](https://github.com/McMarius11/svgtovisio) (MIT, © 2026 McMarius11). Its `LICENSE` is preserved; it powers the optional Visio/VDX export.
- `node_modules/` is **git-ignored** and never committed. To enable the Visio/VDX export, run `npm install` inside `tools/diagrams/vendor/svgtovisio/`. The core `build.mjs` (drawio/SVG/layout generation, `--score`, `--diff`) is stdlib-only and needs no install.

## Methodology & credits

The constraints are synthesized from the `academic-agent-toolkit` family (`diagram-design`, `mermaid-diagram`, `scientific-schematics`, `paper-figure-drawio`) and `isomoes/creating-figures` (Claude/Codex ecosystem), rewritten into dsh's three-key format with V4.1 hard constraints — not copied verbatim. The revision-diff coloring and the "≤2 visual self-check rounds" cap are borrowed from `Agents365-ai/drawio-skill`'s drawiodiff, reimplemented in stdlib Node with no draw.io binary dependency.

## Disclaimer

Unofficial, community skill adapted for DeepSeek V4.1 / dsh. Not affiliated with DeepSeek Inc. Tested against the dsh `0.1.5-rc.2` harness.

## License

MIT
