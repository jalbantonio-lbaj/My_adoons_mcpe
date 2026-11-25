import * as MC from "@minecraft/server";
import { armorEffects } from "./player/armorEffects.js";
import "./player/wingFlight.js";
import "./player/neonImpact.js";
import "./player/neonArmorPower.js";
import "./player/swordRot.js";
import "./player/toolArm.js";
import "./admin/invsee.js";
import "./admin/chronoClock.js";

MC.system.afterEvents.scriptEventReceive.subscribe((eventData) => {
  const entity = eventData.sourceEntity;
  if (eventData.id == "avaritia:all_immunity") {
    entity.triggerEvent("minecraft:components");
    const item = entity.getComponent("item").itemStack;
    if (item.typeId.includes("netherite") && !item.typeId.includes("minecraft:") || (item.typeId.includes("neutronium") || item.typeId.includes("crystal_matrix")) && item.typeId.includes("avaritia:")) {
      entity.addTag("fire_immunity");
    } 
    if (item.typeId.includes("infinity") && item.typeId.includes("avaritia:") || item.typeId == "infinity_bow:bow" || item.typeId == "infinity_bow:bow_dragon" || item.typeId == "avaritia:matter_cluster") {
      entity.addTag("fire_immunity");
      entity.addTag("all_immunity");
    }
  }
});

MC.system.runInterval(() => {
  for (const player of MC.world.getAllPlayers()) {
    const equipment = player.getComponent("minecraft:equippable");
    const invComponent = player.getComponent("inventory");
    if (!equipment || !invComponent) continue;
    const inventory = invComponent.container;
    for (let i = 0; i < inventory.size; i++) {
      const item = inventory.getItem(i);
      if (item && isInfinityOrNeutronium(item)) {
        if (!item.keepOnDeath) {
          item.keepOnDeath = true;
          inventory.setItem(i, item);
        }
      }
    }
    const armorSlots = [
      MC.EquipmentSlot.Head,
      MC.EquipmentSlot.Chest,
      MC.EquipmentSlot.Legs,
      MC.EquipmentSlot.Feet,
      MC.EquipmentSlot.Offhand
    ];
    for (const slot of armorSlots) {
      const item = equipment.getEquipment(slot);
      if (item && isInfinityOrNeutronium(item)) {
        if (!item.keepOnDeath) {
          item.keepOnDeath = true;
          equipment.setEquipment(slot, item);
        }
      }
    }
    armorEffects(player);
  }
}, 1);

function isInfinityOrNeutronium(item) {
  const id = item.typeId.toLowerCase();
  return id.includes("infinity") || id.includes("neutronium");
}

// ===== Mechanics (core systems: altar, compressor, neutron collector, matter cluster, block) =====
import "./mechanics/blockEvents.js";
import "./mechanics/neutroniumBlockPlace.js";
import "./mechanics/direAltar.js";
import "./mechanics/itemUse.js";
import "./mechanics/matterCluster.js";
import "./mechanics/compressor.js";
import "./mechanics/neutronCollector.js";
import "./mechanics/altarCraftingEngine.js";
import "./mechanics/neutronCollectorUI.js";
import "./mechanics/compressorUI.js";
import "./mechanics/recordFurnaceUI.js";
import "./mechanics/infinityChestUI.js";
import "./mechanics/machineEntityGuard.js";
import "./mechanics/machineHitbox.js";
import "./mechanics/utilityCraftCompat.js";
import "./mechanics/projectECompat.js";
import "./mechanics/xpVial.js";
import "./mechanics/gachaMachine.js";

// ===== Player (effects on the player: armor, food) =====
import "./player/foodEffects.js";

// ===== Tools (individual behavior of each infinity tool) =====
import "./tools/infinityTools.js";
import "./tools/combatHit.js";
import "./tools/heavenArrowRain.js";
import "./tools/veinMining.js";
import "./tools/endestPearlThrow.js";
import "./tools/infinityBowInfiniteAmmo.js";
import "./tools/infinityBowDragon.js";
import "./tools/infinityTotems.js";
import "./tools/biomeCompass.js";
import "./tools/infinitySwordWave.js";
import "./tools/infinityMace.js";
import "./tools/infinityScythe.js";
import "./tools/infinitySpear.js";
import "./tools/infinityShield.js";
import "./tools/infinityCrossbow.js";
import "./tools/infinityTrident.js";
import "./tools/infinityUtility.js";
import "./tools/infinityTotemEternal.js";
import "./tools/sealOrb.js";
