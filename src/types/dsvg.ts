/**
 * Shared types for the dSVG Creator. These describe how source SVG layers map onto
 * Diplicity's canonical roles, and the named-coast sub-regions derived from them.
 * Logic in `src/utils` and the dSVG step components both import from here.
 */

export interface LayerAssignments {
  provinces: string | null;
  namedCoasts: string | null;
  unitPositions: string | null;
  provinceNames: string | null;
  borders: string | null;
  supplyCenters: string | null;
}

export interface NamedCoastEntry {
  svgId: string;
  parentProvince: string;
  coastAbbr: string;
}
