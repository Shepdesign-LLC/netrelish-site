import logo from '../../design/logo.svg?raw';
import cog from '../../design/logo-cog.svg?raw';
import symbols from '../../design/symbols.svg?raw';

const files = { logo, 'logo-cog': cog, symbols } as const;

/** A design SVG, byte-for-byte, inlined at build time. */
export function readDesignSvg(name: keyof typeof files): string {
  return files[name];
}
