export interface ProvinceElement {
  svgId: string;
  pathData: string[];
}

function shapeToPathD(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "circle") {
    const cx = parseFloat(el.getAttribute("cx") ?? "0");
    const cy = parseFloat(el.getAttribute("cy") ?? "0");
    const r = parseFloat(el.getAttribute("r") ?? "0");
    if (r <= 0) return null;
    return `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0 Z`;
  }
  if (tag === "ellipse") {
    const cx = parseFloat(el.getAttribute("cx") ?? "0");
    const cy = parseFloat(el.getAttribute("cy") ?? "0");
    const rx = parseFloat(el.getAttribute("rx") ?? "0");
    const ry = parseFloat(el.getAttribute("ry") ?? "0");
    if (rx <= 0 || ry <= 0) return null;
    return `M ${cx - rx},${cy} a ${rx},${ry} 0 1,0 ${rx * 2},0 a ${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
  }
  if (tag === "rect") {
    const x = parseFloat(el.getAttribute("x") ?? "0");
    const y = parseFloat(el.getAttribute("y") ?? "0");
    const w = parseFloat(el.getAttribute("width") ?? "0");
    const h = parseFloat(el.getAttribute("height") ?? "0");
    if (w <= 0 || h <= 0) return null;
    return `M ${x},${y} H ${x + w} V ${y + h} H ${x} Z`;
  }
  return null;
}

function isInkscapeSubLayer(el: Element): boolean {
  if (el.tagName.toLowerCase() !== "g") return false;
  return (
    el.getAttribute("inkscape:groupmode") === "layer" ||
    el.getAttribute("inkscape:label") !== null
  );
}

export function getFlatProvinceChildren(el: Element): Element[] {
  const result: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (isInkscapeSubLayer(child)) {
      result.push(...getFlatProvinceChildren(child));
    } else {
      result.push(child);
    }
  }
  return result;
}

function collectPathData(el: Element): string[] {
  const paths: string[] = [];
  const tag = el.tagName.toLowerCase();
  if (tag === "path") {
    const d = el.getAttribute("d");
    if (d) paths.push(d);
  } else {
    const d = shapeToPathD(el);
    if (d) paths.push(d);
  }
  Array.from(el.children).forEach(child => paths.push(...collectPathData(child)));
  return paths;
}

export interface ExtractedProvinces {
  viewBox: string;
  provinces: ProvinceElement[];
}

export function extractLayerPaths(
  svgContent: string,
  layerKey: string | null
): string[] {
  if (!layerKey) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const root = doc.documentElement;

  const path = layerKey.replace(/^root-/, "").split("-").map(Number);
  let el: Element = root;
  for (const index of path) {
    const child = el.children[index];
    if (!child) return [];
    el = child;
  }

  const paths: string[] = [];
  const collect = (element: Element) => {
    const d = element.getAttribute("d");
    if (d) paths.push(d);
    Array.from(element.children).forEach(collect);
  };
  Array.from(el.children).forEach(collect);

  return paths;
}

/**
 * Returns the labels/ids of groups in the given layer whose children are
 * mixed — some have inkscape:label and some do not. These groups will be
 * expanded (not merged) by buildDsvgOutput, which may be unexpected.
 */
export function detectAmbiguousGroups(
  svgContent: string,
  layerKey: string
): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const root = doc.documentElement;

  const path = layerKey.replace(/^root-/, "").split("-").map(Number);
  let el: Element = root;
  for (const index of path) {
    const child = el.children[index];
    if (!child) return [];
    el = child;
  }

  const ambiguous: string[] = [];
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase() !== "g") continue;
    const grandchildren = Array.from(child.children);
    const labeledCount = grandchildren.filter(
      c => c.getAttribute("inkscape:label") !== null
    ).length;
    if (labeledCount > 0 && labeledCount < grandchildren.length) {
      const id =
        child.getAttribute("inkscape:label") ??
        child.getAttribute("id") ??
        "(unnamed)";
      ambiguous.push(id);
    }
  }
  return ambiguous;
}

export function extractProvinces(
  svgContent: string,
  provincesKey: string | null
): ExtractedProvinces {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const root = doc.documentElement;

  const viewBox = root.getAttribute("viewBox") ?? "0 0 1000 1000";

  if (!provincesKey) return { viewBox, provinces: [] };

  const path = provincesKey
    .replace(/^root-/, "")
    .split("-")
    .map(Number);

  let el: Element = root;
  for (const index of path) {
    const child = el.children[index];
    if (!child) return { viewBox, provinces: [] };
    el = child;
  }

  const provinces: ProvinceElement[] = [];
  getFlatProvinceChildren(el).forEach(child => {
    const svgId = child.getAttribute("inkscape:label") ?? child.getAttribute("id");
    if (!svgId) return;
    provinces.push({ svgId, pathData: collectPathData(child) });
  });

  return { viewBox, provinces };
}
