import paper from "paper";
import { resolveTransforms } from "@/utils/svgTransform";

function elementToPathD(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "path") return el.getAttribute("d");
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

function collectPaperPaths(el: Element): paper.Path[] {
  const paths: paper.Path[] = [];
  const d = elementToPathD(el);
  if (d) {
    try { paths.push(new paper.Path(d)); } catch { /* skip unparseable paths */ }
  }
  for (const child of Array.from(el.children)) {
    paths.push(...collectPaperPaths(child));
  }
  return paths;
}

function getElementCenter(el: Element): { x: number; y: number } | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "circle" || tag === "ellipse") {
    return {
      x: parseFloat(el.getAttribute("cx") ?? "0"),
      y: parseFloat(el.getAttribute("cy") ?? "0"),
    };
  }
  if (tag === "rect") {
    const x = parseFloat(el.getAttribute("x") ?? "0");
    const y = parseFloat(el.getAttribute("y") ?? "0");
    const w = parseFloat(el.getAttribute("width") ?? "0");
    const h = parseFloat(el.getAttribute("height") ?? "0");
    return { x: x + w / 2, y: y + h / 2 };
  }
  const allPaths = collectPaperPaths(el);
  if (allPaths.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allPaths) {
    const b = p.bounds;
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.right);
    maxY = Math.max(maxY, b.bottom);
  }
  return isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null;
}

function getLayerEl(root: Element, key: string): Element | null {
  const indices = key.replace(/^root-/, "").split("-").map(Number);
  let el: Element = root;
  for (const idx of indices) {
    const child = el.children[idx];
    if (!child) return null;
    el = child;
  }
  return el;
}

export function autoDetectUnitProvinces(
  svgContent: string,
  unitPositionsKey: string | null,
  provincesKey: string | null,
  provinceAbbrs: Record<string, string>
): Record<string, string> {
  if (!unitPositionsKey || !provincesKey) return {};

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  resolveTransforms(doc.documentElement);

  const upLayer = getLayerEl(doc.documentElement, unitPositionsKey);
  const provLayer = getLayerEl(doc.documentElement, provincesKey);
  if (!upLayer || !provLayer) return {};

  // Build Paper.js paths per province for containment testing
  const provinceGroups: Array<{ svgId: string; paths: paper.Path[] }> = [];
  for (const child of Array.from(provLayer.children)) {
    // Prefer inkscape:label (Inkscape files) over id (Figma/generic files)
    const svgId = child.getAttribute("inkscape:label") ?? child.getAttribute("id");
    if (!svgId || !(svgId in provinceAbbrs)) continue;
    const paths = collectPaperPaths(child);
    if (paths.length > 0) provinceGroups.push({ svgId, paths });
  }

  const result: Record<string, string> = {};
  for (const child of Array.from(upLayer.children)) {
    // Prefer inkscape:label (Inkscape files) over id (Figma/generic files)
    const id = child.getAttribute("inkscape:label") ?? child.getAttribute("id");
    if (!id) continue;
    const center = getElementCenter(child);
    if (!center) continue;
    const pt = new paper.Point(center.x, center.y);
    for (const { svgId, paths } of provinceGroups) {
      const hit = paths.some(p => {
        try { return p.contains(pt); } catch { return false; }
      });
      if (hit) {
        result[id] = provinceAbbrs[svgId];
        break;
      }
    }
  }

  return result;
}
