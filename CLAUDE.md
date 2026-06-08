# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## !!! VERY IMPORTANT PRECURSOR - READ THIS FIRST !!!

**Under no circumstances should you agree with any assertion or claim without providing concrete, evidence-based reasoning.**

- **Evidence-Based Reasoning is Paramount:** For every claim, deduction, or inference, you **must** provide supporting evidence from the related context.
- **Corroborate All Findings:** Before proceeding with any chain of facts or thoughts, corroborate your findings, deductions, and inferences using the following format:
  `Based on what I found <here [and here ...]>, <yes/no | deductions> because <why>`.
- **Avoid Assumptions:** Never assume or guess. If information is unavailable, state it clearly. Do not assume correctness or incorrectness of any party (user or AI).
- **Logic, Facts, and Conclusive Evidence:** It is **PARAMOUNT** that you utilize logic, facts, and conclusive evidence at all times, rather than establishing blind trust or fulfilling requests without justification.

## Maintaining This Document

**If you discover new patterns, make decisions about architecture, or establish conventions during development, suggest updates to this CLAUDE.md file.**

## Project Overview

The **Variant Creator** is a standalone, client-side React web application that helps
non-technical users author custom Diplomacy game variants for the Diplicity platform.

- **Fully client-side**: No backend dependencies; all processing happens in the browser
- **Deployable on Netlify**: Single-page app with SPA redirect
- **Input**: an SVG map (typically drawn in Inkscape, or AI-vectorized from a PNG)
- **Output**: **two separate files** that Diplicity ingests —
  - a **`.d.svg`** ("dSVG"): the map SVG with canonical layer/object naming conventions
  - a **`.dvar`** ("dVAR"): the variant metadata (nations, adjacencies, supply centers,
    phase progression, victory conditions, rule modifiers)

There is **no single `VariantDefinition` JSON output** — that was the old design and has
been removed.

**Tech Stack:**
- React 19 + TypeScript 5.6
- Vite (build tool, port 5174)
- Tailwind CSS v4 + shadcn/ui (new-york style, neutral base color)
- React Hook Form + Zod (form validation — see the note under Forms)
- Paper.js (headless SVG geometry: centroids, path intersection / point-in-polygon)
- React Router (`createBrowserRouter`, one flat route per page)
- Vitest + Testing Library (tests)
- Netlify (deployment)

## Development Setup

```bash
npm install
npm run dev      # Dev server at http://localhost:5174
npm run build    # Production build
npm run lint     # ESLint
npm run test     # Vitest
```

## General Development Guidelines

1. **Follow existing code patterns and conventions** - Consistency is key
2. **Use TypeScript for type safety** - Never use `any` types
3. **Run linting before submitting changes** - Fix all violations properly
   - `npm run lint` (only on changed files when possible)
4. **Run tests to validate changes** - Do not run full test suite unnecessarily
   - Always run single test files at a time: `npm run test <filename>`
5. **Never disable lint violations** - Fix the root cause instead
   - DO NOT use `eslint-disable`, `ts-ignore`, or similar suppression comments
   - The only acceptable outcomes are: the violation is properly fixed OR you report the issue
6. **Prefer composition over effects** - Minimize useEffect usage in React
7. **Use proper error handling** - Catch and handle errors appropriately
8. **Write tests alongside features** - Not as an afterthought

---

# Frontend Development

## Architecture Overview

The app is **two independent tools plus a set of instructional guide pages**, not one
monolithic wizard:

- **dSVG Creator** (`src/components/dsvg/`): takes a source SVG and walks the user through
  assigning layers to canonical roles → naming province abbreviations → named coasts →
  unit positions → export. Output: a `.d.svg` file.
- **dVAR Creator** (`src/components/dvar/`): takes a required dSVG (and an optional
  existing `.dvar` to edit) and walks through nations, province names/types, home nations,
  adjacencies, dominance rules, phase progression, victory conditions, and rule modifiers.
  Output: a `.dvar` file.
- **Guide pages**: `HomePage`, `PreparingMapPage`, `VectorizeWithAIPage`, `StyleMapPage`,
  `UploadDiplicityPage` (instructional content + navigation).

Cross-cutting concerns:

- **State Management**: plain local component state (`useState` + refs) per wizard. There
  is **no global store, no `localStorage`, no `useVariant` hook, no Redux, no React Query.**
- **Routing**: `createBrowserRouter` in [src/Router.tsx](src/Router.tsx) with one flat
  route per page (`/`, `/dsvg-creator`, `/dvar-creator`, `/preparing-your-map`,
  `/vectorize-with-ai`, `/style-map`, `/upload-diplicity`). No `/phase/N` routes.
- **UI Components**: shadcn/ui with Tailwind CSS v4.
- **Testing**: Vitest + Testing Library (pure-logic utils in `src/utils/__tests__/`).

## Module Map

| Path | Responsibility |
|---|---|
| `src/types/` | Shared domain types (`geometry.ts`, `dsvg.ts`, `dvar.ts`). Logic/components import types from here — never the reverse. |
| `src/utils/` | **Pure logic, no React.** SVG parse/transform/build/preview, Paper.js geometry, dVAR assemble/reconcile. Unit-tested. |
| `src/hooks/` | Reusable React hooks (e.g. `useSvgObjectUrl` for blob preview URLs). |
| `src/components/dsvg/` | dSVG Creator orchestrator + step components. |
| `src/components/dvar/` | dVAR Creator orchestrator + per-step form components + `steps.ts`. |
| `src/components/common/` | App-wide shared components (`AppHeader`, `NationColorPicker`). |
| `src/components/ui/` | shadcn/ui primitives. |

## Component Patterns

### File Organization

Keep it flat, one clear job per file:
- Pure logic lives in `src/utils/` (no React imports); shared types in `src/types/`.
- dSVG step components in `src/components/dsvg/`; dVAR step components in
  `src/components/dvar/` (one component per file).
- Shared UI primitives in `src/components/ui/` (shadcn/ui); common shared components in
  `src/components/common/`.

### Inline Over Extract

- **Inline sub-components** when they're only used in one place
- Only extract to separate files when genuinely shared

### Prop Types

Always provide explicit interface definitions for component props; infer types elsewhere.

## UI Guidelines

### Component Library

- Use shadcn/ui components over raw HTML elements
- Use Lucide icons (imported from `lucide-react`)
- Style: `new-york`, base color: `neutral`

### Tailwind CSS

Only add classes that actually do something. Question every class:

- Does this override a default that needs overriding?
- Is this spacing not already handled by a parent's `gap` or component's built-in spacing?

Trust component defaults - shadcn/ui components have sensible defaults; only override when necessary.

## Forms

Prefer React Hook Form with Zod for new forms.

**Known existing inconsistency (intentional, do not "fix" blindly):** within the dVAR
Creator the earlier step forms (`BasicInfoForm`, `NationsForm`, `ProvinceNamesForm`,
`ProvinceTypesForm`) use React Hook Form + Zod, while the later, more interactive step
forms (`HomeNationsForm`, `AdjacenciesForm`, `DominanceRulesForm`, `PhaseProgressionForm`,
`VictoryConditionsForm`, `AdjudicationModifiersForm`) manage state with plain `useState`
because their UIs (map-driven selection, drag-to-reorder) don't map cleanly onto RHF.
Both patterns expose the same imperative `getValues()` handle to the orchestrator via
`forwardRef` + `useImperativeHandle`.

---

# Testing

Run tests with:
```bash
npm run test              # Run all tests (watch mode)
npm run test -- --run     # Run once (CI mode)
npm run test <filename>   # Run specific test file (preferred)
```

Test files live alongside the code they cover, in a sibling `__tests__/` directory
(e.g. `src/utils/__tests__/svgBuild.test.ts`). The current suite covers the pure-logic
utilities; UI components are validated by the end-to-end manual smoke test.
