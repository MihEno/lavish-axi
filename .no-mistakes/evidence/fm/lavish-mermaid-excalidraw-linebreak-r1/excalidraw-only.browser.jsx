/* global document, location, window */

import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements, exportToCanvas, FONT_FAMILY } from "@excalidraw/excalidraw";
import {
  convertExcalidrawSkeletonsAfterFontsLoad,
  findDuplicateElementIds,
  restoreMermaidLabelLineBreaks,
} from "/Users/kunchen/.no-mistakes/worktrees/ea3c5e639a16/01M0233JW80SG4FSTYJ1BCRR4F/src/whiteboard-core.js";

/** @type {any} */ (window).EXCALIDRAW_ASSET_PATH = `${location.origin}/whiteboard-assets/`;

const SOURCE = `flowchart LR
  SCAN["1 Scan + classify<br>checks - compliance - mergeable - blast radius - risky paths<br>FLEET_TOKEN, deterministic"]
  BR["classify<br>checks"]
  NL["alpha\\nbeta"]
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

function materialize(skeletons) {
  let elements = convertToExcalidrawElements(skeletons, { regenerateIds: false });
  if (findDuplicateElementIds(elements).length > 0) {
    elements = convertToExcalidrawElements(skeletons, { regenerateIds: true });
  }
  return elements;
}

async function run() {
  const parsed = await parseMermaidToExcalidraw(SOURCE, { themeVariables: { fontSize: "16px" } });
  const skeletons = restoreMermaidLabelLineBreaks(parsed.elements);
  const elements = restoreMermaidLabelLineBreaks(
    await convertExcalidrawSkeletonsAfterFontsLoad(skeletons, {
      convert: materialize,
      loadFonts: async (firstPass) => {
        await exportToCanvas({
          elements: firstPass,
          appState: { exportBackground: false },
          files: parsed.files || null,
          maxWidthOrHeight: 1,
        });
        await document.fonts.ready;
      },
    }),
    { measure: measureText },
  );
  const canvas = await exportToCanvas({
    elements,
    appState: { exportBackground: true, exportPadding: 28, viewBackgroundColor: "#fffaf3" },
    files: parsed.files || null,
  });
  document.body.innerHTML = "";
  const heading = document.createElement("h1");
  heading.textContent = "Lavish whiteboard conversion of the reported Mermaid node";
  document.body.appendChild(heading);
  canvas.style.maxWidth = "100%";
  canvas.style.height = "auto";
  document.body.appendChild(canvas);
  const labels = elements
    .filter((element) => element.type === "text" && !element.isDeleted)
    .map((element) => ({
      text: element.text,
      originalText: element.originalText,
      lines: String(element.text || "").split("\n"),
      width: element.width,
      height: element.height,
    }));
  document.body.dataset.result = JSON.stringify({ pass: true, labels });
}

run().catch((error) => {
  document.body.textContent = String(error?.stack || error);
  document.body.dataset.result = JSON.stringify({ pass: false, error: String(error) });
});
