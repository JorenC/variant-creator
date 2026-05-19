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
  Array.from(el.children).forEach(child => {
    const id = child.getAttribute("id");
    if (!id) return;
    provinces.push({ svgId: id, pathData: collectPathData(child) });
  });

  return { viewBox, provinces };
}
