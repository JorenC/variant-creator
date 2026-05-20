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

// ─── Main export ─────────────────────────────────────────────────────────────

export function buildDsvgOutput(
  svgContent: string,
  assignments: LayerAssignments,
  unitPositionCodes: Record<string, string> = {}
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const root = doc.documentElement;

  // 1. Resolve all transform attributes → bake into coordinates
  resolveTransforms(root);

  // 2. Strip non-SVG elements from root
  removeNonSvgChildren(root);

  // 3. Clone assigned layers
  const cloneByKey = (key: string | null): Element | null => {
    if (!key) return null;
    const el = getElementByKey(root, key);
    return el ? (el.cloneNode(true) as Element) : null;
  };

  const provincesEl = cloneByKey(assignments.provinces);
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
  root.appendChild(pLayer);

  const ncLayer = namedCoastsEl ?? makeLayerGroup(doc, "named-coasts");
  ncLayer.setAttribute("id", "named-coasts");
  ncLayer.setAttribute("style", "display:none");
  root.appendChild(ncLayer);

  const upLayer = unitPositionsEl ?? makeLayerGroup(doc, "unit-positions");
  upLayer.setAttribute("id", "unit-positions");
  upLayer.setAttribute("style", "display:none");
  for (const child of Array.from(upLayer.children)) {
    const id = child.getAttribute("id");
    if (id && unitPositionCodes[id]) {
      child.setAttribute("id", unitPositionCodes[id].toLowerCase());
    }
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
