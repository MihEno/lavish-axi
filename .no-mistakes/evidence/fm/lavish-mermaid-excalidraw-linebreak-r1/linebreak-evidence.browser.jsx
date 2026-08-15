/* global document, location, window */

import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements, exportToCanvas, FONT_FAMILY } from "@excalidraw/excalidraw";

import {
  convertExcalidrawSkeletonsAfterFontsLoad,
  findDuplicateElementIds,
  restoreMermaidLabelLineBreaks,
} from "lavish-whiteboard-core";

/** @type {any} */ (window).EXCALIDRAW_ASSET_PATH = `${location.origin}/whiteboard-assets/`;

const LIVE_DECK_LINES = [
  "1  Scan + classify",
  "checks - compliance - mergeable - blast radius - risky paths",
  "FLEET_TOKEN, deterministic",
];

const CASES = [
  {
    id: "br",
    title: "Live-deck label with <br> breaks",
    source: `flowchart TD
  SCAN["1  Scan + classify<br>checks - compliance - mergeable - blast radius - risky paths<br>FLEET_TOKEN, deterministic"]`,
    expectedLines: LIVE_DECK_LINES,
  },
  {
    id: "brslash",
    title: "Same label with <br/> breaks",
    source: `flowchart TD
  SCAN["1  Scan + classify<br/>checks - compliance - mergeable - blast radius - risky paths<br/>FLEET_TOKEN, deterministic"]`,
    expectedLines: LIVE_DECK_LINES,
  },
  {
    id: "newline",
    title: "Same label with \\\\n breaks",
    source: `flowchart TD
  SCAN["1  Scan + classify\\nchecks - compliance - mergeable - blast radius - risky paths\\nFLEET_TOKEN, deterministic"]`,
    expectedLines: LIVE_DECK_LINES,
  },
];

const metricsCanvas = document.createElement("canvas");
const metricsContext = metricsCanvas.getContext("2d");

function fontFamilyName(fontFamily) {
  return Object.entries(FONT_FAMILY).find(([, value]) => value === fontFamily)?.[0] || "Segoe UI Emoji";
}

function fontString(element) {
  const family = fontFamilyName(element.fontFamily);
  const families = family === "Excalifont" ? [family, "Xiaolai", "Segoe UI Emoji"] : [family, "Segoe UI Emoji"];
  return `${Number(element.fontSize) || 20}px ${families.map((value) => JSON.stringify(value)).join(", ")}`;
}

function measureText(element) {
  metricsContext.font = fontString(element);
  const lines = String(element.text || "").split("\n");
  return {
    width: Math.max(...lines.map((line) => metricsContext.measureText(line || " ").width)),
    height: lines.length * (Number(element.fontSize) || 20) * (Number(element.lineHeight) || 1.25),
  };
}

async function loadFonts(elements, files) {
  await exportToCanvas({
    elements,
    appState: { exportBackground: false },
    files,
    maxWidthOrHeight: 1,
  });
  const labels = elements.filter((element) => element.type === "text" && !element.isDeleted);
  await Promise.all(labels.map((element) => document.fonts.load(fontString(element), String(element.text || ""))));
  await document.fonts.ready;
}

function materialize(skeletons) {
  let elements = convertToExcalidrawElements(skeletons, { regenerateIds: false });
  if (findDuplicateElementIds(elements).length > 0) {
    elements = convertToExcalidrawElements(skeletons, { regenerateIds: true });
  }
  return elements;
}

function findLabel(elements, expectedLines) {
  const expected = expectedLines.join("\n");
  return elements.find(
    (element) =>
      element.type === "text" &&
      (element.originalText === expected || element.text === expected || String(element.text || "").includes("\n")),
  );
}

function inspectLabel(elements, expectedLines) {
  const label =
    elements.find((element) => element.type === "text" && String(element.originalText || "") === expectedLines.join("\n")) ||
    elements.find((element) => element.type === "text" && String(element.text || "").includes(expectedLines[0]));
  const original = String(label?.originalText || "");
  const text = String(label?.text || "");
  const measured = label ? measureText(label) : { width: 0, height: 0 };
  const container = label?.containerId
    ? elements.find((element) => element.id === label.containerId)
    : null;
  return {
    found: Boolean(label),
    original,
    text,
    lines: original.split("\n"),
    fusedClassify: original.includes("classifychecks") || text.includes("classifychecks"),
    fusedFleet: original.includes("pathsFLEET_TOKEN") || text.includes("pathsFLEET_TOKEN"),
    hasHtmlBreak: original.includes("<br") || text.includes("<br"),
    width: label?.width ?? null,
    height: label?.height ?? null,
    measuredWidth: measured.width,
    measuredHeight: measured.height,
    containerWidth: container?.width ?? null,
    containerHeight: container?.height ?? null,
    boxFits:
      Boolean(label) &&
      measured.width <= Number(label.width) + 0.1 &&
      measured.height <= Number(label.height) + 0.1,
    containerFits:
      Boolean(container) &&
      Number(container.width) + 0.1 >= Number(label?.width) &&
      Number(container.height) + 0.1 >= Number(label?.height),
  };
}

async function convertCase(source) {
  const parsed = await parseMermaidToExcalidraw(source, { themeVariables: { fontSize: "16px" } });
  const skeletons = restoreMermaidLabelLineBreaks(parsed.elements);
  const elements = restoreMermaidLabelLineBreaks(
    await convertExcalidrawSkeletonsAfterFontsLoad(skeletons, {
      convert: materialize,
      loadFonts: async (firstPass) => {
        await loadFonts(firstPass, parsed.files || null);
      },
    }),
    { measure: measureText },
  );
  return { elements, files: parsed.files || null };
}

function card(title, canvas, inspection) {
  const wrap = document.createElement("section");
  wrap.style.cssText =
    "background:#161410;border:1px solid #3a342c;border-radius:16px;padding:20px 24px;margin:0 0 24px;color:#f4efe4;font-family:ui-sans-serif,system-ui,sans-serif;";
  const heading = document.createElement("h2");
  heading.textContent = title;
  heading.style.cssText = "margin:0 0 12px;font-size:18px;font-weight:600;";
  const status = document.createElement("p");
  const ok =
    inspection.found &&
    !inspection.fusedClassify &&
    !inspection.fusedFleet &&
    !inspection.hasHtmlBreak &&
    inspection.lines.length === 3 &&
    inspection.boxFits &&
    inspection.containerFits;
  status.textContent = ok
    ? "PASS: three real lines, no fused words, box sized to the line set"
    : `FAIL: ${JSON.stringify(inspection)}`;
  status.style.cssText = `margin:0 0 12px;font-size:14px;color:${ok ? "#8fbf8a" : "#d46a4a"};`;
  const pre = document.createElement("pre");
  pre.textContent = inspection.lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
  pre.style.cssText =
    "margin:0 0 16px;padding:12px 14px;background:#0f0d0a;border-radius:10px;font:13px/1.45 ui-monospace,monospace;white-space:pre-wrap;";
  canvas.style.cssText = "display:block;max-width:100%;height:auto;background:#fff;border-radius:10px;";
  wrap.append(heading, status, pre, canvas);
  return { wrap, ok };
}

async function run() {
  document.body.style.cssText = "margin:0;background:#0b0a08;padding:32px;";
  const page = document.createElement("main");
  page.style.cssText = "max-width:1100px;margin:0 auto;";
  const title = document.createElement("h1");
  title.textContent = "Mermaid → Excalidraw label line breaks";
  title.style.cssText = "margin:0 0 8px;color:#f4efe4;font:600 28px ui-sans-serif,system-ui,sans-serif;";
  const lead = document.createElement("p");
  lead.textContent =
    "Live-deck reproduction: the three-line Scan + classify node must keep real line breaks in the Excalidraw box.";
  lead.style.cssText = "margin:0 0 28px;color:#c9c0b0;font:16px/1.5 ui-sans-serif,system-ui,sans-serif;";
  page.append(title, lead);
  document.body.append(page);

  const results = [];
  for (const item of CASES) {
    const { elements, files } = await convertCase(item.source);
    const inspection = inspectLabel(elements, item.expectedLines);
    const canvas = await exportToCanvas({
      elements,
      appState: { exportBackground: true, exportPadding: 24, viewBackgroundColor: "#ffffff" },
      files,
    });
    const { wrap, ok } = card(item.title, canvas, inspection);
    page.append(wrap);
    results.push({
      id: item.id,
      ok,
      ...inspection,
      png: canvas.toDataURL("image/png"),
    });
  }

  const allPass = results.every((item) => item.ok);
  document.body.dataset.result = JSON.stringify({
    pass: allPass,
    cases: results.map(({ png, ...rest }) => rest),
  });
  window.__linebreakEvidence = results;
}

run().catch((error) => {
  document.body.dataset.result = JSON.stringify({ pass: false, error: error?.stack || String(error) });
});
