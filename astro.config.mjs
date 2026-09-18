import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://netrelish.com',
  output: 'static',
  adapter: vercel(),
  build: { inlineStylesheets: 'never' },
});
