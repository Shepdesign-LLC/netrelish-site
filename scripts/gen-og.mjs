// Renders public/og.png: the cog on --nr-bg with the headline. Run: npm run og
// Hexes are the sRGB fallbacks from design/tokens.css (--nr-bg, --nr-fg, --nr-fg-2).
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const cog = readFileSync('design/logo-cog.svg');
const W = 1200, H = 630;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#FCFCFB"/>
  <text x="300" y="300" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="64" fill="#1D1D1B">Keep the pages that matter.</text>
  <text x="300" y="360" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="28" fill="#66665F">A Mac browser with a pantry.</text>
</svg>`;
const cogPng = await sharp(cog).resize(160, 160).png().toBuffer();
const out = await sharp(Buffer.from(svg)).composite([{ input: cogPng, left: 100, top: 235 }]).png().toBuffer();
writeFileSync('public/og.png', out);
console.log('public/og.png', out.length, 'bytes');
