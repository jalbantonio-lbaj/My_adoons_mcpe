import { world, Block, ItemStack, Player, Direction, system, BlockPermutation } from "@minecraft/server"
import { ActionFormData } from "@minecraft/server-ui";
import { AMETHYSTBREAKER_LORE, AMETHYSTBREAKER_STAT, ENDFRAMEBREAKER_LORE, ENDFRAMEBREAKER_STAT, SCOREBOARD_ID, WRENCH_LORE, WRENCH_STAT } from "../main";
import { Configs, getConfig } from "./config";
import { configFailedMessage } from "./messenger";
import { decrementHeldItem, loreToId, setupIdForLore } from "./util";

const interactionCooldown = new Map()

/**
 * Perform's the end frame breaker's break ability
 * @param {Player} player 
 * @param {ItemStack} itemStack 
 * @param {Block} block 
 * @param {boolean} activateCooldown
 */
function performEndFrameBreak(player, itemStack, block, activateCooldown = false) {

  if (!getConfig(Configs.Endframebreaker)) { configFailedMessage(player); return }

  if (activateCooldown && interactionCooldown.get(player.id)) return;

  if (activateCooldown) interactionCooldown.set(player.id, true)

  world.scoreboard.getObjective(SCOREBOARD_ID).addScore(ENDFRAMEBREAKER_STAT, 1)

  block.setPermutation(BlockPermutation.resolve('air'))
  block.dimension.spawnParticle('minecraft:water_evaporation_bucket_emitter', block.bottomCenter())
  block.dimension.playSound('dig.stone', block.center())

  // Handle durability instead of uses
  if (getConfig(Configs.EndFrameBreakerDurability) && player.getGameMode() != 'creative') {
    const durabilityComponent = itemStack.getComponent('durability')
    const equippable = player.getComponent('equippable')

    if (100 / ((itemStack.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0) + 1) >= Math.random() * 100) {
      try {
        durabilityComponent.damage += 1
        equippable.setEquipment('Mainhand', itemStack)
      } catch (er) {
        equippable.setEquipment('Mainhand')
        player.playSound('random.break', { location: player.location })
      }
    } else {
      equippable.setEquipment('Mainhand', itemStack)
    }
  }

  // Delay spawning of the end portal frame item so it doesn't break
  system.runTimeout(() => {
    player.dimension.spawnItem(new ItemStack('end_portal_frame', 1), block.center())
    interactionCooldown.set(player.id, false)
  }, 2)

}

/**
 * Perform's the end frame breaker's break ability
 * @param {Player} player 
 * @param {ItemStack} itemStack 
 * @param {Block} block 
 * @param {boolean} activateCooldown
 */

function performAmethystBreak(player, itemStack, block, activateCooldown = false) {

  if (!getConfig(Configs.AmethystBreaker)) { configFailedMessage(player); return }

  if (activateCooldown && interactionCooldown.get(player.id)) return;

  if (activateCooldown) interactionCooldown.set(player.id, true)

  world.scoreboard.getObjective(SCOREBOARD_ID).addScore(AMETHYSTBREAKER_STAT, 1)

  block.setPermutation(BlockPermutation.resolve('air'))
  block.dimension.spawnParticle('minecraft:water_evaporation_bucket_emitter', block.bottomCenter())
  block.dimension.playSound('break.amethyst_block', block.center())

  // Handle durability instead of uses
  if (getConfig(Configs.AmethystBreakerDurability) && player.getGameMode() != 'creative') {
    const durabilityComponent = itemStack.getComponent('durability')
    const equippable = player.getComponent('equippable')

    if (100 / ((itemStack.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0) + 1) >= Math.random() * 100) {
      try {
        durabilityComponent.damage += 1
        equippable.setEquipment('Mainhand', itemStack)
      } catch (er) {
        equippable.setEquipment('Mainhand')
        player.playSound('random.break', { location: player.location })
      }
    } else {
      equippable.setEquipment('Mainhand', itemStack)
    }
  }

  // Delay spawning of the budding amethyst item so it doesn't break
  system.runTimeout(() => {
    player.dimension.spawnItem(new ItemStack('budding_amethyst', 1), block.center())
    interactionCooldown.set(player.id, false)
  }, 2)

}

/**
 * Perform's the spawner wrenches break ability
 * @param {Player} player 
 * @param {ItemStack} itemStack 
 * @param {Block} block 
 */

function performSpawnBreak(player, itemStack, block) {

  if (!getConfig(Configs.SpawnerWrench)) { configFailedMessage(player); return }

  const { dimension } = block;
  const center = block.center();

  world.scoreboard.getObjective(SCOREBOARD_ID).addScore(WRENCH_STAT, 1)

  // Handle durability instead of uses
  if (getConfig(Configs.SpawnerWrenchDurability) && player.getGameMode() != 'Creative') {
    const durabilityComponent = itemStack.getComponent('durability')
    const equippable = player.getComponent('equippable')

    if (100 / ((itemStack.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0) + 1) >= Math.random() * 100) {
      try {
        durabilityComponent.damage += 1
        equippable.setEquipment('Mainhand', itemStack)
      } catch (er) {
        equippable.setEquipment('Mainhand')
        player.playSound('random.break', { location: player.location })
      }
    } else {
      equippable.setEquipment('Mainhand', itemStack)
    }
  }

  system.runTimeout(() => {
    // Break the block naturally so it drops as an item with its data intact
    block.dimension.playSound('block.mob_spawner.break', center)
    block.dimension.spawnParticle('minecraft:water_evaporation_bucket_emitter', center)

    // Use the natural block breaking to preserve data
    const drops = block.getItemStack(1, true) // Get block with data
    block.setType('air')

    if (drops) {
      dimension.spawnItem(drops, center)
    } else {
      // Fallback to regular spawner if getItemStack fails
      dimension.spawnItem(new ItemStack('mob_spawner'), center)
    }
  }, 2)

}

const options = ['Zombie', 'Skeleton', 'Cave Spider', 'Spider', 'Silverfish', 'Blaze', 'Magma Cube']

/**
 * Perform's the spawner wrenches break ability
 * @param {Player} player 
 * @param {ItemStack} itemStack 
 * @param {Block} block 
 */
function performSpawnChoose(player, itemStack, block) {
  const config = getConfig(Configs.SpawnerWrench);
  if (!config) {
    configFailedMessage(player);
    return;
  }

  // SFX + stat
  block.dimension.playSound("dig.stone", block.center());
  world.scoreboard.getObjective(SCOREBOARD_ID).addScore(WRENCH_STAT, 1);

  const equippable = player.getComponent("equippable");

  // UI
  const ui = new ActionFormData()
    .title({ translate: "gf_wu:choose_spawner.menu" })
    .body({
      rawtext: [
        { translate: "gf_wu:choose_spawner.destroy", with: ["\n"] },
        { text: "§r\n" }
      ]
    });

  options.forEach(option => {
    ui.button(
      option,
      `textures/gamefam/world_utils/mob_icons/${option.toLowerCase().replace(/\s+/g, "_")}`
    );
  });

  ui.show(player).then(response => {
    if (response.canceled || response.selection === undefined) return;

    if (getConfig(Configs.SpawnerWrenchDurability) && player.getGameMode() != "Creative") {
      const durabilityComponent = itemStack.getComponent("durability");
      const unbreakingLvl =
        itemStack.getComponent("enchantable")?.getEnchantment("unbreaking")?.level || 0;
      const damageChance = 100 / (unbreakingLvl + 1);

      if (damageChance >= Math.random() * 100) {
        try {
          durabilityComponent.damage += 1;
          equippable.setEquipment("Mainhand", itemStack);
        } catch (er) {
          // broke
          equippable.setEquipment("Mainhand");
          player.playSound("random.break", { location: player.location });
        }
      } else {
        equippable.setEquipment("Mainhand", itemStack);
      }
    }

    const pickedLabel = options[response.selection];
    const drop = new ItemStack("mob_spawner");
    drop.setLore([`§r§7${pickedLabel}`]);

    system.runTimeout(() => {
      block.setPermutation(BlockPermutation.resolve("air"));
      block.dimension.spawnParticle("minecraft:water_evaporation_bucket_emitter", block.bottomCenter());
      player.dimension.spawnItem(drop, block.center());
    }, 2);
  });
}


/**
 * Place a spawner after it's been picked up by the spawner wrench
 * @param {Player} player 
 * @param {ItemStack} itemStack 
 * @param {Block} block 
 * @param {Direction} blockFace
 */
function placeSpawner(player, itemStack, block, blockFace) {

  const lore = itemStack.getLore()?.[0]
  if (!lore) return;
  const id = loreToId(lore)

  let offset = { x: 0, y: 0, z: 0 }

  if (blockFace == 'Up') offset.y = 1
  else if (blockFace == 'Down') offset.y = -1
  else if (blockFace == 'East') offset.x = 1
  else if (blockFace == 'West') offset.x = -1
  else if (blockFace == 'South') offset.z = 1
  else if (blockFace == 'North') offset.z = -1

  const location = { x: block.x + offset.x, y: block.y + offset.y, z: block.z + offset.z }

  player.runCommand(`structure load "gf_wu/${id}" ${location.x} ${location.y} ${location.z}`)
  player.dimension.playSound('block.mob_spawner.break', block)
  decrementHeldItem(itemStack, player.getComponent('equippable'))
}

function generateId() {
  return Math.floor(10 ** 15 + Math.random() * 9 * 10 * 15).toString()
}

export { performSpawnBreak, performEndFrameBreak, placeSpawner, performAmethystBreak, performSpawnChoose }