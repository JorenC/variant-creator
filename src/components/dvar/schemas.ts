/**
 * Zod schemas for the React-Hook-Form-backed dVAR steps (Basic info, Nations,
 * Province names, Province types) and their inferred value types.
 *
 * Co-located with the forms that consume them. The later, more interactive steps
 * (home nations, adjacencies, etc.) manage state with plain `useState` instead —
 * see the note in CLAUDE.md.
 */

import { z } from "zod";

export const basicInfoSchema = z.object({
  name: z.string().min(1, "Name is required"),
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  description: z.string().min(1, "Description is required"),
  author: z.string().min(1, "Author is required"),
  startYear: z.number({ message: "Required" }).int(),
  rules: z.string(),
});

export const nationSchema = z.object({
  id: z.string().min(1, "Name must contain at least one letter or number"),
  name: z.string().min(1, "Name is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color"),
});

export const nationsSchema = z.object({
  nations: z
    .array(nationSchema)
    .min(1, "At least one nation is required")
    .refine(
      nations => {
        const names = nations
          .map(n => n.name.toLowerCase().trim())
          .filter(Boolean);
        return new Set(names).size === names.length;
      },
      { message: "Nation names must be unique" }
    )
    .refine(
      nations => {
        const ids = nations.map(n => n.id).filter(Boolean);
        return new Set(ids).size === ids.length;
      },
      { message: "Nation IDs must be unique — two names produce the same ID" }
    )
    .refine(
      nations => nations.every(n => n.id !== "neutral"),
      { message: '"Neutral" is reserved for unowned supply centers and cannot be used as a nation name' }
    ),
});

export const provinceNamesFormSchema = z.object({
  provinces: z.array(z.object({
    id: z.string(),
    name: z.string().min(1, "Name is required"),
    namedCoasts: z.array(z.object({
      id: z.string(),
      name: z.string().min(1, "Name is required"),
    })),
  })),
});

export const provinceTypesFormSchema = z.object({
  provinces: z.array(z.object({
    id: z.string(),
    type: z.enum(["land", "sea", "coastal"], { error: "Province type is required" }),
    supplyCenter: z.boolean(),
  })),
});

export type BasicInfoValues = z.infer<typeof basicInfoSchema>;
export type NationsValues = z.infer<typeof nationsSchema>;
export type ProvinceNamesFormValues = z.infer<typeof provinceNamesFormSchema>;
export type ProvinceTypesFormValues = z.infer<typeof provinceTypesFormSchema>;
