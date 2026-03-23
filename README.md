# MaenExists

MaenExists is a personal blog built with Astro, Markdown, Cloudflare Pages, and plain CSS.

The interface follows a strict rule set:

- one column
- one accent color
- dark mode by default
- no shadows, gradients, or glass
- spacing and typography do the work

## Stack

- Astro
- Markdown content collections
- Plain CSS
- Cloudflare Pages

## Local development

```bash
npm install
npm run dev
```

## Daily writing flow

Create a new post draft:

```bash
npm run new:post -- "Your post title"
```

That command creates a new folder at `contents/blog/<your-post-slug>/` with an `index.md` draft inside it. Write the post, then publish with:

```bash
git add .
git commit -m "Publish your post"
git push
```

## What you usually edit

If you are using this as your own writing system, the main files you touch are:

- `contents/blog/<your-post-slug>/index.md` for posts
- `contents/blog/<your-post-slug>/` for post images and assets
- `contents/site/home.md` for the homepage intro
- `contents/site/about.md` for the about page

Everything else is site infrastructure.

Images can live beside a post's `index.md` file and be referenced from Markdown with relative paths like `./cover.png`.

## Deploy to Cloudflare Pages

Use a GitHub or GitLab repo connected to Cloudflare Pages.

- Framework preset: `Astro`
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`

The site URL is configured as `https://maen.pages.dev` in `astro.config.mjs`.

## Open source use

This repo is intentionally easy to fork.

1. Clone the repo.
2. Update the files in `contents/site/`.
3. Replace the posts in `contents/blog/`.
4. Deploy your own copy.

The code is MIT licensed. Your writing can stay yours.

## Repo safety

Recommended GitHub setup for the live site:

1. Keep `main` as the production branch.
2. Require the `Validate` GitHub Action before merging.
3. Use pull requests for layout or tooling changes.
4. Edit files in `contents/` directly for normal publishing.

More detail lives in `docs/repo-safety.md`.
