# Design System

BeatVault uses CSS custom properties in `src/styles/tokens.css` for surface, border, text, accent, spacing-by-component, radius, and motion foundations. `src/styles/themes.css` is the theme layer and `[data-theme]` is the source of truth; components consume variables rather than selecting colors themselves.

## Themes

- **Classic**: the default cyan/slate dark theme for the current BeatVault identity.
- **Ember Forge**: flame orange and charcoal, with warm contrast for focused production work.
- **Ivory Studio**: premium light theme with differentiated warm whites, soft gray borders, near-black text, and restrained umber accent.
- **Verdant Signal**: technical dark theme using differentiated green tones, green-gray borders, black surfaces, and a refined green accent.

The header selector exposes a swatch, name, and description for each theme. The selected key is stored as `beatvault:theme`; invalid or missing values safely fall back to Classic. All themes retain the same layout, states, focus treatment, responsive behavior, and reduced-motion policy.
