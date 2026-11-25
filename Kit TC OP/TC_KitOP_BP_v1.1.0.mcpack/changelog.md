# Changelog

## [1.1.0] - 2026-11-22

- Fix: `/tc:kitop` and `/tc:kitn` now resolve structure templates by namespaced,
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

- `/tc:kitop` (Operators only): spawns a 4x4 supply room around you on two
  tiers — 11 double-chest clusters on colored plinths with hanging sign labels
  (Combat, Minerals, Build, Food, Tools, Redstone, Nether-End, Treasure, Armor,
  Weapons, plus the player gear chest). Every chest front faces the room
  center; every chest is filled to all 54 slots with named, color-coded
  shulker boxes, every shulker filled to all 27 slots.
- 394 unique items with no overlap between categories, full enchant level
  1000 gear sets including Density/Breach/Wind Burst maces and the exclusive
  Lunge enchant on all 7 spear tiers.
- 4 armor stands at the room corners wearing level 1000 armor sets.
- Automatic armor equip from the kit chest; leftovers stay in the chest.
- `/tc:kitn` (everyone): one plain double chest with vanilla survival-max
  enchants, no room layout, no auto-equip.
- All user-facing text in English. No cheats required, stable APIs only.
