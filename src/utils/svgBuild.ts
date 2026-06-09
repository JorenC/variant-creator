import type { SvgTreeNode } from "@/utils/svgTree";
import type { LayerAssignments } from "@/types/dsvg";
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

// Matches typical province/coast IDs (2–5 letters/digits, optional /2–4 suffix).
const PROVINCE_ID_RE = /^[a-zA-Z0-9]{2,5}(\/[a-zA-Z0-9]{2,4})?$/;

// Returns true if any direct child of `el` has a user-assigned inkscape:label
// (i.e. the label differs from the auto-generated id Inkscape copies to it).
function hasNamedChildren(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    const label = child.getAttribute("inkscape:label");
    if (label && label !== child.getAttribute("id")) return true;
  }
  return false;
}

// Flattens Inkscape sub-layer groups into direct children of `el`.
//
// When `force` is false (provinces/named-coasts): a <g> with inkscape:label is
// only flattened if its children carry their own user-assigned labels, meaning
// it is an organisational sub-layer (e.g. "mountains" containing "kie"/"par").
// A <g> whose children have no user-assigned labels is treated as a composite
// shape (e.g. "kie" island + mainland) and left intact for
// flattenGroupsToCompoundPaths to merge later.  Warnings are emitted for
// ambiguous cases where detection is uncertain.
//
// When `force` is true (unit-positions): all <g> sub-layers are always
// flattened regardless of child labels, because unit-position markers are
// single points — composite groups do not apply there.
function flattenInkscapeSubLayers(el: Element, force = false, warnings?: string[]): void {
  const toRemove: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase() !== "g") continue;

    const isLayer = child.getAttribute("inkscape:groupmode") === "layer";
    const label = child.getAttribute("inkscape:label");
    const named = label !== null && hasNamedChildren(child);

    const shouldFlatten = isLayer || force || named;

    if (shouldFlatten) {
      if (warnings && label !== null && named && PROVINCE_ID_RE.test(label)) {
        // Province-like label but has named children: treating as sub-layer,
        // which may not be what the user intended.
        warnings.push(
          `Group "${label}" looks like a province ID but contains labeled sub-elements — treating as a sub-layer. ` +
          `If "${label}" is a composite shape (e.g. mainland + island), remove the labels from its child paths.`
        );
      }
      flattenInkscapeSubLayers(child, force, warnings);
      for (const gc of Array.from(child.children)) {
        el.insertBefore(gc, child);
      }
      toRemove.push(child);
    } else if (label !== null && !force && warnings && !PROVINCE_ID_RE.test(label)) {
      // Non-province-like label with no named children: treating as composite
      // shape, but long/descriptive names are more likely sub-layers.
      warnings.push(
        `Group "${label}" has no labeled children — treating as a composite shape. ` +
        `If it is a sub-layer containing separate provinces, add inkscape:label to its child elements.`
      );
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

// Collapses any <g> direct-children of a layer into a single compound <path>.
// The diplicity validator requires each element in provinces/named-coasts to be
// a <path> with an id; groups fail validation even when the group itself has an id.
// Child paths are deduplicated (Inkscape sometimes emits duplicate subpaths as
// artefacts) and their d attributes are concatenated into one compound path.
function flattenGroupsToCompoundPaths(doc: Document, layer: Element): void {
  for (const child of Array.from(layer.children)) {
    if (child.tagName.toLowerCase() !== "g") continue;

    const seenDs = new Set<string>();
    const uniqueDs: string[] = [];
    for (const pathEl of Array.from(child.querySelectorAll("path"))) {
      const d = pathEl.getAttribute("d");
      if (d && !seenDs.has(d)) {
        seenDs.add(d);
        uniqueDs.push(d);
      }
    }

    if (uniqueDs.length === 0) continue;

    const merged = doc.createElementNS(SVG_NS, "path");
    const id = child.getAttribute("id");
    if (id) merged.setAttribute("id", id);

    const firstPath = child.querySelector("path");
    if (firstPath) {
      const fill = firstPath.getAttribute("fill");
      if (fill) merged.setAttribute("fill", fill);
      const style = firstPath.getAttribute("style");
      if (style) merged.setAttribute("style", style);
    }

    merged.setAttribute("d", uniqueDs.join(" "));
    layer.replaceChild(merged, child);
  }
}

// ─── Path centre extraction (for unit-position markers) ──────────────────────

// Returns the bounding-box centre and approximate radius of a path element by
// sampling the start point (M) and the destination point of each absolute
// C / L / Q command. Works for circles drawn with any number of bezier arcs
// (Inkscape uses 4, some exporters use 3) as well as arbitrary compound shapes
// — diplicity-react only needs cx/cy for unit placement, so an approximation is fine.
function pathCenter(d: string): { cx: number; cy: number; r: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];

  const mMatch = d.match(/M\s*([-\d.e]+)[,\s]+([-\d.e]+)/);
  if (!mMatch) return null;
  xs.push(parseFloat(mMatch[1]));
  ys.push(parseFloat(mMatch[2]));

  let m;
  // Absolute C: endpoint is 5th and 6th of the six numbers per triplet
  const cRe = /C\s*[-\d.e]+[,\s]+[-\d.e]+[,\s]+[-\d.e]+[,\s]+[-\d.e]+[,\s]+([-\d.e]+)[,\s]+([-\d.e]+)/g;
  while ((m = cRe.exec(d)) !== null) { xs.push(parseFloat(m[1])); ys.push(parseFloat(m[2])); }

  // Absolute L
  const lRe = /L\s*([-\d.e]+)[,\s]+([-\d.e]+)/g;
  while ((m = lRe.exec(d)) !== null) { xs.push(parseFloat(m[1])); ys.push(parseFloat(m[2])); }

  // Absolute Q: endpoint is 3rd and 4th of four numbers
  const qRe = /Q\s*[-\d.e]+[,\s]+[-\d.e]+[,\s]+([-\d.e]+)[,\s]+([-\d.e]+)/g;
  while ((m = qRe.exec(d)) !== null) { xs.push(parseFloat(m[1])); ys.push(parseFloat(m[2])); }

  if (xs.length === 0) return null;
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  if (!isFinite(minX)) return null;

  const w = maxX - minX, h = maxY - minY;
  return {
    cx: parseFloat(((minX + maxX) / 2).toFixed(3)),
    cy: parseFloat(((minY + maxY) / 2).toFixed(3)),
    r: Math.max(parseFloat(((w + h) / 4).toFixed(3)), 1),
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
  unitPositionCodes: Record<string, string> = {},
  namedCoastEntries: Array<{ svgId: string; parentProvince: string; coastAbbr: string }> = [],
  warnings?: string[]
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
  if (provincesEl) flattenInkscapeSubLayers(provincesEl, false, warnings);
  const namedCoastsEl = cloneByKey(assignments.namedCoasts);
  const unitPositionsEl = cloneByKey(assignments.unitPositions);
  const provinceNamesEl = cloneByKey(assignments.provinceNames);
  const bordersEl = cloneByKey(assignments.borders);

  // 4. Classify sibling groups as background/foreground
  // scForegroundNodes is kept separate so SC is always appended last (top of foreground).
  const backgroundNodes: Element[] = [];
  const foregroundNodes: Element[] = [];
  const scForegroundNodes: Element[] = [];

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

      let scLocalIdx: number | null = null;
      if (assignments.supplyCenters) {
        const scPath = assignments.supplyCenters.replace(/^root-/, "").split("-").map(Number);
        if (scPath.length === provincesPath.length) {
          const scParent = scPath.slice(0, -1);
          if (scParent.every((v, j) => v === parentPath[j])) {
            scLocalIdx = scPath[scPath.length - 1];
          }
        }
      }

      Array.from(parentEl.children).forEach((child, i) => {
        if (child.tagName.toLowerCase() !== "g") return;
        if (assignedLocalIndices.has(i)) return;
        const clone = child.cloneNode(true) as Element;
        if (i < provincesLocalIdx) backgroundNodes.push(clone);
        else if (i === scLocalIdx) scForegroundNodes.push(clone);
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
  //    province-names → borders → foreground (supply-centers live inside foreground)
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
  // Merge any <g> children into compound <path> elements. Inkscape sometimes
  // produces tiny artefact sub-paths that share a group with the main province
  // shape; the diplicity validator requires each provinces-layer child to be a
  // <path> with an id, so groups must be flattened.
  flattenGroupsToCompoundPaths(doc, pLayer);
  root.appendChild(pLayer);

  const ncLayer = namedCoastsEl ?? makeLayerGroup(doc, "named-coasts");
  ncLayer.setAttribute("id", "named-coasts");
  ncLayer.setAttribute("style", "display:none");
  // Hoist Inkscape sub-layer groups into direct children before processing.
  // Uses the labeled-children heuristic: a <g> is only flattened if its children
  // carry user-assigned labels (sub-layer), otherwise kept as a composite shape
  // for flattenGroupsToCompoundPaths to merge below.
  flattenInkscapeSubLayers(ncLayer, false, warnings);
  convertShapesToPaths(doc, ncLayer);
  // Same label promotion for named-coast paths (e.g. "mor/wc").
  relabelByInkscape(ncLayer);
  // Apply user-assigned parentProvince/coastAbbr IDs from the NamedCoastEditor step.
  // Mirrors the unitPositionCodes rename loop above. Uses inkscape:label ?? id as the
  // lookup key (matching what extractProvinces shows users in the editor).
  for (const child of Array.from(ncLayer.children)) {
    const svgId = child.getAttribute("inkscape:label") ?? child.getAttribute("id");
    const entry = namedCoastEntries.find(e => e.svgId === svgId);
    if (entry?.parentProvince && entry?.coastAbbr) {
      child.setAttribute("id", `${entry.parentProvince}/${entry.coastAbbr}`);
    }
  }
  // Same group-flattening for named coasts.
  flattenGroupsToCompoundPaths(doc, ncLayer);
  root.appendChild(ncLayer);

  const upLayer = unitPositionsEl ?? makeLayerGroup(doc, "unit-positions");
  upLayer.setAttribute("id", "unit-positions");
  upLayer.setAttribute("style", "display:none");
  // Unit-position markers are single points; composite groups don't apply here,
  // so always force-flatten to ensure all ellipses/circles reach the top level.
  flattenInkscapeSubLayers(upLayer, true);
  for (const child of Array.from(upLayer.children)) {
    // Prefer inkscape:label (Inkscape files) over id (Figma/generic files) when
    // looking up the user-assigned code so the rename works for both sources.
    const svgId = child.getAttribute("inkscape:label") ?? child.getAttribute("id");
    if (svgId && unitPositionCodes[svgId]) {
      child.setAttribute("id", unitPositionCodes[svgId].toLowerCase());
    }
  }
  // Convert all non-circle children to <circle> (diplicity requires <circle> for unit positions).
  // Paths are converted by sampling key endpoints for the bounding-box centre.
  // rect/ellipse use their geometric centre directly.
  for (const child of Array.from(upLayer.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "circle") continue;

    let cx: number | null = null;
    let cy: number | null = null;
    let r = 10;

    if (tag === "path") {
      const d = child.getAttribute("d");
      if (!d) continue;
      const result = pathCenter(d);
      if (!result) continue;
      cx = result.cx; cy = result.cy; r = result.r;
    } else if (tag === "ellipse") {
      cx = parseFloat(child.getAttribute("cx") ?? "0");
      cy = parseFloat(child.getAttribute("cy") ?? "0");
      r = parseFloat(child.getAttribute("rx") ?? child.getAttribute("ry") ?? "10");
    } else if (tag === "rect") {
      const x = parseFloat(child.getAttribute("x") ?? "0");
      const y = parseFloat(child.getAttribute("y") ?? "0");
      cx = x + parseFloat(child.getAttribute("width") ?? "0") / 2;
      cy = y + parseFloat(child.getAttribute("height") ?? "0") / 2;
    } else {
      continue;
    }

    if (cx === null || cy === null) continue;

    const circleEl = doc.createElementNS(SVG_NS, "circle");
    const elId = child.getAttribute("id");
    if (elId) circleEl.setAttribute("id", elId);
    circleEl.setAttribute("cx", String(cx));
    circleEl.setAttribute("cy", String(cy));
    circleEl.setAttribute("r", String(r));
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
  scForegroundNodes.forEach(el => fg.appendChild(el));
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
