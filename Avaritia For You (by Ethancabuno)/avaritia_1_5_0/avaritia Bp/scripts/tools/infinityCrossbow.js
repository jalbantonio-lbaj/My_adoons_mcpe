import {
  EntityDamageCause,
  EntityEquippableComponent,
  EntityProjectileComponent,
  EquipmentSlot,
  ItemDurabilityComponent,
  ItemEnchantableComponent,
  ItemStack,
  system,
  world,
} from "@minecraft/server";
import { fireEnergyBeams, radiusForHold, lengthForRadius, BEAM_MIN_RADIUS, BEAM_MAX_RADIUS, UNBREAKABLE, finishOff } from "./infinityBeams.js";
import { beamSegment, hitFx } from "./infinityFx.js";
import { isFlaggedAgainst, isPet } from "./dangerFlags.js";

/**
 * Infinity Crossbow (avaritia:infinity_crossbow / avaritia:infinity_crossbow_loaded)
 *
 * Ported to JavaScript from Alien-Edds' Crossbow template (component "ae_cb:crossbow"),
 * changed the namespace to "avaritia:infinity_crossbow" and adjusted for Infinity gear:
 *  - NO arrow needed (removed projectile_item) => no "unusable" item.
 *  - Minimum charge 0.5 seconds (holding longer => bigger Devour: radius +1 block per second held), fires a 3-arrow burst (Multishot adds 2 more arrows per level).
 *  - Devour SKILL: charged while Sneaking (or fired while Sneaking) = a huge void sphere flying straight from the muzzle, devouring blocks into a tunnel
 *    (see infinityBeams.js). On cooldown nothing fires.
 *  - No durability.
 *  - The arrow (avaritia:infinity_crossbow_arrow) deals 60 damage and disappears after sticking in the ground.
 *
 * Parameters in the item (components -> avaritia:infinity_crossbow):
 *   default, loaded, projectile, power, projectile_amount, projectile_rotation, multishot,
 *   shoot_sound, loaded_sound, loading_sound, loading_middle_sound, loaded_animation.
 */

const COMPONENT_ID = "avaritia:infinity_crossbow";
const ARROW_ID = "avaritia:infinity_crossbow_arrow";
const ARROW_LINGER_TICKS = 20; // arrow sticks into a block then disappears after 1 second


const RADIUS_PROP = "avaritia:beam_radius"; // Devour radius stored on the loaded crossbow itself
const DEVOUR_PROP = "avaritia:beam_devour"; // crossbow CHARGED with Devour (charged while crouching/Sneak): the next shot is Devour even after standing up
// Devour can ONLY be charged while crouching (Sneak) the whole time the charge button is held. Charging while standing finishes by itself after CHARGE_MIN_TICKS (no long hold needed) and the crossbow fires 3 normal arrows.
const chargeStand = {}; // playerId -> number of times the player was seen NOT crouching while holding the charge button (sampled every 4 ticks)
const STAND_TOLERANCE = 1; // allows this many missed samples (standing up right as the button is released) and still counts as charged while crouching
const CHARGE_MIN_TICKS = 10; // must hold at least 0.5 seconds to finish loading
const chargeStart = {}; // playerId -> tick when the charge button started being held
const MAX_HOLD_TICKS = (BEAM_MAX_RADIUS - BEAM_MIN_RADIUS) * 20;

const loadedPlayers = {}; // just finished loading: prevents an accidental immediate shot
const animPlayers = {}; // animation the player is currently running (crossbow aiming pose)

// ----- Utilities -----
function playSound(dimension, location, sound) {
  if (!sound) return;
  if (typeof sound === "string") dimension.playSound(sound, location);
  else dimension.playSound(sound.id, location, { volume: sound.volume, pitch: sound.pitch });
}

/** Switch to another item but keep enchants, name, lore, (durability if any). */
function convertItem(from, to) {
  const next = new ItemStack(to, from.amount);
  const fromDur = from.getComponent(ItemDurabilityComponent.componentId);
  const nextDur = next.getComponent(ItemDurabilityComponent.componentId);
  if (fromDur && nextDur) nextDur.damage = fromDur.damage;
  const enchants = from.getComponent(ItemEnchantableComponent.componentId)?.getEnchantments();
  if (enchants && enchants.length) {
    next.getComponent(ItemEnchantableComponent.componentId)?.addEnchantments(enchants);
  }
  if (from.nameTag) next.nameTag = from.nameTag;
  const lore = from.getLore();
  if (lore && lore.length) next.setLore(lore);
  return next;
}

/** Loading finished: switch to the loaded variant and record the Devour radius based on how long it was held. */
function loadCrossbow(source, mainhand, item, params, heldTicks) {
  const radius = radiusForHold(heldTicks);
  const stood = chargeStand[source.id];
  const devour = stood !== undefined && stood <= STAND_TOLERANCE; // only charge Devour if crouching the whole time while loading
  delete chargeStand[source.id];
  const loaded = convertItem(item, params.loaded);
  try {
    loaded.setDynamicProperty(RADIUS_PROP, radius);
    if (devour) loaded.setDynamicProperty(DEVOUR_PROP, true);
  } catch {
    // could not write: use the default radius when firing
  }
  mainhand.setItem(loaded);
  playSound(source.dimension, source.location, params.loaded_sound);
  try {
    source.onScreenDisplay.setActionBar(devour ? `§bDevour charged: radius §f${radius}§b blocks, length §f${lengthForRadius(radius)}§b blocks §7(you can fire while standing)` : `§7Loaded: fires 3 arrows §8(crouch/Sneak while loading to charge Devour)`);
  } catch {
    // ignore
  }
  const id = source.id;
  loadedPlayers[id] = true;
  system.runTimeout(() => {
    delete loadedPlayers[id];
  }, 7);
  syncAnimation(source);
}

function getMainhand(player) {
  return player.getComponent(EntityEquippableComponent.componentId)?.getEquipmentSlot(EquipmentSlot.Mainhand);
}

function stopPlayerAnimation(player) {
  const name = animPlayers[player.id];
  if (!name) return;
  delete animPlayers[player.id];
  try {
    player.playAnimation(name, { blendOutTime: 0, stopExpression: "true" });
  } catch {
    // player just left
  }
}

function startPlayerAnimation(player, name) {
  // The crossbow aiming pose is handled by the pack's animation (Actions & Stuff); no extra player animation is played to avoid layering on top of it.
}

// ----- Piercing bullets: fly extremely fast, drill holes through blocks, kill every creature on the path until they run out of kinetic energy -----
const PIERCE_ENERGY = 300; // initial kinetic energy of EACH bullet
const PIERCE_SPEED = 6; // blocks per tick (6 blocks/tick = 120 blocks/second)
const PIERCE_MAX_RANGE = 250; // flies at most this many blocks even if it still has kinetic energy
const PIERCE_START = 1.5; // starts this many blocks from the shooter's head
const PIERCE_AIR_COST = 0.3; // kinetic energy lost per block traveled (including through air)
const PIERCE_BLOCK_COST = 1; // kinetic energy lost per block drilled
const PIERCE_HARD_COST = 5; // hard blocks (obsidian...) cost more
const PIERCE_ENTITY_COST = 5; // kinetic energy lost per creature killed
const PIERCE_ENTITY_RADIUS = 1.5; // creatures within this distance of the flight path are hit
const PIERCE_DAMAGE = 1e9;
const PIERCE_KILL_PLAYERS = true; // false: bullets do not kill other players
const PIERCE_HARD_BLOCKS = new Set(["minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:respawn_anchor", "minecraft:ancient_debris", "minecraft:netherite_block"]);
// Drilled hole in a 3x3x3 cross shape (center + 6 adjacent cells) around the flight path.
const PIERCE_CELLS = [
  [0, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const PIERCE_EXCLUDED_TYPES = [
  "minecraft:item",
  "minecraft:xp_orb",
  "minecraft:armor_stand",
  "minecraft:lightning_bolt",
  "minecraft:arrow",
  "minecraft:thrown_trident",
  "avaritia:infinity_trident_spirit",
  "avaritia:infinity_trident_thrown",
  "avaritia:infinity_trident_giant",
  ARROW_ID,
];

function pierceBolt(owner, origin, dir) {
  const dim = owner.dimension;
  const hit = new Set();
  let energy = PIERCE_ENERGY;
  let d = PIERCE_START;
  const pointAt = (t) => ({ x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t });

  const end = (at) => {
    system.clearRun(handle);
    try {
      hitFx(dim, at);
    } catch {
      // ignore
    }
  };

  const handle = system.runInterval(() => {
    if (!owner.isValid) {
      system.clearRun(handle);
      return;
    }
    const from = d;
    let stopped = false;
    for (let i = 0; i < PIERCE_SPEED; i++) {
      d += 1;
      const p = pointAt(d);
      const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);

      // 1) Drill blocks around this point
      let centerBlocked = false;
      for (let c = 0; c < PIERCE_CELLS.length; c++) {
        const cell = PIERCE_CELLS[c];
        let block;
        try {
          block = dim.getBlock({ x: bx + cell[0], y: by + cell[1], z: bz + cell[2] });
        } catch {
          block = undefined;
        }
        if (!block) {
          if (c === 0) {
            stopped = true; // chunk not loaded / outside the world: the bullet stops
            break;
          }
          continue;
        }
        if (block.isAir || block.isLiquid) continue;
        if (UNBREAKABLE.has(block.typeId)) {
          if (c === 0) centerBlocked = true;
          continue;
        }
        try {
          block.setType("minecraft:air");
          energy -= PIERCE_HARD_BLOCKS.has(block.typeId) ? PIERCE_HARD_COST : PIERCE_BLOCK_COST;
        } catch {
          // block cannot be drilled
        }
      }
      if (stopped || centerBlocked) {
        stopped = true;
        break;
      }

      // 2) Kill creatures along the path
      try {
        for (const e of dim.getEntities({ location: p, maxDistance: PIERCE_ENTITY_RADIUS, excludeTypes: PIERCE_EXCLUDED_TYPES })) {
          if (hit.has(e.id) || e.id === owner.id) continue;
          if (!PIERCE_KILL_PLAYERS && e.typeId === "minecraft:player") continue;
          if (isPet(e) && !isFlaggedAgainst(e, owner.id)) continue; // pets: do not shoot, unless they carry a danger flag
          hit.add(e.id);
          try {
            e.applyDamage(PIERCE_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: owner });
          } catch {
            // target takes no damage
          }
          finishOff(e);
          system.runTimeout(() => finishOff(e), 2);
          energy -= PIERCE_ENTITY_COST;
        }
      } catch {
        // chunk not loaded
      }

      energy -= PIERCE_AIR_COST;
      if (energy <= 0 || d >= PIERCE_MAX_RANGE) {
        stopped = true;
        break;
      }
    }

    // Light trail for the segment just traveled this tick
    try {
      const mid = pointAt((from + d) / 2);
      beamSegment(dim, mid, dir, 0.35, (d - from) / 2 + 0.5);
    } catch {
      // ignore
    }
    if (stopped) end(pointAt(d));
  }, 1);
}

/** Fires a burst of piercing bullets in the look direction (number of bullets and spread like the old arrows). */
function shoot(source, item, params) {
  const loc = source.getHeadLocation();
  const viewDir = source.getViewDirection();
  const multishotLevel = item.getComponent(ItemEnchantableComponent.componentId)?.getEnchantment("multishot")?.level ?? 0;
  const amount = (params.projectile_amount ?? 1) + multishotLevel * (params.multishot ?? 0);
  const spread = params.projectile_rotation ?? 10;

  for (let i = 0; i < amount; i++) {
    const angle = -((amount - 1) / 2) * spread + spread * i;
    const radians = angle * (Math.PI / 180);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const direction = {
      x: viewDir.x * cos + viewDir.z * sin,
      y: viewDir.y,
      z: -viewDir.x * sin + viewDir.z * cos,
    };
    const l = Math.hypot(direction.x, direction.y, direction.z) || 1;
    pierceBolt(source, loc, { x: direction.x / l, y: direction.y / l, z: direction.z / l });
  }
  playSound(source.dimension, source.location, params.shoot_sound);
}

// ----- Component item -----
system.beforeEvents.startup.subscribe((initEvent) => {
  initEvent.itemComponentRegistry.registerCustomComponent(COMPONENT_ID, {
    // Held long enough => loading finished: switch to the "loaded" variant.
    onCompleteUse(event, arg) {
      try {
        const source = event.source;
        const mainhand = getMainhand(source);
        const item = mainhand?.getItem();
        if (!mainhand || !item || item.typeId !== event.itemStack.typeId) return;
        const params = arg.params;
        if (item.typeId === params.loaded) return;

        // Held until the maximum time => maximum radius.
        const start = chargeStart[source.id];
        delete chargeStart[source.id];
        loadCrossbow(source, mainhand, item, params, start === undefined ? MAX_HOLD_TICKS : Math.max(MAX_HOLD_TICKS, system.currentTick - start));
      } catch (err) {
        console.warn(`avaritia:infinity_crossbow onCompleteUse error: ${err}`);
      }
    },

    // On use: if already loaded then fire, otherwise play the loading sound.
    onUse(event, arg) {
      try {
        const source = event.source;
        const mainhand = getMainhand(source);
        const item = mainhand?.getItem();
        if (!mainhand || !item || item.typeId !== event.itemStack?.typeId) return;
        const params = arg.params;

        if (item.typeId === params.loaded) {
          if (loadedPlayers[source.id]) return;
          // Crossbow CHARGED with Devour while crouching (DEVOUR_PROP): the next shot is always Devour, whether crouching or standing when firing. On cooldown
          // nothing fires (the crossbow keeps its loaded state). After firing it goes back to 3 arrows as usual.
          // Crossbow loaded while STANDING (no DEVOUR_PROP): always fires 3 arrows, even if crouching when firing.
          if (item.getDynamicProperty(DEVOUR_PROP) === true) {
            const stored = item.getDynamicProperty(RADIUS_PROP);
            const radius = typeof stored === "number" ? stored : undefined; // old crossbow with no data -> default radius
            if (fireEnergyBeams(source, radius)) {
              mainhand.setItem(convertItem(item, params.default));
              stopPlayerAnimation(source);
            }
            return;
          }
          shoot(source, item, params);
          mainhand.setItem(convertItem(item, params.default));
          stopPlayerAnimation(source);
        } else {
          chargeStart[source.id] = system.currentTick;
          chargeStand[source.id] = source.isSneaking ? 0 : 1;
          playSound(source.dimension, source.location, params.loading_sound);
          system.runTimeout(() => {
            playSound(source.dimension, source.location, params.loading_middle_sound);
          }, 5);
        }
      } catch (err) {
        console.warn(`avaritia:infinity_crossbow onUse error: ${err}`);
      }
    },
  });
});

// ----- Player crossbow aiming pose -----
function syncAnimation(player) {
  try {
    const item = getMainhand(player)?.getItem();
    const params = item?.getComponent(COMPONENT_ID)?.customComponentParameters?.params;
    if (params && item.typeId === params.loaded && params.loaded_animation) {
      startPlayerAnimation(player, params.loaded_animation);
    } else {
      stopPlayerAnimation(player);
    }
  } catch {
    // player just left
  }
}

// Change hotbar slot / take the crossbow out of the hand => update the pose.
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((data) => {
  const player = data.player;
  system.run(() => syncAnimation(player));
});

// Joining the world / respawning: if a loaded crossbow is in hand, raise it again.
world.afterEvents.playerSpawn.subscribe((data) => {
  const player = data.player;
  delete animPlayers[player.id];
  system.runTimeout(() => syncAnimation(player), 10);
});

world.afterEvents.itemReleaseUse.subscribe((data) => {
  const params = data.itemStack?.getComponent(COMPONENT_ID)?.customComponentParameters?.params;
  if (!params) return;
  const player = data.source;
  if (data.itemStack.typeId === params.loaded) {
    delete loadedPlayers[player.id];
    return;
  }
  // Releasing the button while loading: if held for at least CHARGE_MIN_TICKS loading finishes, and the longer it is held the bigger the Devour radius.
  const start = chargeStart[player.id];
  delete chargeStart[player.id];
  if (start === undefined) {
    delete chargeStand[player.id];
    return;
  }
  const held = system.currentTick - start;
  if (held < CHARGE_MIN_TICKS) {
    delete chargeStand[player.id];
    return;
  }
  try {
    const mainhand = getMainhand(player);
    const item = mainhand?.getItem();
    if (!mainhand || !item || item.typeId !== data.itemStack.typeId) return;
    loadCrossbow(player, mainhand, item, params, held);
  } catch (err) {
    console.warn(`avaritia:infinity_crossbow release error: ${err}`);
  }
});

// While holding the charge button: shows the current Devour radius (grows +1 block per second held).
system.runInterval(() => {
  for (const id of Object.keys(chargeStart)) {
    const player = world.getEntity(id);
    let params;
    let item;
    try {
      item = player && player.isValid ? getMainhand(player)?.getItem() : undefined;
      params = item?.getComponent(COMPONENT_ID)?.customComponentParameters?.params;
      if (!params || item.typeId === params.loaded) {
        delete chargeStart[id];
        continue;
      }
    } catch {
      delete chargeStart[id];
      continue;
    }
    const held = system.currentTick - chargeStart[id];
    // STANDING (not crouching while loading): there is no Devour to charge, so there is no need to keep holding.
    // As soon as the minimum loading time has passed the crossbow finishes loading by itself with 3 arrows.
    if ((chargeStand[id] ?? 0) > STAND_TOLERANCE && held >= CHARGE_MIN_TICKS) {
      try {
        const mh = getMainhand(player);
        const cur = mh?.getItem();
        if (mh && cur && cur.typeId === item.typeId) {
          delete chargeStart[id];
          loadCrossbow(player, mh, cur, params, held);
          continue;
        }
      } catch (err) {
        console.warn(`avaritia:infinity_crossbow auto-load error: ${err}`);
      }
    }
    const radius = radiusForHold(held);
    try {
      if (!player.isSneaking) chargeStand[id] = (chargeStand[id] ?? 0) + 1;
      if ((chargeStand[id] ?? 0) <= STAND_TOLERANCE && player.isSneaking) {
        player.onScreenDisplay.setActionBar(`§bCharging Devour: radius §f${radius}§b blocks, length §f${lengthForRadius(radius)}§b blocks §7(keep holding: +1 radius / second, max ${BEAM_MAX_RADIUS})`);
      } else {
        player.onScreenDisplay.setActionBar(`§7Loading 3 arrows §8(crouch/Sneak the whole time while loading to charge Devour)`);
      }
    } catch {
      // ignore
    }
  }
}, 4);

world.afterEvents.playerLeave.subscribe((data) => {
  delete loadedPlayers[data.playerId];
  delete animPlayers[data.playerId];
  delete chargeStart[data.playerId];
  delete chargeStand[data.playerId];
});

// ----- Arrows: disappear when stuck in the ground (no item drop) -----
world.afterEvents.projectileHitBlock.subscribe((data) => {
  const arrow = data.projectile;
  if (!arrow?.isValid || arrow.typeId !== ARROW_ID) return;
  system.runTimeout(() => {
    if (arrow.isValid) arrow.remove();
  }, ARROW_LINGER_TICKS);
});
