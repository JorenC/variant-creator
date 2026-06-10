/**
 * Reconciles an imported `.dvar` against the province/coast IDs found in the uploaded
 * dSVG: detects which IDs no longer match, and remaps (or drops) the dVAR's data
 * accordingly. Pure logic — no DOM, no React.
 */

import type { ParsedDsvg } from "@/utils/parseDsvg";
import type {
  DvarJson,
  DvarJsonAdjacency,
  DvarJsonNamedCoast,
  DvarJsonProvince,
  DvarJsonSupplyCenter,
  DvarJsonUnit,
  DvarJsonDomRule,
  ReconcileMap,
  ReconcileMismatches,
} from "@/types/dvar";

/** Compares dVAR IDs against dSVG IDs, reporting which exist in only one of the two. */
export function computeMismatches(dvar: DvarJson, dsvg: ParsedDsvg): ReconcileMismatches {
  const dvarProvinceIds = new Set((dvar.provinces ?? []).map(p => p.id));
  const dvarCoastIds = new Set((dvar.namedCoasts ?? []).map(c => c.id));
  const dsvgProvinceIds = new Set(dsvg.provinceIds);
  const dsvgCoastIds = new Set(dsvg.namedCoastIds);
  return {
    missingProvinces: [...dvarProvinceIds].filter(id => !dsvgProvinceIds.has(id)),
    missingCoasts: [...dvarCoastIds].filter(id => !dsvgCoastIds.has(id)),
    newProvinces: [...dsvgProvinceIds].filter(id => !dvarProvinceIds.has(id)),
    newCoasts: [...dsvgCoastIds].filter(id => !dvarCoastIds.has(id)),
  };
}

/**
 * Rewrites every province/coast reference in `dvar` according to the supplied maps.
 * A mapping of `null` drops the entry (and anything that referenced it).
 */
export function applyIdRemapping(
  dvar: DvarJson,
  provinceMap: ReconcileMap,
  coastMap: ReconcileMap,
): DvarJson {
  const remapProvince = (id: string): string | null =>
    id in provinceMap ? provinceMap[id] : id;
  const remapCoast = (id: string): string | null =>
    id in coastMap ? coastMap[id] : id;
  const remapAdjTo = (to: string): string | null => {
    if (to in coastMap) return coastMap[to];
    if (to in provinceMap) return provinceMap[to];
    return to;
  };
  const remapLocation = (loc: string): string | null =>
    loc.includes("/") ? remapCoast(loc) : remapProvince(loc);

  const provinces = (dvar.provinces ?? [])
    .map(p => {
      const newId = remapProvince(p.id);
      if (newId === null) return null;
      return {
        ...p,
        id: newId,
        adjacencies: p.adjacencies
          .map(a => { const t = remapAdjTo(a.to); return t === null ? null : { ...a, to: t }; })
          .filter((a): a is DvarJsonAdjacency => a !== null),
      };
    })
    .filter((p): p is DvarJsonProvince => p !== null);

  const namedCoasts = (dvar.namedCoasts ?? [])
    .map(c => {
      const newId = remapCoast(c.id);
      if (newId === null) return null;
      const newParent = remapProvince(c.parentProvince);
      if (newParent === null) return null;
      return {
        ...c,
        id: newId,
        parentProvince: newParent,
        adjacencies: c.adjacencies
          .map(a => { const t = remapAdjTo(a.to); return t === null ? null : { ...a, to: t }; })
          .filter((a): a is DvarJsonAdjacency => a !== null),
      };
    })
    .filter((c): c is DvarJsonNamedCoast => c !== null);

  const supplyCenters = (dvar.initialState?.supplyCenters ?? [])
    .map(sc => { const p = remapProvince(sc.province); return p === null ? null : { ...sc, province: p }; })
    .filter((sc): sc is DvarJsonSupplyCenter => sc !== null);

  const units = (dvar.initialState?.units ?? [])
    .map(u => { const l = remapLocation(u.location); return l === null ? null : { ...u, location: l }; })
    .filter((u): u is DvarJsonUnit => u !== null);

  const dominanceRules = (dvar.dominanceRules ?? [])
    .map(rule => {
      const p = remapProvince(rule.province);
      if (p === null) return null;
      const dependencies = rule.dependencies
        .map(dep => { const d = remapProvince(dep.province); return d === null ? null : { ...dep, province: d }; })
        .filter((d): d is { province: string; nation: string } => d !== null);
      return { ...rule, province: p, dependencies };
    })
    .filter((r): r is DvarJsonDomRule => r !== null);

  const victoryConditions = (dvar.victoryConditions ?? []).map(vc => {
    if (vc.type !== "province-control") return vc;
    return {
      ...vc,
      provinces: vc.provinces
        .map(id => remapProvince(id))
        .filter((id): id is string => id !== null),
    };
  });

  return {
    ...dvar,
    provinces,
    namedCoasts,
    dominanceRules,
    victoryConditions,
    initialState: dvar.initialState
      ? { ...dvar.initialState, supplyCenters, units }
      : undefined,
  };
}
