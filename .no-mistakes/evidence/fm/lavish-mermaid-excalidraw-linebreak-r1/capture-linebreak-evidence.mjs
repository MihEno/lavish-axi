import { execFile } from "node:child_process";
import { access, cp, mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const projectRoot = "/Users/kunchen/.no-mistakes/worktrees/ea3c5e639a16/01M021MTFJXEBPHWEWGE9SNSPZ";
const require = createRequire(path.join(projectRoot, "package.json"));
const esbuild = require("esbuild");

const execFileAsync = promisify(execFile);
const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(evidenceDir, "_bundle");
const chrome =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

await access(chrome);
await mkdir(root, { recursive: true });

await esbuild.build({
  absWorkingDir: projectRoot,
  entryPoints: [path.join(evidenceDir, "linebreak-evidence.browser.jsx")],
  outdir: root,
  entryNames: "fixture",
  assetNames: "assets/[name]-[hash]",
  bundle: true,
  format: "iife",
  platform: "browser",
  conditions: ["production"],
  nodePaths: [path.join(projectRoot, "node_modules")],
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.IS_PREACT": '"false"',
  },
  alias: {
    "lavish-whiteboard-core": path.join(projectRoot, "src/whiteboard-core.js"),
  },
});

await cp(
  path.join(projectRoot, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"),
  path.join(root, "whiteboard-assets/fonts"),
  { recursive: true },
);

await writeFile(
  path.join(root, "index.html"),
  `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Mermaid to Excalidraw line-break evidence</title>
    <link rel="stylesheet" href="/fixture.css">
  </head>
  <body>
    <script src="/fixture.js"></script>
    <script>
      const send = () => {
        const raw = document.body.dataset.result;
        if (!raw) return;
        const payload = JSON.parse(raw);
        const pngs = (window.__linebreakEvidence || []).map((item) => ({
          id: item.id,
          png: item.png,
        }));
        fetch("/result", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, pngs }),
        });
      };
      const watch = new MutationObserver(send);
      watch.observe(document.body, { attributes: true, attributeFilter: ["data-result"] });
      if (document.body.dataset.result) send();
    </script>
  </body>
</html>`,
);

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

const posted = Promise.withResolvers();
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/result") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      posted.resolve(body);
      return;
    }
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error("outside");
    const { readFile } = await import("node:fs/promises");
    const body = await readFile(file);
    response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const profile = path.join(root, "chrome-profile");
const screenshotPath = path.join(evidenceDir, "mermaid-excalidraw-linebreaks.png");

const chromeChild = execFile(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    `--user-data-dir=${profile}`,
    "--hide-scrollbars",
    "--window-size=1200,2200",
    `http://127.0.0.1:${port}/`,
  ],
  { timeout: 90_000 },
  () => {},
);

const timeout = setTimeout(() => posted.reject(new Error("timed out waiting for conversion result")), 80_000);

try {
  const result = await posted.promise;
  clearTimeout(timeout);
  const summary = {
    pass: result.pass,
    cases: result.cases,
  };
  await writeFile(path.join(evidenceDir, "conversion-result.json"), `${JSON.stringify(summary, null, 2)}\n`);
  for (const item of result.pngs || []) {
    const match = String(item.png || "").match(/^data:image\/png;base64,(.+)$/);
    if (!match) continue;
    await writeFile(path.join(evidenceDir, `converted-${item.id}.png`), Buffer.from(match[1], "base64"));
  }
  console.log(JSON.stringify(summary, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  chromeChild.kill("SIGTERM");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
