/**
 * Admin API Router
 * Handles all /api/* requests for /write
 */

import {
  checkRateLimit,
  createClearSessionCookie,
  createSessionCookie,
  createSessionToken,
  getClientIp,
  getSessionFromCookie,
  recordFailedAttempt,
  resetAttempts,
  verifyCredentials,
  verifySessionToken,
  type AuthEnv,
} from "./admin-auth.ts";
import {
  BLOG_TEMPLATE,
  getBlogPost,
  getSiteContent,
  listAllContent,
  saveBlogPost,
  saveSiteContent,
  type ContentEnv,
} from "./admin-content.ts";

export type AdminEnv = AuthEnv & ContentEnv;

function json(data: any, init: number | ResponseInit = 200): Response {
  const options = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), {
    ...options,
    headers,
  });
}

/**
 * Main API Request Handler
 */
export async function handleApiRequest(request: Request, env: AdminEnv = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const isHttps = url.protocol === "https:";

  // CSRF protection for non-GET requests
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    const customHeader = request.headers.get("x-requested-with");
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (customHeader !== "MaenStudio") {
      // If no custom header, verify same-origin
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return json({ error: "CSRF check failed: Origin mismatch." }, 403);
          }
        } catch {
          return json({ error: "CSRF check failed: Invalid origin." }, 403);
        }
      }
    }
  }

  // ----------------------------------------------------
  // Auth Endpoints
  // ----------------------------------------------------

  // POST /api/auth/login
  if (path === "/api/auth/login" && method === "POST") {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return json(
        {
          error: `Too many failed login attempts. Access is temporarily locked. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds || 900),
          },
        }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request body." }, 400);
    }

    const { username, password } = body;
    if (!username || !password) {
      return json({ error: "Username and password are required." }, 400);
    }

    const verification = await verifyCredentials(username, password, env);

    if (!verification.ok) {
      recordFailedAttempt(ip);
      return json({ error: verification.reason || "Invalid credentials." }, 401);
    }

    resetAttempts(ip);

    // Create session token
    const token = await createSessionToken(username, env);
    const cookieHeader = createSessionCookie(token, isHttps);

    const headers = new Headers();
    headers.append("Set-Cookie", cookieHeader);

    return json({ ok: true, user: username }, { status: 200, headers });
  }

  // GET /api/auth/me
  if (path === "/api/auth/me" && method === "GET") {
    const token = getSessionFromCookie(request);
    if (!token) {
      return json({ authenticated: false }, 200);
    }

    const session = await verifySessionToken(token, env);
    if (!session.valid) {
      return json({ authenticated: false }, 200);
    }

    return json({ authenticated: true, user: session.user }, 200);
  }

  // POST /api/auth/logout
  if (path === "/api/auth/logout" && method === "POST") {
    const cookieHeader = createClearSessionCookie(isHttps);
    const headers = new Headers();
    headers.append("Set-Cookie", cookieHeader);
    return json({ ok: true }, { status: 200, headers });
  }

  // ----------------------------------------------------
  // Protected Content Endpoints (Require Valid Session)
  // ----------------------------------------------------

  const sessionToken = getSessionFromCookie(request);
  const session = sessionToken ? await verifySessionToken(sessionToken, env) : { valid: false };

  if (!session.valid) {
    return json({ error: "Unauthorized. Please log in to /write." }, 401);
  }

  // GET /api/content - list or get
  if (path === "/api/content" && method === "GET") {
    const type = url.searchParams.get("type");
    const slug = url.searchParams.get("slug");
    const id = url.searchParams.get("id");

    if (type === "blog" && slug) {
      const post = await getBlogPost(slug, env);
      if (!post) {
        return json({ error: `Blog post "${slug}" not found.` }, 404);
      }
      return json({ ok: true, item: post });
    }

    if (type === "site" && (id === "about" || id === "home")) {
      const siteItem = await getSiteContent(id, env);
      if (!siteItem) {
        return json({ error: `Site content "${id}" not found.` }, 404);
      }
      return json({ ok: true, item: siteItem });
    }

    if (type === "template") {
      return json({
        ok: true,
        template: {
          title: "",
          description: "",
          tags: [],
          draft: false,
          publishedAt: new Date().toISOString().slice(0, 10),
          body: BLOG_TEMPLATE,
        },
      });
    }

    // Default: list all content
    const contentList = await listAllContent(env);
    return json({ ok: true, ...contentList });
  }

  // POST /api/content - save / publish
  if (path === "/api/content" && method === "POST") {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const { type } = body;

    if (type === "blog") {
      const { slug, title, description, draft, tags, body: contentBody, id } = body;
      const res = await saveBlogPost(
        {
          slug,
          title,
          description: description || "",
          draft: Boolean(draft),
          tags: Array.isArray(tags) ? tags : [],
          body: contentBody || "",
          id,
        },
        env
      );

      if (!res.ok) {
        return json({ error: res.error || "Failed to save blog post." }, 500);
      }

      return json({
        ok: true,
        message: "Blog post saved successfully.",
        slug: res.slug,
        publishedAt: res.publishedAt,
        persistedVia: res.persistedVia,
      });
    }

    if (type === "site") {
      const { id, title, tagline, description, body: contentBody } = body;
      if (id !== "about" && id !== "home") {
        return json({ error: 'Site content id must be "about" or "home".' }, 400);
      }

      const res = await saveSiteContent(
        {
          id,
          title: title || "",
          tagline,
          description: description || "",
          body: contentBody || "",
        },
        env
      );

      if (!res.ok) {
        return json({ error: res.error || "Failed to save site content." }, 500);
      }

      return json({
        ok: true,
        message: `${id} page saved successfully.`,
        persistedVia: res.persistedVia,
      });
    }

    return json({ error: 'Invalid content type. Expected "blog" or "site".' }, 400);
  }

  return json({ error: `Not found: ${method} ${path}` }, 404);
}
