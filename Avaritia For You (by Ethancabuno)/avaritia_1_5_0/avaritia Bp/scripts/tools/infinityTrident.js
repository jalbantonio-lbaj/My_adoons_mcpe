import {
  EnchantmentType,
  EntityDamageCause,
  EntityEquippableComponent,
  EntityInventoryComponent,
  EntityProjectileComponent,
  EquipmentSlot,
  GameMode,
  ItemEnchantableComponent,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { handleTridentTap } from "./infinityTridentSpirits.js";
import { hitFx, stormExplosion } from "./infinityFx.js";
import { isFlaggedAgainst, isPet } from "./dangerFlags.js";

/**
 * Infinity Trident (avaritia:infinity_trident)
 *
 * Ported to JavaScript from Alien-Edds' Custom-Trident template, adjusted for Infinity gear:
 *  - Releasing the mouse (held >= 10 ticks) = throw the trident (entity avaritia:infinity_trident_thrown).
 *  - Always returns to the hand on its own (like Loyalty level 3), no durability.
 *  - A hit calls down lightning (like Channeling, regardless of weather).
 *  - SPECTRAL ARMORY SKILL: QUICK TAP (no holding) = summon 8 spirit tridents behind you / command them to attack;
 *    they also attack mobs on their own and block hits on their own (see infinityTridentSpirits.js).
 *  - Holding SNEAK on release = Riptide: dash in the look direction in EVERY environment (no water/rain needed),
 *    dealing damage to creatures rammed along the dash.
 *  - The item's enchant glint (if any) is preserved when thrown and when received back.
 *
 * Differences from the original: does not use water_checker / weather (no longer depends on water or rain),
 * and fixes an original bug: a trident that falls into the void was only pushed once and did not actually return.
 */

const ITEM_ID = "avaritia:infinity_trident";
const PROJECTILE_ID = "avaritia:infinity_trident_thrown";
const RETURNING_EVENT = "avaritia:trident_returning";

const MIN_CHARGE_TICKS = 10;
const THROW_VELOCITY = 3;
const RETURN_SPEED = 1.5;
const LOYALTY_LEVEL = 3; // return speed multiplier = 1 + level * 0.25
const WAIT_TICKS = 3; // wait after hitting before returning
const PICKUP_RANGE = 2.5;

const RIPTIDE_VELOCITY = 2.04;
const RIPTIDE_LEVEL = 3;
const RIPTIDE_DAMAGE = 250;
const RIPTIDE_DURATION_TICKS = 20;

// GIANT trident: every throw, when the trident touches something (a block or a creature both count), a giant trident from the sky stabs down exactly there,
// dealing GIANT_DAMAGE (100000) damage to every creature within GIANT_RADIUS (not a one-shot, no kill/remove).
const GIANT_ID = "avaritia:infinity_trident_giant";
const GIANT_RADIUS = 24; // kill range (blocks)
const GIANT_HEIGHT = 120; // the giant trident appears this far above the impact point
const GIANT_FALL_SPEED = 8; // blocks per tick while plunging down
const GIANT_LINGER_TICKS = 20; // stays planted for this many ticks then disappears
const GIANT_FX_RADIUS = 40; // size of the explosion effect (particle) on impact, scaled to the giant trident
const GIANT_DAMAGE = 100000; // fixed damage, NOT a one-shot (if it survives it stays alive)

const LIGHTNING_MIN_OWNER_DISTANCE = 4; // no lightning when the owner is standing too close
const LIGHTNING_COOLDOWN_TICKS = 10;

const RIPTIDE_EXCLUDED_TYPES = [
  "minecraft:arrow",
  "minecraft:snowball",
  "minecraft:thrown_trident",
  "minecraft:xp_orb",
  "minecraft:item",
  "minecraft:experience_bottle",
  "minecraft:splash_potion",
  "minecraft:lingering_potion",
  "minecraft:fireworks_rocket",
  "minecraft:armor_stand",
  "minecraft:lightning_bolt",
  "avaritia:infinity_trident_spirit",
  PROJECTILE_ID,
  GIANT_ID,
];

const useStart = {}; // tick when each player started holding the mouse button
const lastLightning = {}; // tick of the most recent lightning strike for each trident

// ----- Item <-> data utilities -----
function serializeItem(item) {
  const data = { id: item.typeId };
  if (item.nameTag) data.name = item.nameTag;
  try {
    const lore = item.getLore();
    if (lore && lore.length) data.lore = lore;
  } catch {
    // ignore
  }
  const ench = item.getComponent(ItemEnchantableComponent.componentId);
  if (ench) {
    const list = ench.getEnchantments().map((e) => ({ id: e.type.id, lvl: e.level }));
    if (list.length) data.enchants = list;
  }
  return data;
}

function deserializeItem(data) {
  const item = new ItemStack(data?.id ?? ITEM_ID, 1);
  if (data?.name) item.nameTag = data.name;
  if (data?.lore) item.setLore(data.lore);
  if (data?.enchants) {
    const ench = item.getComponent(ItemEnchantableComponent.componentId);
    if (ench) {
      for (const e of data.enchants) {
        try {
          ench.addEnchantment({ type: new EnchantmentType(e.id), level: e.lvl });
        } catch {
          // enchant cannot be applied to this item
        }
      }
    }
  }
  return item;
}

function readItemData(entity) {
  const raw = entity.getDynamicProperty("item");
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function getOwner(entity) {
  const id = entity.getDynamicProperty("ownerID");
  if (typeof id !== "string") return undefined;
  try {
    const owner = world.getEntity(id);
    return owner?.isValid ? owner : undefined;
  } catch {
    return undefined;
  }
}

/** Returns the trident to its owner (inventory first, dropped at their feet if full) then removes the entity. */
function pickUp(tridentEntity, owner) {
  const data = readItemData(tridentEntity);
  const dimension = tridentEntity.dimension;
  const loc = tridentEntity.location;
  delete lastLightning[tridentEntity.id];
  if (data && owner instanceof Player) {
    const gm = owner.getGameMode();
    // Creative/Spectator: no item is consumed when throwing so it is not returned (avoids duplication).
    if (gm !== GameMode.Creative && gm !== GameMode.Spectator) {
      const item = deserializeItem(data);
      const container = owner.getComponent(EntityInventoryComponent.componentId)?.container;
      const leftover = container ? container.addItem(item) : item;
      if (leftover) owner.dimension.spawnItem(leftover, owner.location);
    }
  }
  try {
    dimension.playSound("random.pop", loc, { pitch: 1 + Math.random(), volume: 0.5 });
  } catch {
    // ignore
  }
  tridentEntity.remove();
}

function startReturning(projectile, delay = 0) {
  const trigger = () => {
    if (projectile?.isValid) {
      try {
        projectile.triggerEvent(RETURNING_EVENT);
      } catch {
        // already in the returning state
      }
    }
  };
  if (delay > 0) system.runTimeout(trigger, delay);
  else trigger();
}

// ----- Holding the mouse: record the timestamp -----
world.afterEvents.itemStartUse.subscribe((data) => {
  if (data.itemStack?.typeId === ITEM_ID) useStart[data.source.id] = system.currentTick;
});

world.afterEvents.playerLeave.subscribe((data) => {
  delete useStart[data.playerId];
});

// ----- Releasing the mouse: throw or Riptide -----
world.afterEvents.itemReleaseUse.subscribe((data) => {
  const source = data.source;
  if (!(source instanceof Player) || data.itemStack?.typeId !== ITEM_ID) return;

  const startedAt = useStart[source.id];
  delete useStart[source.id];
  if (startedAt !== undefined && system.currentTick - startedAt < MIN_CHARGE_TICKS) {
    handleTridentTap(source); // quick tap = spirit trident skill (Sneak + tap = recall)
    return;
  }

  const mainhand = source.getComponent(EntityEquippableComponent.componentId)?.getEquipmentSlot(EquipmentSlot.Mainhand);
  const item = mainhand?.getItem();
  if (!mainhand || !item || item.typeId !== ITEM_ID) return;

  if (source.isSneaking) {
    riptide(source, item);
    return;
  }
  throwTrident(source, mainhand, item);
});

function throwTrident(source, mainhand, item) {
  const headLoc = source.getHeadLocation();
  let projectile;
  try {
    // Spawn low then teleport up, exactly like the original template.
    projectile = source.dimension.spawnEntity(PROJECTILE_ID, { x: headLoc.x, y: 100, z: headLoc.z });
    projectile.teleport(headLoc);
  } catch {
    return;
  }
  projectile.setDynamicProperty("item", JSON.stringify(serializeItem(item)));
  projectile.setDynamicProperty("ownerID", source.id);
  if (source.getGameMode() !== GameMode.Creative) mainhand.setItem(undefined);

  const comp = projectile.getComponent(EntityProjectileComponent.componentId);
  if (!comp) return;
  comp.owner = source;
  const dir = source.getViewDirection();
  comp.shoot({ x: dir.x * THROW_VELOCITY, y: dir.y * THROW_VELOCITY, z: dir.z * THROW_VELOCITY });
  source.dimension.playSound("item.trident.throw", source.location, { volume: 1, pitch: 1 });
}

// ----- Riptide (every environment) -----
function riptide(source, item) {
  const level = item.getComponent(ItemEnchantableComponent.componentId)?.getEnchantment("riptide")?.level ?? RIPTIDE_LEVEL;
  const power = RIPTIDE_VELOCITY + (RIPTIDE_VELOCITY / 6) * level;
  const dir = source.getViewDirection();
  const flat = Math.hypot(dir.x, dir.z) || 1;
  const horizontal = (Math.abs(dir.x) + Math.abs(dir.z)) * 1.75 * power;
  try {
    source.applyKnockback({ x: (dir.x / flat) * horizontal, z: (dir.z / flat) * horizontal }, dir.y * power);
  } catch {
    return;
  }
  source.dimension.playSound(`item.trident.riptide_${Math.min(level, 3)}`, source.location, { volume: 1 });

  // Ramming a creature within the first ~1 second deals damage then stops.
  let ticks = 0;
  const handle = system.runInterval(() => {
    ticks++;
    if (!source.isValid || ticks > RIPTIDE_DURATION_TICKS) {
      system.clearRun(handle);
      return;
    }
    const targets = source.dimension
      .getEntities({ location: source.location, maxDistance: 2.5, excludeTypes: RIPTIDE_EXCLUDED_TYPES, closest: 5 })
      .filter((e) => e.id !== source.id);
    const target = targets[0];
    if (!target) return;
    hitFx(target.dimension, { x: target.location.x, y: target.location.y + 1, z: target.location.z });
    target.applyDamage(RIPTIDE_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: source });
    system.clearRun(handle);
  });
}

// ----- Giant trident stabs down where the trident touched -----
function giantImpact(dim, loc, owner) {
  try {
    dim.playSound("random.explode", loc, { volume: 4, pitch: 0.7 });
    dim.playSound("item.trident.thunder", loc, { volume: 4, pitch: 0.8 });
  } catch {
    // ignore
  }
  try {
    stormExplosion(dim, { x: loc.x, y: loc.y, z: loc.z }, GIANT_FX_RADIUS);
  } catch {
    // ignore
  }
  let victims = [];
  try {
    victims = dim.getEntities({ location: loc, maxDistance: GIANT_RADIUS, excludeTypes: RIPTIDE_EXCLUDED_TYPES });
  } catch {
    // chunk not loaded
  }
  for (const e of victims) {
    if (!e?.isValid) continue;
    if (owner && e.id === owner.id) continue; // do not kill yourself
    // Pets: NO, unless carrying a danger flag against the thrower.
    if (isPet(e) && !(owner && isFlaggedAgainst(e, owner.id))) continue;
    try {
      const src = owner && owner.isValid ? { cause: EntityDamageCause.entityAttack, damagingEntity: owner } : { cause: EntityDamageCause.entityAttack };
      e.applyDamage(GIANT_DAMAGE, src);
    } catch {
      // target takes no damage
    }
  }
}

function summonGiantTrident(dim, loc, owner) {
  let top = loc.y + GIANT_HEIGHT;
  try {
    top = Math.min(top, dim.heightRange.max - 2);
  } catch {
    // use the default height
  }
  let giant;
  try {
    giant = dim.spawnEntity(GIANT_ID, { x: loc.x, y: top, z: loc.z });
  } catch {
    giant = undefined; // could not spawn (chunk not loaded): still kill, just without the visual
  }
  let y = top;
  const handle = system.runInterval(() => {
    y = Math.max(loc.y, y - GIANT_FALL_SPEED);
    if (giant?.isValid) {
      try {
        giant.teleport({ x: loc.x, y, z: loc.z });
      } catch {
        // ignore
      }
    }
    if (y > loc.y) return;
    system.clearRun(handle);
    giantImpact(dim, loc, owner);
    system.runTimeout(() => {
      if (giant?.isValid) giant.remove();
    }, GIANT_LINGER_TICKS);
  });
}

/** Each throw summons only ONE giant trident (the first touch, block or creature). */
function triggerGiant(projectile, hitLoc) {
  try {
    if (projectile.getDynamicProperty("giant") === true) return;
    projectile.setDynamicProperty("giant", true);
    const loc = hitLoc ?? projectile.location;
    summonGiantTrident(projectile.dimension, { x: loc.x, y: loc.y, z: loc.z }, getOwner(projectile));
  } catch (err) {
    console.warn(`avaritia:infinity_trident giant error: ${err}`);
  }
}

// ----- Hit a block / creature: always returns, lightning strikes -----
world.afterEvents.projectileHitBlock.subscribe((data) => {
  const projectile = data.projectile;
  if (!projectile?.isValid || projectile.typeId !== PROJECTILE_ID) return;
  startReturning(projectile, WAIT_TICKS);
  triggerGiant(projectile, data.location);
});

world.afterEvents.projectileHitEntity.subscribe((data) => {
  const projectile = data.projectile;
  if (!projectile?.isValid || projectile.typeId !== PROJECTILE_ID) return;
  startReturning(projectile, WAIT_TICKS);
  triggerGiant(projectile, data.location);

  const hitEntity = data.getEntityHit()?.entity;
  if (!hitEntity?.isValid) return;

  const now = system.currentTick;
  if (now - (lastLightning[projectile.id] ?? -999) < LIGHTNING_COOLDOWN_TICKS) return;
  const owner = getOwner(projectile);
  if (owner) {
    const a = owner.location;
    const b = hitEntity.location;
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < LIGHTNING_MIN_OWNER_DISTANCE) return;
  }
  lastLightning[projectile.id] = now;
  try {
    const loc = hitEntity.location;
    const bolt = data.dimension.spawnEntity("minecraft:lightning_bolt", { x: loc.x, y: 100, z: loc.z });
    bolt.teleport(loc);
  } catch {
    // invalid position
  }
});

// ----- Entity calling scriptevent: return / check every second -----
system.afterEvents.scriptEventReceive.subscribe((data) => {
  if (data.id !== "avaritia:trident_return" && data.id !== "avaritia:trident_tick") return;
  const trident = data.sourceEntity;
  if (!trident?.isValid || trident.typeId !== PROJECTILE_ID) return;

  const owner = getOwner(trident);

  if (data.id === "avaritia:trident_tick") {
    // Falling into the void starts the return.
    if (trident.location.y < -64) startReturning(trident);
    // The owner is no longer in the world (left the game): drop the item instead of losing it.
    if (!owner && trident.getDynamicProperty("returning")) {
      const itemData = readItemData(trident);
      if (itemData) trident.dimension.spawnItem(deserializeItem(itemData), trident.location);
      trident.remove();
    }
    return;
  }

  // trident_return
  if (!owner) return;
  if (owner.dimension.id !== trident.dimension.id) {
    pickUp(trident, owner);
    return;
  }

  const loc = trident.location;
  const ownerLoc = owner.location;
  if (Math.hypot(loc.x - ownerLoc.x, loc.y - (ownerLoc.y + 1), loc.z - ownerLoc.z) <= PICKUP_RANGE) {
    pickUp(trident, owner);
    return;
  }

  if (!trident.getDynamicProperty("returning")) {
    trident.setDynamicProperty("returning", true);
    if (owner instanceof Player) owner.playSound("item.trident.return", { volume: 1, pitch: 1 });
  }
  const speed = RETURN_SPEED * (1 + LOYALTY_LEVEL * 0.25);
  trident.teleport(loc, { facingLocation: { x: ownerLoc.x, y: ownerLoc.y + 1, z: ownerLoc.z } });
  const dir = trident.getViewDirection();
  trident.teleport({
    x: loc.x + dir.x + dir.x * speed,
    y: loc.y + dir.y + dir.y * speed,
    z: loc.z + dir.z + dir.z * speed,
  });
});
