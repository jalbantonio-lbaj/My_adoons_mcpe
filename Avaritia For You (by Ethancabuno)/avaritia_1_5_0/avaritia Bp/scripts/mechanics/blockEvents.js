import { zoneMultiplier } from "../admin/timeZones.js";
import * as MC from "@minecraft/server";
import { selfHealDireCraftingTable } from "./direAltar.js";
import { ensureCollectorContainer, tickCollector } from "./neutronCollectorUI.js";
import { ensureCompressorContainer, tickCompressor } from "./compressorUI.js";
import { ensureRecordFurnaceContainer, tickRecordFurnace } from "./recordFurnaceUI.js";
import { ensureInfinityChestContainer, tickInfinityChest } from "./infinityChestUI.js";

// Neutron Collector and Neutronium Compressor now have their own REAL shelf UI
// (see neutronCollectorUI.js / compressorUI.js) replacing ModalFormData/ActionFormData
// old - does not touch direAltar.js/altarCraftingEngine.js so the 9x9 UI of the Dire
// Crafting Table is not affected.

function applyEffects(block) {
  const { x, y, z } = block.location;
  const commands = [
    { radius: 10, effect: "regeneration", level: 0 },
    { radius: 9, effect: "regeneration", level: 1 },
    { radius: 8, effect: "regeneration", level: 2 },
    { radius: 7, effect: "regeneration", level: 3 },
    { radius: 5, effect: "regeneration", level: 4 },
    { radius: 6, effect: "resistance", level: 0 },
    { radius: 5, effect: "resistance", level: 1 },
    { radius: 3, effect: "resistance", level: 2 }
  ];
  for (const { radius, effect, level } of commands) {
    block.dimension.runCommand(
      `effect @e[type=player,x=${x},y=${y},z=${z},r=${radius}] ${effect} 1 ${level}`
    );
  }
}

MC.system.beforeEvents.startup.subscribe(eventData => {
  eventData.blockComponentRegistry.registerCustomComponent("avaritia:player_interact", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!block || !player) return;
      // avaritia:dire_crafting_table NO LONGER uses this custom component -
      // see world.beforeEvents.playerInteractWithBlock in direAltar.js (exactly like the v9 mechanism).
      // neutron_collector/neutronium_compressor: only need to make sure the shelf entity exists,
      // OPENING the UI happens automatically (the engine automatically opens the is_chested entity's container when
      // the player uses it, exactly like the Dire Crafting Table's altar mechanism).
      // Altar-style: the machines (collector, compressor, record furnace, infinity chest) are NOT handled here any more.
      // Each of them ensures its entity through world.beforeEvents.playerInteractWithBlock in its own UI file,
      // exactly like direAltar.js. Calling ensure*() here as well made every use run it twice.
    }
  });
  eventData.blockComponentRegistry.registerCustomComponent("avaritia:on_tick", {
    onTick(event) {
      const block = event.block;
      if (!block) return;
      if (block.typeId == "avaritia:neutron_collector") { const m = zoneMultiplier(block); return m > 0 ? tickCollector(block, m) : undefined; }
      if (block.typeId == "avaritia:neutronium_compressor") { const m = zoneMultiplier(block); return m > 0 ? tickCompressor(block, m) : undefined; }
      if (block.typeId == "avaritia:record_furnace") { const m = zoneMultiplier(block); return m > 0 ? tickRecordFurnace(block, m) : undefined; }
      if (block.typeId == "avaritia:infinity_chest") return tickInfinityChest(block);
      if (block.typeId == "avaritia:asgardandelion") return applyEffects(block);
      if (block.typeId == "avaritia:dire_crafting_table") return selfHealDireCraftingTable(block);
    }
  });
});