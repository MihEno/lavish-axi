import { execFile } from "node:child_process";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const projectRoot = "/Users/kunchen/.no-mistakes/worktrees/ea3c5e639a16/01M0233JW80SG4FSTYJ1BCRR4F";
const { parse } = await import(pathToFileURL(path.join(projectRoot, "node_modules/parse5/dist/index.js")).href);
const esbuild = await import(pathToFileURL(path.join(projectRoot, "node_modules/esbuild/lib/main.js")).href);

const execFileAsync = promisify(execFile);
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function resultFromDump(html) {
  const document = parse(html);
  const stack = [document];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeName === "body") {
      const attribute = node.attrs.find((item) => item.name === "data-result");
      if (attribute) return JSON.parse(attribute.value);
    }
    if ("childNodes" in node) stack.push(...node.childNodes);
  }
  return null;
}

await access(chrome);
const root = path.join(os.tmpdir(), `lavish-linebreak-evidence-${process.pid}`);
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });

try {
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
    <title>Mermaid label line-break evidence</title>
    <link rel="stylesheet" href="/fixture.css">
    <style>
      body { margin: 24px; font-family: ui-sans-serif, system-ui, sans-serif; background: #14120e; color: #f4efe4; }
      h2 { font-size: 22px; margin: 0 0 8px; }
      h3 { font-size: 16px; margin: 0 0 12px; }
      .note { color: #c9c0ae; margin: 0 0 20px; max-width: 920px; }
      .panel { background: #1d1a14; border: 1px solid #3a3428; border-radius: 12px; padding: 16px; margin: 0 0 20px; }
      .panel.before h3 { color: #d96c4f; }
      .panel.after h3 { color: #8fad7a; }
      canvas { display: block; width: 100%; background: #fffaf3; border-radius: 8px; }
      ul { margin: 12px 0 0; padding-left: 18px; font-family: ui-monospace, monospace; font-size: 13px; }
      .pass { color: #8fad7a; }
      .fail { color: #d96c4f; }
      .ok { color: #c9c0ae; }
    </style>
  </head>
  <body>
    <script src="/fixture.js"></script>
  </body>
</html>`,
  );

  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
      const file = path.resolve(root, relative);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error("outside fixture root");
      const body = await readFile(file);
      response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const port = address.port;
    const profile = path.join(root, "chrome-profile");
    const screenshot = path.join(evidenceDir, "mermaid-excalidraw-linebreaks.png");
    const dump = await execFileAsync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        `--user-data-dir=${profile}`,
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=25000",
        "--dump-dom",
        `http://127.0.0.1:${port}/`,
      ],
      { maxBuffer: 16 * 1024 * 1024, timeout: 90_000 },
    );
    const result = resultFromDump(dump.stdout);
    await writeFile(path.join(evidenceDir, "conversion-result.json"), `${JSON.stringify(result, null, 2)}\n`);
    await execFileAsync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        `--user-data-dir=${profile}`,
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=25000",
        "--window-size=1400,1600",
        `--screenshot=${screenshot}`,
        `http://127.0.0.1:${port}/`,
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 90_000 },
    );
    if (!result?.pass) {
      console.error("EVIDENCE_FAIL");
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
    } else {
      console.log("EVIDENCE_PASS");
      console.log(JSON.stringify({ screenshot, reported: result.reported, br: result.br, nl: result.nl }, null, 2));
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
