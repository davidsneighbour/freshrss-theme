#!/usr/bin/env node

/**
 * Tailwind build + optional Stylelint runner
 *
 * Usage:
 *   node build.ts build
 *   node build.ts watch
 *   node build.ts build --no-lint
 *   node build.ts watch --no-lint
 */

import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';

type Mode = 'build' | 'watch';

interface Target {
  input: string;
  output: string;
}

interface Config {
  targets: Target[];
  content: string[];
  watch: string[];
}

interface RunOptions {
  allowFailure?: boolean;
}

const cliArgs = process.argv.slice(2);
const mode: Mode = cliArgs.includes('watch') ? 'watch' : 'build';
const lintEnabled = !cliArgs.includes('--no-lint');

const configPath = path.resolve(process.cwd(), 'theme.config.json');

let config: Config;

try {
  config = JSON.parse(readFileSync(configPath, 'utf-8')) as Config;
} catch (error: unknown) {
  console.error('Failed to read `theme.config.json`.');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
}

/**
 * Resolve a local binary from `node_modules/.bin`.
 *
 * @param binaryName Binary name without extension.
 * @returns Absolute path to the local binary.
 */
function getLocalBinary(binaryName: string): string {
  const extension = process.platform === 'win32' ? '.cmd' : '';
  return path.resolve(process.cwd(), 'node_modules', '.bin', `${binaryName}${extension}`);
}

/**
 * Self-hosted font files (latin subset, variable weight) copied from the
 * @fontsource-variable packages into `fonts/` so `src/css/fonts.css` can
 * reference them with a plain relative `url()`, no CDN involved.
 */
const FONT_FILES: string[] = [
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
];

/**
 * Copy the self-hosted font files this theme uses from `node_modules` into
 * `fonts/` at the repo root.
 */
function copyFonts(): void {
  const fontsDir = path.resolve(process.cwd(), 'fonts');
  mkdirSync(fontsDir, { recursive: true });

  for (const source of FONT_FILES) {
    const sourcePath = path.resolve(process.cwd(), source);
    const destPath = path.join(fontsDir, path.basename(source));
    copyFileSync(sourcePath, destPath);
  }

  console.log(`Copied ${FONT_FILES.length} font file(s) to ${path.relative(process.cwd(), fontsDir)}/`);
}

/**
 * Returns the CSS source files that should be linted and watched.
 *
 * This intentionally includes only the input source file(s), not the generated
 * Tailwind output files.
 *
 * @returns Array of CSS source paths for Stylelint.
 */
function getStylelintTargets(): string[] {
  return config.targets.map((target) => target.input);
}

/**
 * Spawn a child process and wait for completion.
 *
 * @param command Command path.
 * @param args Command arguments.
 * @param options Runtime options.
 * @returns Promise that resolves on success, or also on failure if `allowFailure` is true.
 */
function run(command: string, args: string[], options: RunOptions = {}): Promise<void> {
  const { allowFailure = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error: Error) => {
      console.error(`Failed to start command: ${command}`);

      if (allowFailure) {
        console.error(error.message);
        resolve();
        return;
      }

      reject(error);
    });

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal !== null ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      const error = new Error(`${command} exited with ${reason}`);

      if (allowFailure) {
        console.error(error.message);
        resolve();
        return;
      }

      reject(error);
    });
  });
}

/**
 * Run Tailwind once for a single input/output target.
 *
 * The Tailwind CLI only accepts one input/output pair per process, so each
 * configured target needs its own invocation.
 *
 * @param target Input/output pair to compile.
 * @returns Promise that resolves when Tailwind exits successfully.
 */
async function runTailwindTarget(target: Target): Promise<void> {
  const args: string[] = ['-i', target.input, '-o', target.output];

  if (mode === 'watch') {
    args.push('--watch');
  }

  console.log(`Running Tailwind (${mode}) for ${target.input} -> ${target.output}...`);
  await run(getLocalBinary('tailwindcss'), args);
}

/**
 * Start Tailwind in build or watch mode for every configured target.
 *
 * In build mode, targets run one after another. In watch mode, each target's
 * `tailwindcss --watch` process is long-lived, so all targets run concurrently.
 *
 * @returns Promise that resolves when Tailwind exits successfully for all targets.
 */
async function runTailwind(): Promise<void> {
  if (mode === 'watch') {
    await Promise.all(config.targets.map((target) => runTailwindTarget(target)));
    return;
  }

  for (const target of config.targets) {
    await runTailwindTarget(target);
  }
}

/**
 * Run Stylelint once against source CSS inputs only.
 *
 * In watch mode, failures are logged and do not stop the watcher.
 *
 * @returns Promise that resolves when linting completes.
 */
async function runStylelint(): Promise<void> {
  if (!lintEnabled) {
    return;
  }

  const targets = getStylelintTargets();

  if (targets.length === 0) {
    console.log('No Stylelint input targets configured.');
    return;
  }

  const args: string[] = [...targets];

  // Auto-fix only in watch mode
  if (mode === 'watch') {
    args.push('--fix');
  }

  // Optional but recommended: speed up repeated runs
  args.push('--cache');

  console.log(`Running Stylelint on: ${targets.join(', ')}${mode === 'watch' ? ' (fix enabled)' : ''}`);

  await run(getLocalBinary('stylelint'), args, {
    allowFailure: mode === 'watch',
  });

}

let lintInProgress = false;
let lintQueued = false;

/**
 * Run Stylelint with simple queueing so overlapping file events do not spawn
 * multiple parallel lint processes.
 *
 * @returns Promise that resolves when the current queued lint cycle finishes.
 */
async function runStylelintQueued(): Promise<void> {
  if (!lintEnabled) {
    return;
  }

  if (lintInProgress) {
    lintQueued = true;
    return;
  }

  lintInProgress = true;

  try {
    await runStylelint();
  } finally {
    lintInProgress = false;

    if (lintQueued) {
      lintQueued = false;
      await runStylelintQueued();
    }
  }
}

/**
 * Start the CSS file watcher that re-runs Stylelint on source file changes.
 *
 * This intentionally watches only input CSS files, not the generated output CSS.
 *
 * @returns The active Chokidar watcher.
 */
function startStylelintWatcher(): FSWatcher {
  const watchPatterns = getStylelintTargets();

  const watcher = chokidar.watch(watchPatterns, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
  });

  watcher.on('add', (filePath: string) => {
    console.log(`CSS source file added: ${filePath}`);
    void runStylelintQueued();
  });

  watcher.on('change', (filePath: string) => {
    console.log(`CSS source file changed: ${filePath}`);
    void runStylelintQueued();
  });

  watcher.on('unlink', (filePath: string) => {
    console.log(`CSS source file removed: ${filePath}`);
    void runStylelintQueued();
  });

  /**
   * Logs unknown errors safely.
   *
   * @param error Unknown error value.
   */
  function logUnknownError(error: unknown): void {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
  }

  watcher.on('error', (error: unknown) => {
    console.error('Stylelint watcher error:');
    logUnknownError(error);
  });

  console.log(`Watching Stylelint source files: ${watchPatterns.join(', ')}`);

  return watcher;
}

/**
 * Main execution.
 *
 * @returns Promise that resolves when the selected mode completes.
 */
async function main(): Promise<void> {
  try {
    copyFonts();

    if (mode === 'build') {
      await runTailwind();
      await runStylelint();
      return;
    }

    await runStylelint();

    if (lintEnabled) {
      startStylelintWatcher();
    } else {
      console.log('Stylelint watcher disabled via `--no-lint`.');
    }

    await runTailwind();
  } catch (error: unknown) {
    console.error('Build failed');

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

void main();