import { optimize } from "svgo/browser";

// Minifies a built dSVG with SVGO. The overrides disable every preset-default
// plugin that would break the dSVG contract enforced by buildDsvgOutput and
// the diplicity dsvgParser:
// - cleanupIds: province/coast/circle ids and layer-group ids are meaningful
// - removeHiddenElems: provinces/named-coasts/unit-positions layers are
//   intentionally style="display:none"
// - removeEmptyContainers: unassigned roles export as empty placeholder layers
// - convertShapeToPath: unit positions must remain <circle> elements
// - collapseGroups: dissolves a single-child group by moving its id onto the
//   child, turning <g id="borders"><path/></g> into <path id="borders"/>
// - moveElemsAttrsToGroup: hoists per-element fill to the group, undoing
//   propagateRootFill (dsvgParser extracts elements out of their groups)
// - removeUselessStrokeAndFill: strips explicit fill="none" that propagateRootFill
//   stamped onto elements, treating them as redundant because the SVG root also has
//   fill="none". Those fills are intentional — without them, elements inherit
//   fill="black" from the React <svg> wrapper that doesn't carry the root fill.
export function optimizeDsvg(svgString: string): string {
  return optimize(svgString, {
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            cleanupIds: false,
            removeHiddenElems: false,
            removeEmptyContainers: false,
            convertShapeToPath: false,
            collapseGroups: false,
            moveElemsAttrsToGroup: false,
            removeUselessStrokeAndFill: false,
          },
        },
      },
    ],
  }).data;
}
