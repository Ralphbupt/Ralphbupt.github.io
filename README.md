# Link's Blog

Personal blog — real-time messaging systems, networking internals, Go, and
high-performance backends. Built with [Astro](https://astro.build) and deployed
to GitHub Pages.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run preview  # serve the built site locally
```

## Writing a post

Create a Markdown file under `src/content/posts/`. Front-matter:

```yaml
---
title: "Your Post Title"
date: 2025-01-15T10:00:00+08:00
permalink: "2025/01/15/Your-Post-Title"   # the URL path; keep the date-based shape
description: "One-sentence summary, shown in the list, <head>, and RSS."
tags:
  - Go
  - Networking
draft: false   # optional; true hides it from the build
---

## First Section

Body in Markdown. Use `##` for top-level sections (the title is the page `<h1>`).
```

- Images go in `public/images/...` and are referenced as `/images/...`.
- Fenced code blocks are syntax-highlighted (Shiki, `github-dark`).
- The URL is taken verbatim from `permalink`, which is how the original Hexo
  permalinks (`/2024/07/04/Title/`) are preserved.

## Deploy

Pushing to `main`/`master` triggers `.github/workflows/deploy.yml`, which builds
and publishes to GitHub Pages.

**One-time setup:** in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions** (not "Deploy from a branch"). The site URL and any custom
domain are configured via `site` in `astro.config.mjs`.
