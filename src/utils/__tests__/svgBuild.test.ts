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
