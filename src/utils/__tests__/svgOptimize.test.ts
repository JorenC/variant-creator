import { describe, it, expect } from "vitest";
import { optimizeDsvg } from "../svgOptimize";

// Miniature dSVG mirroring the structure buildDsvgOutput emits: layer groups
// with meaningful ids, hidden province/coast/position layers, empty placeholder
// layers, unit-position circles, and per-element fills from propagateRootFill.
const FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100.000000 100.000000">
  <!-- editor comment that should be stripped -->
  <g id="background">
    <path d="M 10.000000 10.000000 L 20.000000 10.000000 L 20.000000 20.000000 Z" fill="none"/>
  </g>
  <g id="provinces" style="display:none">
    <path id="par" d="M 0.000000 0.000000 L 10.000000 0.000000 L 10.000000 10.000000 Z" fill="none"/>
    <path id="bre" d="M 10.000000 0.000000 L 20.000000 0.000000 L 20.000000 10.000000 Z" fill="none"/>
  </g>
  <g id="named-coasts" style="display:none">
    <path id="spa/nc" d="M 30.000000 0.000000 L 40.000000 0.000000 L 40.000000 10.000000 Z" fill="none"/>
  </g>
  <g id="unit-positions" style="display:none">
    <circle id="par" cx="5.000000" cy="5.000000" r="2.000000" fill="none"/>
    <circle id="bre" cx="15.000000" cy="5.000000" r="2.000000" fill="none"/>
    <circle id="spa/nc" cx="35.000000" cy="5.000000" r="2.000000" fill="none"/>
  </g>
  <g id="province-names" style="display:inline"></g>
  <g id="borders">
    <path d="M 0.000000 0.000000 L 50.000000 0.000000" fill="none"/>
  </g>
  <g id="foreground" style="display:inline"></g>
</svg>`;

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

describe("optimizeDsvg", () => {
  const result = optimizeDsvg(FIXTURE);
  const doc = parse(result);

  it("produces valid, smaller XML with comments removed", () => {
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(result).not.toContain("editor comment");
    expect(result.length).toBeLessThan(FIXTURE.length);
  });

  it("preserves the viewBox", () => {
    expect(doc.documentElement.getAttribute("viewBox")).toBeTruthy();
  });

  it("preserves all layer-group ids as direct <svg> children", () => {
    const rootGroupIds = Array.from(doc.documentElement.children)
      .filter(el => el.tagName === "g")
      .map(el => el.getAttribute("id"));
    expect(rootGroupIds).toEqual([
      "background",
      "provinces",
      "named-coasts",
      "unit-positions",
      "province-names",
      "borders",
      "foreground",
    ]);
  });

  it("keeps hidden layers and their display:none styling", () => {
    for (const layerId of ["provinces", "named-coasts", "unit-positions"]) {
      const layer = doc.getElementById(layerId);
      expect(layer, layerId).not.toBeNull();
      expect(layer!.getAttribute("style"), layerId).toContain("display:none");
    }
  });

  it("preserves province and named-coast path ids", () => {
    const provinceIds = Array.from(doc.querySelectorAll("#provinces path"))
      .map(el => el.getAttribute("id"));
    expect(provinceIds).toEqual(["par", "bre"]);
    const coast = doc.querySelector("#named-coasts path");
    expect(coast?.getAttribute("id")).toBe("spa/nc");
  });

  it("keeps unit positions as <circle> elements with their ids", () => {
    const circles = Array.from(doc.querySelectorAll("#unit-positions circle"));
    expect(circles.map(el => el.getAttribute("id"))).toEqual(["par", "bre", "spa/nc"]);
    expect(doc.querySelectorAll("#unit-positions path")).toHaveLength(0);
  });

  it("keeps empty placeholder layers", () => {
    expect(doc.getElementById("province-names")).not.toBeNull();
    expect(doc.getElementById("foreground")).not.toBeNull();
  });

  it("does not dissolve single-child groups into their child", () => {
    const borders = doc.getElementById("borders");
    expect(borders?.tagName).toBe("g");
    expect(borders?.children).toHaveLength(1);
  });

  it("keeps per-element fill attributes (propagateRootFill output)", () => {
    for (const el of Array.from(doc.querySelectorAll("path, circle"))) {
      expect(el.getAttribute("fill")).toBe("none");
    }
  });
});
