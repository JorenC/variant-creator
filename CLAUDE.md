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

The **Variant Creator** is a standalone, client-side React web application that enables non-technical users to create custom Diplomacy game variants without programming knowledge.

- **Fully client-side**: No backend dependencies; all processing happens in the browser
- **Deployable on Netlify**: Single-page app with SPA redirect
- **Wizard-based UI**: Guides users through phases to create a complete variant definition
- **Input**: SVG maps created in Inkscape
- **Output**: A self-contained JSON file (`VariantDefinition`)

**Tech Stack:**
- React 19 + TypeScript 5.6
- Vite (build tool, port 5174)
- Tailwind CSS v4 + shadcn/ui (new-york style, neutral base color)
- React Hook Form + Zod (form validation)
- Paper.js (headless SVG geometry/adjacency detection)
- React Router (phase-based navigation)
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

- **State Management**: `useVariant` hook backed by `localStorage` - no Redux, no React Query
- **Routing**: React Router with phase-based URLs (`/phase/0`, `/phase/1`, etc.)
- **UI Components**: shadcn/ui with Tailwind CSS v4
- **Testing**: Vitest + Testing Library

## Component Patterns

### File Organization

Keep it flat:
- Wizard phase components in `src/components/wizard/`
- Map rendering components in `src/components/map/`
- Shared UI primitives in `src/components/ui/` (shadcn/ui)
- Common shared components in `src/components/common/`

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

Use React Hook Form with Zod for all forms.

---

# Testing

Run tests with:
```bash
npm run test              # Run all tests (watch mode)
npm run test -- --run     # Run once (CI mode)
npm run test <filename>   # Run specific test file (preferred)
```

Test files live in `src/__tests__/` or alongside source files as `*.test.ts(x)`.
