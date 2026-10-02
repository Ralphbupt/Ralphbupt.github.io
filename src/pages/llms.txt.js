import { getCollection } from 'astro:content';

// llms.txt: a plain-text index of the blog for AI assistants (https://llmstxt.org).
export async function GET(context) {
  const posts = (await getCollection('posts', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );
  const day = (d) => d.toISOString().slice(0, 10);
  const lines = [
    "# Link's Blog",
    '',
    '> Technical writing by Link (liko), a backend engineer: real-time messaging systems, networking internals, Go, and high-performance backends.',
    '',
    '## Posts',
    '',
    ...posts.map(
      (p) =>
        `- [${p.data.title}](${new URL(`/${p.data.permalink}/`, context.site).href}) (${day(p.data.date)}): ${p.data.description}`
    ),
    '',
    '## About',
    '',
    `- [About](${new URL('/about/', context.site).href})`,
    '- [Homepage](https://liko.page/): all of the author\'s projects',
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
