import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const title = process.argv.slice(2).join(" ").trim();

if (!title) {
  console.error('Usage: npm run new:post -- "Your post title"');
  process.exit(1);
}

const toSlug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const slug = toSlug(title);
const today = new Date().toISOString().slice(0, 10);
const postDir = path.join(process.cwd(), "contents", "blog", slug);
const filePath = path.join(postDir, "index.md");

const template = `---
title: ${title}
description: ""
publishedAt: ${today}
draft: true
tags: []
---
`;

await mkdir(postDir, { recursive: true });
await writeFile(filePath, template, { flag: "wx" });

console.log(`Created ${path.relative(process.cwd(), filePath)}`);
