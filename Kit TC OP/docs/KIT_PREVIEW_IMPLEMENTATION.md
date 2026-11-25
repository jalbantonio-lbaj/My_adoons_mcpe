# TC Kit System — Preview implementation contract

Status: placement planner and inventory-free template cloning are implemented. KitN preview now has live target tracking, four-way rotation, confirm/cancel commands, obstruction checks, and guarded cleanup. Static CI and package validation are pending; in-world Bedrock validation remains required.
Target branch: `feature/kit-selector-menu`.
Do not edit the original `main` branch or replace the working v1.1.1 base.

## Existing behavior that must remain unchanged

- `handleKitOp` in `scripts/commands/kitop.js` places 11 storage structures, then four armor-stand structures, then runs the original auto-equip routine.
- KitOP currently uses per-unit offsets and searches vertical offsets `[0, 1, -1, 2]` when a 2x2 unit footprint is obstructed.
- KitOP reports missing templates, unloaded chunks, blocked space, missing floors, placement counts and the gear-chest coordinates.
- `handleKitN` in `scripts/commands/kitn.js` places `kitop:kit_plain` as a double chest two blocks in front of the player's view, using `doubleBase` and its existing floor/air checks.
- `main.js` exposes the same two menu choices and the original `/tc:kitop` and `/tc:kitn` commands.
- KitOP remains operator-only. KitN remains available to everyone.

The preview must not call either live generator until the player confirms.

## Preview flow

1. Kit Selector opens the existing Kit System menu.
2. Choosing KitOP or KitN starts a preview session for that kit.
3. The player aims at a target location. The preview follows the target while the player moves/looks.
4. The preview UI shows the selected kit and current quarter-turn orientation.
5. Rotate left/right changes orientation by 90 degrees. It must rotate the whole KitOP layout, including all 11 units and four stands, or the KitN double chest as a single structure.
6. Confirm removes the preview representation and invokes the original generator with the selected target/orientation.
7. Cancel, item switch, player disconnect, dimension change, timeout, or invalid target removes all preview-only content and ends the session.
8. No inventory, equipment, chest contents, or armor-stand contents are granted during preview.

## Placement planning boundary

Before implementing rendering, extract a pure placement-plan layer from the existing generator constants. It must calculate:
- KitOP: all 11 structure IDs and offsets, the four stand IDs and offsets, the kit chest anchor, and the four possible rotations.
- KitN: the current two-cell chest footprint and target anchor, plus the four rotations.
- World-space integer positions, after applying the selected rotation around one fixed anchor.

The existing spawn functions must continue to use their current placement rules and feedback. The plan layer is shared by preview and final placement so the preview cannot drift from the confirmed result.

For KitOP, rotate both coordinates and directional structure suffixes (`_n`, `_e`, `_s`, `_w`) consistently. Rotate the stand template suffixes (`0`, `45`, `90`, ... `315`) by the same quarter-turn. Do not independently rotate individual pieces.

For KitN, rotate the footprint and the structure's facing together. Do not silently change the current default orientation or placement distance.

## Safe preview representation

Preferred first implementation: build preview-only in-memory Structure copies from the existing pack templates using the stable Structure API:
- Read the original template using `world.structureManager.get`.
- Create a uniquely named in-memory structure with the same dimensions.
- Copy each source block's `BlockPermutation` into the preview structure.
- Do not copy structure entities or block-entity inventories into preview copies.
- Cache preview copies per source template for the active session; delete temporary structures when the session ends if the API/runtime permits it.

This preserves the template's visible block arrangement while ensuring the preview does not carry the original chest inventory or equipment. Armor stands are entity content in their templates and need a separate non-loot preview representation; they must never be spawned with their real equipment during preview.

Do not place preview structures over existing builds. The first prototype must require every occupied preview cell to be air and the target chunks to be loaded. If any cell is occupied, show a clear obstruction message and do not start or move the preview there. This avoids snapshot/restore risks and prevents cancellation from destroying player blocks.

Preview blocks are temporary world changes. Track every exact preview cell placed by the session. Cleanup must remove only cells still matching the preview block state placed by that session; never clear a cell that another player or process changed after preview placement. Confirm must clean up preview cells before calling the original generator.

If the runtime cannot reliably create and place inventory-free template copies, stop and report that limitation rather than previewing live loot structures or risking world data.

## Session safety

- One active preview session per player.
- Store owner, dimension, kit type, anchor, rotation, preview cell list, and expiration tick.
- Validate player and dimension before every update.
- Bound the target range and cap update frequency; do not rewrite the preview every tick when target and rotation are unchanged.
- Cleanup must be idempotent and safe after partial placement failures.
- A failed preview must never fall through to confirmation or invoke a generator.
- Re-check operator permission immediately before KitOP confirmation.
- Re-check all target cells immediately before confirmation.
- Keep direct commands functional and unchanged as alternatives.

## Delivery order

A. Add and unit-test the pure placement-plan module; do not change generator behavior.
B. Add inventory-free preview-template cloning and test it with one small KitN template.
C. Add the session lifecycle and KitN preview first.
D. Add KitOP preview, including the four armor-stand silhouettes.
E. Add rotation controls and verify all four orientations against the placement plan.
F. Add confirm/cancel cleanup and run in-world tests for obstruction, cancellation, disconnect, dimension change, and confirm.
G. Only then publish a new combined BP/RP `.mcaddon`.

## API references

- StructureManager: https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/structuremanager?view=minecraft-bedrock-stable
- Structure: https://learn.microsoft.com/es-mx/minecraft/creator/scriptapi/minecraft/server/structure?view=minecraft-bedrock-stable
- StructurePlaceOptions: https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/structureplaceoptions?view=minecraft-bedrock-stable

Important API detail: `Structure.getBlockPermutation`, `Structure.setBlockPermutation`, `Structure.size`, `StructureManager.createEmpty`, and `StructureManager.place` provide the building blocks for inventory-free visual copies. This still requires runtime verification on the addon's target Bedrock version before any preview feature is called functional.
