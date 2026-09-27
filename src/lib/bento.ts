/** Bento: the mailing tool. Every outbound email this site triggers goes through here. */

export interface BentoEnv { BENTO_PUBLISHABLE_KEY: string; BENTO_SECRET_KEY: string; BENTO_SITE_UUID: string }

const BASE = 'https://app.bentonow.com/api/v1';

export interface BentoClient {
  /** POST to a batch endpoint. Throws on a non-2xx so callers can't mistake a rejection for success. */
  post(path: 'batch/subscribers' | 'batch/events', body: unknown): Promise<void>;
}

export function bentoClient(env: BentoEnv, fetchImpl: typeof fetch): BentoClient {
  const headers = {
    'Authorization': 'Basic ' + btoa(`${env.BENTO_PUBLISHABLE_KEY}:${env.BENTO_SECRET_KEY}`),
    'User-Agent': 'netrelish-site/1.0',
    'Content-Type': 'application/json',
  };
  return {
    async post(path, body) {
      const res = await fetchImpl(`${BASE}/${path}?site_uuid=${encodeURIComponent(env.BENTO_SITE_UUID)}`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`bento ${path} ${res.status}`);
    },
  };
}
