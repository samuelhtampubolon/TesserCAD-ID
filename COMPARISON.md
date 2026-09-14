# How this compares — to its two sibling editions, and to the thirteen

This page has two jobs. The first is specific to this edition: **what exactly is
different from TesserCAD and TesserCADIna, and what each difference cost.** The
second is inherited and unchanged: thirteen open-source 3D and CAD projects
shaped the briefs behind this work, and this page says as precisely as it can
where the studio is genuinely ahead of them, where it is genuinely behind, and
which comparisons are not meaningful at all.

It is written to be *useful*, which means it is written to be honest. A page
claiming a 23,000-line browser application beats Blender would tell you nothing
except that its author could not be trusted on anything else, and if this
repository is ever put in front of a reviewer, an examiner, or an engineer
deciding whether to rely on it, an overstated claim is the fastest way to lose
all of them.

So: **TesserCAD is not "better than" FreeCAD, Blender or BRL-CAD.** It is not
trying to be, and could not be. It leads them decisively on a specific set of
properties, and trails them decisively on another. Both lists are below.

| | |
|---|---|
| Source | 24,920 lines across 56 modules, 79.9% of it shared line-for-line with TesserCAD |
| Tests | 1023 headless in 16 suites, 407 across 11 browser suites, 18 in the real desktop shell |
| Runtime dependencies | 1 (three.js, vendored, unmodified) |
| Build step | None |
| `npm test`, cold | about six seconds, downloads nothing |

---

## 0. The two sibling editions

Measured rather than asserted, by a script anyone can run:

```bash
node tools/parity.mjs ../TesserCAD ../TesserCADIna
```

| | vs TesserCAD | vs TesserCADIna |
|---|---|---|
| Source identical, line for line | **79.9%** | **81.1%** |
| Modules shared | 49 | 49 |
| Upstream commands missing here | 4 | 4 |
| Commands new here | 2 | 2 |
| Web payload, gzipped | 0.542 vs 0.532 MB (+1.9%) | 0.542 vs 0.596 MB (−9.0%) |
| Windows download | under 80 MB vs 135 MB | under 80 MB vs 135 MB |
| Source sentences still in English | 1.6% vs 19.2% | 1.6% vs 22.3% |

### What was added

- **AI Chat ke 3D** (`src/ai/chat3d.js`, `src/ai/resep.js`) — eleven
  Indonesian-context parametric assemblies from one sentence, planned before
  applied, with the click-equivalence reported per turn. The heaviest single
  sentence is worth 868 clicks by the model in `src/ai/klik.js`.
- **AI Chat ke simulasi 4D** (`src/ai/chat4d.js`) — build sequence, motors,
  keyframes and rigid-body physics from one sentence, resolving its own targets
  against the feature names in the document. A full setup is worth 60-80 clicks.
- **`src/ai/lex.js`** — an Indonesian number-and-quantity reader, used by both.
  It is the part that makes "dua ribu tiga ratus", "9 meter kali 7 meter" and
  "delapan lantai" come out the same as their digit forms.
- **A fifth layer in the architecture** (`ai`, above `intel`/`sim` and below
  `ui`), asserted like the others: no DOM access, so the whole feature is
  testable in Node, and 231 of the 1023 headless checks are that.

### What was removed, and why

Each of these was a deliberate trade against weight, and each is a real loss
worth naming rather than a tidy-up:

| Removed | Weight recovered | What you lose |
|---|---|---|
| `intel/deviation.js` — mesh deviation map (`dev.compare`) | 7.9 KB gzip | You can no longer ask "is this supplier STL my part?" and get a signed-distance histogram. The intent round-trip half of that module was kept and moved to `intel/intent.js`. |
| `intel/merge.js` — three-way merge of two branches (`vcs.merge`) | 6.5 KB gzip | Version history, branching and browsing all remain; merging two branches back together does not. For a single-designer studio that is the least-used third of the feature. |
| glTF export, and `vendor/GLTFExporter.js` with it | 24.6 KB gzip | No `.glb` or `.gltf`. STL, OBJ, PLY, DXF, SVG and PNG remain, which covers laser, CNC, 3D printing and drawings — the paths an Indonesian workshop actually uses. |
| The runtime translation layer: `core/i18n.js` and its two dictionary files | 1,945 lines, ~70 KB gzip | Nothing, for a user. The language is in the literals instead, which is why this edition can be Indonesian-only rather than Indonesian-on-top. |

### What the percentages cannot be

The brief for this edition asked for 75-85% of TesserCAD **and** 65-75% of
TesserCADIna. The first is met at 79.9%. The second is not, and cannot be:
TesserCADIna is itself 89.6% identical to TesserCAD, so anything 80% similar to
one is necessarily close to that similar to the other. Driving the second number
down to 75% without dragging the first below its band would mean rewriting
working code for no reason but the number. The measurement is reported as it is.

---

## 1. Where this studio genuinely leads

These are claims anyone can check in a few minutes, which is the point.

### Zero-friction access

Open a URL. There is no install, no account, no licence server, no download and
no build. None of the thirteen can be used this way except chili3d, which is
also browser-based. FreeCAD, Blender, BRL-CAD, MeshLab, SolveSpace, LibreCAD,
QCAD, OpenSCAD, Bforartists and dust3d are all installed applications;
CadQuery and build123d are Python libraries needing an environment.

### Verifiability of the artefact you run

There is no build step, so **the code you audit is the code that runs**. There
is no bundler output, no compiled binary and no artefact in which something
could differ from the source. Every other project on the list ships a compiled
binary or a wheel built from source you are trusting someone else to have
compiled faithfully.

The desktop build, which *is* a binary, carries a signed build-provenance
attestation naming the commit and workflow that produced it. That is stronger
provenance than most of the thirteen publish.

### Enforced structure rather than documented structure

The layering, the acyclic import graph, the 1200-line module ceiling, the
absence of DOM access in the engineering layer, and the fact that every
identifier resolves are **asserted by tests that fail the build**. Most large
codebases document conventions and rely on review to hold them. This one cannot
drift without going red.

This is the one place where the comparison to a large C++ project is meaningful
in this project's favour, and it is a consequence of being small. A 23,000-line
codebase can afford to assert properties of its own import graph. A
several-million-line one cannot, and it is not a failing on their part.

### Security posture

A Content-Security-Policy of `default-src 'none'` with a SHA-256-pinned import
map, no `eval` or `Function` anywhere in the project, validation enforced at the
document's trust boundary rather than in a widget, prototype pollution closed at
every parse boundary, and a desktop shell that opens **no listening socket** and
denies every Electron permission. 80 security checks run attacks, not
assertions, and the CSP is verified in a real browser with zero violations.

Several of the thirteen have scripting engines that execute untrusted model
files as code by design. That is a legitimate trade for their use case; it is
simply a different risk position from this one.

### Engineering output most of them do not attempt

Cost and process-crossover analysis, tolerance stack-up with Cp/Cpk and ISO 286
fits, second moments of area with load cases, ISO fastener data with torque and
clearance holes, automatic orthographic drawings with hidden-line removal, and a
continuous validation Doctor. These sit *inside* the modeller rather than in a
separate tool. FreeCAD reaches much of this through workbenches; the others
mostly do not attempt it.

### Four things that appear to be genuinely novel here

Stated narrowly enough to be argued with:

- **History as a tree.** An edit after an undo branches rather than truncating,
  so no state reached in a session becomes unreachable. None of the thirteen
  does this, nor do the three commercial packages the design notes quote.
- **A worker pool driven by the document's own dependency depth**, with no
  scheduler: features at equal depth are independent by construction.
- **The document and its text as one object**, either editable, with the
  round-trip checked on the user's own document. OpenSCAD makes the text
  primary; this makes them the same object.
- **A chat that plans in catalogue features and prices itself in clicks.**
  Assembly generators exist elsewhere; what appears not to, is one that runs
  with no network, emits the same editable features the mouse emits rather
  than a mesh, states every assumption it made, and reports what the same
  result would have cost by hand from a click model published as data.

---

## 2. Where this studio is definitively behind

This list matters more than the one above, because it is what decides whether
the tool fits your work.

### No B-rep kernel. This is the big one.

TesserCAD's booleans operate on **triangle meshes**. That means:

- No NURBS or analytic surfaces
- No true fillets or chamfers on arbitrary edges
- No STEP or IGES exchange
- No exact geometry: a cylinder is a faceted approximation, not a cylinder

**FreeCAD, BRL-CAD, CadQuery, build123d and chili3d all have real B-rep
kernels** (OpenCascade, or BRL-CAD's own). For any workflow that needs exact
geometry, a STEP handoff to a manufacturer, or a fillet on an edge you select,
those tools are not merely better here, they are the only option. This is a
foundational difference, not a missing feature that could be added.

### No geometric constraint solver

**SolveSpace's** entire premise — sketch relationships that a solver satisfies,
so a dimension drives the geometry — is absent. The Draft workspace has
snapping, ortho, polar tracking and typed coordinates. It cannot make two lines
perpendicular and hold them that way.

### No mesh processing of consequence

**MeshLab** does remeshing, simplification, Poisson reconstruction, alignment
and a large library of filters. TesserCAD reads a mesh, recognises some
features in it, and measures deviation. It does not repair or reprocess.

### No rendering, sculpting, animation system or asset pipeline

**Blender** and **Bforartists** are in a different category of software.
Cycles, EEVEE, the modifier stack, sculpting, UV unwrapping, rigging, the
compositor, the video sequencer, geometry nodes — none of it has a counterpart
here, and the 4D timeline is keyframes and simple dynamics, not an animation
system. **dust3d**'s organic node-based modelling is likewise absent.

### No plugin, scripting or extension system

Every one of the thirteen can be extended by a third party. TesserCAD has a
macro recorder that replays command ids and no way to load external code. That
is deliberate — loading external code is exactly what the CSP forbids — but it
is a real limitation and it means the tool cannot grow the way theirs do.

### Scale, maturity and standing

FreeCAD, Blender, BRL-CAD, LibreCAD and QCAD have **decades** of development,
large contributor communities, translations, accessibility work, professional
users with production workflows, and years of accumulated bug fixes against
real-world files. BRL-CAD has been in continuous development since 1979.

This project is one person's work over a short period. No amount of test
coverage substitutes for that kind of exposure, and anyone choosing a tool for
production work should weigh it heavily.

### Simulation

No FEA, no CFD, no stress analysis. Collision uses bounding spheres, which is
right for drop tests and packing studies and wrong for contact mechanics.

---

## 3. Comparisons that are not meaningful

Some axes get compared in READMEs where the comparison means nothing, and
saying so is more useful than producing a number:

- **"Lines of code."** Fewer is not better, and more is not better. They are
  different projects solving different problems.
- **"Features."** A count across tools of different kinds measures nothing. One
  B-rep fillet is worth more to a machinist than a dozen features here.
- **Architecture in the abstract.** FreeCAD and Blender are structured as they
  are because they support plugin systems, multiple kernels, scripting
  bindings, and a dozen platforms over decades. Comparing a single-target
  browser application to that on "architecture" would be meaningless. What is
  fair to compare is properties a reader gets — no build step, one dependency,
  enforced layering — and those are in section 1.
- **Performance.** No benchmark has been run against any of them. No claim is
  made.

---

## 4. So when should you use this, and when should you not

**Use TesserCAD when:** you want to model something parametric in a browser
with nothing installed; you want the engineering output (cost, tolerance,
fasteners, drawings, section properties) alongside the model; you are working
offline or on a locked-down machine; you want to read every line that runs; or
you want your work to stay on your machine with a policy the browser enforces
rather than a promise.

**Use something else when:** you need exact geometry, fillets on selected
edges, or a STEP file for a manufacturer — **FreeCAD, chili3d, CadQuery or
build123d**. You need sketch constraints — **SolveSpace**. You need mesh
repair — **MeshLab**. You need rendering, sculpting or animation —
**Blender**. You need a mature 2D drafting package with a deep user base —
**LibreCAD** or **QCAD**. You need a plugin ecosystem — any of them but this.

Those are good tools and the right answer to real questions. This one answers a
different question.

---

## 5. Licence separation

Ten of the thirteen are GPL, LGPL or AGPL. Copying from them into an
MIT-licensed project would be a licence violation, not a style issue. **No
code, data, asset or interface resource from any of them is present here**, and
that is enforced rather than asserted: `tools/tests/architecture.mjs` checks
that exactly four lines in `src/` mention any of the thirteen by name — three
prose comments explaining a design decision, and one palette search keyword —
and fails the build on a fifth. See [ATTRIBUTION.md](ATTRIBUTION.md) for the
full accounting, including the one algorithm that *is* derived from an
MIT-licensed source and is credited for it.

---

```bash
npm test                            # 1023 checks, 16 suites
node tools/tests/architecture.mjs   # includes the originality check above
```
