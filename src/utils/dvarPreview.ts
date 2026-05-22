export interface DvarProvinceShape {
  id: string;
  paths: string[];
}

function elementToPathD(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "path") return el.getAttribute("d");
  if (tag === "circle") {
    const cx = parseFloat(el.getAttribute("cx") ?? "0");
    const cy = parseFloat(el.getAttribute("cy") ?? "0");
    const r = parseFloat(el.getAttribute("r") ?? "0");
    return `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0 Z`;
  }
  if (tag === "ellipse") {
    const cx = parseFloat(el.getAttribute("cx") ?? "0");
    const cy = parseFloat(el.getAttribute("cy") ?? "0");
    const rx = parseFloat(el.getAttribute("rx") ?? "0");
    const ry = parseFloat(el.getAttribute("ry") ?? "0");
    return `M ${cx - rx},${cy} a ${rx},${ry} 0 1,0 ${rx * 2},0 a ${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
  }
  if (tag === "rect") {
    const x = parseFloat(el.getAttribute("x") ?? "0");
    const y = parseFloat(el.getAttribute("y") ?? "0");
    const w = parseFloat(el.getAttribute("width") ?? "0");
    const h = parseFloat(el.getAttribute("height") ?? "0");
    return `M ${x},${y} H ${x + w} V ${y + h} H ${x} Z`;
  }
  return null;
}

function collectPaths(el: Element): string[] {
  const result: string[] = [];
  const d = elementToPathD(el);
  if (d) result.push(d);
  for (const child of Array.from(el.children)) {
    result.push(...collectPaths(child));
  }
  return result;
}

export function extractDsvgProvinceShapes(svgContent: string): {
  shapes: DvarProvinceShape[];
  viewBox: string;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const viewBox = doc.documentElement.getAttribute("viewBox") ?? "0 0 1000 1000";
  const provincesLayer = doc.getElementById("provinces");
  if (!provincesLayer) return { shapes: [], viewBox };

  const shapes: DvarProvinceShape[] = [];
  for (const child of Array.from(provincesLayer.children)) {
    const id = child.getAttribute("id");
    if (!id) continue;
    shapes.push({ id, paths: collectPaths(child) });
  }
  return { shapes, viewBox };
}

export function extractDsvgNamedCoastShapes(svgContent: string): {
  shapes: DvarProvinceShape[];
  viewBox: string;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const viewBox = doc.documentElement.getAttribute("viewBox") ?? "0 0 1000 1000";
  const coastsLayer = doc.getElementById("named-coasts");
  if (!coastsLayer) return { shapes: [], viewBox };

  const shapes: DvarProvinceShape[] = [];
  for (const child of Array.from(coastsLayer.children)) {
    const id = child.getAttribute("id");
    if (!id) continue;
    shapes.push({ id, paths: collectPaths(child) });
  }
  return { shapes, viewBox };
}

export function buildHomeNationPreviewSvg(
  svgContent: string,
  provinceColors: Record<string, string>,
  highlightedId: string | null
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");

  const provincesLayer = doc.getElementById("provinces");
  if (provincesLayer) {
    provincesLayer.removeAttribute("style");

    for (const child of Array.from(provincesLayer.children)) {
      const el = child as SVGElement;
      if (el.id === highlightedId) {
        el.setAttribute("style", "fill:#fde047;opacity:1");
      } else {
        const color = provinceColors[el.id];
        el.setAttribute(
          "style",
          color ? `fill:${color};opacity:0.75` : "fill:#e2e8f0;opacity:0.4"
        );
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}

export function buildProvincePreviewSvg(
  svgContent: string,
  highlightedProvinceId: string | null,
  typeColors?: Record<string, string>
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");

  const provincesLayer = doc.getElementById("provinces");
  if (provincesLayer) {
    provincesLayer.removeAttribute("style"); // override display:none from dSVG

    for (const child of Array.from(provincesLayer.children)) {
      const el = child as SVGElement;
      if (el.id === highlightedProvinceId) {
        el.setAttribute("style", "fill:#fde047;opacity:1");
      } else {
        const typeColor = typeColors?.[el.id];
        el.setAttribute(
          "style",
          typeColor ? `fill:${typeColor};opacity:0.6` : "fill:#e2e8f0;opacity:0.5"
        );
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}
