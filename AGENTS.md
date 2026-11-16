# Project instructions

Before changing this game, read `docs/FEATURES.md` and run `npm run check:features`.

## Non-regression rule
- Treat every feature listed in `docs/FEATURES.md` as already implemented baseline functionality.
- A user request for a feature means add it to the existing game; never interpret it as permission to remove, replace, simplify, or rebuild unrelated existing systems.
- Prefer small additive changes that integrate with the current Three.js/Vite architecture and existing game state.
- Preserve controls, item IDs, save/world data formats, multiplayer room data, and existing UI behavior unless the user explicitly asks to change them.
- When extending multiplayer, add synchronization to the existing Firebase room protocol instead of creating a parallel room system.
- Update `docs/FEATURES.md` and `scripts/check-features.mjs` whenever a new feature becomes part of the established baseline.
- Run the feature check and production build before claiming the change is verified. If a browser/multiplayer test was not performed, say so clearly.
- Do not mark a feature complete merely because UI or an item entry exists; verify its actual behavior.
