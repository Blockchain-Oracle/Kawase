// Serves the web build: static files from dist/client, everything else through Expo's server handler
// (prerendered routes and, later, API routes). Run after `npx expo export --platform web`.
// CommonJS because expo-server's ESM build has extensionless imports that Node cannot resolve unbundled.
const { createReadStream, existsSync, statSync } = require("node:fs");
const { createServer } = require("node:http");
const { extname, join, normalize, sep } = require("node:path");
const { createRequestHandler } = require("expo-server/adapter/http");

const root = join(__dirname, "..", "dist");
const client = join(root, "client");
const port = Number(process.env.PORT ?? "3000");
const handler = createRequestHandler({ build: join(root, "server") });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
};
// Hashed bundles under _expo/ never change; everything else may.
const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=60";

function staticFile(pathname) {
  const target = normalize(join(client, decodeURIComponent(pathname)));
  if (!target.startsWith(client + sep)) return undefined;
  if (!existsSync(target) || !statSync(target).isFile()) return undefined;
  return target;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const file = staticFile(url.pathname);
  if (file) {
    res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
    res.setHeader("cache-control", url.pathname.startsWith("/_expo/") ? IMMUTABLE : SHORT);
    createReadStream(file).pipe(res);
    return;
  }
  handler(req, res, (error) => {
    res.statusCode = error ? 500 : 404;
    res.end(error ? "error" : "not found");
  });
});

server.listen(port, "::", () => console.log(`web listening on ${port}`));
