import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";

const execFileAsync = promisify(execFile);
const projectRoot = "/Users/kunchen/.no-mistakes/worktrees/ea3c5e639a16/01M0233JW80SG4FSTYJ1BCRR4F";
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const { restoreMermaidLabelLineBreaks } = await import(
  pathToFileURL(path.join(projectRoot, "src/whiteboard-core.js")).href
);

const cases = [
  {
    id: "reported",
    title: "Reported three-line node",
    raw: "1 Scan + classify<br>checks - compliance - mergeable - blast radius - risky paths<br>FLEET_TOKEN, deterministic",
    expected: [
      "1 Scan + classify",
      "checks - compliance - mergeable - blast radius - risky paths",
      "FLEET_TOKEN, deterministic",
    ],
  },
  { id: "br", title: "<br> break", raw: "classify<br>checks", expected: ["classify", "checks"] },
  { id: "brslash", title: "<br/> break", raw: "classify<br/>checks", expected: ["classify", "checks"] },
  { id: "newline", title: "\\\\n break", raw: "alpha\\nbeta", expected: ["alpha", "beta"] },
  { id: "single", title: "Single-line control", raw: "Ready?", expected: ["Ready?"] },
];

function measure(element) {
  const lines = String(element.text || "").split("\n");
  return {
    width: Math.max(...lines.map((line) => line.length * 10)),
    height: lines.length * (Number(element.fontSize) || 16) * (Number(element.lineHeight) || 1.25),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stageMarkup(box, label, displayText) {
  const pad = 16;
  const stageW = Math.max(520, box.width + pad * 2);
  const stageH = Math.max(120, box.height + pad * 2);
  const boxLeft = (stageW - box.width) / 2;
  const boxTop = (stageH - box.height) / 2;
  const labelLeft = boxLeft + (box.width - label.width) / 2;
  const labelTop = boxTop + (box.height - label.height) / 2;
  return `<div class="stage" style="width:${stageW}px;height:${stageH}px">
    <div class="box" style="left:${boxLeft}px;top:${boxTop}px;width:${box.width}px;height:${box.height}px"></div>
    <div class="label" style="left:${labelLeft}px;top:${labelTop}px;width:${label.width}px;height:${label.height}px">${escapeHtml(displayText)}</div>
  </div>`;
}

const rows = cases.map((item) => {
  const beforeBox = { id: `${item.id}-box`, type: "rectangle", x: 10, y: 20, width: 80, height: 24 };
  const beforeLabel = {
    id: `${item.id}-text`,
    type: "text",
    containerId: `${item.id}-box`,
    x: 14,
    y: 24,
    width: 72,
    height: 20,
    fontSize: 16,
    lineHeight: 1.25,
    textAlign: "center",
    verticalAlign: "middle",
    text: item.raw,
    originalText: item.raw,
  };
  const [afterBox, afterLabel] = restoreMermaidLabelLineBreaks([{ ...beforeBox }, { ...beforeLabel }], { measure });
  const afterLines = String(afterLabel.text).split("\n");
  const centered =
    afterLabel.x === afterBox.x + (afterBox.width - afterLabel.width) / 2 &&
    afterLabel.y === afterBox.y + (afterBox.height - afterLabel.height) / 2;
  const ok =
    afterLines.join("\n") === item.expected.join("\n") &&
    !String(afterLabel.text).includes("<br") &&
    !String(afterLabel.text).includes("classifychecks") &&
    !String(afterLabel.text).includes("pathsFLEET_TOKEN") &&
    centered &&
    afterBox.width >= afterLabel.width &&
    afterBox.height >= afterLabel.height;
  return {
    ...item,
    before: { box: beforeBox, label: beforeLabel },
    after: { box: afterBox, label: afterLabel },
    afterLines,
    centered,
    ok,
  };
});

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mermaid label line-break fix</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 32px; font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; background: #14120e; color: #f4efe4; }
    h1 { font-size: 28px; font-weight: 560; margin: 0 0 8px; }
    .lede { color: #c9c0ae; max-width: 880px; margin: 0 0 28px; line-height: 1.45; }
    .grid { display: grid; gap: 18px; }
    .case { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #1d1a14; border: 1px solid #3a3428; border-radius: 14px; padding: 16px; }
    h2 { grid-column: 1 / -1; margin: 0; font-size: 15px; letter-spacing: 0.02em; color: #e8dfcc; }
    .col h3 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
    .before h3 { color: #d96c4f; }
    .after h3 { color: #8fad7a; }
    .stage { position: relative; background: #fffaf3; border-radius: 10px; overflow: hidden; max-width: 100%; }
    .box { position: absolute; border: 2px solid #1d1a14; border-radius: 8px; background: #f3ead8; box-sizing: border-box; }
    .label { position: absolute; white-space: pre-wrap; font: 16px/1.25 "IBM Plex Sans", ui-sans-serif, sans-serif; color: #14120e; text-align: center; overflow: hidden; }
    .meta { margin: 10px 0 0; font: 12px/1.45 ui-monospace, SFMono-Regular, monospace; color: #c9c0ae; }
    .fail { color: #d96c4f; }
    .pass { color: #8fad7a; }
  </style>
</head>
<body>
  <h1>Mermaid → Excalidraw keeps real line breaks</h1>
  <p class="lede">The reported node fused “classifychecks” and “pathsFLEET_TOKEN” because literal &lt;br&gt; and \\n stayed in the Excalidraw text. After restore, those markers become real newlines, the box grows to the line set, and bound text is re-centered.</p>
  <div class="grid">
    ${rows
      .map((row) => {
        const beforeDisplay = row.before.label.text;
        const afterDisplay = row.after.label.text;
        return `<section class="case">
          <h2>${row.title}</h2>
          <div class="col before">
            <h3>Before: literal break markers, clipped box</h3>
            ${stageMarkup(row.before.box, row.before.label, beforeDisplay)}
            <p class="meta fail">text=${JSON.stringify(beforeDisplay)} · box ${row.before.box.width}×${row.before.box.height} · label (${row.before.label.x},${row.before.label.y})</p>
          </div>
          <div class="col after">
            <h3>After: real newlines, resized and re-centered</h3>
            ${stageMarkup(row.after.box, row.after.label, afterDisplay)}
            <p class="meta ${row.ok ? "pass" : "fail"}">text=${JSON.stringify(afterDisplay)} · box ${row.after.box.width}×${row.after.box.height} · label (${row.after.label.x},${row.after.label.y}) · centered ${row.centered}</p>
          </div>
        </section>`;
      })
      .join("\n")}
  </div>
</body>
</html>`;

const htmlPath = path.join(evidenceDir, "mermaid-linebreak-before-after.html");
const jsonPath = path.join(evidenceDir, "conversion-result.json");
await writeFile(htmlPath, html);
await writeFile(
  jsonPath,
  `${JSON.stringify(
    {
      pass: rows.every((row) => row.ok),
      cases: rows.map((row) => ({
        id: row.id,
        raw: row.raw,
        expected: row.expected,
        afterText: row.after.label.text,
        afterOriginalText: row.after.label.originalText,
        afterLines: row.afterLines,
        fusedClassify: String(row.after.label.text).includes("classifychecks"),
        fusedPaths: String(row.after.label.text).includes("pathsFLEET_TOKEN"),
        hasHtmlBreak: /<br/i.test(String(row.after.label.text) + String(row.after.label.originalText)),
        beforeBox: row.before.box,
        afterBox: row.after.box,
        afterLabel: {
          x: row.after.label.x,
          y: row.after.label.y,
          width: row.after.label.width,
          height: row.after.label.height,
        },
        centered: row.centered,
        ok: row.ok,
      })),
    },
    null,
    2,
  )}\n`,
);

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshot = path.join(evidenceDir, "mermaid-linebreak-before-after.png");
const server = http.createServer(async (request, response) => {
  if (new URL(request.url, "http://127.0.0.1").pathname !== "/") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(await readFile(htmlPath));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
try {
  const child = execFile(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--hide-scrollbars",
      `--user-data-dir=/tmp/lavish-linebreak-static-${process.pid}`,
      "--window-size=1400,1900",
      "--virtual-time-budget=1500",
      `--screenshot=${screenshot}`,
      `http://127.0.0.1:${port}/`,
    ],
    { timeout: 12_000 },
    () => {},
  );
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 4000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  console.log(JSON.stringify({ htmlPath, screenshot, jsonPath, pass: rows.every((row) => row.ok) }, null, 2));
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
