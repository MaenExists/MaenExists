import type { CollectionEntry } from "astro:content";

type BlogEntry = CollectionEntry<"blog">;

export const isPublishedPost = (entry: BlogEntry) =>
  !entry.data.draft && entry.data.publishedAt.getTime() <= Date.now();

export const sortPosts = (entries: BlogEntry[]) =>
  [...entries].sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());

export const getPostSlug = (entry: BlogEntry) => entry.id.replace(/\/index$/, "");

export const formatPostDate = (value: Date) =>
  new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);

export const getReadingTime = (source: string) => {
  const words = source.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 220));

  return `${minutes} min read`;
};
