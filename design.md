# Design — Waveguide Mode Solver

A locked design system for this scientific web app. Every view uses the same
typography, colour language, spacing and interaction rules.

## Genre

Modern-minimal scientific workbench: quiet chrome, dense but readable controls,
and information revealed when it becomes relevant.

## Macrostructure family

- App views: Workbench — compact utility header, section rail, contextual title,
  asymmetric configuration/results canvas and progressive disclosure.
- Content views: Long Document — evidence-led sections with restrained rules and
  no decorative cards.
- Marketing pages: not present in the current product.

## Theme

- `--color-paper`: oklch(97.2% 0.008 155)
- `--color-paper-2`: oklch(94.5% 0.012 175)
- `--color-surface`: oklch(98.5% 0.006 155)
- `--color-ink`: oklch(22% 0.025 205)
- `--color-ink-2`: oklch(43% 0.028 195)
- `--color-rule`: oklch(86% 0.018 175)
- `--color-accent`: oklch(48% 0.095 190)
- `--color-focus`: oklch(50% 0.15 250)

## Typography

- Display: Space Grotesk, weight 600–700, roman.
- Body: IBM Plex Sans, weight 400–600.
- Mono: IBM Plex Mono, weight 500–600, for numerical output only.
- Display tracking: `-0.035em`.
- Type scale anchor: `--text-display: clamp(2rem, 3.6vw, 3.25rem)`.

## Spacing

Four-point named scale from `--space-3xs` to `--space-3xl`. Components use the
named values from `tokens.css`; one-off spacing is not permitted.

## Motion

- UI easing: `--ease-out` and `--ease-in-out` from `tokens.css`.
- Reveal pattern: none. Scientific content is immediately available.
- Reduced motion: all non-essential transitions removed.

## Microinteractions stance

- Silent success; inline status for asynchronous work and errors.
- Focus appears instantly with an opaque 3:1+ ring.
- Disabled and busy are visually distinct.
- Hover changes colour or rule weight only; no scaling or bounce.

## CTA voice

- Primary: solid teal, 8 px radius, direct verb first.
- Secondary: tinted surface with a hairline rule.
- Pills are reserved for compact status indicators.

## Per-view allowances

- Solver: persistent configuration rail on wide screens; Configure/Results switch
  on narrow screens.
- Materials: data controls beside the plot; no decorative wrapper layers.
- Sweeps and Analysis: one containment layer, with advanced tools revealed by tabs.
- Validation: the model explanation stands alone until a solved result exists.
- Scientific plots retain their colorblind-safe data palette.

## What views MUST share

- Wordmark, teal accent and typography.
- Title scale and heading rhythm without decorative eyebrows.
- Button, input, tab, status and focus treatment.
- Surface hierarchy and 4-point spacing scale.

## What views MAY differ on

- Control/result column proportions.
- Plot height and table density according to the scientific content.
- Whether a view uses tabs, details or a continuous document.

## Exports

### tokens.css

The canonical implementation is the root-level `tokens.css` file.

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(97.2% 0.008 155);
  --color-surface: oklch(98.5% 0.006 155);
  --color-ink: oklch(22% 0.025 205);
  --color-accent: oklch(48% 0.095 190);
  --font-display: "Space Grotesk", sans-serif;
  --font-body: "IBM Plex Sans", sans-serif;
  --spacing-md: 1.5rem;
  --radius-card: 8px;
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(97.2% 0.008 155)", "$type": "color" },
    "surface": { "$value": "oklch(98.5% 0.006 155)", "$type": "color" },
    "ink": { "$value": "oklch(22% 0.025 205)", "$type": "color" },
    "accent": { "$value": "oklch(48% 0.095 190)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Space Grotesk", "$type": "fontFamily" },
    "body": { "$value": "IBM Plex Sans", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1.5rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 97.2% 0.008 155;
  --foreground: 22% 0.025 205;
  --primary: 48% 0.095 190;
  --primary-foreground: 98.5% 0.006 155;
  --muted: 94.5% 0.012 175;
  --muted-foreground: 43% 0.028 195;
  --border: 86% 0.018 175;
  --input: 86% 0.018 175;
  --ring: 50% 0.15 250;
  --radius: 8px;
}
```
