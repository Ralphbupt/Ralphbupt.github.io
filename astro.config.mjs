// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build
export default defineConfig({
  site: 'https://blog.liko.page',
  trailingSlash: 'always',
  // Astro 7's default compression strips whitespace between inline tags
  // (e.g. "Built with <a>Astro</a>" renders as "withAstro"). Keep it as-is.
  compressHTML: false,
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      // Code blocks are always rendered on a dark surface, light or dark page.
      theme: 'github-dark',
      wrap: false,
    },
  },
});
