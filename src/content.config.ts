import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Posts live as Markdown under src/content/posts/.
// `permalink` is the full URL path (minus host and trailing slash), which lets
// us reproduce the original Hexo URLs, e.g.
//   2024/07/07/Troubleshooting-a-UDP-Packet-Loss-Issue-on-Linux
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    description: z.string(),
    permalink: z.string(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
