import { world, system, EntityDamageCause, EquipmentSlot } from "@minecraft/server";
import { customEffects } from "./customEffects.js";

/**
 * Infinity Scythe (avaritia:infinity_scythe) - soul-reaping scythe.
 *
 * 1) DAMAGE GROWS WITH EVERY KILL
 *      bonus damage = maxHealth(victim) x (number of slashes needed to kill)^2
 *    - Number of slashes = how many times the scythe hit that mob (at least 1, even if it died from bleeding).
 *    - The total bonus damage is stored RIGHT ON THE ITEM (dynamic property), each scythe has its own power,
 *      not lost when leaving the game. Each hit = item damage (120) + bonus damage.
 *    - NO CAP. The only limit is JavaScript's Number.MAX_VALUE (~1.8e308), only so that
 *      the number does not become Infinity and get misread as 0.
 *    - The item description shows 4 lines: base damage, kill count, total bonus damage, bonus damage from the most recent kill.
 *    - Only counts creatures hit/infected by the scythe. Does not count players and tamed pets.
 *
 * 2) CONTAGIOUS DISEASE (only on mobs, does not spread to players)
 *    - Grievous Wounds: the infected target cannot regain health (every tick forces health to the minimum).
 *    - Bleeding (UNLIMITED level, each hit +1 level, extends the timer):
 *        + Max health > BIG_HEALTH (1000): loses 20% of max health every second.
 *        + Otherwise: level 1 = 50 hearts (100 health) per second, each next level doubles the previous
 *          (level 2 = 200, level 3 = 400, ...) i.e. 100 x 2^(cap-1).
 *    - Spread: EVERY scythe hit IMMEDIATELY spreads to every creature within SPREAD_RADIUS (7 blocks) around the target,
 *      and every SPREAD_INTERVAL ticks an infected mob spreads again. The spread level drops by 1 (min 1) and the generation +1;
 *      after MAX_GENERATION generations spreading stops. Creatures killed by spreading also give bonus damage as normal.
 *
 * 3) DEATH EFFECT: scythe slash mark + souls rising + dust storm (particle scythe:*).
 *    The corpse disappears after the effect plays if REMOVE_CORPSE = true (NOT TESTED in game).
 */

const SCYTHE_ID = "avaritia:infinity_scythe";
const BONUS_KEY = "avaritia:scythe_bonus";
const KILLS_KEY = "avaritia:scythe_kills";
const LAST_GAIN_KEY = "avaritia:scythe_last_gain";
const BASE_DAMAGE = 120; // must match "minecraft:damage" in infinity_scythe.json

// ----- Disease -----
const INFECTION_TICKS = 200; // 10 seconds, extended every time it is slashed
const BLEED_INTERVAL = 20; // 1 second
const BLEED_BASE_HP = 100; // level 1 = 50 hearts = 100 health per second, each next level doubles
const BIG_HEALTH = 1000; // max health above this -> lose by % instead of by level
const BLEED_PCT_BIG = 0.2; // 20% of max health per second
const SPREAD_INTERVAL = 40; // 2 seconds
const SPREAD_RADIUS = 7;
const MAX_GENERATION = 4;
const MAX_INFECTED = 200; // limit on the total number of infected mobs at once to avoid lag

// ----- Khac -----
const HIT_TRACK_TTL = 2400; // 2 minutes: clear the kill counter if no more hits
const REMOVE_CORPSE = true;

const REMOVE_CORPSE_DELAY = 6; // ticks, after the slash mark has appeared

const NEVER_TARGET = new Set(["minecraft:armor_stand", "minecraft:item", "minecraft:xp_orb"]);

// ----- Effects on the HUD of the INFECTED PLAYER -----
// true: OTHER players (not the scythe holder) can also get infected. Only the hit player sees the effect on the HUD;
// the scythe holder sees nothing, and mobs have no HUD so nothing is shown (they still bleed / are blocked from healing as normal).
const INFECT_PLAYERS = true;
// The effect is shown via the Custom Effects system (tools/customEffects.js + RP ui/hud_screen.json): same list / same corner /
// stacks automatically with vanilla effects; only shows the icon, tap it to see the name / level / duration.
//   scythe_bleed  "Bleeding"         level = stack count
//   scythe_noheal "Grievous Wounds"  (cannot regain health)
const HUD_INTERVAL = 10; // compare state 2 times/second (effects count down on their own, only update when level/duration changes)
customEffects.register({ id: "scythe_bleed", name: "Bleeding", texture: "textures/avaritia/ui/effect_bleed" });
customEffects.register({ id: "scythe_noheal", name: "Grievous Wounds", texture: "textures/avaritia/ui/effect_noheal" });
const SCYTHE_EFFECT_IDS = ["scythe_bleed", "scythe_noheal"];

/** targetId -> { hits, tick, maxHealth } */
const hitCounts = new Map();
/** targetId -> { entity, ownerId, stacks, generation, expire, lastHealth, maxHealth, nextBleed, nextSpread, loc, dim } */
const infected = new Map();

function heldScythe(player) {
  const equip = player.getComponent("minecraft:equippable");
  if (!equip) return undefined;
  const item = equip.getEquipment(EquipmentSlot.Mainhand);
  if (!item || item.typeId !== SCYTHE_ID) return undefined;
  return { item, equip };
}

function isReapable(entity) {
  if (!entity?.isValid || NEVER_TARGET.has(entity.typeId)) return false;
  if (entity.typeId === "minecraft:player" && !INFECT_PLAYERS) return false;
  if (!entity.getComponent("minecraft:health")) return false;
  if (entity.getComponent("minecraft:is_tamed")) return false;
  return true;
}

function readNumber(item, key) {
  const v = item.getDynamicProperty(key);
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function formatNumber(n) {
  if (n >= 1e9) return n.toExponential(2).replace("e+", "e");
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function writeStats(item, bonus, kills, lastGain) {
  item.setDynamicProperty(BONUS_KEY, bonus);
  item.setDynamicProperty(KILLS_KEY, kills);
  item.setDynamicProperty(LAST_GAIN_KEY, lastGain);
  item.setLore([
    `§7Base Damage: §f${BASE_DAMAGE}`,
    `§7Souls Reaped: §f${formatNumber(kills)}`,
    `§7Soul Bonus: §c+${formatNumber(bonus)} §7damage`,
    `§7Last Reap: §a+${formatNumber(lastGain)} §7damage`,
  ]);
}

// ===================== Infection =====================

function infect(target, ownerId, addStacks, generation) {
  const id = target.id;
  const health = target.getComponent("minecraft:health");
  let state = infected.get(id);
  if (!state) {
    if (infected.size >= MAX_INFECTED) return;
    const now = system.currentTick;
    state = {
      entity: target,
      ownerId,
      stacks: 0,
      generation,
      expire: now,
      lastHealth: health.currentValue,
      maxHealth: health.effectiveMax,
      nextBleed: now + BLEED_INTERVAL,
      nextSpread: now + SPREAD_INTERVAL,
      loc: target.location,
      dim: target.dimension,
    };
    infected.set(id, state);
  }
  state.stacks += addStacks; // unlimited bleeding level
  state.generation = Math.min(state.generation, generation);
  state.expire = system.currentTick + INFECTION_TICKS;
}

function bleedDamage(level, maxHealth) {
  if (maxHealth > BIG_HEALTH) return maxHealth * BLEED_PCT_BIG;
  return Math.min(Number.MAX_VALUE, BLEED_BASE_HP * 2 ** (level - 1));
}

/** Spreads the disease to every creature within SPREAD_RADIUS around source (already infected ones just get the timer extended). */
function spreadFrom(source, ownerId, level, generation) {
  if (generation >= MAX_GENERATION) return;
  const childLevel = Math.max(1, level - 1);
  for (const near of source.dimension.getEntities({ location: source.location, maxDistance: SPREAD_RADIUS })) {
    if (near.id === source.id || near.id === ownerId || !isReapable(near)) continue;
    const already = infected.get(near.id);
    if (already) {
      already.expire = system.currentTick + INFECTION_TICKS; // already infected: only extend
      continue;
    }
    infect(near, ownerId, childLevel, generation + 1);
    if (infected.has(near.id)) near.dimension.spawnParticle("scythe:spore_dust", near.getHeadLocation());
  }
}

function damageSourceFor(ownerId) {
  const owner = world.getEntity(ownerId);
  if (owner?.isValid) return { cause: EntityDamageCause.magic, damagingEntity: owner };
  return { cause: EntityDamageCause.magic };
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, state] of infected) {
    const entity = state.entity;
    if (!entity.isValid) {
      infected.delete(id);
      continue;
    }
    const health = entity.getComponent("minecraft:health");
    if (!health || now >= state.expire) {
      infected.delete(id);
      continue;
    }

    // Grievous Wounds: blocks healing.
    if (health.currentValue > state.lastHealth) health.setCurrentValue(state.lastHealth);
    else state.lastHealth = health.currentValue;
    state.loc = entity.location;
    state.dim = entity.dimension;

    // Xuat Huyet.
    if (now >= state.nextBleed) {
      state.nextBleed = now + BLEED_INTERVAL;
      const damage = bleedDamage(state.stacks, health.effectiveMax);
      entity.dimension.spawnParticle("scythe:blood_drip", entity.getHeadLocation());
      entity.applyDamage(damage, damageSourceFor(state.ownerId));
      if (entity.isValid) state.lastHealth = health.currentValue;
    }

    // Periodic spreading.
    if (entity.isValid && now >= state.nextSpread) {
      state.nextSpread = now + SPREAD_INTERVAL;
      spreadFrom(entity, state.ownerId, state.stacks, state.generation);
    }
  }
}, 1);

system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, rec] of hitCounts) {
    if (now - rec.tick > HIT_TRACK_TTL && !infected.has(id)) hitCounts.delete(id);
  }
}, 200);

/** playerId -> { stacks, expire } already applied to the HUD (to only update on change). */
const applied = new Map();

function syncStatusHud() {
  const now = system.currentTick;
  const victims = new Map(); // only PLAYERS get infected
  for (const [, st] of infected) {
    if (!st.entity.isValid || st.expire <= now || st.entity.typeId !== "minecraft:player") continue;
    victims.set(st.entity.id, { stacks: st.stacks, expire: st.expire });
  }

  const ids = new Set([...victims.keys(), ...applied.keys()]);
  for (const pid of ids) {
    const player = world.getEntity(pid);
    if (!player?.isValid || player.typeId !== "minecraft:player") {
      applied.delete(pid);
      continue;
    }
    const cur = victims.get(pid);
    const prev = applied.get(pid);
    if (!cur) {
      for (const id of SCYTHE_EFFECT_IDS) customEffects.remove(player, id);
      applied.delete(pid);
      continue;
    }
    if (prev && prev.stacks === cur.stacks && Math.abs(prev.expire - cur.expire) <= 5) continue; // unchanged
    const remaining = Math.max(1, cur.expire - now);
    const options = { amplifier: Math.max(0, Math.min(255, cur.stacks - 1)) };
    for (const id of SCYTHE_EFFECT_IDS) customEffects.add(player, id, remaining, options);
    applied.set(pid, cur);
  }
}
system.runInterval(syncStatusHud, HUD_INTERVAL);

// HUD test (deals no damage): /scriptevent avaritia:scythe_hud_test -> 2 effects for 15 seconds on whoever runs the command.
system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id !== "avaritia:scythe_hud_test") return;
  const player = e.sourceEntity;
  if (!player || player.typeId !== "minecraft:player") return;
  for (const id of SCYTHE_EFFECT_IDS) customEffects.add(player, id, 20 * 15, { amplifier: 2 });
});

// Rejoining the world: remove leftover scythe effects in the player's data (the infected state no longer exists).
world.afterEvents.playerSpawn.subscribe((data) => {
  if (!data.initialSpawn) return;
  for (const id of ["scythe_bleed", "scythe_noheal", "scythe_target_bleed", "scythe_target_noheal"]) customEffects.remove(data.player, id);
});

world.afterEvents.playerLeave.subscribe((data) => {
  applied.delete(data.playerId);
});

// ===================== Trung don =====================

world.afterEvents.entityHitEntity.subscribe((event) => {
  const player = event.damagingEntity;
  const target = event.hitEntity;
  if (player.typeId !== "minecraft:player" || !isReapable(target)) return;
  const held = heldScythe(player);
  if (!held) return;

  const health = target.getComponent("minecraft:health");
  const rec = hitCounts.get(target.id) ?? { hits: 0, tick: 0, maxHealth: health.effectiveMax };
  rec.hits += 1;
  rec.tick = system.currentTick;
  hitCounts.set(target.id, rec);

  infect(target, player.id, 1, 0);
  const targetState = infected.get(target.id);
  if (targetState) spreadFrom(target, player.id, targetState.stacks, targetState.generation);

  const bonus = readNumber(held.item, BONUS_KEY);
  if (bonus > 0) {
    target.applyDamage(bonus, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
  }
});

// ===================== Death =====================

function playReapEffect(dimension, location) {
  const center = { x: location.x, y: location.y + 1, z: location.z };
  dimension.spawnParticle("scythe:soul_slash", center);
  dimension.spawnParticle("scythe:soul_wisp", center);
  dimension.spawnParticle("scythe:spore_dust", center);
}

world.afterEvents.entityDie.subscribe((event) => {
  const dead = event.deadEntity;
  const id = dead.id;
  const state = infected.get(id);
  const rec = hitCounts.get(id);
  infected.delete(id);
  hitCounts.delete(id);
  if (!state && !rec) return; // unrelated to the scythe

  const location = dead.isValid ? dead.location : state?.loc;
  const dimension = dead.isValid ? dead.dimension : state?.dim;

  // Killer: the player holding the scythe for the final hit, or the disease's owner if it died from bleeding.
  let killer = event.damageSource?.damagingEntity;
  if (killer?.typeId !== "minecraft:player") killer = undefined;
  if (!killer && state) {
    const owner = world.getEntity(state.ownerId);
    if (owner?.isValid && owner.typeId === "minecraft:player") killer = owner;
  }

  if (location && dimension) playReapEffect(dimension, location);
  if (REMOVE_CORPSE && dead.isValid && dead.typeId !== "minecraft:player") {
    system.runTimeout(() => {
      if (dead.isValid) dead.remove();
    }, REMOVE_CORPSE_DELAY);
  }

  if (!killer) return;
  const held = heldScythe(killer);
  if (!held) return;

  const maxHealth = (rec ?? state).maxHealth;
  const hits = Math.max(1, rec?.hits ?? 0);
  const gain = maxHealth * hits * hits;
  const bonus = Math.min(Number.MAX_VALUE, readNumber(held.item, BONUS_KEY) + gain);
  const kills = readNumber(held.item, KILLS_KEY) + 1;
  writeStats(held.item, bonus, kills, gain);
  held.equip.setEquipment(EquipmentSlot.Mainhand, held.item);
});


// ===================== SKILL: SUMMON PLAGUE =====================
// Use (right click) while holding the scythe: summons SKILL_CARRIERS "plague seeds" (particles) that fly out evenly in
// all directions around the user. After flying straight for a distance, each seed automatically chases the nearest UN-
// INFECTED creature (even in the air, 3D flight), infects it on touch, then spreads on to the next uninfected one...
// until there are no targets left, no hops left (CARRIER_MAX_HOPS) or it times out.
const SKILL_COOLDOWN_TICKS = 40; // 2 seconds
const SKILL_CARRIERS = 10;
const CARRIER_SPEED = 0.7; // block/tick
const CARRIER_TURN = 0.35; // turn rate per tick (0..1)
const CARRIER_LAUNCH_TICKS = 8; // fly straight out before starting to chase
const CARRIER_SEEK_RADIUS = 24;
const CARRIER_HIT_RADIUS = 1.4;
const CARRIER_MAX_TICKS = 300; // 15 seconds
const CARRIER_IDLE_TICKS = 60; // disappears if there is no target for too long
const CARRIER_MAX_HOPS = 30;
const CARRIER_PARTICLE = "scythe:soul_wisp";
const CARRIER_INFECT_PARTICLE = "scythe:spore_dust";

/** { dim, pos, vel, ownerId, age, idle, hops, targetId } */
const carriers = [];
const lastSkill = new Map();

function castPlague(player) {
  const p = player.location;
  const origin = { x: p.x, y: p.y + 1.2, z: p.z };
  for (let i = 0; i < SKILL_CARRIERS; i++) {
    const yaw = (i / SKILL_CARRIERS) * Math.PI * 2;
    const dx = Math.cos(yaw);
    const dy = 0.15;
    const dz = Math.sin(yaw);
    const len = Math.hypot(dx, dy, dz);
    carriers.push({
      dim: player.dimension,
      pos: { ...origin },
      vel: { x: (dx / len) * CARRIER_SPEED, y: (dy / len) * CARRIER_SPEED, z: (dz / len) * CARRIER_SPEED },
      ownerId: player.id,
      age: 0,
      idle: 0,
      hops: 0,
      targetId: undefined,
    });
  }
  try {
    player.dimension.playSound("mob.wither.spawn", origin, { volume: 0.6, pitch: 1.6 });
  } catch {
    /* sound is optional */
  }
}

function findPlagueTarget(c) {
  let best;
  let bestDist = Infinity;
  for (const e of c.dim.getEntities({ location: c.pos, maxDistance: CARRIER_SEEK_RADIUS })) {
    if (e.id === c.ownerId || !isReapable(e) || infected.has(e.id)) continue;
    const l = e.location;
    const d = Math.hypot(l.x - c.pos.x, l.y + 0.9 - c.pos.y, l.z - c.pos.z);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

/** Returns false if the plague seed has expired. */
function tickCarrier(c) {
  let target;
  if (c.targetId) {
    try {
      target = world.getEntity(c.targetId);
    } catch {
      target = undefined;
    }
    if (!target?.isValid || infected.has(target.id) || !isReapable(target) || target.dimension.id !== c.dim.id) {
      target = undefined;
      c.targetId = undefined;
    }
  }
  if (!target && c.age >= CARRIER_LAUNCH_TICKS) {
    target = findPlagueTarget(c);
    if (target) c.targetId = target.id;
  }

  if (target) {
    c.idle = 0;
    const l = target.location;
    const tx = l.x;
    const ty = l.y + 0.9;
    const tz = l.z;
    const dx = tx - c.pos.x;
    const dy = ty - c.pos.y;
    const dz = tz - c.pos.z;
    const dist = Math.hypot(dx, dy, dz);

    if (dist <= CARRIER_HIT_RADIUS + CARRIER_SPEED) {
      infect(target, c.ownerId, 1, 0);
      if (!infected.has(target.id)) return false; // no room left for infections (MAX_INFECTED)
      try {
        c.dim.spawnParticle(CARRIER_INFECT_PARTICLE, { x: tx, y: ty, z: tz });
      } catch {
        /* ignore */
      }
      c.pos = { x: tx, y: ty, z: tz };
      c.targetId = undefined;
      c.hops++;
      return c.hops < CARRIER_MAX_HOPS; // hop on to the next uninfected one
    }

    // steer toward the target (chasing even in the air)
    const k = CARRIER_TURN;
    let vx = c.vel.x + ((dx / dist) * CARRIER_SPEED - c.vel.x) * k;
    let vy = c.vel.y + ((dy / dist) * CARRIER_SPEED - c.vel.y) * k;
    let vz = c.vel.z + ((dz / dist) * CARRIER_SPEED - c.vel.z) * k;
    const vl = Math.hypot(vx, vy, vz) || 1;
    c.vel = { x: (vx / vl) * CARRIER_SPEED, y: (vy / vl) * CARRIER_SPEED, z: (vz / vl) * CARRIER_SPEED };
  } else if (c.age >= CARRIER_LAUNCH_TICKS && ++c.idle > CARRIER_IDLE_TICKS) {
    return false;
  }

  c.pos = { x: c.pos.x + c.vel.x, y: c.pos.y + c.vel.y, z: c.pos.z + c.vel.z };
  try {
    c.dim.spawnParticle(CARRIER_PARTICLE, c.pos);
  } catch {
    /* ignore */
  }
  return true;
}

system.runInterval(() => {
  if (carriers.length === 0) return;
  for (let i = carriers.length - 1; i >= 0; i--) {
    const c = carriers[i];
    if (++c.age > CARRIER_MAX_TICKS) {
      carriers.splice(i, 1);
      continue;
    }
    let alive = false;
    try {
      alive = tickCarrier(c);
    } catch (e) {
      console.warn(`avaritia:infinity_scythe carrier error: ${e}`);
    }
    if (!alive) carriers.splice(i, 1);
  }
}, 1);

world.afterEvents.itemUse.subscribe((event) => {
  try {
    const player = event.source;
    if (!player || player.typeId !== "minecraft:player") return;
    if (event.itemStack?.typeId !== SCYTHE_ID) return;
    const now = system.currentTick;
    if (now - (lastSkill.get(player.id) ?? -Infinity) < SKILL_COOLDOWN_TICKS) return;
    lastSkill.set(player.id, now);
    castPlague(player);
  } catch (e) {
    console.warn(`avaritia:infinity_scythe skill error: ${e}`);
  }
});

world.afterEvents.playerLeave.subscribe((event) => {
  lastSkill.delete(event.playerId);
});
