import { defineConfig } from "astro/config";

function adminApiDevPlugin() {
  return {
    name: "admin-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/api/")) {
          try {
            const { handleApiRequest } = await import("./src/lib/admin-api.ts");
            const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
              if (value !== undefined) {
                headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
              }
            }

            let body = undefined;
            if (req.method !== "GET" && req.method !== "HEAD") {
              const chunks = [];
              for await (const chunk of req) {
                chunks.push(chunk);
              }
              body = Buffer.concat(chunks);
            }

            const webReq = new Request(url.toString(), {
              method: req.method,
              headers,
              body,
            });

            const webRes = await handleApiRequest(webReq, process.env);

            res.statusCode = webRes.status;
            webRes.headers.forEach((val, key) => {
              res.setHeader(key, val);
            });

            const buf = await webRes.arrayBuffer();
            res.end(Buffer.from(buf));
          } catch (err) {
            console.error("API Dev Middleware Error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Internal Server Error in Dev API" }));
          }
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  site: "https://maen.pages.dev",
  vite: {
    plugins: [adminApiDevPlugin()],
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark-default",
      wrap: true,
    },
  },
});
