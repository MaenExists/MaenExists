import { getCollection } from "astro:content";
import { getPostSlug, isPublishedPost, sortPosts } from "../lib/blog";
import { siteConfig } from "../data/site";

export async function GET() {
  const posts = sortPosts(await getCollection("blog", isPublishedPost));
  const pages = [
    "",
    "/about/",
    ...posts.map((post) => `/posts/${getPostSlug(post)}/`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (path) => `  <url>
    <loc>${new URL(path, siteConfig.url).toString()}</loc>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
