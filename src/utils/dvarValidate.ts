/**
 * Semantic validation of an assembled `.dvar`, mirroring the checks the
 * Diplicity server runs on upload (`service/variant/utils.py` in
 * diplicity-react): adjacency symmetry and pass consistency, reference
 * integrity, and ambiguous phase transitions. The Zod schema in `dvarSchema.ts`
 * only checks shapes; without these checks a structurally valid file can still
 * be rejected server-side with errors the user can't act on from here.
 * Pure logic — no DOM, no React.
 */

import type { DvarOutput } from "@/utils/dvarSchema";

export function validateDvarSemantics(dvar: DvarOutput): string[] {
  const errors: string[] = [];

  const nationIds = new Set(dvar.nations.map(n => n.id));
  const provinceIds = new Set(dvar.provinces.map(p => p.id));
  const coastIds = new Set(dvar.namedCoasts.map(c => c.id));
  const locationIds = new Set([...provinceIds, ...coastIds]);

  // Duplicate ids would make every other check ambiguous
  if (provinceIds.size !== dvar.provinces.length) {
    const seen = new Set<string>();
    for (const p of dvar.provinces) {
      if (seen.has(p.id)) errors.push(`Duplicate province id "${p.id}".`);
      seen.add(p.id);
    }
  }
  if (nationIds.size !== dvar.nations.length) {
    const seen = new Set<string>();
    for (const n of dvar.nations) {
      if (seen.has(n.id)) errors.push(`Duplicate nation id "${n.id}" — rename one of the nations.`);
      seen.add(n.id);
    }
  }

  // Reference integrity
  for (const p of dvar.provinces) {
    if (p.homeNation !== undefined && !nationIds.has(p.homeNation)) {
      errors.push(`Province "${p.id}" has home nation "${p.homeNation}", which is not a defined nation.`);
    }
  }
  for (const c of dvar.namedCoasts) {
    if (!provinceIds.has(c.parentProvince)) {
      errors.push(`Named coast "${c.id}" has parent province "${c.parentProvince}", which does not exist.`);
    }
  }
  for (const unit of dvar.initialState.units) {
    if (!nationIds.has(unit.nation)) {
      errors.push(`Starting unit at "${unit.location}" belongs to "${unit.nation}", which is not a defined nation.`);
    }
    if (!locationIds.has(unit.location)) {
      errors.push(`Starting unit references unknown location "${unit.location}".`);
    }
  }
  for (const sc of dvar.initialState.supplyCenters) {
    if (!nationIds.has(sc.nation)) {
      errors.push(`Supply center "${sc.province}" is owned by "${sc.nation}", which is not a defined nation.`);
    }
    if (!provinceIds.has(sc.province)) {
      errors.push(`Supply-center ownership references unknown province "${sc.province}".`);
    }
  }
  for (const rule of dvar.dominanceRules ?? []) {
    if (!provinceIds.has(rule.province)) {
      errors.push(`Dominance rule references unknown province "${rule.province}".`);
    }
    if (rule.nation !== "Neutral" && !nationIds.has(rule.nation)) {
      errors.push(`Dominance rule for "${rule.province}" assigns it to "${rule.nation}", which is not a defined nation.`);
    }
    for (const dep of rule.dependencies) {
      if (!provinceIds.has(dep.province)) {
        errors.push(`Dominance rule for "${rule.province}" depends on unknown province "${dep.province}".`);
      }
      if (dep.nation !== "Neutral" && dep.nation !== "Empty" && !nationIds.has(dep.nation)) {
        errors.push(`Dominance rule for "${rule.province}" depends on "${dep.nation}", which is not a defined nation.`);
      }
    }
  }
  for (const vc of dvar.victoryConditions) {
    if (vc.type === "province-control") {
      for (const id of vc.provinces) {
        if (!provinceIds.has(id)) {
          errors.push(`Victory condition references unknown province "${id}".`);
        }
      }
    }
  }

  // Adjacency symmetry: every edge must exist on both endpoints with the same
  // pass. The server rejects asymmetric edges outright.
  const edges = new Map<string, Map<string, string>>();
  const addEdge = (source: string, target: string, pass: string) => {
    let targets = edges.get(source);
    if (!targets) {
      targets = new Map();
      edges.set(source, targets);
    }
    targets.set(target, pass);
  };
  for (const p of dvar.provinces) {
    for (const adj of p.adjacencies) addEdge(p.id, adj.to, adj.pass);
  }
  for (const c of dvar.namedCoasts) {
    for (const adj of c.adjacencies) addEdge(c.id, adj.to, adj.pass);
  }
  for (const [source, targets] of edges) {
    for (const [target, pass] of targets) {
      if (!locationIds.has(target)) {
        errors.push(`Adjacency ${source} → ${target} references an unknown province or coast.`);
        continue;
      }
      const reverse = edges.get(target)?.get(source);
      if (reverse === undefined) {
        errors.push(`Adjacency ${source} → ${target} is one-way: ${target} has no matching connection back to ${source}.`);
      } else if (reverse !== pass && source < target) {
        errors.push(`Adjacency ${source} ↔ ${target} disagrees on pass type: "${pass}" vs "${reverse}".`);
      }
    }
  }

  // Ambiguous transitions: two unconditional transitions from the same phase
  const fromSeen = new Set<string>();
  for (const t of dvar.phaseProgression.transitions) {
    if (t.condition) continue;
    const key = `${t.from.season}/${t.from.type}`;
    if (fromSeen.has(key)) {
      errors.push(`Two phase transitions start from "${t.from.season} ${t.from.type}" — each phase may only have one outgoing transition.`);
    }
    fromSeen.add(key);
  }

  // Opening phase must reference a declared season
  if (!dvar.phaseProgression.seasons.includes(dvar.initialState.phase.season)) {
    errors.push(`The opening phase season "${dvar.initialState.phase.season}" is not in the declared seasons list.`);
  }

  return errors;
}
