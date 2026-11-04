// Bundles src/*.ts into dist/ and copies static/ alongside, so dist/ is the
// complete extension that web-ext runs, lints and packages.
//
//   node scripts/build.mjs           one-off build
//   node scripts/build.mjs --watch   rebuild on change (used by scripts/dev.sh)

import * as esbuild from "esbuild";
import { cp, rm, watch } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const watchMode = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const options = {
  absWorkingDir: root,
  entryPoints: ["src/background.ts", "src/content.ts", "src/popup.ts"],
  outdir: "dist",
  bundle: true,
  // Content scripts can't be ES modules; IIFE keeps every script self-contained.
  format: "iife",
  target: "firefox159",
  // Readable output: AMO reviewers diff it against the submitted source.
  minify: false,
  sourcemap: watchMode ? "inline" : false,
  logLevel: "info",
};

async function copyStatic() {
  await cp(`${root}static`, `${root}dist`, { recursive: true });
}

await rm(`${root}dist`, { recursive: true, force: true });
await copyStatic();

if (watchMode) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  for await (const _ of watch(`${root}static`, { recursive: true })) {
    await copyStatic();
  }
} else {
  await esbuild.build(options);
}
