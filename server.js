const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(".");
const ENABLE_DIR_LISTING = process.env.DIR_LISTING === "1"; // enable to see folders if no index.html
const SPA_FALLBACK = process.env.SPA_FALLBACK === "1";       // for React/Next/Vite SPAs

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/jpeg",
  ".webp": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "public, max-age=0",
    ...headers
  });
  res.end(body);
}

function listDir(dirPath, reqPath, res) {
  if (!ENABLE_DIR_LISTING) return send(res, 404, "Not found");
  fs.readdir(dirPath, { withFileTypes: true }, (err, items) => {
    if (err) return send(res, 500, "Directory read error");
    const links = items
      .map(d => {
        const slash = d.isDirectory() ? "/" : "";
        return `<li><a href="${path.posix.join(reqPath, d.name)}${slash}">${d.name}${slash}</a></li>`;
      })
      .join("");
    const html = `<!doctype html><meta charset="utf-8">
      <title>Index of ${reqPath}</title>
      <style>body{font:14px/1.5 system-ui, -apple-system, Segoe UI, Roboto; padding:20px} ul{padding-left:20px}</style>
      <h1>Index of ${reqPath}</h1><ul><li><a href="${path.posix.join(reqPath, "..")}">..</a></li>${links}</ul>`;
    send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
  });
}

function serveFile(filePath, res) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Try 404.html at root
      const custom404 = path.join(ROOT, "404.html");
      if (!err && stat && stat.isDirectory()) {
        // Directory without index will be handled by caller
        return send(res, 403, "Forbidden");
      }
      fs.stat(custom404, (e2, st2) => {
        if (!e2 && st2.isFile()) {
          fs.createReadStream(custom404).pipe(res);
        } else {
          send(res, 404, "Not found");
        }
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIMES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Content-Length": stat.size, "Cache-Control":"public, max-age=0" });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let reqPath = decodeURIComponent(parsed.pathname || "/");

  // Normalize to prevent traversal
  const normalized = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  let requested = path.join(ROOT, normalized);

  fs.stat(requested, (err, stat) => {
    if (!err && stat.isDirectory()) {
      // If directory: try index.html
      const indexFile = path.join(requested, "index.html");
      return fs.stat(indexFile, (e2, st2) => {
        if (!e2 && st2.isFile()) {
          return serveFile(indexFile, res);
        }
        // No index.html -> optional directory listing
        return listDir(requested, reqPath, res);
      });
    }

    if (!err && stat.isFile()) {
      return serveFile(requested, res);
    }

    // Not a file: SPA fallback?
    if (SPA_FALLBACK) {
      const spaIndex = path.join(ROOT, "index.html");
      return fs.stat(spaIndex, (e3, st3) => {
        if (!e3 && st3.isFile()) return serveFile(spaIndex, res);
        send(res, 404, "Not found");
      });
    }

    send(res, 404, "Not found");
  });
});

server.listen(PORT, () => {
  console.log(`✅ Serving root and all folders from ${ROOT}`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   Options: DIR_LISTING=1 SPA_FALLBACK=1`);
});
