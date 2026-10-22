# 设计调研与评审专家 Style Guide

> Source of truth: Figma page **Design System - 设计调研与评审专家**, August 2026.  
> Figma file: https://www.figma.com/design/O6m0t303xLPib1N8PE7KMA/  
> Scope: the 设计调研与评审专家 dashboard, project intake, research review, and strategy screens.

## 1. Design direction

设计调研与评审专家 is a calm, evidence-led workspace for designers. The interface should feel precise and editorial rather than decorative: warm neutral backgrounds, dark ink typography, restrained violet emphasis, generous whitespace, and compact controls.

Core principles:

- **Evidence first.** Content, screenshots, quotations, and decisions carry the visual hierarchy.
- **Quiet by default.** Most surfaces use warm neutrals; strong color is reserved for action, selection, status, and categorization.
- **Clear layers.** Canvas, sidebar, panels, cards, and sunken regions must be distinguishable without heavy shadows.
- **Compact, not cramped.** Dense research information is supported by a consistent spacing scale and readable type hierarchy.
- **Semantic tokens first.** Product UI must consume semantic tokens rather than primitive colors directly.
- **One primary action per region.** Avoid competing dark or violet calls to action.

## 2. Token usage

Use the semantic token layer in product code. Primitive tokens exist to construct or extend semantic tokens and should not be used directly in feature components unless no semantic equivalent exists.

Recommended CSS naming:

```css
--color-text-primary
--color-bg-canvas
--color-surface-primary
--color-border-default
--color-accent-primary
--space-16
--radius-card
--font-size-body
```

The visible four Figma panels and their `7:*` variable collections are canonical for this guide. The file also contains unused duplicate collections under `13:*`; they are not part of this page's published visual specification and must not be mixed into implementation.

## 3. Color primitives

### Warm neutrals

Warm neutrals define the overall character of the interface. Do not replace them with cool blue-gray values.

| Token | Value | Typical role |
|---|---:|---|
| `neutral/900` | `#1A1816` | Primary ink, primary action |
| `neutral/800` | `#302C28` | Hovered dark action |
| `neutral/700` | `#474139` | Secondary text |
| `neutral/600` | `#5E564E` | Supporting dark text |
| `neutral/500` | `#766E65` | Muted text |
| `neutral/400` | `#948C83` | Placeholder or quiet metadata |
| `neutral/300` | `#ADA59C` | Quiet text |
| `neutral/200` | `#C8C1B8` | Strong border |
| `neutral/100` | `#E0DBD4` | Default border, disabled fill |
| `neutral/75` | `#EBE7E1` | Sidebar, secondary surface |
| `neutral/50` | `#F2EFE9` | App canvas |
| `neutral/25` | `#F7F5F1` | Hover surface |
| `neutral/0` | `#FDFCFA` | Panel and card surface |

### Violet

Violet communicates selection, AI assistance, active filters, focus, and the 设计调研与评审专家 identity. It is not a general-purpose background color.

| Token | Value |
|---|---:|
| `violet/900` | `#2B1456` |
| `violet/800` | `#3A1E72` |
| `violet/700` | `#4A2A8E` |
| `violet/600` | `#5B38A8` |
| `violet/500` | `#6D4ABF` |
| `violet/400` | `#8568CA` |
| `violet/300` | `#A08ED5` |
| `violet/200` | `#C0B5E2` |
| `violet/100` | `#DDD8EF` |
| `violet/50` | `#EEEAF6` |

### Orange

Orange is a supporting category color for warm opportunity, reward, commerce, or brand-oriented content. It must not compete with violet as the product accent.

| Token | Value |
|---|---:|
| `orange/700` | `#96553A` |
| `orange/600` | `#B06D48` |
| `orange/500` | `#C88558` |
| `orange/400` | `#D8A47E` |
| `orange/200` | `#E8C4A8` |
| `orange/100` | `#F0D8C5` |
| `orange/50` | `#F6EBE0` |

### Green

Green is a supporting category color for positive evidence, completion, sustainability, or retained value.

| Token | Value |
|---|---:|
| `green/700` | `#3D6E50` |
| `green/600` | `#508A64` |
| `green/500` | `#6DA37E` |
| `green/400` | `#8FB99C` |
| `green/200` | `#B5D2BE` |
| `green/100` | `#D4E5D8` |
| `green/50` | `#E9F1EB` |

### Status colors

| Token | Value | Use |
|---|---:|---|
| `status/error` | `#D9534F` | Failed, blocked, destructive |
| `status/warning` | `#E5A832` | Needs attention, partial result |
| `status/success` | `#34A853` | Completed, saved, verified |
| `status/info` | `#4A90D9` | Informational system state |

Status colors communicate state only. Never use them as decorative card palettes.

## 4. Semantic colors

### Text

| Token | Value | Use |
|---|---:|---|
| `text/primary` | `#1A1816` | Headings and primary content |
| `text/secondary` | `#474139` | Labels and supporting content |
| `text/muted` | `#766E65` | Descriptions and metadata |
| `text/quiet` | `#ADA59C` | Placeholder, timestamps, low-priority labels |
| `text/inverse` | `#FDFCFA` | Text on dark surfaces |

Maintain at least a one-step hierarchy between adjacent text roles. Do not use quiet text for information required to complete a task.

### Backgrounds and surfaces

| Token | Value | Use |
|---|---:|---|
| `bg/canvas` | `#F2EFE9` | Main application background |
| `bg/panel` | `#FDFCFA` | Main panels and modal surfaces |
| `bg/sidebar` | `#EBE7E1` | Navigation and persistent rails |
| `bg/elevated` | `#FDFCFA` | Popovers, dialogs, floating content |
| `bg/sunken` | `#E0DBD4` | Wells, inactive tracks, recessed regions |
| `surface/primary` | `#FDFCFA` | Cards and form controls |
| `surface/primary-hover` | `#EEE9E3` | Hover state for primary surfaces |
| `surface/primary-active` | `#E0DBD4` | Pressed state for primary surfaces |
| `surface/secondary` | `#EBE7E1` | Secondary controls and grouped areas |
| `surface/secondary-hover` | `#E3DED7` | Hover state for secondary surfaces |
| `surface/secondary-active` | `#D8D2CA` | Pressed or selected secondary state |

Prefer borders and background separation over large shadows. Elevated surfaces may use one subtle shadow when separation cannot be achieved by color alone. Keep interaction states in their surface family: primary surfaces use `primary-hover/active`; secondary surfaces use `secondary-hover/active`.

### Borders

| Token | Value | Use |
|---|---:|---|
| `border/default` | `#E0DBD4` | Inputs, cards, dividers |
| `border/subtle` | `#EBE7E1` | Hairlines and low-emphasis grouping |
| `border/strong` | `#C8C1B8` | Focus-adjacent or high-contrast boundaries |

Use 1 px borders. Dashed borders are reserved for upload/drop zones and empty insertion areas.

### Accent and interaction

| Token | Value | Use |
|---|---:|---|
| `accent/primary` | `#6D4ABF` | Selected states, focus, AI-related emphasis |
| `accent/secondary` | `#6DA37E` | Supporting positive categorization |
| `accent/surface` | `#DDD8EF` | Selected or highlighted background |
| `accent/muted` | `#EEEAF6` | Low-emphasis accent background |
| `interactive/primary` | `#1A1816` | Primary action background |
| `interactive/hover` | `#302C28` | Primary action hover |
| `interactive/disabled` | `#E0DBD4` | Disabled action background |

Focus rings use `accent/primary` at reduced opacity and must remain visible against both canvas and panel backgrounds.

## 5. Typography

### Typeface

- Primary Latin typeface: `Inter`.
- Figma uses `Regular` for supporting text and `Medium` for hierarchy and scale specimens.
- Chinese fallback: `PingFang SC`, then `Microsoft YaHei`, then system sans-serif.
- Recommended stack: `Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`.
- Avoid Arial as the first choice because it changes the proportions established in Figma.

### Size scale

| Token | Size | Default role |
|---|---:|---|
| `size/caption` | 10 px | Eyebrows, compact metadata |
| `size/detail` | 12 px | Secondary labels, helper text |
| `size/body-sm` | 14 px | Dense card and table copy |
| `size/body` | 16 px | Default readable body copy |
| `size/subheading` | 18 px | Section subheading |
| `size/body-lg` | 20 px | Lead text or emphasized body |
| `size/heading-sm` | 24 px | Card-group or page-section heading |
| `size/heading` | 32 px | Standard page title |
| `size/heading-lg` | 36 px | Major page title |
| `size/display-sm` | 40 px | Compact display heading |
| `size/display` | 48 px | Display heading |
| `size/display-lg` | 56 px | Large display heading |
| `size/display-xl` | 64 px | Hero-only display heading |

Implementation guidance:

- Use `Medium` for headings, button labels, selected navigation, and important metrics.
- Use `Regular` for paragraphs, descriptions, metadata, and form values.
- Default body line height: 1.5–1.7 for Chinese or mixed-language content.
- Compact labels may use 1.3–1.4 line height.
- Page titles may use slightly negative letter spacing, but never below `-0.04em`.
- Uppercase eyebrows may use `0.08em–0.14em` letter spacing.
- Do not use display sizes inside operational dashboard cards.

## 6. Spacing

Canonical spacing scale:

`2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 38, 46, 52, 64 px`

Usage guidance:

- `2–6`: icon offsets, inline metadata, tight internal alignment.
- `8–12`: compact control gaps, chips, small card internals.
- `14–20`: standard component padding and form spacing.
- `24–32`: section padding, card groups, layout gutters.
- `38–64`: separation between major page regions.
- Prefer values from the scale; do not introduce arbitrary 15, 17, 22, or 30 px gaps.
- Related controls should be closer to each other than to the next section.

## 7. Radius

The Figma variables contain a granular radius scale, while the visible specification highlights these canonical values:

`4, 6, 8, 10, 12, 14, 16 px, full`

Recommended semantic mapping:

| Role | Radius |
|---|---:|
| Tiny tags and keyboard hints | 4 px |
| Compact buttons and badges | 6 px |
| Inputs and standard buttons | 8 px |
| Upload areas and compact cards | 10 px |
| Standard dashboard cards | 12 px |
| Prominent action or content cards | 14 px |
| Dialogs and major floating panels | 16 px |
| Pills, avatars, circular controls | `9999px` |

Nested elements should normally use a radius 2–4 px smaller than their parent.

## 8. Layout

- Desktop pages use a persistent sidebar and a centered content column.
- Use `minmax(0, 1fr)` for flexible main regions to prevent overflow.
- Default content width should remain readable rather than stretching across the viewport; use approximately 1030–1100 px for evidence-heavy pages and 720–800 px for forms.
- Major page padding: 52–64 px vertically and 24–32 px horizontally.
- Use CSS Grid for repeated cards and data columns; use Flexbox for toolbars and compact control rows.
- Card grids collapse to one column on narrow screens.
- On mobile, reduce persistent navigation to an icon rail or compact header, but preserve task progress and the primary action.

## 9. Components

The Figma page defines foundations and contains no reusable Figma component sets. The following rules are implementation conventions derived from those foundations.

### Buttons

- Primary: `interactive/primary` background, `text/inverse`, 8 px radius.
- Primary hover: `interactive/hover`; do not rely only on movement or shadow.
- Disabled: `interactive/disabled` with quiet text and no shadow.
- Secondary: `surface/secondary` with `text/secondary`.
- Ghost: transparent; hover uses the surface family of its containing region.
- Standard height: 36–40 px. Compact toolbar actions: 28–32 px.
- Use violet for selection/focus, not as the default primary-button fill.

### Inputs

- All text-entry controls use a visible white `surface/primary` fill and warm brown-gray `border/strong` (`neutral/200`, `#C8C1B8`). Never present an editable field as borderless text.
- Standard single-line height: 42 px; standard radius: 8 px; horizontal padding: 12–13 px.
- Labels sit 10–15 px above their control and use `text/secondary`, 11–12 px, semibold.
- Placeholder uses `text/quiet`.
- Focus retains the warm stroke and adds a 2 px `accent/primary` ring without shifting layout.
- Textareas follow the same fill, stroke, radius, and focus treatment; minimum height is 74 px and they may grow vertically.
- Select controls follow the same geometry as text inputs. Their chevron is secondary information and must not become the strongest element.
- Helper text uses `size/detail` or `size/caption`, never below 10 px in production UI.
- Validation errors retain the white fill, replace the border with `status/error`, and add a short text explanation below the control.

### Upload areas

- Upload areas occupy the full available row unless paired files are the explicit task.
- Use `surface/primary`, a 1 px dashed `border/strong`, and a 10 px radius.
- Minimum height is 72–82 px. Center the icon and two-line label vertically; keep file names readable and truncate only at the end.
- The action that processes an uploaded file appears on the following row, centered. It is not placed as a tall block beside the drop zone.
- After upload, show small previews and a plain-language processing state. Violet indicates active Agent processing; green indicates a completed result.

### Cards and panels

- Default content card: white `surface/primary`, 12 px radius, no visible stroke, and `shadow/card` only when separation from the canvas is necessary.
- Input cards and editable design-point cards remain white. Their contained inputs carry the warm stroke; the card itself does not.
- Selection cards use white fill in the default state. Hover changes to `surface/primary-hover`; selected state uses `accent/surface` or a violet state cue.
- Secondary groups inside a white card use `surface/secondary` and a radius 2–4 px smaller than the parent. Do not stack several shadowed white cards.
- Summary panels may use `surface/secondary` without a stroke. They present context and must not resemble editable inputs.
- Selected cards retain the same structure and add an accent fill or state indicator; do not rely on opacity alone.
- Primary evidence images preserve their aspect ratio and source context. A design-point card may show a focused crop only when the original image remains available from the same record.

### Editable design-point cards

- Use a white card with 16–18 px internal padding and a 12 px radius.
- Present the Agent-cropped source image first, followed by the editable decision name and concise description.
- Strategy and expected metrics belong to the same decision card. Strategy labels are action-oriented verbs such as “降低参与门槛”.
- One design point may contain multiple short metric chips or fields. Each can be edited or removed; “添加指标” is a quiet secondary action.
- Remove controls are low-emphasis until hover and must never compete with the primary workflow action.

### Step progress

- Use the same numbered horizontal stepper across project setup, research, solution review, and retrospective screens.
- Active step: `interactive/primary` circle with inverse number and primary label.
- Completed step: `accent/surface` circle with violet number plus a separate success check; connectors use `border/default`.
- Future steps use `interactive/disabled` and quiet text. Previous steps may be clickable; future steps remain disabled until their prerequisites exist.

### Progress and Agent states

- Routine Agent processing uses `accent/primary` for both percentage text and the filled progress track.
- The empty progress track uses `interactive/disabled`.
- Status colors are reserved for exceptions or outcomes: green for completed, orange for attention or login, red for failed. Do not use blue for the normal running state.

### Navigation

- Sidebar uses `bg/sidebar`.
- Default items use `text/muted`; active items use `text/primary` and `surface/secondary-active` or `accent/surface`.
- Navigation hover uses `surface/secondary-hover`.
- Navigation labels should use 12–14 px type; do not use tiny metadata sizes for primary navigation.

### Chips and tags

- Chips use 4–6 px radius and 10–12 px text.
- Neutral chips use `surface/secondary`.
- Selected chips use `accent/surface` with violet text derived from `violet/700`.
- Orange, green, blue, and status colors communicate categories or states, not arbitrary decoration.

### Tables and research lists

- Headers use muted text on `surface/secondary`.
- Rows use `surface/primary` with `border/subtle` dividers.
- Row hover uses `surface/primary-hover`.
- Keep actions aligned consistently at the end of each row.
- Dense data may use `size/body-sm`; critical values should not be smaller than 12 px.

### Dialogs and feedback

- Dialogs use `bg/elevated`, 16 px radius, and a restrained shadow.
- Toasts use `interactive/primary` with inverse text.
- Error, warning, success, and info messages must pair color with a label or icon.
- Loading states should preserve layout to avoid page jumps.

## 10. Interaction and motion

- Use 150–200 ms transitions for hover, focus, and selection.
- Motion should confirm state change, not decorate routine navigation.
- Avoid scale effects on dense cards; a small elevation or background change is sufficient.
- Respect `prefers-reduced-motion`.
- Never disable page animation temporarily during screenshots or Agent observation; wait for visual stability instead.

## 11. Accessibility

- Body and operational text should meet WCAG AA contrast.
- Do not place quiet text on `bg/sunken` for required information.
- All controls need keyboard focus states.
- Icon-only buttons require accessible labels.
- Touch targets should be at least 40 × 40 px on touch-oriented layouts.
- Color must not be the only indicator for selection, status, or validation.
- Preserve source links and evidence context wherever screenshots or quotations are shown.

## 12. Content style

- Prefer concise Chinese labels and sentence-case English.
- Button labels describe the immediate action: “提炼要点”, “生成策略”, “保存”.
- Avoid anthropomorphic Agent wording unless the distinction is useful to the user.
- Helper text explains consequence or required input, not the obvious control label.
- Empty states should state what is missing and the next available action.

## 13. Migration notes for the current dashboard

The existing `app/globals.css` still uses a cool-gray palette such as `#F4F6F7`, `#E7EBED`, and `#25282A`, and places Arial before the Chinese/system stack. New work should use the Figma tokens above. Existing screens should migrate incrementally:

1. Replace root variables with semantic warm-neutral tokens.
2. Change the primary font stack to Inter with Chinese fallbacks.
3. Map canvas, sidebar, panels, text, borders, and actions to semantic variables.
4. Replace hardcoded violet, orange, and green values with primitive or semantic tokens.
5. Normalize spacing and radii to the canonical scales.
6. Increase any required operational text currently below 10 px.

Do not mix the old cool-gray and new warm-neutral foundations within the same screen.

## 14. Review checklist

Before considering a 设计调研与评审专家 screen complete, verify:

- Semantic tokens are used instead of hardcoded primitive colors.
- Warm-neutral canvas, sidebar, and panel hierarchy is visible.
- Violet is reserved for selection, focus, AI, and brand emphasis.
- Only one primary action dominates each section.
- Typography follows the scale and required information is at least 10 px.
- Spacing and radius values come from the documented scales.
- Cards, inputs, and buttons have complete hover, focus, active, and disabled states.
- Evidence images are uncropped and source context remains visible.
- Layout works at desktop and narrow breakpoints.
- Keyboard focus, contrast, labels, and non-color state cues have been checked.
