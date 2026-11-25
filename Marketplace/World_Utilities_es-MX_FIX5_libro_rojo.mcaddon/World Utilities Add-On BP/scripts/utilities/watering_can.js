import { EquipmentSlot, GameMode, ItemComponentUseEvent, ItemStack } from '@minecraft/server';
import { WATERINGCAN_LORE } from '../main';
import { Configs, getConfig } from "../sub/config";
import { configFailedMessage } from "../sub/messenger";

function getMaxDurabilityOrDefault(itemStack, fallback = 10) {
  try {
    const d = itemStack.getComponent('durability');
    if (d && typeof d.maxDurability === 'number' && d.maxDurability > 0) return d.maxDurability;
  } catch {}
  return fallback;
}

export class EmptyWateringCanComponent {
  /** @param {ItemComponentUseEvent} e  */
  onUse(e) {
    const { source } = e;

    if (!getConfig(Configs.WateringCan)) { configFailedMessage(source); return; }

    const block = source.getBlockFromViewDirection({ includeLiquidBlocks: true, maxDistance: 10 })?.block;
    if (!block || !block.typeId.endsWith('water')) return;

    const result = new ItemStack('gf_wu:watering_can_filled');
    result.setLore([WATERINGCAN_LORE]);

    if (getConfig(Configs.Durability)) {
      try {
        const d = result.getComponent('durability');
        if (d) d.damage = 0;
      } catch {}
    }
    source.getComponent('equippable').setEquipment(EquipmentSlot.Mainhand, result);

    // Consume the water source as per your original behavior
    block.setType('air');
    source.playSound('bucket.fill_water', block.center());
  }
}

export class WateringCanComponent {
  /** @param {ItemComponentUseEvent} e  */
  onUse(e) {
    const { source, itemStack } = e;

    if (!getConfig(Configs.WateringCan)) { configFailedMessage(source); return; }

    const viewBlock = source.getBlockFromViewDirection({ includeLiquidBlocks: true, maxDistance: 10 })?.block;
    if (viewBlock?.typeId?.endsWith('water')) {
      try {
        const d = itemStack.getComponent('durability');
        if (d) d.damage = 0;
      } catch {}
      source.getComponent('equippable').setEquipment(EquipmentSlot.Mainhand, itemStack);
      viewBlock.setType('air');
      source.playSound('bucket.fill_water', viewBlock.center());
      return;
    }

    const { dimension, location } = source;
    const currentLocation = { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };

    // Visuals
    dimension.spawnParticle('gf_wu:water_area', { x: location.x, y: currentLocation.y + 1, z: location.z });
    source.playSound('bucket.empty_water');

    // Effects
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (Math.random() < 0.375) continue;

          const blockLocation = { x: x + currentLocation.x, y: y + currentLocation.y, z: z + currentLocation.z };
          const block = dimension.getBlock(blockLocation);
          if (
            !block.permutation.getTags().includes('minecraft:crop') &&
            !block.typeId.endsWith('stem') &&
            block.typeId != 'minecraft:azalea' &&
            block.typeId != 'minecraft:flowering_azalea' &&
            block.typeId != 'minecraft:dirt' &&
            block.typeId != 'minecraft:grass_block' &&
            block.typeId != 'minecraft:grass_path'
          ) continue;

          dimension.spawnParticle('minecraft:crop_growth_emitter', {
            x: blockLocation.x + 0.5,
            y: blockLocation.y + 0.5,
            z: blockLocation.z + 0.5
          });

          if (block.typeId == 'minecraft:dirt' || block.typeId == 'minecraft:grass_block' || block.typeId == 'minecraft:grass_path') {
            block.setType('farmland');
            continue;
          }

          if (block.typeId == 'minecraft:azalea') {
            block.setType('minecraft:flowering_azalea');
            continue;
          }

          if (block.typeId == 'minecraft:flowering_azalea') continue;

          dimension.runCommand(`execute positioned ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} run function gf/wu/wateringCan/grow`);
        }
      }
    }

    if (source.getGameMode() == GameMode.Creative) return;

    if (!getConfig(Configs.WateringCanDurability)) {
      source.getComponent('equippable').setEquipment(EquipmentSlot.Mainhand, itemStack);
      return;
    }

    try {
      const d = itemStack.getComponent('durability');
      const max = getMaxDurabilityOrDefault(itemStack, 10);

      if (d) {
        d.damage += 1;
        if (d.damage >= max) {
          const empty = new ItemStack('gf_wu:watering_can');
          empty.setLore([WATERINGCAN_LORE]);
          source.getComponent('equippable').setEquipment(EquipmentSlot.Mainhand, empty);
        } else {
          source.getComponent('equippable').setEquipment(EquipmentSlot.Mainhand, itemStack);
        }
      } else {
        source.getComponent('equippable').setEquipment(EquipmentSlot.Mainhand, itemStack);
      }
    } catch (error) {
      const result = new ItemStack('gf_wu:watering_can');
      result.setLore([WATERINGCAN_LORE]);
      source.getComponent('equippable').setEquipment(EquipmentSlot.Mainhand, result);
    }
  }
}
