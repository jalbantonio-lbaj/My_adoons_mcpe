import { Dimension, EntityEquippableComponent, EquipmentSlot, ItemStack, Player, system, world } from "@minecraft/server";
import { Configs, getConfig } from "./config";
import { configFailedMessage, failed, success } from "./messenger";
import { loreMap } from "../main"

/**
 * Add's the item to the inventory if there is an empty slot, else spawns it at the player's location
 * @param {Player} player 
 * @param {ItemStack} itemStack 
 */
export function safeGiveItem(player, itemStack) {
    const inventory = player.getComponent('inventory').container
    if (inventory.emptySlotsCount > 0) inventory.addItem(itemStack)
    else player.dimension.spawnItem(itemStack, player.location);
}

/**
 * Displays the chunk border particles for chunks in the given range
 * @param {Dimension} player 
 * @param {import("@minecraft/server").Vector3} location
 * @param {number} radius
 */
export function highlightChunks(dimension, location, radius, particle) {
    location = { x: Math.floor(location.x / 16) * 16, y: 128, z: Math.floor(location.z / 16) * 16 };
    for (let xOffset = -radius; xOffset <= radius; xOffset++) {
        for (let zOffset = -radius; zOffset <= radius; zOffset++) {
            dimension.spawnParticle(particle, {
                x: location.x + xOffset * 16 + 8,
                y: location.y,
                z: location.z + zOffset * 16 + 8
            });
        }
    }
}

/**
 * Add a persistent effect for a player using dynamic properties
 * @param {Player} player 
 * @param {string} effectType 
 */
export function addPersistentEffect(player, effectType) {
    // Only add persistent effects if NeedItemInInventory is disabled
    if (getConfig(Configs.NeedItemInInventory)) {
        return;
    }
    
    const currentEffects = getPersistentEffects(player);
    currentEffects.add(effectType);
    player.setDynamicProperty('gf_wu:persistent_effects', JSON.stringify(Array.from(currentEffects)));
}

/**
 * Remove a persistent effect for a player using dynamic properties
 * @param {Player} player 
 * @param {string} effectType 
 */
export function removePersistentEffect(player, effectType) {
    const currentEffects = getPersistentEffects(player);
    currentEffects.delete(effectType);
    
    if (currentEffects.size === 0) {
        player.setDynamicProperty('gf_wu:persistent_effects', undefined);
    } else {
        player.setDynamicProperty('gf_wu:persistent_effects', JSON.stringify(Array.from(currentEffects)));
    }
}

/**
 * Check if a player has a persistent effect using dynamic properties
 * @param {Player} player 
 * @param {string} effectType 
 * @returns {boolean}
 */
export function hasPersistentEffect(player, effectType) {
    const currentEffects = getPersistentEffects(player);
    return currentEffects.has(effectType);
}

/**
 * Get all persistent effects for a player
 * @param {Player} player 
 * @returns {Set<string>}
 */
function getPersistentEffects(player) {
    const effectsData = player.getDynamicProperty('gf_wu:persistent_effects');
    if (effectsData) {
        try {
            return new Set(JSON.parse(effectsData));
        } catch (error) {
            console.warn('Failed to parse persistent effects for player:', error);
            return new Set();
        }
    }
    return new Set();
}

function flipAllTriggerableStacks(source, itemId, enable, lore) {
  const inv = source.getComponent('inventory')?.container;
  if (!inv) return;

  const onId = itemId + '_on';
  const targetId = enable ? onId : itemId;
  const targetLore = enable
    ? [lore, '', '§r§7Status: §aEnabled']
    : [lore, '', '§r§7Status: §r§cDisabled'];

  for (let i = 0; i < inv.size; i++) {
    const stack = inv.getItem(i);
    if (!stack) continue;
    if (stack.typeId !== itemId && stack.typeId !== onId) continue;

    const replacement = new ItemStack(targetId, stack.amount);
    replacement.setLore(targetLore);
    inv.setItem(i, replacement);
  }

  const eq = source.getComponent('equippable');
  const inHand = eq?.getEquipment('Mainhand');
  if (inHand && (inHand.typeId === itemId || inHand.typeId === onId)) {
    const newHand = new ItemStack(targetId, inHand.amount);
    newHand.setLore(targetLore);
    eq.setEquipment('Mainhand', newHand);
  }
}

const TRIGGERABLES = {
  "gf_wu:vein_miner":        { config: Configs.VeinMiner,        effectTag: "gf_wu:vein_miner_on",        loreKey: "gf_wu:vein_miner" },
  "gf_wu:treecapitator":     { config: Configs.TreeCapitator,    effectTag: "gf_wu:treecapitator_on",     loreKey: "gf_wu:treecapitator" },
  "gf_wu:miners_essentials": { config: Configs.MinersEssentials, effectTag: "gf_wu:miners_essentials_on", loreKey: "gf_wu:miners_essentials" },
  "gf_wu:chunk_borders":     { config: Configs.ChunkBorders,     effectTag: "gf_wu:chunk_borders_on",     loreKey: "gf_wu:chunk_borders" },
  "gf_wu:bridge_builder":    { config: Configs.BridgeBuilder,    effectTag: "gf_wu:bridge_builder_on",    loreKey: "gf_wu:bridge_builder" },
  "gf_wu:magnet":            { config: Configs.Magnet,           effectTag: "gf_wu:magnet_on",            loreKey: "gf_wu:magnet" },
  "gf_wu:fast_place":        { config: Configs.FastPlace,        effectTag: "gf_wu:fast_place_on",        loreKey: "gf_wu:fast_place" },
};

/**
 * @param {import('@minecraft/server').Player} player
 * @param {string} effectType
 * @param {boolean} on
 */
export function setPlayerTriggerableState(player, effectType, on) {
  player.setDynamicProperty(`gf_wu:state:${effectType}`, !!on);
}

/**
 * Read player's triggerable state. Falls back to tags/effects (NOT inventory).
 * @param {import('@minecraft/server').Player} player
 * @param {string} effectType e.g. "vein_miner"
 * @returns {boolean}
 */
export function getPlayerTriggerableState(player, effectType) {
  const v = player.getDynamicProperty(`gf_wu:state:${effectType}`);
  if (typeof v === 'boolean') return v;

  switch (effectType) {
    case 'miners_essentials': return player.hasTag('minersEssentials');
    case 'fast_place':        return player.getTags().includes('gfwu:fastPlaceEnabled');
    default: return false;
  }
}


export function ensureTriggerableInventorySynced(player) {
  const inv = player.getComponent('inventory')?.container;
  if (!inv) return;

  // Cache desired ON per baseId (per player, per tick)
  const desiredOnByBase = {};

  function getDesiredOn(baseId) {
    if (baseId in desiredOnByBase) return desiredOnByBase[baseId];
    const entry = TRIGGERABLES[baseId];
    if (!entry) return (desiredOnByBase[baseId] = false);

    const configOn   = !!getConfig(entry.config);
    const playerOn   = !!getPlayerTriggerableState(player, baseId.replace('gf_wu:', ''));
    
    // If config is off, force item to be disabled and remove effects
    if (!configOn) {
      // Remove the player effect when config is disabled
      setPlayerTriggerableState(player, baseId.replace('gf_wu:', ''), false);
      return (desiredOnByBase[baseId] = false);
    }
    
    // If config is on, respect player's current state (don't auto-enable)
    return (desiredOnByBase[baseId] = playerOn);
  }

  function normalizeStack(stack, set) {
    if (!stack) return;
    const typeId = stack.typeId;
    const baseId = typeId.endsWith('_on') ? typeId.slice(0, -3) : typeId;
    const entry  = TRIGGERABLES[baseId];
    if (!entry) return;

    const shouldBeOn = getDesiredOn(baseId);
    const isOnNow    = (typeId === `${baseId}_on`);
    if (isOnNow === shouldBeOn) return;

    const lore0   = loreMap[entry?.loreKey]?.[0] || '§r§7Interact to toggle!';
    const nextId  = shouldBeOn ? `${baseId}_on` : baseId;
    const nextLore = shouldBeOn
      ? [lore0, '', '§r§7Status: §aEnabled']
      : [lore0, '', '§r§7Status: §r§cDisabled'];

    const repl = new ItemStack(nextId, stack.amount);
    repl.setLore(nextLore);
    set(repl);
  }

  for (let i = 0; i < inv.size; i++) {
    const s = inv.getItem(i);
    normalizeStack(s, (repl) => inv.setItem(i, repl));
  }

  const eq = player.getComponent('equippable');
  const hand = eq?.getEquipment('Mainhand');
  if (hand) normalizeStack(hand, (repl) => eq.setEquipment('Mainhand', repl));

}

/**
 * 
 * @param {Player} source 
 * @param {ItemStack} itemStack 
 * @param {*} config 
 * @param {*} itemId 
 * @param {*} lore 
 * @param {*} shouldEnable 
 * @returns 
 */
export function handleTriggerableItem(
  source,
  itemStack,
  config,
  itemId,
  lore,
  shouldEnable = itemStack.getLore()[2]?.includes('§c')
) {
  const equippable = source.getComponent('equippable');
  const effectType = itemId.replace('gf_wu:', '');
  const baseId     = itemId;

  if (shouldEnable) {
    if (!getConfig(config)) {
      system.run(() => { configFailedMessage(source); });
      return;
    }

    addPersistentEffect(source, effectType);
    setPlayerTriggerableState(source, effectType, true);

    const lore0 = lore ?? (globalThis.loreMap?.[baseId]?.[0]) ?? '§r§7Interact to toggle!';
    flipAllTriggerableStacks(source, baseId, true, lore0);

    success({ translate: baseId + ".on" }, source);

    if (baseId === 'gf_wu:fast_place') {
      if (!source.getTags().some(tag => tag.startsWith('gfwu:fastplace'))) source.addTag('gfwu:fastplace2v');
      system.runTimeout(() => { source.addTag('gfwu:fastPlaceEnabled'); }, 20);
    }
  } else {
    removePersistentEffect(source, effectType);
    setPlayerTriggerableState(source, effectType, false);

    const lore0 = lore ?? (globalThis.loreMap?.[baseId]?.[0]) ?? '§r§7Interact to toggle!';
    flipAllTriggerableStacks(source, baseId, false, lore0);

    failed({ translate: baseId + ".off" }, source);

    if (baseId === 'gf_wu:miners_essentials') source.removeEffect('haste');
    else if (baseId === 'gf_wu:fast_place')   source.removeTag('gfwu:fastPlaceEnabled');
  }
}


/**
 * Enhanced hasItem function that checks both inventory and persistent effects
 * @param {Player} entity 
 * @param {string} itemId 
 * @returns {ItemStack|boolean}
 */
export function hasItemOrEffect(entity, itemId) {
    if (!getConfig(Configs.NeedItemInInventory)) {
        const effectType = itemId.replace('gf_wu:', '').replace('_on', '');
        if (hasPersistentEffect(entity, effectType)) {
            return true;
        }
    }
    
    const inventoryItem = hasItem(entity, itemId);
    if (inventoryItem) return inventoryItem;

    return undefined;
}

function hasItem(entity, itemId) {
    const inventory = entity.getComponent('inventory').container
    if (inventory.emptySlotsCount == inventory.size) return undefined;
    for (let i = 0; i < inventory.size; i++) {
        const itemStack = inventory.getItem(i);
        if (itemStack && itemStack.typeId.split(':').pop().includes(itemId.split(':').pop())) return itemStack
    }
    return undefined;
}

/**
 * Decrements the item in a given slot
 * @param {ItemStack} itemStack 
 * @param {EntityEquippableComponent} equippable 
 * @param {EquipmentSlot} slot 
 */
export function decrementHeldItem(itemStack, equippable, slot = "Mainhand") {
    try {
        itemStack.amount -= 1;
        equippable.setEquipment(slot, itemStack)
    } catch (error) {
        equippable.setEquipment(slot)
    }
}

/**
 * Converts an entity's ID into a format that can be stored on an item without it being visible to the user
 * @param {string} id 
 * @returns {string}
 */
export function setupIdForLore(id) {
    return id.split('').map(char => char == '-' ? '§v' : '§' + char).join('')
}

/**
 * Converts the hidden entity ID stored as lore back into a usable ID
 * @param {string} id 
 * @returns 
 */
export function loreToId(lore) {
  return lore
    .replace(/§./g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}
