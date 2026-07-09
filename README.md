# image-generation-benchmarks

Fair, reproducible benchmarks for JavaScript image generation libraries — across runtimes,
scenarios, and output formats, with pixel-level output validation.

The goal is not a single winner: it's giving you a grounded answer to **"which library fits my
use case?"** — fastest steady-state throughput, cheapest cold start, broadest format support,
most portable across runtimes, or fewest native dependencies.

## Candidates

| Library                                                                                     | Paradigm              | Engine               | Encodes               |
| ------------------------------------------------------------------------------------------- | --------------------- | -------------------- | --------------------- |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas)                                   | Canvas API            | Skia (native, N-API) | png, jpeg, webp, avif |
| [skia-canvas](https://github.com/samizdatco/skia-canvas)                                    | Canvas API            | Skia (native, N-API) | png, jpeg, webp, svg  |
| [canvas](https://github.com/Automattic/node-canvas) (node-canvas)                           | Canvas API            | Cairo (native)       | png, jpeg, svg        |
| [canvaskit-wasm](https://www.npmjs.com/package/canvaskit-wasm)                              | Canvas API            | Skia (WebAssembly)   | png, webp\*           |
| [pureimage](https://github.com/joshmarinacci/node-pureimage)                                | Canvas API            | Pure JavaScript      | png, jpeg             |
| [takumi](https://github.com/kane50613/takumi) (@takumi-rs/core)                             | Declarative (JSX/CSS) | Rust (N-API)         | png, jpeg, webp       |
| [satori](https://github.com/vercel/satori) + [resvg-js](https://github.com/yisibl/resvg-js) | Declarative (JSX/CSS) | Yoga + resvg         | png, svg              |

\* canvaskit-wasm's prebuilt module silently falls back to PNG for codecs it doesn't include;
the harness probes at setup and only benchmarks formats that genuinely encode.

`sharp` was considered and deliberately excluded — it's an image _processing_ library, a
different category from drawing/layout engines.

## How fairness is enforced

- **Same inputs everywhere.** Every scenario is defined once, with both an imperative
  `drawCanvas(ctx)` implementation and a declarative element tree (consumed directly by satori,
  converted via `fromJsx` by takumi — that conversion is timed, because it's part of takumi's
  real pipeline). Identical fonts (committed Inter TTFs), identical sample images, identical
  coordinates and colors.
- **The timed unit is identical:** scenario input → encoded image buffer, using each library's
  maintainer-recommended async path (`canvas.encode()`, `canvas.toBuffer()`, callback
  `toBuffer`, `renderer.render()`, `satori()` + `Resvg.render()`).
- **Setup is measured but reported separately.** Module import, font registration, image
  decoding, and first render are recorded once per process as _cold-start cost_ — a metric in
  its own right (serverless!) — and never mixed into the steady-state numbers.
- **Identical encode settings** (quality 80) wherever the format takes a quality parameter.
- **Feature gaps are findings, not crashes.** Every adapter × scenario × format combination is
  preflighted; failures are recorded as `unsupported` and reported. A library that can't load
  on a runtime (e.g. native modules on Deno without `--allow-scripts`) is reported the same way.
- **Pinned versions** (Renovate keeps them fresh in grouped PRs whose benchmark impact is
  posted as a PR comment).

## Scenarios

| Scenario          | Exercises                                                | Paradigms   |
| ----------------- | -------------------------------------------------------- | ----------- |
| shapes            | rect/rounded-rect/circle fills, translucency, borders    | both        |
| gradients         | linear + radial gradients, full-bleed and clipped        | both        |
| text              | weights, sizes, centering, multi-line body copy          | both        |
| image-compositing | photo cover-scaling, overlay, circular avatar clip       | both        |
| og-card           | the realistic 1200×630 social-card workload              | both        |
| bezier-paths      | 240 cubic beziers + 80 arcs + dashed quadratics (seeded) | canvas only |

## Output validation

Two layers, by design:

1. **Per-library baselines (CI-failing).** Each library's PNG output is compared
   (pixelmatch) against its own committed baseline in `baselines/`. A dependency bump that
   changes rendering fails CI until the baseline is regenerated and the change reviewed.
   Threshold: 0.5% of pixels.
2. **Cross-library similarity (report-only).** Pairwise pixel diffs within each paradigm group.
   Rasterizers legitimately differ in antialiasing and font rendering, so this never fails CI —
   but a large divergence (like pureimage's radial-gradient limitation) is surfaced in the
   report and the diff-image gallery.

## Running locally

```sh
pnpm install
pnpm bench            # full mitata run  → results/<runtime>.json
pnpm bench:quick      # fast indicative run
pnpm validate         # render + compare against committed baselines
pnpm report           # aggregate results/*.json → results/RESULTS.md + site data
pnpm baselines:update # regenerate baselines (linux + node, review the diff!)
```

Checks (also run on every PR): `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` (oxlint +
oxfmt, tab-indented).

Same harness on other runtimes:

```sh
bun src/runner/bench.ts --quick
deno install --allow-scripts && deno run -A src/runner/bench.ts --quick
```

Useful flags: `--adapters napi-rs-canvas,takumi`, `--scenarios og-card`, `--out file.json`.

## CI

- **`bench.yml`** (push to main / manual): matrix over Node 22/24/26, Bun, and Deno on
  ubuntu-latest. Each job benchmarks, validates against baselines, and uploads artifacts; a
  report job aggregates everything into `RESULTS.md` (also the job summary) and site data; a
  deploy job publishes the dashboard to Cloudflare Workers (when `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` secrets are configured).
- **`pr-bench.yml`** (pull requests): benchmarks base and head on the same runner (quick mode)
  and posts a sticky comment with the diff. Two signals, kept separate:
  - **This PR (base → head, same runner).** Isolates the effect of the change. Quick-mode
    numbers are noisy, so the delta is computed on the **median** and only flagged 🚀/⚠️ when it
    clears both ±15% _and_ the benchmarks' own measured jitter — so unrelated PRs (dependency
    bumps that don't touch rendering) stop surfacing phantom regressions. Library version bumps
    and support changes are called out.
  - **Drift vs committed baseline** (advisory). Same-runner A/B only ever compares against the
    PR's immediate parent, so a small regression that merges becomes the new reference and hides;
    over many merges that drift compounds invisibly. Head is therefore also compared against
    `baselines/perf.json`, a fixed reference that only moves when it's deliberately re-blessed.
    Cross-run, so it uses a wider ±25% band. Omitted until the baseline is first generated.

  The comment updates in place on each push.

- **`perf-baseline.yml`** (manual `workflow_dispatch`): regenerates `baselines/perf.json` on a
  GitHub-hosted `ubuntu-latest` runner — the same hardware class the PR job compares against, so
  it can't be produced from a faster local machine — and opens a reviewable PR. Re-bless it when a
  performance shift is real and understood, exactly like regenerating the pixel baselines.

## Adding a library or scenario

- **Library:** implement the `Adapter` interface in `src/adapters/<name>.ts` (see
  `src/types.ts`), register it in `src/adapters/index.ts`, add the pinned dependency, run
  `pnpm baselines:update`, and add the package to the `candidate libraries` group in
  `.github/renovate.json`.
- **Scenario:** add `src/scenarios/<name>.ts` exporting a `Scenario` with `drawCanvas` and/or
  `element`, register it in `src/scenarios/index.ts`, and regenerate baselines. Keep both
  implementations visually equivalent and avoid APIs outside the `Canvas2D` surface in
  `src/types.ts`.

## License

Benchmark code: MIT. Inter font: SIL OFL 1.1 (see `assets/fonts/LICENSE.txt`).
Sample images are generated deterministically by `scripts/generate-assets.ts`.
