# YAYL UI Lab

Static HTML/CSS/JS prototypes for the YAYL launcher. **No build step. No server.** Open `index.html` directly in Edge or Chrome.

## Quick start

1. Copy the official key art into the lab (optional but recommended for realistic review):

   ```powershell
   bun run design:art
   ```

   The copies are gitignored. Without them, pages fall back to a game-colored gradient.

2. Open `index.html`.

   For automated preview or screenshots, an optional local server is available:

   ```powershell
   bun run design:serve
   # http://127.0.0.1:4173/
   ```

3. Use the floating **UI LAB** button (bottom-right) to switch game, state, language, and motion.

## Screens

| File | Purpose |
|---|---|
| `index.html` | Gallery and review checklist |
| `home-sidebar.html` | Home, variant A (icon rail + news) |
| `home-topbar.html` | Home, variant B (top avatars + news) |
| `settings.html` | Settings (General, Game, Network, Advanced, About) |
| `first-run.html` | Onboarding (language, games, done) |
| `ui-kit.html` | Buttons, forms, status, progress, modal |
| `download-animations.html` | Five download-avatar animation options to review |
| `effects-gallery.html` | 34 progress effects with library tags, weight, sticky scrubber and a simulate-download control |
| `server-switch.html` | One game icon + server picker concept |

## Query parameters

| Parameter | Values | Notes |
|---|---|---|
| `game` | `arknights`, `stella` | Active game profile |
| `state` | `ready`, `update`, `install`, `downloading`, `paused`, `verifying`, `running`, `error`, `offline`, `complete` | Home; download supports a subset |
| `lang` | `vi`, `en` | Vietnamese is the default |
| `ui` | `0`, `1` | `0` hides the lab toolbar |
| `step` | `1`, `2`, `3` | `first-run.html` only |
| `tab` | `general`, `game`, `network`, `advanced`, `about` | `settings.html` only |

Examples:

```text
home-sidebar.html?state=install&lang=vi
home-sidebar.html?state=downloading&game=stella
settings.html?tab=network
first-run.html?step=2
```

## Review checklist

- All strings fit in Vietnamese and English.
- Long install paths truncate in the middle without hiding the drive.
- 1280×720 and 1100×650 both look intentional.
- 150% zoom does not clip the primary action.
- Keyboard focus is visible on every control.
- Disabled and enabled states are clearly different.
- Offline/error states still allow navigation.
- Destructive actions require confirmation.
- The primary action is obvious in every state.

## Rules

- Classic `<script>` only. No ES modules.
- No `fetch()` of local JSON; use the data in `assets/js/mock-data.js`.
- No external fonts, icon CDNs, or analytics.
- `assets/css/tokens.css` is the source of truth for design tokens.
- `assets/css/components/` contains standalone, scalable components. The download badge lives there and is scaled with `--dl-badge-size`.
- `assets/vendor/` holds locally vendored libraries. No CDN at runtime.
- The update-button animation proposals use anime.js (MIT) with a CSS fallback.
- Official art is local-only and gitignored. Never commit it.

When a layout is approved here, it gets ported to the React app with the same tokens.
