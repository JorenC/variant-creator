export interface DvarProvinceShape {
  id: string;
  paths: string[];
}

function collectPaths(el: Element): string[] {
  const result: string[] = [];
  const d = el.getAttribute("d");
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
  typeColorMap?: Record<string, string>
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
        const typeColor = typeColorMap?.[el.id];
        el.setAttribute(
          "style",
          typeColor
            ? `fill:${typeColor};opacity:0.7`
            : "fill:#e2e8f0;opacity:0.5"
        );
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}
