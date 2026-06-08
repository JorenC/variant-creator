import type { Step } from "@/types/dvar";

/** Ordered steps shown in the dVAR Creator's header stepper. */
export const DVAR_STEPS = [
  { key: "upload",                  label: "Upload"        },
  { key: "basic-info",              label: "Basic info"    },
  { key: "nations",                 label: "Nations"       },
  { key: "province-names",           label: "Human names"   },
  { key: "province-types",           label: "Coasts & SCs"  },
  { key: "home-nations",            label: "Home nations"  },
  { key: "adjacencies",             label: "Adjacencies"   },
  { key: "dominance-rules",         label: "Dominance"     },
  { key: "phase-progression",       label: "Phases"        },
  { key: "victory-conditions",      label: "Victory"       },
  { key: "adjudication-modifiers",  label: "Rules"         },
  { key: "export",                  label: "Export"        },
];

/** Page title + subtitle shown above each non-upload step. */
export const STEP_META: Record<Exclude<Step, "upload" | "reconcile">, { title: string; subtitle: string }> = {
  "basic-info": {
    title: "Basic Info",
    subtitle: "Set the identity and metadata for your variant.",
  },
  nations: {
    title: "Nations",
    subtitle: "Define the playable powers, their names, and their colours.",
  },
  "province-names": {
    title: "Human names",
    subtitle: "Give every province and coast a human-readable name. Hover a row to locate it on the map.",
  },
  "province-types": {
    title: "Coasts & SCs",
    subtitle: "Here we set the type for each province (Land / Sea / Coastal) and whether they contain a supply center or not.",
  },
  "home-nations": {
    title: "Home Nations",
    subtitle: "Mark supply centers and starting units. Mark them as empty, owned by a nation or neutral.",
  },
  adjacencies: {
    title: "Adjacencies",
    subtitle: "Set connections between provinces and the unit types that may cross each link.",
  },
  "dominance-rules": {
    title: "Dominance Rules",
    subtitle: "Optionally define conditions under which a province is dominated, based on adjacent supply center control.",
  },
  "phase-progression": {
    title: "Phase Progression",
    subtitle: "Phases run top to bottom and loop back. They can be named anything, but their type is limited to three possibilities. The last phase's year + increments the year on wrap-around.",
  },
  "victory-conditions": {
    title: "Victory Conditions",
    subtitle: "Define how the game can end. Add multiple conditions — the first to fire wins. This means players only have to meet one of these conditions, not all.",
  },
  "adjudication-modifiers": {
    title: "Game Rules",
    subtitle: "Configure adjudicator rule modifiers for this variant.",
  },
  export: {
    title: "Review & Export",
    subtitle: "Check your variant settings and download the .dvar file.",
  },
};
