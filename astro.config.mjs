// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build
export default defineConfig({
  site: 'https://ralphbupt.github.io',
  trailingSlash: 'always',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      // Code blocks are always rendered on a dark surface, light or dark page.
      theme: 'github-dark',
      wrap: false,
    },
  },
});
