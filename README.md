# Diplicity Variant Creator

A client-side web tool for creating custom Diplomacy game variants for [Diplicity.com](https://www.diplicity.com) — no coding required.

The tool guides you through the full pipeline: from a hand-drawn PNG map all the way to the two files the Diplicity engine needs — a **dSVG** (the map) and a **dVAR** (the rules).

## The workflow

1. **Prepare a PNG map** — draw your map and clean it up for vectorization
2. **Vectorize with AI** — run the bundled vectorizer script with Claude to trace province shapes into SVG
3. **Style and complete the map** — organize the seven required layers and style the map in Inkscape/Figma
4. **dSVG Creator** — assign SVG layers to canonical roles, configure province IDs, export a `.d.svg`
5. **dVAR Creator** — define nations, adjacencies, home centers, victory conditions, export a `.dvar`
6. **Upload to Diplicity** — submit both files to the Diplicity platform

## Tech stack

- React 19 + TypeScript 5.6
- Vite (port 5174)
- Tailwind CSS v4 + shadcn/ui
- React Hook Form + Zod
- Paper.js (SVG geometry and adjacency detection)
- React Router
- Vitest + Testing Library
- Netlify (deployment)

Fully client-side — no backend, no server.

## Development

```bash
npm install
npm run dev      # http://localhost:5174
npm run build
npm run lint
npm run test
```

## Contributing

Issues and pull requests are welcome. Please open an issue first for larger changes so we can discuss the approach.

The project uses branch protection on `main` — all changes go through pull requests.
