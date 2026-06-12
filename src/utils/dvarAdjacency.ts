import { prepareShape, preparedShapesIntersect, disposeShape } from "./geometry";

export type PassType = "army" | "fleet" | "both";

export interface DvarAdjacency {
  to: string;
  pass: PassType;
}

export type DvarAdjacencyMap = Record<string, DvarAdjacency[]>;

export function buildEmptyDvarAdjacencyMap(ids: string[]): DvarAdjacencyMap {
  const map: DvarAdjacencyMap = {};
  for (const id of ids) map[id] = [];
  return map;
}

function resolvePass(typeA: string, typeB: string): PassType {
  if (typeA === "sea" || typeB === "sea") return "fleet";
  if (typeA === "coastal" && typeB === "coastal") return "both";
  return "army";
}

export function autoDetectDvarAdjacencies(
  provinceShapes: { id: string; paths: string[] }[],
  namedCoastShapes: { id: string; parentId: string; paths: string[] }[] = [],
  provinceTypes: Record<string, string> = {}
): DvarAdjacencyMap {
  const coastParentIds = new Set(namedCoastShapes.map(c => c.parentId));
  const allShapes = [
    ...provinceShapes.map(s => ({ ...s, isCoast: false, parentId: "" })),
    ...namedCoastShapes.map(s => ({ ...s, isCoast: true })),
  ];
  const map = buildEmptyDvarAdjacencyMap(allShapes.map(s => s.id));

  // Parse each shape's paths once and prefilter pairs by bounding box —
  // re-parsing per pair makes the n²/2 sweep freeze the UI on large maps.
  const prepared = allShapes.map(s => prepareShape(s.paths));

  try {
    for (let i = 0; i < allShapes.length; i++) {
      for (let j = i + 1; j < allShapes.length; j++) {
        const a = allShapes[i];
        const b = allShapes[j];

        if (!preparedShapesIntersect(prepared[i], prepared[j])) continue;

        if (a.isCoast && b.isCoast) {
          // Subprovince ↔ subprovince: always fleet
          map[a.id].push({ to: b.id, pass: "fleet" });
          map[b.id].push({ to: a.id, pass: "fleet" });
        } else if (a.isCoast || b.isCoast) {
          // Subprovince ↔ province
          const coast = a.isCoast ? a : b;
          const province = a.isCoast ? b : a;
          // Skip if adjacent province itself has named coasts — those connect via coast↔coast
          if (coastParentIds.has(province.id)) continue;
          const pType = provinceTypes[province.id] ?? "";
          if (pType === "coastal" || pType === "sea") {
            map[coast.id].push({ to: province.id, pass: "fleet" });
            map[province.id].push({ to: coast.id, pass: "fleet" });
          }
          // Land provinces: no connection from a named coast subprovince
        } else {
          // Province ↔ province
          const aHasCoasts = coastParentIds.has(a.id);
          const bHasCoasts = coastParentIds.has(b.id);
          if (aHasCoasts || bHasCoasts) {
            const aType = provinceTypes[a.id] ?? "";
            const bType = provinceTypes[b.id] ?? "";
            // Fleet to/from a named-coast main province is never added;
            // skip sea neighbours (fleet access is via subprovinces only)
            if (aType === "sea" || bType === "sea") continue;
            map[a.id].push({ to: b.id, pass: "army" });
            map[b.id].push({ to: a.id, pass: "army" });
          } else {
            const pass = resolvePass(provinceTypes[a.id] ?? "", provinceTypes[b.id] ?? "");
            map[a.id].push({ to: b.id, pass });
            map[b.id].push({ to: a.id, pass });
          }
        }
      }
    }
  } finally {
    for (const shape of prepared) disposeShape(shape);
  }

  return map;
}

export function toggleDvarAdjacency(
  map: DvarAdjacencyMap,
  idA: string,
  idB: string,
  defaultPass: PassType = "both"
): DvarAdjacencyMap {
  const newMap: DvarAdjacencyMap = {};
  for (const k of Object.keys(map)) newMap[k] = [...map[k]];
  if (!newMap[idA]) newMap[idA] = [];
  if (!newMap[idB]) newMap[idB] = [];

  const existsInA = newMap[idA].some(adj => adj.to === idB);
  if (existsInA) {
    newMap[idA] = newMap[idA].filter(adj => adj.to !== idB);
    newMap[idB] = newMap[idB].filter(adj => adj.to !== idA);
  } else {
    newMap[idA] = [...newMap[idA], { to: idB, pass: defaultPass }];
    newMap[idB] = [...newMap[idB], { to: idA, pass: defaultPass }];
  }
  return newMap;
}

export function toggleDvarAdjacencyWithCoasts(
  map: DvarAdjacencyMap,
  fromId: string,
  toId: string,
  toCoasts: string[],
  fromCoasts: string[],
  defaultPass: PassType
): DvarAdjacencyMap {
  const newMap: DvarAdjacencyMap = {};
  for (const k of Object.keys(map)) newMap[k] = [...map[k]];

  const allFromIds = [fromId, ...fromCoasts];
  const allToIds = [toId, ...toCoasts];

  const ensureKey = (id: string) => {
    if (!newMap[id]) newMap[id] = [];
  };

  const hasAnyConnection = allFromIds.some(fId =>
    (newMap[fId] ?? []).some(adj => allToIds.includes(adj.to))
  );

  const removeLink = (aId: string, bId: string) => {
    if (newMap[aId]) newMap[aId] = newMap[aId].filter(adj => adj.to !== bId);
    if (newMap[bId]) newMap[bId] = newMap[bId].filter(adj => adj.to !== aId);
  };

  const addLink = (aId: string, bId: string, pass: PassType) => {
    ensureKey(aId);
    ensureKey(bId);
    if (!newMap[aId].some(adj => adj.to === bId)) newMap[aId].push({ to: bId, pass });
    if (!newMap[bId].some(adj => adj.to === aId)) newMap[bId].push({ to: aId, pass });
  };

  if (hasAnyConnection) {
    for (const fId of allFromIds) {
      for (const tId of allToIds) {
        removeLink(fId, tId);
      }
    }
  } else {
    addLink(fromId, toId, defaultPass);
    for (const coastId of toCoasts) {
      addLink(fromId, coastId, "fleet");
    }
    for (const coastId of fromCoasts) {
      addLink(coastId, toId, "fleet");
      for (const toCoastId of toCoasts) {
        addLink(coastId, toCoastId, "fleet");
      }
    }
  }

  return newMap;
}

export function setDvarAdjacencyPass(
  map: DvarAdjacencyMap,
  idA: string,
  idB: string,
  pass: PassType
): DvarAdjacencyMap {
  const newMap: DvarAdjacencyMap = {};
  for (const k of Object.keys(map)) newMap[k] = [...map[k]];

  if (newMap[idA]) {
    newMap[idA] = newMap[idA].map(adj =>
      adj.to === idB ? { ...adj, pass } : adj
    );
  }
  if (newMap[idB]) {
    newMap[idB] = newMap[idB].map(adj =>
      adj.to === idA ? { ...adj, pass } : adj
    );
  }
  return newMap;
}

export function getIsolatedIds(
  ids: string[],
  map: DvarAdjacencyMap
): string[] {
  return ids.filter(id => !map[id] || map[id].length === 0);
}
