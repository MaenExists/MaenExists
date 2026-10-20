/**
 * Content Management Engine for /write
 * - Manages Blog Posts & Site Content (About, Home)
 * - Strict Date Enforcement: blogs keep original publishedAt forever on edits
 * - Supports Local Disk (in Node dev) and GitHub REST API (in Cloudflare Pages / remote)
 */

export interface BlogItem {
  id: string; // file path relative to contents/blog
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO string or YYYY-MM-DD
  updatedAt?: string;
  draft: boolean;
  tags: string[];
  body: string;
}

export interface SiteItem {
  id: "about" | "home";
  title: string;
  tagline?: string;
  description: string;
  body: string;
}

export interface ContentEnv {
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string; // e.g. "MaenExists/MaenExists"
  GITHUB_BRANCH?: string; // e.g. "main"
  [key: string]: any;
}

export const BLOG_TEMPLATE = `## Overview

<!-- What are you building or exploring? -->

## The Build & Technical Breakdown

<!-- Code snippets, architecture, or problems encountered -->

## Honest Reflection & Takeaway

<!-- What worked, what failed, and what's next -->
`;

/**
 * Parses simple YAML frontmatter and markdown body
 */
export function parseFrontmatter(raw: string): { frontmatter: Record<string, any>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const yamlBlock = match[1];
  const body = match[2];
  const frontmatter: Record<string, any> = {};

  const lines = yamlBlock.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();

    // Parse strings with quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
      frontmatter[key] = val;
    } else if (val === "true") {
      frontmatter[key] = true;
    } else if (val === "false") {
      frontmatter[key] = false;
    } else if (val.startsWith("[") && val.endsWith("]")) {
      // Parse simple array: [tag1, tag2]
      const items = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      frontmatter[key] = items;
    } else {
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

/**
 * Formats frontmatter and body into valid markdown
 */
export function stringifyFrontmatter(frontmatter: Record<string, any>, body: string): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      const formatted = value.map((v) => JSON.stringify(v)).join(", ");
      lines.push(`${key}: [${formatted}]`);
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "string") {
      // Check if it's already a clean date YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        lines.push(`${key}: ${value}`);
      } else {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(body.trimEnd());
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate a clean URL-friendly slug
 */
export function toSlug(val: string): string {
  return val
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Check if running in Node environment with filesystem access
 */
function hasNodeFs(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

// ==========================================
// GitHub API Storage Provider
// ==========================================

async function fetchFromGitHub(path: string, env: ContentEnv): Promise<{ content: string; sha?: string } | null> {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || "MaenExists/MaenExists";
  const branch = env.GITHUB_BRANCH || "main";

  if (!token) return null;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "MaenStudio-BlogWriter",
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`GitHub API error ${res.status}:`, await res.text());
      return null;
    }

    const data: any = await res.json();
    if (!data.content) return null;

    // Decode base64
    const decoded = atob(data.content.replace(/\s/g, ""));
    // Handle UTF-8
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    const content = new TextDecoder().decode(bytes);

    return { content, sha: data.sha };
  } catch (err) {
    console.error("GitHub fetch error:", err);
    return null;
  }
}

async function commitToGitHub(
  path: string,
  content: string,
  message: string,
  env: ContentEnv,
  existingSha?: string
): Promise<{ ok: boolean; error?: string }> {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || "MaenExists/MaenExists";
  const branch = env.GITHUB_BRANCH || "main";

  if (!token) {
    return { ok: false, error: "GITHUB_TOKEN is missing in environment variables." };
  }

  try {
    // If sha wasn't passed, check if file exists to get sha
    let sha = existingSha;
    if (!sha) {
      const existing = await fetchFromGitHub(path, env);
      if (existing) {
        sha = existing.sha;
      }
    }

    // UTF-8 base64 encoding
    const utf8Bytes = new TextEncoder().encode(content);
    let binary = "";
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    const base64Content = btoa(binary);

    const body: Record<string, any> = {
      message,
      content: base64Content,
      branch,
    };
    if (sha) {
      body.sha = sha;
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "MaenStudio-BlogWriter",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `GitHub commit failed (${res.status}): ${errText}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to commit to GitHub" };
  }
}

// ==========================================
// Local FS Operations
// ==========================================

async function readLocalFile(relPath: string): Promise<string | null> {
  if (!hasNodeFs()) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const fullPath = path.join(process.cwd(), relPath);
    return await readFile(fullPath, "utf-8");
  } catch {
    return null;
  }
}

async function writeLocalFile(relPath: string, content: string): Promise<boolean> {
  if (!hasNodeFs()) return false;
  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const fullPath = path.join(process.cwd(), relPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return true;
  } catch (err) {
    console.error("Local write error:", err);
    return false;
  }
}

async function listLocalBlogFiles(): Promise<string[]> {
  if (!hasNodeFs()) return [];
  try {
    const { readdir, stat } = await import("node:fs/promises");
    const path = await import("node:path");
    const blogDir = path.join(process.cwd(), "contents", "blog");

    async function walk(dir: string, base: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        if (entry.name === "templates" || entry.name.startsWith(".")) continue;
        const res = path.resolve(dir, entry.name);
        const rel = path.relative(blogDir, res);
        if (entry.isDirectory()) {
          files.push(...(await walk(res, base)));
        } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "Welcome.md") {
          files.push(rel);
        }
      }
      return files;
    }

    return await walk(blogDir, blogDir);
  } catch {
    return [];
  }
}

// ==========================================
// Public Content API Functions
// ==========================================

/**
 * List all available content items (Blogs and Site Pages)
 */
export async function listAllContent(env: ContentEnv): Promise<{ blogs: BlogItem[]; site: string[] }> {
  const blogs: BlogItem[] = [];

  // Try local FS first
  const localFiles = await listLocalBlogFiles();

  for (const file of localFiles) {
    const raw = await readLocalFile(`contents/blog/${file}`);
    if (raw) {
      const { frontmatter, body } = parseFrontmatter(raw);
      const cleanId = file.replace(/\/index\.md$/, "").replace(/\.md$/, "");
      const baseSlug = cleanId.split("/").pop() || cleanId;
      const slug = toSlug(baseSlug);

      blogs.push({
        id: file,
        slug,
        title: frontmatter.title || "Untitled",
        description: frontmatter.description || "",
        publishedAt: frontmatter.publishedAt ? String(frontmatter.publishedAt).slice(0, 10) : "",
        updatedAt: frontmatter.updatedAt ? String(frontmatter.updatedAt).slice(0, 10) : undefined,
        draft: Boolean(frontmatter.draft),
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        body,
      });
    }
  }

  // Sort by date descending
  blogs.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());

  return {
    blogs,
    site: ["about", "home"],
  };
}

/**
 * Get a single blog post by slug
 */
export async function getBlogPost(slug: string, env: ContentEnv): Promise<BlogItem | null> {
  const cleanSlug = toSlug(slug);

  // Possible paths to check
  const candidates = [
    `contents/blog/${cleanSlug}.md`,
    `contents/blog/${cleanSlug}/index.md`,
    `contents/blog/posts/${cleanSlug}.md`,
  ];

  let raw: string | null = null;
  let foundPath: string | null = null;

  // Check local fs
  for (const p of candidates) {
    raw = await readLocalFile(p);
    if (raw) {
      foundPath = p;
      break;
    }
  }

  // If not on local fs, check GitHub
  if (!raw && env.GITHUB_TOKEN) {
    for (const p of candidates) {
      const gh = await fetchFromGitHub(p, env);
      if (gh) {
        raw = gh.content;
        foundPath = p;
        break;
      }
    }
  }

  if (!raw || !foundPath) return null;

  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    id: foundPath.replace(/^contents\/blog\//, ""),
    slug: cleanSlug,
    title: frontmatter.title || "Untitled",
    description: frontmatter.description || "",
    publishedAt: frontmatter.publishedAt ? String(frontmatter.publishedAt).slice(0, 10) : "",
    updatedAt: frontmatter.updatedAt ? String(frontmatter.updatedAt).slice(0, 10) : undefined,
    draft: Boolean(frontmatter.draft),
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    body,
  };
}

/**
 * Get site page content ("about" or "home")
 */
export async function getSiteContent(id: "about" | "home", env: ContentEnv): Promise<SiteItem | null> {
  const relPath = `contents/site/${id}.md`;
  let raw = await readLocalFile(relPath);

  if (!raw && env.GITHUB_TOKEN) {
    const gh = await fetchFromGitHub(relPath, env);
    if (gh) raw = gh.content;
  }

  if (!raw) return null;

  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    id,
    title: frontmatter.title || (id === "about" ? "About Me" : "MaenExists"),
    tagline: frontmatter.tagline,
    description: frontmatter.description || "",
    body,
  };
}

/**
 * Save Blog Post
 * STRICT RULE: "blogs should come with the date it is wrote on (no date changes for updating or editing the contents )"
 */
export async function saveBlogPost(
  item: {
    slug: string;
    title: string;
    description: string;
    draft: boolean;
    tags: string[];
    body: string;
    id?: string;
  },
  env: ContentEnv
): Promise<{ ok: boolean; slug: string; error?: string; publishedAt: string; persistedVia: string[] }> {
  const cleanSlug = toSlug(item.slug || item.title);
  if (!cleanSlug) {
    return { ok: false, slug: "", error: "A valid title or slug is required.", publishedAt: "", persistedVia: [] };
  }

  // Check if post already exists to preserve publishedAt date
  const existingPost = await getBlogPost(cleanSlug, env);

  const today = new Date().toISOString().slice(0, 10);
  let publishedAt: string;
  let updatedAt: string | undefined = undefined;

  if (existingPost && existingPost.publishedAt) {
    // PRESERVE ORIGINAL DATE! DO NOT OVERWRITE!
    publishedAt = existingPost.publishedAt;
    updatedAt = today;
  } else {
    // New blog post - set to current date
    publishedAt = today;
  }

  const frontmatter: Record<string, any> = {
    title: item.title.trim() || "Untitled",
    description: item.description.trim(),
    publishedAt,
    draft: Boolean(item.draft),
    tags: Array.isArray(item.tags) ? item.tags.map((t) => t.trim()).filter(Boolean) : [],
  };

  if (updatedAt && updatedAt !== publishedAt) {
    frontmatter.updatedAt = updatedAt;
  }

  const fileContent = stringifyFrontmatter(frontmatter, item.body);

  // File path preference: preserve existing file structure if it was in /index.md, otherwise flat .md
  let targetRelPath = `contents/blog/${cleanSlug}.md`;
  if (existingPost?.id) {
    targetRelPath = `contents/blog/${existingPost.id}`;
  }

  const persistedVia: string[] = [];

  // 1. Write to local disk if in Node environment
  if (hasNodeFs()) {
    const success = await writeLocalFile(targetRelPath, fileContent);
    if (success) {
      persistedVia.push("local-disk");
    }
  }

  // 2. Commit to GitHub if GITHUB_TOKEN is available
  if (env.GITHUB_TOKEN) {
    const action = existingPost ? "Update" : "Publish";
    const commitMsg = `${action} blog: ${frontmatter.title} [skip ci]`;
    const ghRes = await commitToGitHub(targetRelPath, fileContent, commitMsg, env);
    if (ghRes.ok) {
      persistedVia.push("github-commit");
    } else if (persistedVia.length === 0) {
      return {
        ok: false,
        slug: cleanSlug,
        error: ghRes.error || "Failed to commit to GitHub",
        publishedAt,
        persistedVia,
      };
    }
  }

  if (persistedVia.length === 0) {
    return {
      ok: false,
      slug: cleanSlug,
      error: "Unable to persist content: local disk not writable and GITHUB_TOKEN not configured.",
      publishedAt,
      persistedVia,
    };
  }

  return { ok: true, slug: cleanSlug, publishedAt, persistedVia };
}

/**
 * Save Site Page ("about" or "home")
 */
export async function saveSiteContent(
  item: {
    id: "about" | "home";
    title: string;
    tagline?: string;
    description: string;
    body: string;
  },
  env: ContentEnv
): Promise<{ ok: boolean; error?: string; persistedVia: string[] }> {
  const targetRelPath = `contents/site/${item.id}.md`;

  const frontmatter: Record<string, any> = {
    title: item.title.trim(),
  };

  if (item.id === "home" && item.tagline) {
    frontmatter.tagline = item.tagline.trim();
  }

  frontmatter.description = item.description.trim();

  const fileContent = stringifyFrontmatter(frontmatter, item.body);
  const persistedVia: string[] = [];

  if (hasNodeFs()) {
    const success = await writeLocalFile(targetRelPath, fileContent);
    if (success) persistedVia.push("local-disk");
  }

  if (env.GITHUB_TOKEN) {
    const commitMsg = `Update site content: ${item.id} page`;
    const ghRes = await commitToGitHub(targetRelPath, fileContent, commitMsg, env);
    if (ghRes.ok) {
      persistedVia.push("github-commit");
    } else if (persistedVia.length === 0) {
      return { ok: false, error: ghRes.error || "Failed to commit to GitHub", persistedVia };
    }
  }

  if (persistedVia.length === 0) {
    return {
      ok: false,
      error: "Unable to persist content: local disk not writable and GITHUB_TOKEN not configured.",
      persistedVia,
    };
  }

  return { ok: true, persistedVia };
}
