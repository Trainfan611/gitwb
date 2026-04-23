const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function proxyMpstats(req, res) {
  const reqUrl = new URL(req.url, "http://localhost");
  const targetPath = reqUrl.pathname.replace(/^\/api\/mpstats/, "") + reqUrl.search;
  const token = req.headers["x-mpstats-token"] || "";
  if (!token) {
    sendJson(res, 400, { error: "Missing X-Mpstats-TOKEN header" });
    return;
  }

  const options = {
    hostname: "mpstats.io",
    port: 443,
    path: targetPath,
    method: req.method,
    headers: {
      "X-Mpstats-TOKEN": token,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
      "User-Agent": "wb-seo-app/1.0",
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    // Remove hop-by-hop headers that cannot be forwarded.
    delete responseHeaders.connection;
    delete responseHeaders["transfer-encoding"];
    delete responseHeaders["keep-alive"];
    delete responseHeaders["proxy-authenticate"];
    delete responseHeaders["proxy-authorization"];
    delete responseHeaders.te;
    delete responseHeaders.trailer;
    delete responseHeaders.upgrade;

    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.setTimeout(15000, () => {
    proxyReq.destroy(new Error("MPStats request timeout"));
  });

  proxyReq.on("error", (error) => {
    sendJson(res, 502, { error: `MPStats proxy error: ${error.message}` });
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || "/", "http://localhost");

  if (reqUrl.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (reqUrl.pathname === "/api/mpstats/health") {
    sendJson(res, 200, { status: "ok", proxy: "mpstats" });
    return;
  }

  if (reqUrl.pathname.startsWith("/api/mpstats/")) {
    proxyMpstats(req, res);
    return;
  }

  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(ROOT, safePath);

  fs.stat(absolutePath, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, absolutePath);
      return;
    }

    // SPA/static fallback so root always opens the app.
    sendFile(res, path.join(ROOT, "index.html"));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`WB SEO app running on http://${HOST}:${PORT}`);
});
