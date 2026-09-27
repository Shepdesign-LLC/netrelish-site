/**
 * License keys are derived, not stored: HMAC(secret, subject) → Crockford base32, 5 groups of 5.
 * The subject is the Stripe object that paid for it (subscription or payment intent), so a redelivered
 * webhook produces the same key and there is nothing to deduplicate. Verification is the same function.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUPS = 5;
const GROUP = 5;

export type Licenser = (subject: string) => Promise<string>;

export function hmacLicenser(secret: string, prefix = 'NR'): Licenser {
  if (!secret) throw new Error('license: LICENSE_SECRET is empty');
  const keyP = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return async (subject) => {
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await keyP, new TextEncoder().encode(subject)));
    return `${prefix}-${base32(mac, GROUPS * GROUP).replace(/(.{5})(?=.)/g, '$1-')}`;
  };
}

function base32(bytes: Uint8Array, chars: number): string {
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === chars) break;
    acc &= (1 << bits) - 1;
  }
  return out;
}

export const LICENSE_KEY = /^[A-Z]{2,4}-([0-9A-HJKMNP-TV-Z]{5}-){4}[0-9A-HJKMNP-TV-Z]{5}$/;
