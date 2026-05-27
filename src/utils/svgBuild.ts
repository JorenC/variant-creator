import type { SvgTreeNode } from "@/utils/svgTree";
import type { LayerAssignments } from "@/components/dsvg/LayerAssignment";
import { resolveTransforms } from "@/utils/svgTransform";

const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
const SODIPODI_NS = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd";
const SVG_NS = "http://www.w3.org/2000/svg";

// Namespaces whose attributes are always stripped from the output
const STRIP_NAMESPACES = new Set([INKSCAPE_NS, SODIPODI_NS]);
// Non-namespaced attributes that are Inkscape/sodipodi conventions we don't want
const STRIP_ATTRS = new Set(["sodipodi:docname", "sodipodi:version", "inkscape:version"]);

function getElementByKey(root: Element, key: string): Element | null {
  const indices = key.replace(/^root-/, "").split("-").map(Number);
  let el: Element = root;
  for (const idx of indices) {
    const child = el.children[idx];
    if (!child) return null;
    el = child;
  }
  return el;
}

function flattenInkscapeSubLayers(el: Element): void {
  const toRemove: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (
      child.tagName.toLowerCase() === "g" &&
      (child.getAttribute("inkscape:groupmode") === "layer" ||
        child.getAttribute("inkscape:label") !== null)
    ) {
      flattenInkscapeSubLayers(child);
      for (const gc of Array.from(child.children)) {
        el.insertBefore(gc, child);
      }
      toRemove.push(child);
    }
  }
  for (const removed of toRemove) {
    removed.parentNode?.removeChild(removed);
  }
}

function makeLayerGroup(doc: Document, id: string): Element {
  const g = doc.createElementNS(SVG_NS, "g");
  g.setAttribute("id", id);
  return g;
}

// ─── Stripping ─────────────────────────────────────────────────────────────────

function stripElement(el: Element): void {
  // Remove namespaced attributes belonging to inkscape/sodipodi
  const toRemove: Attr[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (
      (attr.namespaceURI && STRIP_NAMESPACES.has(attr.namespaceURI)) ||
      STRIP_ATTRS.has(attr.name)
    ) {
      toRemove.push(attr);
    }
  }
  toRemove.forEach(a => el.removeAttributeNode(a));

  for (const child of Array.from(el.children)) {
    stripElement(child);
  }
}

function stripRootNamespaces(root: Element): void {
  root.removeAttributeNS(null, "xmlns:inkscape");
  root.removeAttributeNS(null, "xmlns:sodipodi");
  root.removeAttributeNS(null, "xmlns:dc");
  root.removeAttributeNS(null, "xmlns:cc");
  root.removeAttributeNS(null, "xmlns:rdf");
  // The serializer may write xmlns:* as plain attrs; remove by name too
  ["xmlns:inkscape", "xmlns:sodipodi", "xmlns:dc", "xmlns:cc", "xmlns:rdf"].forEach(
    name => { if (root.hasAttribute(name)) root.removeAttribute(name); }
  );
}

function removeNonSvgChildren(root: Element): void {
  const remove: Element[] = [];
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (
      tag === "metadata" ||
      tag === "sodipodi:namedview" ||
      tag === "title" ||
      tag === "desc"
    ) {
      remove.push(child);
    }
  }
  remove.forEach(el => el.parentNode?.removeChild(el));
}

// ─── Fill inheritance fix ─────────────────────────────────────────────────────

const DRAWABLE_TAGS = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline", "line"]);

// When the source SVG has fill="none" on its root, child elements that have no
// explicit fill rely on that inherited value. After extraction into a new SVG
// (by dsvgParser), those elements default to fill="black". This function
// propagates the root fill explicitly to every drawable element that lacks one,
// making the exported dSVG self-contained.
function propagateRootFill(root: Element, fillValue: string): void {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (DRAWABLE_TAGS.has(el.tagName.toLowerCase()) && !el.hasAttribute("fill")) {
      el.setAttribute("fill", fillValue);
    }
  }
}

// ─── Shape-to-path conversion (for province/named-coast layers) ──────────────

// Converts <circle>, <ellipse>, and <rect> elements to equivalent <path> elements.
// The diplicity validator requires <path> elements in the provinces and named-coasts layers.
function shapeToPath(doc: Document, el: Element): Element | null {
  const tag = el.tagName.toLowerCase();
  let d: string | null = null;

  if (tag === "circle") {
    const cx = parseFloat(el.getAttribute("cx") ?? "0");
    const cy = parseFloat(el.getAttribute("cy") ?? "0");
    const r = parseFloat(el.getAttribute("r") ?? "0");
    if (r <= 0) return null;
    d = `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z`;
  } else if (tag === "ellipse") {
    const cx = parseFloat(el.getAttribute("cx") ?? "0");
    const cy = parseFloat(el.getAttribute("cy") ?? "0");
    const rx = parseFloat(el.getAttribute("rx") ?? "0");
    const ry = parseFloat(el.getAttribute("ry") ?? "0");
    if (rx <= 0 || ry <= 0) return null;
    d = `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} Z`;
  } else if (tag === "rect") {
    const x = parseFloat(el.getAttribute("x") ?? "0");
    const y = parseFloat(el.getAttribute("y") ?? "0");
    const w = parseFloat(el.getAttribute("width") ?? "0");
    const h = parseFloat(el.getAttribute("height") ?? "0");
    if (w <= 0 || h <= 0) return null;
    const rx = parseFloat(el.getAttribute("rx") ?? "0");
    const ry = parseFloat(el.getAttribute("ry") ?? el.getAttribute("rx") ?? "0");
    if (rx > 0 || ry > 0) {
      const rrx = Math.min(rx, w / 2), rry = Math.min(ry, h / 2);
      d = `M ${x + rrx} ${y} H ${x + w - rrx} A ${rrx} ${rry} 0 0 1 ${x + w} ${y + rry} V ${y + h - rry} A ${rrx} ${rry} 0 0 1 ${x + w - rrx} ${y + h} H ${x + rrx} A ${rrx} ${rry} 0 0 1 ${x} ${y + h - rry} V ${y + rry} A ${rrx} ${rry} 0 0 1 ${x + rrx} ${y} Z`;
    } else {
      d = `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
    }
  }

  if (!d) return null;

  const pathEl = doc.createElementNS(SVG_NS, "path");
  pathEl.setAttribute("d", d);
  for (const attr of Array.from(el.attributes)) {
    if (!["cx", "cy", "r", "rx", "ry", "x", "y", "width", "height"].includes(attr.name)) {
      pathEl.setAttribute(attr.name, attr.value);
    }
  }
  return pathEl;
}

function convertShapesToPaths(doc: Document, layer: Element): void {
  for (const child of Array.from(layer.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "circle" || tag === "ellipse" || tag === "rect") {
      const pathEl = shapeToPath(doc, child);
      if (pathEl) layer.replaceChild(pathEl, child);
    }
  }
}

// ─── Path-to-circle conversion ───────────────────────────────────────────────

// Detects circles drawn as 4 cubic Bezier arcs (Inkscape's default representation)
// and returns their center/radius. Returns null for non-circular shapes.
function pathToCircle(d: string): { cx: number; cy: number; r: number } | null {
  const mMatch = d.match(/M\s*([-\d.]+)[,\s]+([-\d.]+)/);
  if (!mMatch) return null;

  // Collect endpoints of each absolute C command (the 5th and 6th number of each triplet)
  const endpointXs: number[] = [parseFloat(mMatch[1])];
  const endpointYs: number[] = [parseFloat(mMatch[2])];
  const cRe = /C\s*[-\d.]+[,\s]+[-\d.]+[,\s]+[-\d.]+[,\s]+[-\d.]+[,\s]+([-\d.]+)[,\s]+([-\d.]+)/g;
  let m;
  while ((m = cRe.exec(d)) !== null) {
    endpointXs.push(parseFloat(m[1]));
    endpointYs.push(parseFloat(m[2]));
  }
  if (endpointXs.length < 3) return null;

  const minX = Math.min(...endpointXs), maxX = Math.max(...endpointXs);
  const minY = Math.min(...endpointYs), maxY = Math.max(...endpointYs);
  const w = maxX - minX, h = maxY - minY;
  if (w <= 0 || h <= 0) return null;
  if (Math.min(w, h) / Math.max(w, h) < 0.8) return null; // not circular

  return {
    cx: parseFloat(((minX + maxX) / 2).toFixed(3)),
    cy: parseFloat(((minY + maxY) / 2).toFixed(3)),
    r: parseFloat(((w + h) / 4).toFixed(3)),
  };
}

// ─── Inkscape label → id promotion ───────────────────────────────────────────

// Inkscape files store meaningful province/coast identifiers in inkscape:label
// (e.g. inkscape:label="EDI") rather than in the id attribute (e.g. id="path120").
// Before stripping all inkscape namespaced attributes we promote each child's
// inkscape:label value to its id so the output dSVG uses the human-readable key.
function relabelByInkscape(layer: Element): void {
  for (const child of Array.from(layer.children)) {
    const label = child.getAttribute("inkscape:label");
    if (label) {
      child.setAttribute("id", label.toLowerCase());
    }
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function buildDsvgOutput(
  svgContent: string,
  assignments: LayerAssignments,
  unitPositionCodes: Record<string, string> = {}
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const root = doc.documentElement;

  const rootFill = root.getAttribute("fill");

  // 1. Resolve all transform attributes → bake into coordinates
  resolveTransforms(root);

  // NOTE: removeNonSvgChildren is intentionally deferred until after steps 3–4.
  // Calling it here would remove <sodipodi:namedview> (index 1 in Inkscape files)
  // and shift all subsequent children, making the numeric layer keys (e.g. "root-3")
  // point to the wrong elements during cloning and sibling classification.

  // 2. Clone assigned layers (while original child indices are still intact)
  //    removeNonSvgChildren has NOT been called yet, so indices match parseSvgTree.
  const cloneByKey = (key: string | null): Element | null => {
    if (!key) return null;
    const el = getElementByKey(root, key);
    return el ? (el.cloneNode(true) as Element) : null;
  };

  const provincesEl = cloneByKey(assignments.provinces);
  if (provincesEl) flattenInkscapeSubLayers(provincesEl);
  const namedCoastsEl = cloneByKey(assignments.namedCoasts);
  const unitPositionsEl = cloneByKey(assignments.unitPositions);
  const provinceNamesEl = cloneByKey(assignments.provinceNames);
  const bordersEl = cloneByKey(assignments.borders);

  // 4. Classify sibling groups as background/foreground
  const backgroundNodes: Element[] = [];
  const foregroundNodes: Element[] = [];

  if (assignments.provinces) {
    const provincesPath = assignments.provinces
      .replace(/^root-/, "")
      .split("-")
      .map(Number);
    const provincesLocalIdx = provincesPath[provincesPath.length - 1];
    const parentPath = provincesPath.slice(0, -1);

    let parentEl: Element = root;
    let navigated = true;
    for (const idx of parentPath) {
      const child = parentEl.children[idx];
      if (!child) { navigated = false; break; }
      parentEl = child;
    }

    if (navigated) {
      const assignedLocalIndices = new Set<number>();
      for (const key of [
        assignments.provinces,
        assignments.namedCoasts,
        assignments.unitPositions,
        assignments.provinceNames,
        assignments.borders,
      ]) {
        if (!key) continue;
        const kPath = key.replace(/^root-/, "").split("-").map(Number);
        if (kPath.length !== provincesPath.length) continue;
        const kParent = kPath.slice(0, -1);
        if (!kParent.every((v, i) => v === parentPath[i])) continue;
        assignedLocalIndices.add(kPath[kPath.length - 1]);
      }

      Array.from(parentEl.children).forEach((child, i) => {
        if (child.tagName.toLowerCase() !== "g") return;
        if (assignedLocalIndices.has(i)) return;
        const clone = child.cloneNode(true) as Element;
        if (i < provincesLocalIdx) backgroundNodes.push(clone);
        else foregroundNodes.push(clone);
      });
    }
  }

  // 3b. Now safe to remove non-SVG root children (metadata, sodipodi:namedview, etc.).
  // Cloning and classification above used the original indices; from here on the
  // exact child order of root no longer matters for key-based lookups.
  removeNonSvgChildren(root);

  // 5. Collect non-<g> root children (defs, style, etc.)
  const headerNodes: Node[] = [];
  Array.from(root.childNodes).forEach(child => {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      headerNodes.push(child.cloneNode(true));
    } else if ((child as Element).tagName.toLowerCase() !== "g") {
      headerNodes.push(child.cloneNode(true));
    }
  });

  // 6. Build clean output document in canonical layer order:
  //    background → provinces → named-coasts → unit-positions →
  //    province-names → borders → foreground
  while (root.firstChild) root.removeChild(root.firstChild);
  headerNodes.forEach(n => root.appendChild(n));

  const bg = makeLayerGroup(doc, "background");
  backgroundNodes.forEach(el => bg.appendChild(el));
  root.appendChild(bg);

  const pLayer = provincesEl ?? makeLayerGroup(doc, "provinces");
  pLayer.setAttribute("id", "provinces");
  pLayer.setAttribute("style", "display:none");
  convertShapesToPaths(doc, pLayer);
  // Promote inkscape:label → id so Inkscape-authored province paths get
  // meaningful ids (e.g. "edi") rather than auto-generated ones ("path120").
  // For Figma/generic SVGs that have no inkscape:label this is a no-op.
  relabelByInkscape(pLayer);
  root.appendChild(pLayer);

  const ncLayer = namedCoastsEl ?? makeLayerGroup(doc, "named-coasts");
  ncLayer.setAttribute("id", "named-coasts");
  ncLayer.setAttribute("style", "display:none");
  convertShapesToPaths(doc, ncLayer);
  // Same label promotion for named-coast paths (e.g. "mor/wc").
  relabelByInkscape(ncLayer);
  root.appendChild(ncLayer);

  const upLayer = unitPositionsEl ?? makeLayerGroup(doc, "unit-positions");
  upLayer.setAttribute("id", "unit-positions");
  upLayer.setAttribute("style", "display:none");
  for (const child of Array.from(upLayer.children)) {
    // Prefer inkscape:label (Inkscape files) over id (Figma/generic files) when
    // looking up the user-assigned code so the rename works for both sources.
    const svgId = child.getAttribute("inkscape:label") ?? child.getAttribute("id");
    if (svgId && unitPositionCodes[svgId]) {
      child.setAttribute("id", unitPositionCodes[svgId].toLowerCase());
    }
  }
  // Convert path circles to <circle> elements (diplicity validator requires <circle> tags)
  for (const child of Array.from(upLayer.children)) {
    if (child.tagName.toLowerCase() !== "path") continue;
    const d = child.getAttribute("d");
    if (!d) continue;
    const circle = pathToCircle(d);
    if (!circle) continue;
    const circleEl = doc.createElementNS(SVG_NS, "circle");
    const elId = child.getAttribute("id");
    if (elId) circleEl.setAttribute("id", elId);
    circleEl.setAttribute("cx", String(circle.cx));
    circleEl.setAttribute("cy", String(circle.cy));
    circleEl.setAttribute("r", String(circle.r));
    const fill = child.getAttribute("fill");
    if (fill) circleEl.setAttribute("fill", fill);
    upLayer.replaceChild(circleEl, child);
  }
  root.appendChild(upLayer);

  const pnLayer = provinceNamesEl ?? makeLayerGroup(doc, "province-names");
  pnLayer.setAttribute("id", "province-names");
  pnLayer.setAttribute("style", "display:inline");
  root.appendChild(pnLayer);

  const bLayer = bordersEl ?? makeLayerGroup(doc, "borders");
  bLayer.setAttribute("id", "borders");
  root.appendChild(bLayer);

  const fg = makeLayerGroup(doc, "foreground");
  fg.setAttribute("style", "display:inline");
  foregroundNodes.forEach(el => fg.appendChild(el));
  root.appendChild(fg);

  // 7. Strip all Inkscape/sodipodi attributes from the whole tree
  stripElement(root);
  stripRootNamespaces(root);

  // 8. If the source root declared fill="none", propagate it explicitly to all
  //    drawable elements that lack a fill attribute, so they remain correct when
  //    extracted into a new SVG document by dsvgParser.
  if (rootFill !== null) {
    propagateRootFill(root, rootFill);
  }

  return new XMLSerializer().serializeToString(doc);
}

// ─── Preview helper (unchanged) ───────────────────────────────────────────────

export function buildVisibilityPreviewSvg(
  svgContent: string,
  nodes: SvgTreeNode[],
  visibleKeys: Set<string>
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const root = doc.documentElement;

  for (const node of nodes) {
    const el = getElementByKey(root, node.key);
    if (!el) continue;
    const style = el.getAttribute("style") ?? "";
    const cleaned = style.replace(/display\s*:\s*[^;]+;?\s*/g, "").trim();
    if (visibleKeys.has(node.key)) {
      if (cleaned) el.setAttribute("style", cleaned);
      else el.removeAttribute("style");
    } else {
      el.setAttribute("style", cleaned ? `${cleaned};display:none` : "display:none");
    }
  }

  return new XMLSerializer().serializeToString(doc);
}
