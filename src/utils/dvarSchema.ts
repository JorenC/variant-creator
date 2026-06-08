/**
 * Zod schema that mirrors service/variant.schema.yaml in diplicity-react exactly.
 * Used to validate dVAR output before download so we never silently produce an
 * invalid file.
 */

import { z } from "zod";

const PhaseType = z.enum(["Movement", "Retreat", "Adjustment"]);

const Adjacency = z.object({
  to: z.string(),
  pass: z.enum(["army", "fleet", "both"]),
});

const Province = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["land", "sea", "coastal"]),
  supplyCenter: z.boolean(),
  homeNation: z.string().optional(),
  adjacencies: z.array(Adjacency),
});

const NamedCoast = z.object({
  id: z.string(),
  name: z.string(),
  parentProvince: z.string(),
  adjacencies: z.array(Adjacency),
});

const Nation = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const PhaseTransition = z.object({
  from: z.object({
    season: z.string(),
    type: PhaseType,
  }),
  to: z.object({
    season: z.string(),
    type: PhaseType,
    yearDelta: z.number().int().min(0),
  }),
  condition: z.object({
    yearMod: z.number().int().min(1),
    yearModValue: z.number().int().min(0),
  }).optional(),
});

const VictoryCondition = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("supply-center-majority"),
    supplyCenters: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("timed-resolution"),
    year: z.number().int(),
    resolution: z.enum(["most-supply-centers", "shared-draw"]),
  }),
  z.object({
    type: z.literal("province-control"),
    provinces: z.array(z.string()).min(1),
    year: z.number().int().optional(),
  }),
]);

const DominanceRule = z.object({
  province: z.string(),
  nation: z.string(),
  dependencies: z.array(z.object({
    province: z.string(),
    nation: z.string(),
  })),
});

export const DvarSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  rules: z.string().optional(),
  victoryConditions: z.array(VictoryCondition).min(1),
  adjudicationModifiers: z.array(z.string()).optional(),
  phaseProgression: z.object({
    seasons: z.array(z.string()).min(1),
    transitions: z.array(PhaseTransition).min(1),
  }),
  nations: z.array(Nation).min(1),
  provinces: z.array(Province).min(1),
  namedCoasts: z.array(NamedCoast),
  initialState: z.object({
    phase: z.object({
      season: z.string(),
      year: z.number().int(),
      type: PhaseType,
    }),
    units: z.array(z.object({
      nation: z.string(),
      type: z.enum(["Army", "Fleet"]),
      location: z.string(),
    })),
    supplyCenters: z.array(z.object({
      nation: z.string(),
      province: z.string(),
    })),
  }),
  dominanceRules: z.array(DominanceRule).optional(),
});

export type DvarOutput = z.infer<typeof DvarSchema>;
