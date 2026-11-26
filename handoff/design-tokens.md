# Design tokens

Calm, practical look: warm off-white ground, deep green accent, dark camera screens.

## Color

| Token | Hex | Use |
|---|---|---|
| `bg` | `#F5F3EE` | App background |
| `surface` | `#FFFFFF` | Cards, lists, inputs, tab bar |
| `ink` | `#1B1A17` | Primary text, dark buttons |
| `muted` | `#5F5B53` | Secondary text, labels |
| `line` | `#E3DFD6` | Card borders, input borders |
| `divider` | `#EFECE5` | Row separators inside cards |
| `accent` | `#2E5E4E` | Primary buttons, links, active tab, selection |
| `accent-dark` | `#1F4337` | Link hover/pressed, text on accent-soft |
| `accent-soft` | `#E3EDE8` | "Done"/selected chips (border `#B9D1C6`) |
| `warn-soft` | `#FBE7D3` | "Needs details" / "No receipt" badges and cards |
| `warn-text` | `#7A3E0C` | Text on warn-soft (`#5C3008` for body text) |
| `placeholder` | `#E7E2D8` | Item photo placeholders |
| `placeholder-2` | `#DCD6C9` | Exterior/room photo placeholders |
| `camera-bg` | `#121210` | Camera screens background |
| `camera-viewfinder` | `#34322D` | Viewfinder area |
| `camera-muted` | `#CFCBC2` | Secondary text on dark |
| `camera-accent` | `#7FB5A1` | Done markers on dark |

All text/background pairs above meet WCAG AA (4.5:1) at the sizes used.

## Type

- Headings: **Space Grotesk** 600 — screen titles 26–30, letter-spacing −0.02em.
- Everything else: **Inter** — body 15–16, labels 12–13 (600), captions 11–12.
- Money: tabular numerals.
- On native platforms, the system font (SF Pro / Roboto) is an acceptable substitute for Inter.

## Shape & spacing

- Screen side padding 24 (20 on dense screens). Gaps 8 / 12 / 16.
- Radius: cards 16–18, inputs 10–12, chips 17–18 (pill), primary buttons 14, photos 8–10.
- Touch targets ≥ 44 pt. Primary buttons 52 tall; inputs 42–48.
- Bottom tab bar 84 tall with a 56 pt raised circular camera button in the center.

## Icons

Thin stroke line icons (1.8 stroke), e.g. SF Symbols or Lucide equivalents: house, camera, document, chevron, check, x, search, upload.
