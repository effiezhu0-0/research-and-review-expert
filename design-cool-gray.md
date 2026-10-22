# 设计调研与评审专家 Style Guide — Cool Gray Variant

> Source: Figma page **Design System — Cool Gray Variant**, nodes `48:2`, `48:3`, `48:191`, `49:314`, and `49:404`.
> Date: August 2026. This is an independent variant and does not replace `/design.md`.

## Direction

The Cool Gray variant is a precise, quiet operational interface. It replaces the warm neutral foundation with a clean blue-gray hierarchy while retaining violet as the product accent and orange/green for categorization. Use color and surface contrast before borders or heavy shadow.

## Color primitives

### Cool gray neutrals

| Token | Value |
|---|---|
| `neutral/900` | `#1A1D1F` |
| `neutral/800` | `#2E3438` |
| `neutral/700` | `#454D52` |
| `neutral/600` | `#5F686E` |
| `neutral/500` | `#7A848B` |
| `neutral/400` | `#98A1A8` |
| `neutral/300` | `#B5BCC1` |
| `neutral/200` | `#D1D7DB` |
| `neutral/100` | `#E4E8EB` |
| `neutral/75` | `#EDF0F2` |
| `neutral/50` | `#F3F5F7` |
| `neutral/25` | `#F8F9FA` |
| `neutral/0` | `#FFFFFF` |

### Violet

`900 #2B1456`, `800 #3A1E72`, `700 #4A2A8E`, `500 #6D4ABF`, `400 #8568CA`, `300 #A08ED5`, `200 #C0B5E2`, `100 #DDD8EF`, `50 #EEEAF6`.

### Supporting colors

- Orange: `700 #96553A`, `600 #B06D48`, `500 #C88558`, `400 #D8A47E`, `200 #E8C4A8`, `100 #F0D8C5`, `50 #F6EBE0`.
- Green: `700 #3D6E50`, `600 #508A64`, `500 #6DA37E`, `400 #8FB99C`, `200 #B5D2BE`, `100 #D4E5D8`, `50 #E9F1EB`.
- Status: error `#D9534F`, warning `#E5A832`, success `#34A853`, info `#4A90D9`.

## Semantic colors

| Token | Value | Usage |
|---|---|---|
| `text/primary` | `#1A1D1F` | Headings and primary content |
| `text/secondary` | `#454D52` | Labels and supporting copy |
| `text/muted` | `#7A848B` | Descriptions and metadata |
| `text/quiet` | `#B5BCC1` | Low-priority metadata |
| `text/inverse` | `#FFFFFF` | Text on dark surfaces |
| `bg/canvas` | `#F3F5F7` | Application canvas |
| `bg/panel` | `#FFFFFF` | Main panels |
| `bg/sidebar` | `#EDF0F2` | Persistent navigation |
| `bg/elevated` | `#FFFFFF` | Dialogs and popovers |
| `bg/sunken` | `#E4E8EB` | Recessed areas and tracks |
| `surface/primary` | `#FFFFFF` | Cards and controls |
| `surface/secondary` | `#E4E8EB` | Grouped secondary surfaces |
| `surface/hover` | `#F8F9FA` | Hover state |
| `surface/active` | `#D1D7DB` | Active neutral state |
| `border/default` | `#D1D7DB` | Text fields only |
| `border/subtle` | `#EDF0F2` | Dividers |
| `border/strong` | `#B5BCC1` | Upload/drop input |
| `accent/primary` | `#6D4ABF` | Selection and focus |
| `accent/secondary` | `#6DA37E` | Positive category |
| `accent/surface` | `#DDD8EF` | Selected surface |
| `accent/muted` | `#EEEAF6` | Quiet violet surface |
| `interactive/primary` | `#1A1D1F` | Primary action |
| `interactive/hover` | `#2E3438` | Primary action hover |
| `interactive/disabled` | `#D1D7DB` | Disabled state |

## Typography

- Typeface: `Inter`, followed by `PingFang SC`, `Microsoft YaHei`, and system sans-serif.
- Use Regular for body copy and Medium for headings, selected navigation, controls, and metrics.
- Scale: caption `10`, detail `12`, body-sm `14`, body `16`, subheading `18`, body-lg `20`, heading-sm `24`, heading `32`, heading-lg `36`, display-sm `40`, display `48`, display-lg `56`, display-xl `64` px.
- Operational dashboards should prefer caption through heading sizes; display sizes are reserved for presentation or hero contexts.
- Chinese body line-height: `1.5–1.7`. Compact labels: `1.3–1.4`.

## Spacing and radius

- Spacing scale: `2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 38, 46, 52, 64` px.
- Radius scale: `4, 6, 8, 10, 12, 14, 16, full`.
- Use `8px` for inputs and standard buttons, `10–12px` for cards, `16px` for dialogs, and full radius for avatars and pills.

## Component rules

- Cards and display panels have no stroke. Separate them with surface contrast, spacing, and restrained elevation.
- Text fields, textareas, selects, and upload/drop inputs use a 1px semantic border. Focus changes the border to violet and adds a low-opacity violet ring.
- List rows may use subtle internal dividers; the list container itself has no stroke.
- Selected cards use `accent/surface` or `accent/muted`, not an outline.
- Primary actions use `interactive/primary`; violet is reserved for selection, focus, AI emphasis, and progress.
- Sidebar uses `bg/sidebar`; active navigation uses `surface/active`; hover uses `surface/hover`.
- Shadows are subtle and cool: card `0 6px 20px rgba(46,52,56,.05)`, elevated `0 18px 50px rgba(46,52,56,.14)`.

## Dashboard application

- Desktop sidebar: 224px fixed/sticky rail.
- Main content should remain centered with readable maximum width.
- Canvas, sidebar, top bar, cards, secondary surfaces, and active rows must each map to semantic tokens.
- Preserve violet, orange, and green category cues; do not recolor them into cool gray.
- Avoid warm beige values in this variant.
