# forgefit.space UI

`@fitai/ui` is the product design system shared by every forgefit.space web surface.

## What belongs here

- Color, typography, spacing, radius, shadow, and motion tokens.
- Accessible interaction behavior such as focus rings, disabled states, and touch sizes.
- Reusable primitives such as `Button`, `Card`, `Field`, `PageHeader`, `StatusBadge`, and `VisuallyHidden`.
- Responsive behavior that must stay consistent across features.

Feature-specific composition stays in the consuming application. A workout logger can decide how exercises are arranged, but it must use design-system fields and buttons rather than defining new versions.

## Product rules

1. Build mobile-first and verify at 390 px, 768 px, and 1280 px.
2. Keep primary actions visually unambiguous and no smaller than 44 px tall.
3. Every icon-only control needs an accessible label.
4. Use semantic HTML and visible keyboard focus.
5. Add a design-system primitive when a visual interaction is repeated; do not copy CSS between features.
6. Respect reduced-motion preferences and safe-area insets.

Import the components from `@fitai/ui` and load `@fitai/ui/styles.css` once in the application root layout.
