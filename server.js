// Static server (ES module) with correct MIME types. Camera + ES modules + WASM
// require a secure context: http://localhost counts.
//
// Routing:
//   /app/...  -> the vanilla gesture app (repo-root files; prefix stripped)
//   /...      -> the built React landing (landing/dist), SPA-fallback to its
//                index.html. If the landing isn't built yet, root serves the
//                gesture app directly (handy in dev).
//
// Run:  node server.js   then open  http://localhost:8000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const LANDING = path.join(ROOT, 'landing', 'dist');
const hasLanding = fs.existsSync(path.join(LANDING, 'index.html'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

function sendFile(res, filePath, fallback) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (fallback) return sendFile(res, fallback, null);
      res.writeHead(404); return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const within = (base, p) => p.startsWith(base);

http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);

    // ---- gesture app under /app (serve repo-root files) ----
    if (urlPath === '/app' || urlPath === '/app/') urlPath = '/app/index.html';
    if (urlPath.startsWith('/app/')) {
      const rel = urlPath.slice('/app/'.length) || 'index.html';
      const filePath = path.join(ROOT, path.normalize(rel));
      if (!within(ROOT, filePath)) { res.writeHead(403); return res.end('Forbidden'); }
      return sendFile(res, filePath, null);
    }

    // ---- built landing at root (SPA) ----
    if (hasLanding) {
      const rel = urlPath === '/' ? 'index.html' : urlPath;
      const filePath = path.join(LANDING, path.normalize(rel));
      if (!within(LANDING, filePath)) { res.writeHead(403); return res.end('Forbidden'); }
      const isRoute = !path.extname(urlPath); // SPA fallback only for routes
      return sendFile(res, filePath, isRoute ? path.join(LANDING, 'index.html') : null);
    }

    // ---- dev fallback: gesture app at root ----
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!within(ROOT, filePath)) { res.writeHead(403); return res.end('Forbidden'); }
    return sendFile(res, filePath, null);
  } catch (e) { res.writeHead(500); res.end('Server error'); }
}).listen(PORT, () => {
  console.log(`\n  Digital Hammerr — running at http://localhost:${PORT}`);
  console.log(hasLanding
    ? '  Landing: /   ·   Visualizations: /app/?tab=forest|ocean|earth|energy\n'
    : '  (landing not built yet — root serves the gesture app; build with: cd landing && npm run build)\n');
});
