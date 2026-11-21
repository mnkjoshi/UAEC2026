# Elijah's task: Module Tile component

## What you're building

The **module tile** is the small card that represents one battery module on the pack map.
The dashboard shows 12 of them in a 2 × 6 grid. It's the first thing judges look at, so it needs to show
**at a glance** which modules are fine and which are in trouble.

Your job is purely visual: the tile is given its data and just displays it. No calculations needed.

## Setup (5 minutes)

```bash
git pull
npm install
npm run dev        # open http://localhost:5173
```

You'll see 12 plain placeholder tiles built from mock data. Make them look good.

## Files

| File | What to do |
|---|---|
| `src/ui/components/ModuleTile.tsx` | **Build this.** The placeholder is already there with the correct props. |
| `src/ui/components/StatusBadge.tsx` | **Create this.** Small icon + text label for a severity; the tile uses it. |
| `src/ui/components/ModuleTile.css` | Create if you want a stylesheet (or use CSS modules). |
| `src/ui/demo/mockModules.ts` | Mock data. Edit freely to test different cases. |
| `src/ui/demo/ModuleTileDemo.tsx` | The preview page with the 2 × 6 grid. Tweak the layout if needed. |
| `src/index.css` | Colour variables (`--sev-normal`, `--sev-critical`, etc.). Use these; adjust them if you have a better palette. |

**Don't change** `src/core/types.ts` without checking with the team; other code depends on it.

## Props (already defined)

```ts
interface ModuleTileProps {
  id: string;                 // "M07"
  temperature: number | null; // °C, null = sensor missing
  voltage: number | null;     // V
  soc: number | null;         // state of charge %
  severity: 'normal' | 'advisory' | 'warning' | 'critical' | 'data_fault';
  label?: string;             // short reason, e.g. "Rising 7.5 °C/min"
  selected?: boolean;
  onClick?: () => void;
}
```

## Requirements

- [ ] **Module ID** shown large (e.g. `M07`)
- [ ] **Temperature** (1 decimal, `°C`) and **voltage** (3 decimals, `V`) clearly readable; SOC smaller
- [ ] Colour by severity using the CSS variables:
  - normal → green
  - advisory → blue
  - warning → amber
  - critical → red, with a **slow pulse** animation
  - data_fault → purple with a **hatched/striped** background (so it reads as "unknown", not "danger")
- [ ] **Always show an icon + word** next to the colour (`✓ Normal`, `ⓘ Advisory`, `⚠ Warning`, `⛔ Critical`, `? No data`). Colour alone is not enough for colour-blind users.
- [ ] Show the `label` text when present
- [ ] A `null` value shows `—`, never `0`, `NaN` or `null`
- [ ] The **selected** tile has a clear outline/highlight
- [ ] Hover effect, and it's a real `<button>` so it works with the keyboard
- [ ] Tiles stay readable at roughly 140–180 px wide

## Tips

- Keep it simple and high-contrast; this will be shown on a projector.
- The critical pulse should be noticeable but not frantic (about a 1.5 s cycle). Respect `prefers-reduced-motion`.
- Look at the mock data: M03 is a warning, M07 critical, M11 data fault, M05 advisory. All four should be distinguishable from across a room.

## Done when

- [ ] All five severities look clearly different on the demo page
- [ ] M11 (missing sensors) shows `—` and looks like "no data", not "danger"
- [ ] `npm run build` passes with no errors
- [ ] Committed and pushed (small commits are good; judges look at commit history)

**Stretch:** a tiny temperature bar or sparkline inside the tile, or a tooltip with SOH and current on hover.
