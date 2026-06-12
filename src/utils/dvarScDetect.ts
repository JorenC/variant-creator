export interface DetectSCProvincesResult {
  detected: Set<string>;
  skipped: string[];
}

/**
 * Detects which provinces contain a supply-center marker, by rendering the dSVG
 * off-screen and point-testing each supply-center centre against province fills.
 * Browser-only (uses `document` + SVG geometry APIs).
 */
export function detectSCProvinces(svgContent: string): DetectSCProvincesResult {
  const detected = new Set<string>();
  const skipped: string[] = [];

  // Parse as XML and import the node rather than assigning innerHTML: the SVG
  // is user-supplied, and HTML parsing would activate embedded event handlers.
  const parsed = new DOMParser().parseFromString(svgContent, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return { detected, skipped };

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-99999px;top:-99999px;visibility:hidden";
  container.appendChild(document.importNode(parsed.documentElement, true));
  document.body.appendChild(container);

  try {
    const liveSvg = container.querySelector("svg") as SVGSVGElement | null;
    if (!liveSvg) return { detected, skipped };

    const liveSCs = liveSvg.getElementById("foreground")?.querySelector("#supply-centers") ?? null;
    const liveProvinces = liveSvg.getElementById("provinces");
    if (!liveSCs || !liveProvinces) return { detected, skipped };

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
            if (provEl.isPointInFill(pt)) detected.add(provEl.id);
          } catch {
            if (!skipped.includes(provEl.id)) skipped.push(provEl.id);
          }
        }
      }
    }
  } finally {
    document.body.removeChild(container);
  }

  return { detected, skipped };
}
