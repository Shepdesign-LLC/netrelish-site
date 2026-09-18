// --relish-* may appear only in selectors on the allowlist. Astro scopes component CSS with data-astro-cid-*,
// so we match on the class names we own.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOW = [
  /\.btn--primary/,                 // hero primary button (#8)
  /\.badge/,                        // count/status badge (#6) — mock windows only
  /\.jar--target|\.jar--on/,        // active jar tint (#3)
  /\.life\b/,                       // shelf-life bar (#5)
  /\.lip/,                          // active tab lip (#2)
  /\.jdrip|\.card__seal/,           // seal glyph + the one drip (#4)
  /:focus-visible/,                 // focus ring (#7)
];
const dir = 'dist/client/_astro';
const bad = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
  const css = readFileSync(join(dir, f), 'utf8');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, sel, body] = m;
    if (!/--relish-/.test(body)) continue;
    if (/:root/.test(sel)) continue; // tokens.css definitions (light, dark, data-theme)
    if (!ALLOW.some((re) => re.test(sel))) bad.push(`${f}: ${sel.trim()} { ${body.trim()} }`);
  }
}
if (bad.length) { console.error('relish audit: relish outside the allowlist:\n' + bad.join('\n')); process.exit(1); }
console.log('relish audit: clean');
