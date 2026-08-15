import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = "/Users/kunchen/.no-mistakes/worktrees/ea3c5e639a16/01M0233JW80SG4FSTYJ1BCRR4F";
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const esbuild = await import(pathToFileURL(path.join(projectRoot, "node_modules/esbuild/lib/main.js")).href);
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = path.join(os.tmpdir(), `lavish-excalidraw-shot-${process.pid}`);

await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
try {
  await esbuild.build({
    absWorkingDir: projectRoot,
    entryPoints: [path.join(evidenceDir, "excalidraw-only.browser.jsx")],
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
    `<!doctype html><html><head><meta charset="utf-8"><title>Excalidraw linebreak evidence</title>
    <style>body{margin:24px;background:#14120e;color:#f4efe4;font-family:ui-sans-serif,system-ui,sans-serif}h1{font-size:20px}canvas{display:block;width:100%;background:#fffaf3;border-radius:10px}</style>
    </head><body><script src="/fixture.js"></script></body></html>`,
  );
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
      const file = path.resolve(root, relative);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error("outside");
      const body = await readFile(file);
      const type = file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".woff2")
            ? "font/woff2"
            : "text/html; charset=utf-8";
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const screenshot = path.join(evidenceDir, "excalidraw-reported-node.png");
  try {
    const child = execFile(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--hide-scrollbars",
        `--user-data-dir=${path.join(root, "chrome-profile")}`,
        "--window-size=1400,900",
        "--virtual-time-budget=12000",
        `--screenshot=${screenshot}`,
        `http://127.0.0.1:${port}/`,
      ],
      { timeout: 20_000 },
      () => {},
    );
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 14000);
      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    console.log(JSON.stringify({ screenshot, port }, null, 2));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
