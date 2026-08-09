# Design — Waveguide Mode Solver

## Shared contract (normative)

This application consumes `@jorpago2/scientific-ui` and follows the [shared interface contract](https://github.com/jorpago2/jorpago2.github.io/blob/main/docs/interface-contract.md). Local rules below apply only to waveguide geometry, modal plots and scientific result density.

This document is the canonical visual contract for the scientific application.

## Foundation

- IBM Carbon Design System, theme `g10`, governs components, typography, colour,
  focus, interaction states, layers and shape.
- IBM Plex Sans is the interface typeface. IBM Plex Mono is reserved for
  numerical output and equations.
- Plotly is the only non-Carbon visual system and is used exclusively for
  scientific plots.
- Product CSS may arrange scientific content, constrain plot dimensions and
  express data hierarchy, but must not restyle Carbon component internals.

## Interface character

The application is a dense scientific workbench, not a landing page. Chrome is
quiet, controls are compact and the solved physical result is the primary visual
subject. Wide displays use a centred scientific stage with a bounded working
width; content is not stretched merely to fill the viewport.

## Layout

- Page structure uses Carbon `Grid` and `Column` with explicit `sm`, `md` and
  `lg` spans.
- The desktop workflow rail becomes bottom navigation below the large-screen
  layout breakpoint.
- Configuration and results form separate working regions. On narrow screens,
  configuration replaces the result temporarily instead of compressing it.
- Related controls use the narrowest readable arrangement. Scientific plots
  stack only when their minimum useful width cannot be preserved.
- Fixed navigation and status regions must never cover reachable content.

## Components and icons

- Use installed Carbon components for buttons, inputs, selects, switches, tabs,
  accordions, notifications, loading states, tables, links and overlays.
- Use official Carbon icons for navigation and actions.
- Do not target `.cds--*` selectors in product CSS.
- Do not recreate Carbon controls, tags, notifications or state indicators with
  custom HTML and CSS.
- Corners remain square, following Carbon g10. Decorative cards, pills,
  gradients and ornamental shadows are not part of the product language.

## Scientific presentation

- Numerical values use tabular figures and show units explicitly.
- Primary modal quantities precede secondary diagnostics.
- Empty states explain the next scientific action without becoming hero panels.
- Warnings and errors use Carbon status components and preserve technical detail.
- Tables may become compact stacked records on mobile when horizontal scrolling
  would obscure interpretation.
- Plotly colours remain colour-blind-safe and are defined in the plot modules,
  independently of application chrome.

## Responsive and accessibility requirements

- Validate at 1920×1080, 1440×900, 1280×800, 1024×768, 768×1024 and 390×844.
- No page-level horizontal overflow is permitted.
- Keyboard operation, visible focus, accessible names, disabled semantics,
  Escape behaviour and focus return must remain functional.
- Reduced-motion preferences remove non-essential motion.

## Source files

- `src/carbon.scss` loads the installed Carbon React styles and bundled IBM Plex
  fonts.
- `tokens.css` contains only Carbon-aligned semantic aliases and the bounded
  scientific-stage width.
- `src/styles.css` contains application layout and scientific presentation rules.
- `src/plotColors.ts` and Plotly modules contain plot-specific visual settings.
