# StashBro brand assets

Icon: **A5 Hybrid** - an acorn (the stash) with a bookmark notch (the save), on a warm-dark
tile with a honey glyph.

## Sources (edit these, then regenerate)

| File | Use |
|------|-----|
| `icon.svg` | Rounded tile, transparent corners - macOS AppIcon, browser extension |
| `icon-square.svg` | Full-bleed, no corners - iOS (system masks corners itself) |
| `icon-mono.svg` | Black template glyph - macOS menu bar (auto-inverts light/dark) |
| `icon-1024.png` | Rendered preview |

## Regenerate every platform icon

```bash
bash scripts/gen-icons.sh
```

Requires `rsvg-convert` and `magick` (ImageMagick). Writes to:

- `packages/extension/public/icon/{16,32,48,128}.png`
- `apps/mac/StashBro/Assets.xcassets/AppIcon.appiconset/` (16-1024)
- `apps/mac/StashBro/Assets.xcassets/MenubarIcon.imageset/` (mono template)
- `apps/mobile/assets/icon.png` (1024, flattened for iOS)

After changing the Mac asset catalog run `cd apps/mac && xcodegen generate`.

## Palette

- ink `#17130c` · cap `#c97b1e` · body `#f2a93b` · highlight `#ffca63`
