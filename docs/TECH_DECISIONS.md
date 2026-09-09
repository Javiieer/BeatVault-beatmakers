# Technical Decisions

- React, TypeScript, and Vite are the initial frontend stack.
- No backend or infrastructure is included in Phase 1.
- No dependency was added for routing or iconography.
- Mock data remains separate from the presentation layer.
- The temporary BV text treatment is not final branding.
- BeatVault owns a curated platform catalog; it does not organize or synchronize a user's personal filesystem.
- Content upload is always intentional and is separated conceptually from technical validation and preview generation.
- Subjective tags and required metadata are explicit creator/admin input; automation may process technical facts but must not silently infer authoritative meaning.
- Shorts, streaming, marketplace, and community remain independent future domains rather than being placed inside `core`.
- Future API, authentication, repository, and media-upload seams are represented by TypeScript contracts in `src/domains/core/contracts.ts`; no transport or provider is selected yet.
