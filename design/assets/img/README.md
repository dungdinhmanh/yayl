# Local game art

This directory is for local-only copies of official key art used by the static UI lab.

- `arknights.png` and `stella.png` are ignored by git.
- Generate them with `bun run design:art`.
- The HTML pages fall back to a generated gradient when the images are missing.
- Do not commit official game art, logos, or other copyrighted assets.

The production launcher fetches art from the official API at runtime and caches it in the app data directory.
