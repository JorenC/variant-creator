import { describe, it, expect } from "vitest";
import { buildDsvgOutput } from "../svgBuild";
import type { LayerAssignments } from "@/types/dsvg";

// SVG structure used in these tests:
//   root > container > [bg, provinces, named-coasts, unit-positions, fg]
// assignments.provinces = "root-0-1" → container.children[1] = provinces
const BASE_ASSIGNMENTS: LayerAssignments = {
  provinces: "root-0-1",
  namedCoasts: null,
  unitPositions: null,
  provinceNames: null,
  borders: null,
  supplyCenters: null,
};

function makeSvg(rootFillAttr: string, extraFgPath: string = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${rootFillAttr}>
  <g id="container">
    <g id="bg"><rect id="bg-rect" width="100" height="100" fill="tan"/></g>
    <g id="provs"><path id="prov1" d="M0 0 L10 0 L10 10 Z" fill="#C0A080"/></g>
    <g id="fg">
      <path id="border1" d="M0 0 L100 0 L100 100 Z" stroke="black"/>
      <path id="name1" d="M5 5 L15 5 L10 15 Z" fill="black"/>
      ${extraFgPath}
    </g>
  </g>
</svg>`;
}

function parseOutput(output: string): Document {
  return new DOMParser().parseFromString(output, "image/svg+xml");
}

function getFill(doc: Document, id: string): string | null {
  return doc.getElementById(id)?.getAttribute("fill") ?? null;
}

// Inkscape SVG with sodipodi:namedview (index 1) before the layer groups.
// parseSvgTree assigns keys with sodipodi:namedview present, so:
//   root.children[0] = defs      → root-0 (skipped, not a <g>)
//   root.children[1] = namedview → root-1 (skipped, not a <g>)
//   root.children[2] = background g → root-2
//   root.children[3] = provinces g  → root-3
//   root.children[4] = fg g         → root-4
// buildDsvgOutput must clone using those original indices (before removing namedview).
function makeInkscapeSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     viewBox="0 0 100 100">
  <defs id="defs1"/>
  <sodipodi:namedview id="namedview1"/>
  <g id="bg" inkscape:groupmode="layer" inkscape:label="background">
    <rect id="bg-rect" width="100" height="100" fill="tan"/>
  </g>
  <g id="provs" inkscape:groupmode="layer" inkscape:label="provinces">
    <path id="path1" inkscape:label="AAA" d="M0 0 L10 0 L10 10 Z"/>
    <path id="path2" inkscape:label="BBB" d="M20 0 L30 0 L30 10 Z"/>
  </g>
  <g id="fg" inkscape:groupmode="layer" inkscape:label="foreground">
    <path id="border1" d="M0 0 L100 0 L100 100 Z"/>
  </g>
</svg>`;
}

describe("buildDsvgOutput – Inkscape sodipodi:namedview index shift", () => {
  it("clones the correct layer when sodipodi:namedview precedes it", () => {
    // provinces is at root.children[3] (index 3) in the Inkscape SVG.
    // Without the fix, removeNonSvgChildren would shift it to index 2
    // and cloneByKey("root-3") would grab the wrong element.
    const assignments: LayerAssignments = {
      provinces: "root-3",
      namedCoasts: null,
      unitPositions: null,
      provinceNames: null,
      borders: null,
      supplyCenters: null,
    };
    const output = buildDsvgOutput(makeInkscapeSvg(), assignments);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");

    const provLayer = doc.getElementById("provinces");
    expect(provLayer).not.toBeNull();
    // After relabelByInkscape, children should have ids from inkscape:label
    const childIds = Array.from(provLayer!.children).map(c => c.getAttribute("id"));
    expect(childIds).toEqual(["aaa", "bbb"]);
  });

  it("does not include the provinces group in the background layer", () => {
    const assignments: LayerAssignments = {
      provinces: "root-3",
      namedCoasts: null,
      unitPositions: null,
      provinceNames: null,
      borders: null,
      supplyCenters: null,
    };
    const output = buildDsvgOutput(makeInkscapeSvg(), assignments);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");

    // The provinces group (id="provs") must NOT appear inside background
    const bgLayer = doc.getElementById("background");
    expect(bgLayer).not.toBeNull();
    // provs should not be a descendant of background
    expect(bgLayer!.querySelector("#provs")).toBeNull();
  });
});

// SVG with provinces (root-0) and named-coasts (root-1) at the root level.
function makeCoastSvg(coastPaths: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="provs"><path id="spa" d="M0 0 L10 0 L10 10 Z"/></g>
  <g id="coasts">${coastPaths}</g>
</svg>`;
}

const COAST_ASSIGNMENTS: LayerAssignments = {
  provinces: "root-0",
  namedCoasts: "root-1",
  unitPositions: null,
  provinceNames: null,
  borders: null,
  supplyCenters: null,
};

describe("buildDsvgOutput – named coast ID renaming", () => {
  it("renames coast paths to parentProvince/coastAbbr using plain id lookup", () => {
    const svg = makeCoastSvg(`
      <path id="spain nc" d="M0 0 L5 0 L5 5 Z"/>
      <path id="spain sc" d="M5 0 L10 0 L10 5 Z"/>
    `);
    const entries = [
      { svgId: "spain nc", parentProvince: "spa", coastAbbr: "nc" },
      { svgId: "spain sc", parentProvince: "spa", coastAbbr: "sc" },
    ];
    const output = buildDsvgOutput(svg, COAST_ASSIGNMENTS, {}, entries);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const ncLayer = doc.getElementById("named-coasts");
    const ids = Array.from(ncLayer!.children).map(c => c.getAttribute("id"));
    expect(ids).toContain("spa/nc");
    expect(ids).toContain("spa/sc");
  });

  it("renames coast paths via inkscape:label lookup (Inkscape SVGs)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
      viewBox="0 0 100 100">
  <g id="provs"><path id="spa" d="M0 0 L10 0 L10 10 Z"/></g>
  <g id="coasts">
    <path id="path11" inkscape:label="spain nc" d="M0 0 L5 0 L5 5 Z"/>
    <path id="path12" inkscape:label="spain sc" d="M5 0 L10 0 L10 5 Z"/>
  </g>
</svg>`;
    const entries = [
      { svgId: "spain nc", parentProvince: "spa", coastAbbr: "nc" },
      { svgId: "spain sc", parentProvince: "spa", coastAbbr: "sc" },
    ];
    const output = buildDsvgOutput(svg, COAST_ASSIGNMENTS, {}, entries);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const ncLayer = doc.getElementById("named-coasts");
    const ids = Array.from(ncLayer!.children).map(c => c.getAttribute("id"));
    expect(ids).toContain("spa/nc");
    expect(ids).toContain("spa/sc");
  });

  it("leaves coast paths with no matching entry unchanged", () => {
    const svg = makeCoastSvg(`
      <path id="spain nc" d="M0 0 L5 0 L5 5 Z"/>
      <path id="unknown coast" d="M5 0 L10 0 L10 5 Z"/>
    `);
    const entries = [
      { svgId: "spain nc", parentProvince: "spa", coastAbbr: "nc" },
    ];
    const output = buildDsvgOutput(svg, COAST_ASSIGNMENTS, {}, entries);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const ncLayer = doc.getElementById("named-coasts");
    const ids = Array.from(ncLayer!.children).map(c => c.getAttribute("id"));
    expect(ids).toContain("spa/nc");
    expect(ids).toContain("unknown coast");
  });

  it("skips entries with empty parentProvince or coastAbbr", () => {
    const svg = makeCoastSvg(`<path id="spain nc" d="M0 0 L5 0 L5 5 Z"/>`);
    const entries = [
      { svgId: "spain nc", parentProvince: "", coastAbbr: "nc" },
    ];
    const output = buildDsvgOutput(svg, COAST_ASSIGNMENTS, {}, entries);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const ncLayer = doc.getElementById("named-coasts");
    const ids = Array.from(ncLayer!.children).map(c => c.getAttribute("id"));
    expect(ids).toContain("spain nc");
    expect(ids).not.toContain("/nc");
  });

  it("produces no coast elements when namedCoastEntries is empty (existing behaviour)", () => {
    const svg = makeCoastSvg(`<path id="spain coasts" d="M0 0 L5 0 L5 5 Z"/>`);
    const output = buildDsvgOutput(svg, COAST_ASSIGNMENTS, {}, []);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const ncLayer = doc.getElementById("named-coasts");
    const ids = Array.from(ncLayer!.children).map(c => c.getAttribute("id"));
    // Without entries the original id is preserved unchanged
    expect(ids).toContain("spain coasts");
  });
});

describe("buildDsvgOutput – named coast Inkscape sub-layer flattening", () => {
  it("expands labeled sub-layer groups into individual coast paths", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
      viewBox="0 0 100 100">
  <g id="provs"><path id="plu" d="M0 0 L10 0 L10 10 Z"/></g>
  <g id="coasts">
    <g id="g1" inkscape:label="Plutarch Coasts">
      <path id="path1" inkscape:label="plu/sg" d="M0 0 L5 0 L5 5 Z"/>
      <path id="path2" inkscape:label="plu/ss" d="M5 0 L10 0 L10 5 Z"/>
    </g>
  </g>
</svg>`;
    const entries = [
      { svgId: "plu/sg", parentProvince: "plu", coastAbbr: "sg" },
      { svgId: "plu/ss", parentProvince: "plu", coastAbbr: "ss" },
    ];
    const output = buildDsvgOutput(svg, COAST_ASSIGNMENTS, {}, entries);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const ncLayer = doc.getElementById("named-coasts");
    const ids = Array.from(ncLayer!.children).map(c => c.getAttribute("id"));
    expect(ids).toContain("plu/sg");
    expect(ids).toContain("plu/ss");
    expect(ids).toHaveLength(2);
  });

  it("merges unlabeled Figma-style groups into compound paths", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="provs"><path id="suk" d="M0 0 L10 0 L10 10 Z"/></g>
  <g id="coasts">
    <g id="suk/sc">
      <path d="M0 0 L5 0 L5 5 Z"/>
      <path d="M5 0 L10 0 L10 5 Z"/>
    </g>
  </g>
</svg>`;
    const entries = [
      { svgId: "suk/sc", parentProvince: "suk", coastAbbr: "sc" },
    ];
    const output = buildDsvgOutput(svg, COAST_ASSIGNMENTS, {}, entries);
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const ncLayer = doc.getElementById("named-coasts");
    expect(ncLayer!.children).toHaveLength(1);
    expect(ncLayer!.children[0].getAttribute("id")).toBe("suk/sc");
    expect(ncLayer!.children[0].tagName.toLowerCase()).toBe("path");
  });
});

describe("buildDsvgOutput – canonical layer structure (dsvgParser contract)", () => {
  // These tests enforce that every layer required by diplicity-react's parseDsvg
  // is a *direct child* of the root <svg> element. parseDsvg uses findLayer()
  // which only looks at root.children — nested layers are invisible to it.
  function rootLayers(output: string): Array<{ id: string; style: string | null }> {
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    return Array.from(doc.documentElement.children)
      .filter(el => el.tagName.toLowerCase() === "g")
      .map(el => ({ id: el.getAttribute("id") ?? "", style: el.getAttribute("style") }));
  }

  it("places provinces as a direct root child with display:none", () => {
    const layers = rootLayers(buildDsvgOutput(makeSvg(""), BASE_ASSIGNMENTS));
    const prov = layers.find(l => l.id === "provinces");
    expect(prov).toBeDefined();
    expect(prov?.style).toBe("display:none");
  });

  it("places unit-positions as a direct root child with display:none", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="provs"><path id="par" d="M0 0 L10 0 L10 10 Z"/></g>
  <g id="ups"><circle id="par" cx="5" cy="5" r="3"/></g>
</svg>`;
    const assignments: LayerAssignments = {
      ...BASE_ASSIGNMENTS,
      unitPositions: "root-1",
    };
    const layers = rootLayers(buildDsvgOutput(svg, assignments));
    const up = layers.find(l => l.id === "unit-positions");
    expect(up).toBeDefined();
    expect(up?.style).toBe("display:none");
  });

  it("places supply-centers inside foreground as the top-most layer", () => {
    // SC and an extra unassigned layer are siblings of provinces (all inside root-0 container).
    // An extra unassigned layer after SC ensures SC still ends up last in foreground.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="container">
    <g id="bg"><rect width="100" height="100"/></g>
    <g id="provs"><path id="par" d="M0 0 L10 0 L10 10 Z"/></g>
    <g id="scs"><circle id="sc1" cx="5" cy="5" r="3"/></g>
    <g id="other-fg"><path id="other" d="M50 50 L60 60"/></g>
  </g>
</svg>`;
    const assignments: LayerAssignments = {
      ...BASE_ASSIGNMENTS,
      supplyCenters: "root-0-2",
    };
    const output = buildDsvgOutput(svg, assignments);
    const layers = rootLayers(output);

    // Must NOT be a direct root child
    expect(layers.find(l => l.id === "supply-centers")).toBeUndefined();

    // SC content must appear inside foreground
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const fg = Array.from(doc.documentElement.children).find(
      el => el.tagName.toLowerCase() === "g" && el.getAttribute("id") === "foreground"
    );
    expect(fg?.querySelector("#sc1")).toBeDefined();

    // SC group must be the last child of foreground (rendered on top)
    const fgChildren = fg ? Array.from(fg.children) : [];
    expect(fgChildren[fgChildren.length - 1]?.getAttribute("id")).toBe("scs");
  });

  it("canonical layer order: background → provinces → named-coasts → unit-positions → province-names → borders → foreground", () => {
    const layers = rootLayers(buildDsvgOutput(makeSvg(""), BASE_ASSIGNMENTS));
    const ids = layers.map(l => l.id);
    const order = ["background", "provinces", "named-coasts", "unit-positions", "province-names", "borders", "foreground"];
    const indices = order.map(id => ids.indexOf(id));
    for (const [i, id] of order.entries()) {
      expect(ids).toContain(id);
      if (i > 0) expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });
});

describe("buildDsvgOutput – root fill propagation", () => {
  it("adds fill='none' to paths without explicit fill when root has fill='none'", () => {
    const svg = makeSvg(` fill="none"`);
    const output = buildDsvgOutput(svg, BASE_ASSIGNMENTS);
    const doc = parseOutput(output);

    expect(getFill(doc, "border1")).toBe("none");
  });

  it("does not override explicit fills when root has fill='none'", () => {
    const svg = makeSvg(` fill="none"`);
    const output = buildDsvgOutput(svg, BASE_ASSIGNMENTS);
    const doc = parseOutput(output);

    expect(getFill(doc, "name1")).toBe("black");
    expect(getFill(doc, "prov1")).toBe("#C0A080");
    expect(getFill(doc, "bg-rect")).toBe("tan");
  });

  it("does not add fill to paths when root has no fill attribute", () => {
    const svg = makeSvg("");
    const output = buildDsvgOutput(svg, BASE_ASSIGNMENTS);
    const doc = parseOutput(output);

    expect(getFill(doc, "border1")).toBeNull();
  });

  it("propagates a non-none root fill value", () => {
    const svg = makeSvg(` fill="red"`);
    const output = buildDsvgOutput(svg, BASE_ASSIGNMENTS);
    const doc = parseOutput(output);

    expect(getFill(doc, "border1")).toBe("red");
  });

  it("applies propagation to all drawable element types in foreground", () => {
    const extraShapes = `
      <circle id="c1" cx="50" cy="50" r="10" stroke="black"/>
      <rect id="r1" x="10" y="10" width="20" height="20" stroke="black"/>
      <ellipse id="e1" cx="30" cy="30" rx="5" ry="5"/>
      <circle id="c2" cx="70" cy="70" r="5" fill="white"/>
    `;
    const svg = makeSvg(` fill="none"`, extraShapes);
    const output = buildDsvgOutput(svg, BASE_ASSIGNMENTS);
    const doc = parseOutput(output);

    expect(getFill(doc, "c1")).toBe("none");
    expect(getFill(doc, "r1")).toBe("none");
    expect(getFill(doc, "e1")).toBe("none");
    expect(getFill(doc, "c2")).toBe("white");
  });
});

describe("buildDsvgOutput – unit-position markers from arc paths", () => {
  it("centers the circle on a marker drawn as M + two arcs (Inkscape sodipodi circle)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="container">
    <g id="bg"></g>
    <g id="provs"><path id="par" d="M0 0 L100 0 L100 100 L0 100 Z"/></g>
    <g id="ups"><path id="par-marker" d="M 60 50 A 10 10 0 1 0 40 50 A 10 10 0 1 0 60 50 Z"/></g>
    <g id="fg"></g>
  </g>
</svg>`;
    const output = buildDsvgOutput(svg, {
      provinces: "root-0-1",
      namedCoasts: null,
      unitPositions: "root-0-2",
      provinceNames: null,
      borders: null,
      supplyCenters: null,
    }, { "par-marker": "par" });
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const circle = doc.getElementById("par");
    // provinces layer also has id "par"; find the circle specifically
    const circles = Array.from(doc.querySelectorAll("circle"));
    expect(circles).toHaveLength(1);
    expect(circle).not.toBeNull();
    expect(parseFloat(circles[0].getAttribute("cx")!)).toBeCloseTo(50, 3);
    expect(parseFloat(circles[0].getAttribute("cy")!)).toBeCloseTo(50, 3);
    expect(parseFloat(circles[0].getAttribute("r")!)).toBeCloseTo(10, 3);
  });
});

describe("buildDsvgOutput – compound path concatenation", () => {
  it("normalizes relative subpath starts so merged fragments do not shift", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="container">
    <g id="bg"></g>
    <g id="provs">
      <g id="par">
        <path d="M 0 0 L 10 0 L 10 10 Z"/>
        <path d="m 50 50 l 10 0 l 0 10 z"/>
      </g>
    </g>
    <g id="fg"></g>
  </g>
</svg>`;
    const output = buildDsvgOutput(svg, {
      provinces: "root-0-1",
      namedCoasts: null,
      unitPositions: null,
      provinceNames: null,
      borders: null,
      supplyCenters: null,
    });
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    const merged = doc.getElementById("par")!;
    expect(merged.tagName.toLowerCase()).toBe("path");
    // The island fragment must still start at absolute (50, 50), not at
    // (10, 10) + relative (50, 50) = (60, 60).
    expect(merged.getAttribute("d")).toBe("M 0 0 L 10 0 L 10 10 Z M 50 50 L 60 50 L 60 60 Z");
  });
});
