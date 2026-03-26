#!/usr/bin/env node

/**
 * Tailwind build + optional Stylelint runner
 *
 * Usage:
 *   node scripts/build.ts build
 *   node scripts/build.ts watch
 *   node scripts/build.ts build --no-lint
 *   node scripts/build.ts watch --no-lint
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type Mode = 'build' | 'watch';

interface Config {
  input: string;
  output: string;
  content: string[];
  watch: string[];
}

const args = process.argv.slice(2);

const mode: Mode = args.includes('watch') ? 'watch' : 'build';
const lintEnabled = !args.includes('--no-lint');

const configPath = path.resolve(process.cwd(), 'theme.config.json');

let config: Config;

try {
  config = JSON.parse(readFileSync(configPath, 'utf-8')) as Config;
} catch (err) {
  console.error('Failed to read theme.config.json');
  console.error(err);
  process.exit(1);
}

/**
 * Spawn helper with proper error handling
 */
function run(cmd: string, cmdArgs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', (err) => {
      console.error(`Failed to start ${cmd}`);
      reject(err);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Tailwind build command
 */
async function runTailwind(): Promise<void> {
  const args = [
    '-i',
    config.input,
    '-o',
    config.output,
  ];

  if (mode === 'watch') {
    args.push('--watch');
  }

  console.log(`Running Tailwind (${mode})...`);
  await run('npx @tailwindcss/cli', args);
}

/**
 * Stylelint command
 */
async function runStylelint(): Promise<void> {
  if (!lintEnabled) {
    console.log('Stylelint disabled via --no-lint');
    return;
  }

  console.log('Running Stylelint...');
  await run('npx stylelint', ['"**/*.css"']);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    if (mode === 'build') {
      await runTailwind();
      await runStylelint();
    } else {
      // watch mode
      await Promise.all([
        runTailwind(),
        runStylelint(), // runs once, Tailwind keeps watching
      ]);
    }
  } catch (err) {
    console.error('Build failed');
    console.error(err);
    process.exit(1);
  }
}

main();
