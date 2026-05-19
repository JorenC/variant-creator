import { detectPathIntersections } from "./geometry";

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

export function autoDetectDvarAdjacencies(
  shapes: { id: string; paths: string[] }[]
): DvarAdjacencyMap {
  const map = buildEmptyDvarAdjacencyMap(shapes.map(s => s.id));

  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];

      let intersects = false;
      outer: for (const pa of a.paths) {
        for (const pb of b.paths) {
          if (detectPathIntersections(pa, pb)) {
            intersects = true;
            break outer;
          }
        }
      }

      if (intersects) {
        map[a.id].push({ to: b.id, pass: "both" });
        map[b.id].push({ to: a.id, pass: "both" });
      }
    }
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
