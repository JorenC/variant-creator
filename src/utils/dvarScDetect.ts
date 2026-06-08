/**
 * Detects which provinces contain a supply-center marker, by rendering the dSVG
 * off-screen and point-testing each supply-center centre against province fills.
 * Browser-only (uses `document` + SVG geometry APIs).
 */
export function detectSCProvinces(svgContent: string): Set<string> {
  const result = new Set<string>();

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-99999px;top:-99999px;visibility:hidden";
  container.innerHTML = svgContent;
  document.body.appendChild(container);

  try {
    const liveSvg = container.querySelector("svg") as SVGSVGElement | null;
    if (!liveSvg) return result;

    const liveSCs = liveSvg.getElementById("foreground")?.querySelector("#supply-centers") ?? null;
    const liveProvinces = liveSvg.getElementById("provinces");
    if (!liveSCs || !liveProvinces) return result;

    liveProvinces.removeAttribute("style");

    const centers: { x: number; y: number }[] = [];
    for (const child of Array.from(liveSCs.children)) {
      const tag = child.tagName.toLowerCase();
      let cx: number, cy: number;
      if (tag === "circle") {
        cx = parseFloat(child.getAttribute("cx") ?? "0");
        cy = parseFloat(child.getAttribute("cy") ?? "0");
      } else {
        const bbox = (child as SVGGraphicsElement).getBBox();
        cx = bbox.x + bbox.width / 2;
        cy = bbox.y + bbox.height / 2;
      }
      centers.push({ x: cx, y: cy });
    }

    for (const center of centers) {
      const pt = liveSvg.createSVGPoint();
      pt.x = center.x;
      pt.y = center.y;
      for (const provEl of Array.from(liveProvinces.children)) {
        if (provEl instanceof SVGGeometryElement && provEl.id) {
          try {
            if (provEl.isPointInFill(pt)) result.add(provEl.id);
          } catch {
            // ignore geometry errors on complex paths
          }
        }
      }
    }
  } finally {
    document.body.removeChild(container);
  }

  return result;
}
