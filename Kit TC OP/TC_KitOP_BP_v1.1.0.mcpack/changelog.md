# Changelog

## [1.1.1] - 2026-11-25

- Added the Kit Selector item, styled as a black enchanted book.
- Added the Kit System menu with KitOP and KitN choices.
- Kept /tc:kitop and /tc:kitn as alternative commands.
- KitOP remains operator-only when launched from the menu.
- Added a linked resource pack for the custom book icon.

## [1.1.0] - 2026-11-22

- Fix: /tc:kitop and /tc:kitn now resolve structure templates by namespaced,
  bare, or slash-form identifier, so a template lookup mismatch no longer makes
  the kit spawn silently fail.
- Fix: chest and armor stand placement retries nearby heights when the target
  cell is blocked. When any unit fails, a diagnostic message reports the exact
  cause: missing template, unloaded chunk, blocked space, or no floor.
- Fix: automatic armor equip now reads the gear chest from its actual placed
  position instead of the original anchor.
- Added a chat message with the gear chest coordinates for both commands, sent
  directly so it stays visible even when chat feedback is disabled.
- Added the achievement chime alongside the chest-open sound.
- Fixed six Script API type errors in the kit room layout data.

## [1.0.0] - 2026-10-14

- /tc:kitop (Operators only): spawns the 4x4 supply room with 11 storage units,
  394 unique items, enchanted gear, four armor stands, and automatic equipment.
- /tc:kitn (everyone): spawns one plain double chest with vanilla survival-max
  enchants, no room layout, no auto-equip.
- All user-facing text in English. No cheats required, stable APIs only.
