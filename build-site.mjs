// Assemble a single static site for Vercel (Build Output API v3):
//   /        -> the React landing (landing/dist)
//   /app/... -> the vanilla gesture app (repo-root index.html + styles.css + src + optional offline assets)
// Output goes to .vercel/output/static so `vercel deploy --prebuilt` serves it
// directly, ignoring any dashboard build/root-directory settings.
import { existsSync, rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.join(root, '.vercel', 'output');
const staticDir = path.join(outRoot, 'static');

const landingDist = path.join(root, 'landing', 'dist');
if (!existsSync(path.join(landingDist, 'index.html'))) {
  console.error('ERROR: landing/dist is missing. Run:  npm --prefix landing run build');
  process.exit(1);
}

rmSync(staticDir, { recursive: true, force: true });
mkdirSync(staticDir, { recursive: true });

// 1) Landing -> static root
cpSync(landingDist, staticDir, { recursive: true });

// 2) Gesture app -> static/app
const appDir = path.join(staticDir, 'app');
mkdirSync(appDir, { recursive: true });
cpSync(path.join(root, 'index.html'), path.join(appDir, 'index.html'));
cpSync(path.join(root, 'styles.css'), path.join(appDir, 'styles.css'));
cpSync(path.join(root, 'src'), path.join(appDir, 'src'), { recursive: true });
// include self-hosted offline assets only if they exist (online build uses CDNs)
for (const d of ['vendor', 'models', 'textures']) {
  const p = path.join(root, d);
  if (existsSync(p)) cpSync(p, path.join(appDir, d), { recursive: true });
}

// 3) Build Output API config: serve real files first, then map /app/* to the
//    gesture app's index.html (so /app/?tab=forest resolves), correct .wasm MIME.
writeFileSync(
  path.join(outRoot, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: 'filesystem' },
        { src: '/app(?:/.*)?', dest: '/app/index.html' },
      ],
      overrides: {},
    },
    null,
    2,
  ),
);

console.log('Assembled .vercel/output/static  (/ = landing, /app = gesture app)');
