# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A custom FreshRSS theme ("DNB Theme") built with Tailwind CSS v4 and Stylelint. It is designed to live as a sibling checkout next to a local FreshRSS clone:

```text
freshrss/
  config/          # mounted into Docker as the FreshRSS config folder
  freshrss-theme/  # this repo, mounted into the container's themes directory
  FreshRSS/        # local clone of FreshRSS, used only as a Tailwind content-scan source (not mounted into Docker)
```

Tailwind's CLI can only scan files on the machine where it runs, so `theme.config.json` points its `content`/`watch` globs at both this repo's `src/` and the sibling `../FreshRSS/p` and `../FreshRSS/app` trees. This gives Tailwind visibility into FreshRSS's PHP/Twig templates without needing to inspect the running container.

## Commands

```bash
npm install          # install dependencies
npm run build:css    # one-shot Tailwind build + Stylelint (writes frss.css and base.css)
npm run build:css:nolint  # build without linting
npm run watch:css     # watch mode: lints src/css/{frss,base}.css on change (auto-fix), runs Tailwind --watch for both
npm run watch:css:nolint  # watch mode without the Stylelint watcher
npm run lint:css      # stylelint src/css/**/*.css only (never the compiled root output), --fix --cache
npm run help:css       # node build.ts --help
npm run typecheck      # tsc --noEmit against tsconfig.json (extends @dnbhq/tsconfig/cli)
npm run check           # biome check . (formatter + linter, shared @dnbhq/biome-config; excludes *.css and .vscode/ — Stylelint owns CSS here)
npm run check:fix       # biome check --write .
npm run lint            # biome lint .
npm run lint:markdown   # markdownlint-cli2 against **/*.{md,mdx}, shared @dnbhq/markdownlint-config (excludes CHANGELOG.md and scratch/)
```

`frss.css` and `base.css` at the repo root are build artifacts (gitignored) — run `npm run build:css` after cloning or pulling before the theme will work.

There is no test suite in this repo — validation is via `npm run build:css` (Tailwind compiles cleanly), `npm run lint:css` (Stylelint), `npm run typecheck`, `npm run check` (Biome), and `npm run lint:markdown`.

Release management uses `release-it` via `@dnbhq/release-config` (`npm run release`, config in `.release-it.ts`, uses defaults: no npm publish, `GITHUB_TOKEN_CONTENT_PRIVATE`): conventional-commits-based versioning, auto-generates `CHANGELOG.md`, tags, and creates a GitHub release. Also: `release:dry`, `release:force` (re-tag current version), `release:patch`/`release:minor`/`release:major` (force a specific bump). Do not run any of these unless the user explicitly asks to cut a release. Renovate is configured via `.github/renovate.json5` extending `github>dnbhq/renovate-config`.

Known pre-existing style debt, not fixed during shared-config onboarding since it wasn't requested: `build.ts`, `metadata.json`, `stylelint.config.mjs`, and `theme.config.json` don't yet match Biome's formatting (mostly quote style) — run `npm run format` to fix when convenient. `README.md` and this file's own H1 intentionally keep "Tailwind"/"Theme"/"CLAUDE.md" capitalized against markdownlint's `title-case-style` rule (proper nouns and a mandated filename heading, not oversights).

## Architecture

**Build pipeline (`build.ts`)** is a thin custom runner, not a bundler config:

* Reads `theme.config.json` for `targets` (an array of `{ input, output }` pairs) plus shared `content`/`watch` globs.
* For each target, shells out to the locally installed `tailwindcss` CLI binary (`node_modules/.bin/tailwindcss`) to compile the source CSS to its output path. The Tailwind CLI only takes one input/output pair per invocation, so `build.ts` runs one process per target — sequentially in build mode, concurrently (one long-lived `--watch` process each) in watch mode.
* Optionally shells out to `stylelint`, but **only ever lints the source files** (every target's `input`), never the generated outputs — see `getStylelintTargets()`.
* In watch mode, runs its own `chokidar` watcher over the Stylelint targets (separate from Tailwind's own `--watch`) so linting re-runs on source changes without blocking the Tailwind watchers; lint runs are queued (`runStylelintQueued`) so overlapping file events don't spawn parallel lint processes, and lint failures in watch mode are logged but don't kill the process (`allowFailure: mode === 'watch'`).
* Build mode fails hard (`process.exit(1)`) on any Tailwind or Stylelint error; watch mode does not.

**Source vs. generated files** — only files under `src/css/` are hand-authored. Never edit the generated/output files directly, edit the source and rebuild:

* `src/css/frss.css` → `frss.css` (mirrors FreshRSS's own default stylesheet)
* `src/css/base.css` → `base.css` (the custom theme layered on top)

Both root-level outputs are gitignored build artifacts. RTL is currently out of scope: `frss.rtl.css` and `base.rtl.css` are **not** produced by this pipeline — they're hand-maintained static files at the repo root, committed as-is, to be onboarded into the `src/`-based pipeline later.

**Styling approach**: `src/css/base.css` is a single Tailwind v4 entry file (`@import "tailwindcss"` + `@plugin "@tailwindcss/forms"`) followed by hand-written CSS targeting FreshRSS's own markup — its class/ID names come from FreshRSS itself (hence `selector-id-pattern`/`selector-class-pattern` are disabled in Stylelint) and are not something this repo controls. The file defines a large `:root` custom-property color palette first (themed color scales, e.g. `--color-darker-*`, `--color-dark-*`, each scale aliased under two names), then component-level overrides organized under `/* === COMPONENTS */` section-comment headers (Forms, Buttons, Navigation, Dropdown, Alerts, Pagination, Boxes, Tree, etc.) that mirror FreshRSS's UI regions. `src/css/frss.css` is FreshRSS's own stylesheet (its `--frss-*` custom properties and selectors are FreshRSS's naming, not this repo's), kept close to upstream so it stays diffable; the theme is a single deliberate dark palette (no `prefers-color-scheme`/light-mode branching).

**Content-detection safelist**: `src/tailwind-safelist.txt` lists class name fragments (e.g. `dropdown`, `btn`, `panel`, `tree`) that Tailwind's automatic class scanner might not reliably detect from FreshRSS's PHP/Twig templates; it's included in `theme.config.json`'s `content` globs to guarantee those utilities aren't purged.

**`metadata.json`** is FreshRSS's theme manifest (name, author, version, `theme-color`, and the `files` array telling FreshRSS which CSS files to load — currently `frss.css` and `base.css`).

**Typography**: Inter, used for everything (no separate heading font — this is an interface, not a publication), self-hosted via Fontsource (`@fontsource-variable/inter` — variable-weight, latin subset only, no Google Fonts/CDN dependency). `build.ts`'s `copyFonts()` step copies the specific `.woff2` file this theme uses from `node_modules` into `fonts/` at the repo root (also gitignored, like the compiled CSS). `src/css/fonts.css` declares the `@font-face` rule (`url()` path is root-relative, e.g. `fonts/inter-latin-wght-normal.woff2`, since Tailwind's CLI bundles `@import` without rebasing `url()` paths) and a Tailwind `@theme` block defining `--font-body`, which Tailwind turns into the `font-body` utility class, applied via `@apply` on `html, body` in `base.css` (headings inherit it — browsers don't set an explicit `font-family` on `h1`–`h6`). It's imported from the top of `src/css/base.css`.

## Assistant rules for this repo

* FreshRSS's PHP/Twig layout templates are out of reach — they live in the separate FreshRSS project, not here, and can't be adapted to fit the theme. All styling work happens in the CSS files in this repo.
* Prefer Tailwind utility classes over hand-written CSS declarations wherever an equivalent utility exists. Since the layout markup can't be changed, apply utilities via `@apply` inside the selectors targeting FreshRSS's existing classes/IDs, rather than writing raw property/value declarations.
* Use `scratch/` for temporary/working files. Never delete or modify a file in `scratch/` that you didn't create yourself — if you need your own working structure in there, create a new subfolder or file rather than touching existing contents.

## Stylelint conventions

Config extends `stylelint-config-standard` (`stylelint.config.mjs`). Notable deviations, each with a stated reason in the config itself:

* `no-duplicate-selectors`, `block-no-empty`, `selector-id-pattern`, `selector-class-pattern`, `custom-property-pattern`, `no-descending-specificity` are all disabled — these files target FreshRSS's existing DOM/selectors/custom-property names, which this repo doesn't control, intentionally contain empty rule blocks (placeholders for future overrides) and repeated selectors, and (for `frss.css`) intentionally mirror FreshRSS's own selector order rather than being reordered to satisfy specificity linting.
* `alpha-value-notation: 'number'`, `color-function-notation: 'modern'` are enforced.
* The Tailwind directives at the top of `src/css/base.css` are wrapped in `/* stylelint-disable */` / `/* stylelint-enable */` since Stylelint doesn't understand `@import "tailwindcss"` / `@plugin` syntax.
