// ============================================================================
// build.mjs — static "build" for GitHub Pages with cache-busting.
//
// The game ships as raw ES modules (no bundler). Browsers cache each module by
// URL, and because modules import each other with STATIC relative paths
// (`import { COLORS } from '../config.js'`), versioning only the entry point
// leaves every nested import cached. So we stamp a single build version onto
// EVERY relative `.js` import in every file, plus the module <script> in
// index.html. Same version across the whole deploy → each file is fetched fresh
// exactly once per release, then reused within the page.
//
// Source files are never modified; output goes to ./_site.
//
//   node scripts/build.mjs            # version = UTC timestamp
//   BUILD_VERSION=abc123 node ...     # explicit version (CI passes one)
// ============================================================================

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');

// Version: explicit env wins; otherwise a compact UTC timestamp (YYYYMMDDHHMMSS).
const VERSION =
  process.env.BUILD_VERSION ||
  new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

// Append ?v=VERSION to relative ".js" specifiers only (leaves CDN/absolute URLs
// and anything already carrying a query string alone).
function bustJs(code) {
  // static:  `from './x.js'`  and side-effect `import './x.js'`
  code = code.replace(
    /(\bfrom\s+|\bimport\s+)(['"])(\.\.?\/[^'"?]+?\.js)(['"])/g,
    (_m, kw, q1, spec, q2) => `${kw}${q1}${spec}?v=${VERSION}${q2}`,
  );
  // dynamic:  `import('./x.js')`
  code = code.replace(
    /(\bimport\s*\(\s*)(['"])(\.\.?\/[^'"?]+?\.js)(['"])(\s*\))/g,
    (_m, pre, q1, spec, q2, post) => `${pre}${q1}${spec}?v=${VERSION}${q2}${post}`,
  );
  return code;
}

// Append ?v=VERSION to relative module scripts in index.html (skips the https
// CDN <script>, which our relative-only regex never matches).
function bustHtml(html) {
  return html.replace(
    /(\ssrc=)(['"])(\.\.?\/[^'"?]+?\.js)(['"])/g,
    (_m, attr, q1, spec, q2) => `${attr}${q1}${spec}?v=${VERSION}${q2}`,
  );
}

async function copyDir(srcDir, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  for (const entry of await fs.readdir(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(outDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else if (entry.name.endsWith('.js')) {
      await fs.writeFile(to, bustJs(await fs.readFile(from, 'utf8')));
    } else {
      await fs.copyFile(from, to); // any future non-JS assets pass through
    }
  }
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  // index.html (transformed) + src/ (transformed)
  await fs.writeFile(
    path.join(OUT, 'index.html'),
    bustHtml(await fs.readFile(path.join(ROOT, 'index.html'), 'utf8')),
  );
  await copyDir(path.join(ROOT, 'src'), path.join(OUT, 'src'));

  // Tell GitHub Pages not to run Jekyll over the output.
  await fs.writeFile(path.join(OUT, '.nojekyll'), '');

  console.log(`Built _site with cache-buster v=${VERSION}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
