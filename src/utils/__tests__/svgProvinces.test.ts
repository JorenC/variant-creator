import { describe, it, expect } from "vitest";
import { detectAmbiguousGroups } from "../svgProvinces";

function makeLayerSvg(layerChildren: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg"
    xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
    viewBox="0 0 100 100">
  <g id="layer">${layerChildren}</g>
</svg>`;
}

describe("detectAmbiguousGroups", () => {
  it("returns empty when all group children have inkscape:label", () => {
    const svg = makeLayerSvg(`
      <g id="g1" inkscape:label="Coasts">
        <path inkscape:label="plu/sg" d="M0 0 Z"/>
        <path inkscape:label="plu/ss" d="M1 0 Z"/>
      </g>
    `);
    expect(detectAmbiguousGroups(svg, "root-0")).toEqual([]);
  });

  it("returns empty when all group children have no inkscape:label", () => {
    const svg = makeLayerSvg(`
      <g id="suk/sc">
        <path d="M0 0 Z"/>
        <path d="M1 0 Z"/>
      </g>
    `);
    expect(detectAmbiguousGroups(svg, "root-0")).toEqual([]);
  });

  it("flags a group whose children are mixed labeled and unlabeled", () => {
    const svg = makeLayerSvg(`
      <g id="mixed-group">
        <path inkscape:label="plu/sg" d="M0 0 Z"/>
        <path d="M1 0 Z"/>
      </g>
    `);
    expect(detectAmbiguousGroups(svg, "root-0")).toEqual(["mixed-group"]);
  });

  it("uses inkscape:label as the group identifier when present", () => {
    const svg = makeLayerSvg(`
      <g id="g1" inkscape:label="Plutarch Coasts">
        <path inkscape:label="plu/sg" d="M0 0 Z"/>
        <path d="M1 0 Z"/>
      </g>
    `);
    expect(detectAmbiguousGroups(svg, "root-0")).toEqual(["Plutarch Coasts"]);
  });

  it("returns empty for a layer with only direct paths (no groups)", () => {
    const svg = makeLayerSvg(`
      <path inkscape:label="plu/sg" d="M0 0 Z"/>
      <path inkscape:label="plu/ss" d="M1 0 Z"/>
    `);
    expect(detectAmbiguousGroups(svg, "root-0")).toEqual([]);
  });

  it("returns empty when the layer key is invalid", () => {
    const svg = makeLayerSvg(`<path d="M0 0 Z"/>`);
    expect(detectAmbiguousGroups(svg, "root-99")).toEqual([]);
  });
});
