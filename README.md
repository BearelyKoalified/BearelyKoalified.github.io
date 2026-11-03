# Apps hub

One page listing every app I host: <https://bearelykoalified.github.io/>

## How it updates

`.github/workflows/deploy.yml` runs `scripts/build.mjs` on every push, once a day, and on demand.
The script:

1. Lists my public repos with GitHub Pages turned on (no config needed for new ones).
2. Adds anything hosted elsewhere from `extra` in `apps.json`.
3. Opens each app in headless Chromium and saves a light and a dark thumbnail.
4. Renders `src/index.html` into `dist/`, which the workflow deploys to Pages.

## Common changes

| To... | Do this |
| --- | --- |
| Add a Pages site | Nothing. Turn on Pages for the repo; it appears on the next daily run, or run the workflow now. |
| Add an app hosted elsewhere | Add an entry to `extra` in `apps.json`. Set `"screenshot": false` if it sits behind a login. |
| Hide a repo | Add its name to `exclude`. |
| Change a title or description | Add `"<repo>": { "title": "...", "description": "..." }` to `overrides`. The card description defaults to the repo description. |
| Refresh now | `gh workflow run deploy.yml -R BearelyKoalified/BearelyKoalified.github.io` |

## Run it locally

```bash
npm install
GITHUB_TOKEN=$(gh auth token) npm run build
npm run preview
```
