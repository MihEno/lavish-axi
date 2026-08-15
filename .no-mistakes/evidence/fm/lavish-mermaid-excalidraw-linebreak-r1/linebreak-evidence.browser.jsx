/* global document, location, window */

import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements, exportToCanvas, FONT_FAMILY } from "@excalidraw/excalidraw";

import {
  convertExcalidrawSkeletonsAfterFontsLoad,
  findDuplicateElementIds,
  restoreMermaidLabelLineBreaks,
} from "/Users/kunchen/.no-mistakes/worktrees/ea3c5e639a16/01M0233JW80SG4FSTYJ1BCRR4F/src/whiteboard-core.js";

/** @type {any} */ (window).EXCALIDRAW_ASSET_PATH = `${location.origin}/whiteboard-assets/`;

const REPORTED_SOURCE = `flowchart LR
  SCAN["1 Scan + classify<br>checks - compliance - mergeable - blast radius - risky paths<br>FLEET_TOKEN, deterministic"]
  BR["classify<br>checks"]
  NL["alpha\\nbeta"]
  SINGLE["Ready?"]
  SCAN --> BR --> NL --> SINGLE
`;

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

function textElements(elements) {
  return (elements || [])
    .filter((element) => element?.type === "text" && !element.isDeleted)
    .map((element) => {
      const container = (elements || []).find((item) => item.id === element.containerId);
      const measured = measureText(element);
      const expectedX = container ? container.x + (container.width - element.width) / 2 : null;
      const expectedY = container ? container.y + (container.height - element.height) / 2 : null;
      return {
        id: element.id,
        containerId: element.containerId || null,
        text: String(element.text || ""),
        originalText: String(element.originalText || ""),
        lines: String(element.text || "").split("\n"),
        fusedClassify: String(element.text || "").includes("classifychecks"),
        fusedPaths: String(element.text || "").includes("pathsFLEET_TOKEN"),
        hasHtmlBreak: /<br/i.test(String(element.text || "") + String(element.originalText || "")),
        width: element.width,
        height: element.height,
        x: element.x,
        y: element.y,
        measured,
        container: container
          ? {
              id: container.id,
              x: container.x,
              y: container.y,
              width: container.width,
              height: container.height,
            }
          : null,
        centeredX: expectedX == null ? null : Math.abs(element.x - expectedX) < 0.6,
        centeredY: expectedY == null ? null : Math.abs(element.y - expectedY) < 0.6,
      };
    });
}

async function convert(source, { restore }) {
  const parsed = await parseMermaidToExcalidraw(source, { themeVariables: { fontSize: "16px" } });
  const skeletons = restore ? restoreMermaidLabelLineBreaks(parsed.elements) : parsed.elements;
  const elements = restore
    ? restoreMermaidLabelLineBreaks(
        await convertExcalidrawSkeletonsAfterFontsLoad(skeletons, {
          convert: materialize,
          loadFonts: async (firstPass) => {
            await loadFonts(firstPass, parsed.files || null);
          },
        }),
        { measure: measureText },
      )
    : materialize(skeletons);
  if (!restore) await loadFonts(elements, parsed.files || null);
  const canvas = await exportToCanvas({
    elements,
    appState: { exportBackground: true, exportPadding: 24, viewBackgroundColor: "#fffaf3" },
    files: parsed.files || null,
  });
  return { elements, canvas, labels: textElements(elements) };
}

function heading(text) {
  const el = document.createElement("h2");
  el.textContent = text;
  document.body.appendChild(el);
}

function note(text, className) {
  const el = document.createElement("p");
  el.className = className || "note";
  el.textContent = text;
  document.body.appendChild(el);
}

function renderPanel(title, conversion, kind) {
  const panel = document.createElement("section");
  panel.className = `panel ${kind}`;
  const h = document.createElement("h3");
  h.textContent = title;
  panel.appendChild(h);
  conversion.canvas.style.maxWidth = "100%";
  conversion.canvas.style.height = "auto";
  conversion.canvas.setAttribute("data-kind", kind);
  panel.appendChild(conversion.canvas);
  const list = document.createElement("ul");
  for (const label of conversion.labels) {
    const item = document.createElement("li");
    const fused = label.fusedClassify || label.fusedPaths || label.hasHtmlBreak;
    item.className = fused ? "fail" : label.lines.length > 1 ? "pass" : "ok";
    item.textContent = `${JSON.stringify(label.originalText)} · ${label.lines.length} line(s) · ${Math.round(label.width)}×${Math.round(label.height)}`;
    list.appendChild(item);
  }
  panel.appendChild(list);
  document.body.appendChild(panel);
}

async function run() {
  document.body.innerHTML = "";
  heading("Mermaid → Excalidraw label line breaks");
  note(
    'Reported node: "1 Scan + classify" / "checks - compliance - mergeable - blast radius - risky paths" / "FLEET_TOKEN, deterministic"',
  );

  const broken = await convert(REPORTED_SOURCE, { restore: false });
  const fixed = await convert(REPORTED_SOURCE, { restore: true });

  renderPanel("Before restore (fused words, no real line breaks)", broken, "before");
  renderPanel("After restore (real \\n, box sized to the line set)", fixed, "after");

  const reported = fixed.labels.find((label) => label.originalText.includes("FLEET_TOKEN"));
  const br = fixed.labels.find((label) => label.originalText === "classify\nchecks");
  const nl = fixed.labels.find((label) => label.originalText === "alpha\nbeta");
  const single = fixed.labels.find((label) => label.originalText === "Ready?");
  const brokenReported = broken.labels.find((label) => /FLEET_TOKEN|classify/.test(label.originalText + label.text));

  const result = {
    pass: Boolean(
      reported &&
        reported.lines.length === 3 &&
        !reported.fusedClassify &&
        !reported.fusedPaths &&
        !reported.hasHtmlBreak &&
        reported.centeredX &&
        reported.centeredY &&
        br?.lines.length === 2 &&
        nl?.lines.length === 2 &&
        single?.lines.length === 1 &&
        brokenReported &&
        (brokenReported.fusedClassify || brokenReported.hasHtmlBreak || brokenReported.lines.length === 1),
    ),
    reported: reported || null,
    br: br || null,
    nl: nl || null,
    single: single || null,
    beforeReported: brokenReported || null,
    beforeLabels: broken.labels,
    afterLabels: fixed.labels,
  };
  document.body.dataset.result = JSON.stringify(result);
  return result;
}

run().then(
  (result) => {
    document.body.dataset.result = JSON.stringify(result);
  },
  (error) => {
    document.body.dataset.result = JSON.stringify({ pass: false, error: error?.stack || String(error) });
  },
);
