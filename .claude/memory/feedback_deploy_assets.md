---
name: deploy-assets-copy-step
description: Every build deploy must copy new assets from dist/assets/ to root assets/ — GitHub Pages serves from root not dist
metadata:
  type: feedback
---

After every `npm run build`, new/changed asset files must be copied from `dist/assets/` to the root `assets/` folder before committing. GitHub Pages serves the root `assets/` folder directly — the `dist/` folder is just the build output and not served.

**Why:** Build 29 was deployed without copying new assets to root `assets/`, causing `index-C9sDMW_Q.js` to 404 on the live site and breaking login for all users.

**How to apply:** After every build, identify which files changed (new hashes) in `dist/assets/`, copy them to root `assets/`, then commit BOTH `dist/` and root `assets/` changes together. The pattern: `Copy-Item "dist/assets/<file>" "assets/<file>" -Force` for each new file.
