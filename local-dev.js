const http = require("http");
const fs = require("fs");
const path = require("path");
const beautyAdvisor = require("./api/beauty-advisor");

const root = __dirname;
const port = Number(process.env.PORT || 4175);

function loadEnvFile(file) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return;

  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const mime = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        request.destroy();
        reject(new Error("Request too large"));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function handleApi(request, response) {
  try {
    request.body = await parseJsonBody(request);
    await beautyAdvisor(request, response);
  } catch {
    send(response, 400, JSON.stringify({ error: "Invalid JSON" }), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
  }
}

function staticPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = cleanPath === "/" || cleanPath.endsWith("/")
    ? path.join(cleanPath, "index.html")
    : cleanPath;
  const fullPath = path.normalize(path.join(root, relativePath));
  return fullPath.startsWith(root) ? fullPath : "";
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/api/beauty-advisor") {
    handleApi(request, response);
    return;
  }

  const fullPath = staticPath(url.pathname);
  if (!fullPath || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  send(response, 200, fs.readFileSync(fullPath), {
    "Content-Type": mime[ext] || "application/octet-stream"
  });
});

server.listen(port, () => {
  const mode = process.env.OPENAI_API_KEY ? "OpenAI enabled" : "OpenAI fallback mode";
  console.log(`Lazoya local dev server: http://localhost:${port}/diagnostique/?reset=1 (${mode})`);
});
