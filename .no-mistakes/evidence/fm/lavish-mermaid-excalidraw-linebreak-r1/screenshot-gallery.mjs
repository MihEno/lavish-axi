import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png" };

const server = http.createServer(async (request, response) => {
  const relative = request.url === "/" ? "gallery.html" : decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname.slice(1));
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const screenshot = path.join(root, "gallery.png");
try {
  await execFileAsync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--window-size=1200,2000",
      `--screenshot=${screenshot}`,
      `http://127.0.0.1:${port}/`,
    ],
    { timeout: 20_000 },
  );
  console.log(screenshot);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
