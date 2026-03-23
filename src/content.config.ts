import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  loader: glob({ base: "./contents/blog", pattern: "**/index.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(180),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string().min(1)).max(5).default([]),
  }),
});

const site = defineCollection({
  loader: glob({ base: "./contents/site", pattern: "*.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tagline: z.string().optional(),
  }),
});

export const collections = { blog, site };
