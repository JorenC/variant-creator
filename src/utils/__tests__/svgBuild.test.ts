import { describe, it, expect } from "vitest";
import { buildDsvgOutput } from "../svgBuild";
import type { LayerAssignments } from "@/components/dsvg/LayerAssignment";

// SVG structure used in these tests:
//   root > container > [bg, provinces, named-coasts, unit-positions, fg]
// assignments.provinces = "root-0-1" → container.children[1] = provinces
const BASE_ASSIGNMENTS: LayerAssignments = {
  provinces: "root-0-1",
  namedCoasts: null,
  unitPositions: null,
  provinceNames: null,
  borders: null,
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
