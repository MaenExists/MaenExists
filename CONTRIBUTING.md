# Contributing

Thanks for improving MaenExists.

## Scope

This repository is both:

- a working personal blog
- an open source starter others can learn from or fork

## If you are maintaining the personal site

For normal publishing, prefer changing only:

- `src/content/blog/*.md`
- `src/data/site.ts`

That keeps content work separate from layout and infrastructure changes.

## If you are contributing to the template

Please keep changes aligned with the design system:

- one accent color
- flat interface
- strong spacing
- minimal chrome
- Markdown-first publishing flow

## Before opening a pull request

Run:

```bash
npm run build
```

If you add tooling or structure, document the reason in the README.
