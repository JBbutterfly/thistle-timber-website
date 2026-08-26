// ─────────────────────────────────────────────────────────────────────────
// Turns a rendered report section into a downloadable multi-page PDF.
// Rasterizes the DOM (so the BodyGraph SVG, colors, and layout all carry
// over exactly as shown), then slices the resulting image across US
// Letter-sized pages.
// ─────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function elementToPdf(el, filename) {
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: el.scrollWidth,
  });

  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Crop one page-sized slice of the source canvas per page, rather than
  // re-embedding the whole tall image on every page (which balloons file
  // size to hundreds of MB on a long, multi-page report).
  const pxPerPt = canvas.width / pageWidth;
  const sliceHeightPx = Math.floor(pageHeight * pxPerPt);

  let renderedPx = 0;
  let first = true;
  while (renderedPx < canvas.height) {
    const thisSlicePx = Math.min(sliceHeightPx, canvas.height - renderedPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = thisSlicePx;
    pageCanvas.getContext("2d").drawImage(canvas, 0, renderedPx, canvas.width, thisSlicePx, 0, 0, canvas.width, thisSlicePx);

    if (!first) pdf.addPage();
    pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, thisSlicePx / pxPerPt);

    renderedPx += thisSlicePx;
    first = false;
  }

  pdf.save(filename);
}

/**
 * Renders `buildHtml(item)` into a hidden, laid-out (but off-screen) container,
 * converts it to a PDF, then cleans up. Used to export people who aren't the
 * one currently on screen (e.g. exporting a whole circle at once).
 */
export async function offscreenElementToPdf(innerHtml, filename, { width = 1040 } = {}) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "-10000px";
  container.style.width = `${width}px`;
  container.style.background = "#ffffff";
  container.className = "container";
  container.innerHTML = innerHtml;
  document.body.appendChild(container);
  try {
    await elementToPdf(container, filename);
  } finally {
    document.body.removeChild(container);
  }
}

export function safeFilename(name) {
  return String(name ?? "chart").trim().replace(/[^a-z0-9\- ]/gi, "").replace(/\s+/g, "-") || "chart";
}
