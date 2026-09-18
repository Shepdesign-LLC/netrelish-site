// The built site may reference only these hosts. Anything else is a third-party request and fails.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set(['netrelish.com', 'www.netrelish.com', 'github.com', 'apps.apple.com', 'www.w3.org', 'c2pa.org']);
const root = 'dist/client'; // the Vercel adapter puts the static site here
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|css|js|svg|json|txt)$/.test(name)) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        if (!ALLOWED.has(m[1].toLowerCase())) hits.push(`${p}: ${m[0]}`);
      }
    }
  }
}
walk(root);
if (hits.length) { console.error('network rule: foreign hosts referenced:\n' + [...new Set(hits)].join('\n')); process.exit(1); }
console.log('network rule: only allowed hosts referenced');
