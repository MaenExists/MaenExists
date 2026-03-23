# Repo safety

This project is structured so daily writing stays simple while the codebase stays open source.

## Normal publishing

For most posts, you only need to touch:

- `contents/blog/<post-slug>/index.md`

Optional identity updates live in:

- `contents/site/home.md`
- `contents/site/about.md`

## Recommended GitHub settings

If you create the GitHub repository as `MaenExists`, use these settings:

1. Set the default branch to `main`.
2. Connect Cloudflare Pages to `main`.
3. Enable branch protection for `main`.
4. Require pull requests for non-content changes.
5. Require the `Validate` workflow to pass before merge.

## Safe working model

Use this mental split:

- posts are content
- everything else is infrastructure

That makes it easy to publish quickly without accidentally rewriting the site shell.

## Suggested branch strategy

- `main` for production-ready content
- short feature branches for design or tooling changes

For everyday writing, direct commits to `main` are fine if you are only editing Markdown posts.
