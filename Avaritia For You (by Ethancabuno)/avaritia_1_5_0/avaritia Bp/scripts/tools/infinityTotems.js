import { world, system, EquipmentSlot, EntityDamageCause } from "@minecraft/server";

/**
 * ===== INFINITY TOTEMS (12 elemental totems, upgraded) =====
 * Every totem works while held in the MAIN HAND or OFF-HAND and is never consumed.
 * Use (right click) swaps the totem into the off-hand, except the Ender totem (right click = blink).
 * Passive effects are applied for 10 minutes (no icon flicker) and are removed as soon as the totem is no longer held.
 * (The resurrection totem "Totem of Eternal Rebirth" lives in infinityTotemEternal.js and is unchanged.)
 *
 *  tide          Water Breathing + Conduit + Dolphin's Grace III + swim boost (~1.8x), no drowning
 *  ender         USE: blink 64 blocks, 1s cooldown, no fall damage after the blink
 *  fortune       Haste IV + Luck III; every kill drops 12 XP orbs
 *  berserker     Strength IV + Speed II + Resistance; every kill heals 6 hp + Absorption shield
 *  vitality      Health Boost V (+10 hearts) + Regeneration III + Saturation
 *  gale          Speed IV + Jump Boost V; no fall damage
 *  mercy         24-block aura: Regeneration III + Absorption II, clears bad effects (you + players nearby)
 *  clairvoyance  Night Vision + Luck; hostile mobs within 48 blocks glow (visible through walls)
 *  inferno       Immune to fire and lava; attackers burn 20s; hostiles within 6 blocks catch fire
 *  shadow        Invisibility + Speed II + Night Vision; 30% chance to dodge a hit completely
 *  frost         Resistance II + Fire Resistance; 16-block aura: heavy slowness + weakness; no freezing damage
 *  void          No void/fall damage; clears Wither/Darkness/Blindness; void fall teleports you to safe ground
 */

const PREFIX = "avaritia:infinity_totem_";

// ---- upgraded numbers (all adjustable) ----
const BLINK_RANGE = 64;           // was 30
const BLINK_COOLDOWN_TICKS = 20;  // was 60
const MERCY_RADIUS = 24;          // was 12
const CLAIR_RADIUS = 48;          // was 24
const CLAIR_MAX_MARKS = 64;       // was 24
const FROST_RADIUS = 16;          // was 8
const FORTUNE_ORBS = 12;          // was 4
const VOID_MARGIN = 2;
const VOID_FALL_GRACE_TICKS = 200;
const TIDE_SWIM_PUSH = 0.30;      // was 0.17
const SHADOW_DODGE_CHANCE = 0.3;  // 30% chance to ignore a hit completely
const BERSERKER_HEAL_ON_KILL = 6; // hp restored per kill
const INFERNO_AURA_RADIUS = 6;    // hostiles this close are set on fire
const INFERNO_BURN_SECONDS = 20;  // was 8
const EFFECT_TICKS = 12000;       // passive totem effects last 10 minutes (no icon flicker)
const EFFECT_REFRESH_BELOW = 6000; // re-apply when less than 5 minutes are left
const ALLY_EFFECT_TICKS = 260;    // mercy aura on other players: short, but never below 10s so the icon does not flash
const ALLY_REFRESH_BELOW = 220;
const ACTIVE_KEY = "avaritia:totem_active"; // dynamic property: totems whose effects are currently applied

const FX = {
  mark: "minecraft:villager_happy",
  heart: "minecraft:heart_particle",
  snow: "minecraft:snowball_poof_particle",
  portal: "minecraft:endrod",
  totem: "minecraft:totem_particle",
};

// ---------- helpers ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function say(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    // ignore
  }
}

function eff(player, id, ticks, amp = 0) {
  try {
    player.addEffect(id, ticks, { amplifier: amp, showParticles: false });
  } catch {
    // ignore
  }
}

function particle(dim, id, loc) {
  try {
    dim.spawnParticle(id, loc);
  } catch {
    // ignore
  }
}

/** Set of totem names (e.g. "tide") the player holds in main hand / off-hand. */
function heldTotems(player) {
  const out = new Set();
  try {
    const eq = player.getComponent("minecraft:equippable");
    if (!eq) return out;
    for (const slot of [EquipmentSlot.Mainhand, EquipmentSlot.Offhand]) {
      const id = eq.getEquipment(slot)?.typeId;
      if (!id) continue;
      if (id.startsWith(PREFIX)) out.add(id.slice(PREFIX.length));
    }
  } catch {
    // ignore
  }
  return out;
}

const holds = (player, name) => heldTotems(player).has(name);

function hostiles(dim, loc, radius) {
  try {
    return dim.getEntities({ location: loc, maxDistance: radius, families: ["monster"] });
  } catch {
    return [];
  }
}

// ---------- passive effects (10 min, checked every 10 ticks, removed when the totem is not held) ----------
// [effect id, amplifier]  (amplifier 0 = level I)
const PASSIVE_EFFECTS = {
  tide: [["water_breathing", 0], ["dolphins_grace", 2], ["conduit_power", 0]],
  fortune: [["haste", 3], ["luck", 2]],
  berserker: [["strength", 3], ["speed", 1], ["resistance", 0]],
  vitality: [["health_boost", 4], ["regeneration", 2], ["saturation", 1]], // +10 hearts
  gale: [["speed", 3], ["jump_boost", 4]],
  inferno: [["fire_resistance", 0], ["strength", 1]],
  shadow: [["invisibility", 0], ["speed", 1], ["night_vision", 0]],
  frost: [["resistance", 1], ["fire_resistance", 0]],
  clairvoyance: [["night_vision", 0], ["luck", 0]],
  mercy: [["regeneration", 2], ["absorption", 1]],
};

/** Apply a long totem effect; never downgrades a stronger effect and only re-applies when it is about to run out. */
function totemEff(player, id, amp) {
  try {
    const cur = player.getEffect(id);
    if (cur && (cur.amplifier > amp || (cur.amplifier === amp && cur.duration > EFFECT_REFRESH_BELOW))) return;
    player.addEffect(id, EFFECT_TICKS, { amplifier: amp, showParticles: false });
  } catch {
    // ignore
  }
}

/** Short effect for other players inside the mercy aura (stays above 10s so the icon does not flash). */
function allyEff(player, id, amp) {
  try {
    const cur = player.getEffect(id);
    if (cur && (cur.amplifier > amp || (cur.amplifier === amp && cur.duration > ALLY_REFRESH_BELOW))) return;
    player.addEffect(id, ALLY_EFFECT_TICKS, { amplifier: amp, showParticles: false });
  } catch {
    // ignore
  }
}

/** Passive behaviour that is not a potion effect. */
const PASSIVE_SPECIAL = {
  void(p) {
    for (const bad of ["wither", "darkness", "blindness"]) {
      try { p.removeEffect(bad); } catch { /* ignore */ }
    }
  },
};

// totems whose effects are currently applied to a player (persisted, so a reload / rejoin still cleans up)
const activeCache = new Map(); // playerId -> Set

function getActive(p) {
  let set = activeCache.get(p.id);
  if (set) return set;
  set = new Set();
  try {
    const raw = p.getDynamicProperty(ACTIVE_KEY);
    if (typeof raw === "string") for (const n of JSON.parse(raw)) set.add(n);
  } catch {
    // ignore
  }
  activeCache.set(p.id, set);
  return set;
}

function saveActive(p, set) {
  try {
    p.setDynamicProperty(ACTIVE_KEY, set.size ? JSON.stringify([...set]) : undefined);
  } catch {
    // ignore
  }
}

/** Remove the effects a dropped totem gave, unless another held totem still provides the same effect. */
function clearTotemEffects(p, name, held) {
  const list = PASSIVE_EFFECTS[name];
  if (!list) return;
  const still = new Set();
  for (const h of held) for (const [id, amp] of PASSIVE_EFFECTS[h] ?? []) still.add(id + ":" + amp);
  for (const [id, amp] of list) {
    if (still.has(id + ":" + amp)) continue;
    try {
      const cur = p.getEffect(id);
      if (cur && cur.amplifier === amp) p.removeEffect(id);
    } catch {
      // ignore
    }
  }
}

// ---------- periodic auras (every 20 / 40 ticks) ----------
const BAD_EFFECTS = ["poison", "wither", "weakness", "slowness", "mining_fatigue", "nausea", "hunger", "blindness", "darkness"];

const AURA = {
  mercy(p, tick) {
    if (tick % 20 !== 0) return;
    const dim = p.dimension;
    let near = [];
    try {
      near = dim.getPlayers({ location: p.location, maxDistance: MERCY_RADIUS });
    } catch {
      near = [p];
    }
    for (const t of near) {
      if (t.id !== p.id) {
        allyEff(t, "regeneration", 2);
        allyEff(t, "absorption", 1);
      }
      for (const bad of BAD_EFFECTS) {
        try { t.removeEffect(bad); } catch { /* ignore */ }
      }
      if (tick % 40 === 0) particle(dim, FX.heart, { x: t.location.x, y: t.location.y + 2.1, z: t.location.z });
    }
  },
  clairvoyance(p, tick) {
    if (tick % 20 !== 0) return;
    const list = hostiles(p.dimension, p.location, CLAIR_RADIUS);
    let n = 0;
    for (const e of list) {
      if (n++ >= CLAIR_MAX_MARKS) break;
      const l = e.location;
      particle(p.dimension, FX.mark, { x: l.x, y: l.y + 2.2, z: l.z });
      try { e.addEffect("glowing", 60, { amplifier: 0, showParticles: false }); } catch { /* ignore */ }
    }
  },
  frost(p, tick) {
    if (tick % 20 !== 0) return;
    for (const e of hostiles(p.dimension, p.location, FROST_RADIUS)) {
      try {
        e.addEffect("slowness", 80, { amplifier: 4, showParticles: false });
        e.addEffect("weakness", 80, { amplifier: 1, showParticles: false });
        const l = e.location;
        particle(p.dimension, FX.snow, { x: l.x, y: l.y + 1, z: l.z });
      } catch {
        // ignore
      }
    }
  },
  inferno(p, tick) {
    if (tick % 20 !== 0) return;
    for (const e of hostiles(p.dimension, p.location, INFERNO_AURA_RADIUS)) {
      try { e.setOnFire(INFERNO_BURN_SECONDS, true); } catch { /* ignore */ }
    }
  },
};

let tickCount = 0;
system.runInterval(() => {
  tickCount += 10;
  for (const p of world.getAllPlayers()) {
    try {
      const names = heldTotems(p);
      const active = getActive(p);
      let changed = false;
      // totems that are no longer held -> take their effects away
      for (const n of [...active]) {
        if (names.has(n)) continue;
        clearTotemEffects(p, n, names);
        active.delete(n);
        changed = true;
      }
      for (const n of names) {
        const list = PASSIVE_EFFECTS[n];
        if (list) {
          for (const [id, amp] of list) totemEff(p, id, amp);
          if (!active.has(n)) {
            active.add(n);
            changed = true;
          }
        }
        try {
          PASSIVE_SPECIAL[n]?.(p);
          AURA[n]?.(p, tickCount);
        } catch {
          // ignore
        }
      }
      if (changed) saveActive(p, active);
    } catch {
      // ignore
    }
  }
}, 10);

// ---------- Totem of the Ender: blink ----------
const blinkReady = new Map();

function passable(dim, x, y, z) {
  try {
    const b = dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    if (!b) return false;
    return b.isAir || (!b.isSolid && !b.isLiquid);
  } catch {
    return false;
  }
}

function blink(player) {
  const dim = player.dimension;
  const head = player.getHeadLocation();
  const dir = player.getViewDirection();
  let max = BLINK_RANGE;
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: BLINK_RANGE });
    if (hit?.block) {
      const c = { x: hit.block.x + 0.5, y: hit.block.y + 0.5, z: hit.block.z + 0.5 };
      max = Math.max(0, dist(head, c) - 1);
    }
  } catch {
    // ignore
  }
  for (let d = Math.floor(max); d >= 2; d--) {
    const hx = head.x + dir.x * d;
    const hy = head.y + dir.y * d;
    const hz = head.z + dir.z * d;
    const fy = hy - 1.62;
    if (passable(dim, hx, fy, hz) && passable(dim, hx, fy + 1, hz)) {
      const from = player.location;
      particle(dim, FX.portal, { x: from.x, y: from.y + 1, z: from.z });
      try {
        player.teleport({ x: hx, y: fy, z: hz }, { dimension: dim });
      } catch {
        return false;
      }
      eff(player, "slow_falling", 100);
      rescuedUntil.set(player.id, system.currentTick + 60); // no fall damage after a blink
      try {
        dim.playSound("mob.endermen.portal", { x: hx, y: fy, z: hz }, { volume: 1, pitch: 1 });
      } catch {
        // ignore
      }
      particle(dim, FX.portal, { x: hx, y: fy + 1, z: hz });
      return true;
    }
  }
  return false;
}

world.afterEvents.itemUse.subscribe((ev) => {
  const p = ev.source;
  if (!p) return;
  const id = ev.itemStack?.typeId;
  if (id !== PREFIX + "ender") return;
  const now = system.currentTick;
  const ready = blinkReady.get(p.id) ?? 0;
  if (now < ready) {
    say(p, `§7Blink cooldown: ${((ready - now) / 20).toFixed(1)}s`);
    return;
  }
  if (blink(p)) blinkReady.set(p.id, now + BLINK_COOLDOWN_TICKS);
  else say(p, "§7No room to blink there");
});

// ---------- Fortune / Berserker: kill rewards ----------
world.afterEvents.entityDie.subscribe((ev) => {
  try {
    const killer = ev.damageSource?.damagingEntity;
    const dead = ev.deadEntity;
    if (!killer || killer.typeId !== "minecraft:player" || dead.typeId === "minecraft:player") return;
    const names = heldTotems(killer);
    if (names.size === 0) return;
    if (names.has("fortune") && dead.isValid) {
      const l = dead.location;
      for (let i = 0; i < FORTUNE_ORBS; i++) {
        try {
          dead.dimension.spawnEntity("minecraft:xp_orb", { x: l.x, y: l.y + 0.5, z: l.z });
        } catch {
          // ignore
        }
      }
    }
    if (names.has("berserker")) {
      eff(killer, "absorption", 400, 3);
      try {
        const hp = killer.getComponent("minecraft:health");
        if (hp) hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + BERSERKER_HEAL_ON_KILL));
      } catch { /* ignore */ }
    }
  } catch {
    // ignore
  }
});

// ---------- Inferno: attackers burst into flames ----------
world.afterEvents.entityHurt.subscribe((ev) => {
  try {
    const victim = ev.hurtEntity;
    if (!victim || victim.typeId !== "minecraft:player" || !holds(victim, "inferno")) return;
    const attacker = ev.damageSource?.damagingEntity;
    if (!attacker || attacker.id === victim.id || !attacker.isValid) return;
    attacker.setOnFire(INFERNO_BURN_SECONDS, true);
  } catch {
    // ignore
  }
});

// ---------- Gale: no fall damage / Void: no void damage ----------
world.beforeEvents.entityHurt.subscribe((ev) => {
  try {
    const victim = ev.hurtEntity;
    if (!victim || victim.typeId !== "minecraft:player") return;
    const cause = ev.damageSource?.cause;
    if (cause !== EntityDamageCause.fall && cause !== EntityDamageCause.void && cause !== EntityDamageCause.suicide && holds(victim, "shadow") && Math.random() < SHADOW_DODGE_CHANCE) {
      ev.cancel = true;
      particle(victim.dimension, FX.portal, { x: victim.location.x, y: victim.location.y + 1, z: victim.location.z });
      return;
    }
    if (cause === EntityDamageCause.fall && (holds(victim, "gale") || (rescuedUntil.get(victim.id) ?? 0) > system.currentTick)) ev.cancel = true;
    else if (cause === EntityDamageCause.void && holds(victim, "void")) ev.cancel = true;
    else if (cause === EntityDamageCause.fall && holds(victim, "void")) ev.cancel = true;
    else if ((cause === EntityDamageCause.fire || cause === EntityDamageCause.fireTick || cause === EntityDamageCause.lava) && holds(victim, "inferno")) ev.cancel = true;
    else if (cause === EntityDamageCause.freezing && holds(victim, "frost")) ev.cancel = true;
    else if (cause === EntityDamageCause.drowning && holds(victim, "tide")) ev.cancel = true;
  } catch {
    // ignore
  }
});

// ---------- Totem of the Void: rescue from the void ----------
const lastSafe = new Map(); // playerId -> { x, y, z, dim }
const rescuedUntil = new Map(); // playerId -> tick until which fall damage is ignored

function tryTeleport(p, dim, loc) {
  try {
    p.teleport({ x: loc.x, y: loc.y, z: loc.z }, { dimension: dim });
    return true;
  } catch {
    return false;
  }
}

/** Candidate rescue points: last safe ground -> bed/respawn point -> world spawn -> top block below the player. */
function rescueTargets(p, dim) {
  const out = [];
  const safe = lastSafe.get(p.id);
  if (safe && safe.dim === dim.id) out.push({ x: safe.x, y: safe.y + 0.1, z: safe.z });
  try {
    const sp = p.getSpawnPoint();
    if (sp && sp.dimension.id === dim.id) out.push({ x: sp.x + 0.5, y: sp.y + 1, z: sp.z + 0.5 });
  } catch {
    // ignore
  }
  try {
    if (dim.id === "minecraft:overworld") {
      const ws = world.getDefaultSpawnLocation();
      if (ws) {
        const top = dim.getTopmostBlock({ x: Math.floor(ws.x), z: Math.floor(ws.z) });
        out.push({ x: ws.x + 0.5, y: (top ? top.y + 1 : ws.y) + 0.1, z: ws.z + 0.5 });
      }
    }
  } catch {
    // ignore
  }
  try {
    const l = p.location;
    const top = dim.getTopmostBlock({ x: Math.floor(l.x), z: Math.floor(l.z) });
    if (top) out.push({ x: l.x, y: top.y + 1.1, z: l.z });
  } catch {
    // ignore
  }
  return out;
}

function rescueFromVoid(p, dim) {
  for (const target of rescueTargets(p, dim)) {
    if (!tryTeleport(p, dim, target)) continue;
    try {
      p.clearVelocity();
    } catch {
      // ignore
    }
    eff(p, "slow_falling", 100);
    eff(p, "resistance", 100, 4);
    rescuedUntil.set(p.id, system.currentTick + VOID_FALL_GRACE_TICKS);
    particle(dim, FX.totem, { x: target.x, y: target.y + 1, z: target.z });
    try {
      dim.playSound("random.totem", target, { volume: 0.6, pitch: 1.4 });
    } catch {
      // ignore
    }
    say(p, "§8The Totem of the Void pulled you back");
    return true;
  }
  return false;
}

let voidTick = 0;
system.runInterval(() => {
  voidTick++;
  for (const p of world.getAllPlayers()) {
    try {
      if (!holds(p, "void")) {
        lastSafe.delete(p.id);
        continue;
      }
      const dim = p.dimension;
      const loc = p.location;
      const floor = dim.heightRange.min;
      if (loc.y < floor - VOID_MARGIN) {
        rescueFromVoid(p, dim);
        continue;
      }
      // remember the last solid ground the player stood on (sampled every 4 ticks)
      if (voidTick % 4 === 0 && p.isOnGround && !p.isInWater) {
        const under = dim.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y) - 1, z: Math.floor(loc.z) });
        if (under && under.isSolid && loc.y > floor + 1) {
          lastSafe.set(p.id, { x: loc.x, y: loc.y, z: loc.z, dim: dim.id });
        }
      }
    } catch {
      // ignore
    }
  }
}, 1);

// ---------- Totem of the Tide: fast swimming ----------
// Dolphin's Grace alone barely changes Bedrock swim speed, so the totem also pushes the player along the look
// direction every tick while swimming (sprinting in water).
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    try {
      if (!holds(p, "tide")) continue;
      if (!(p.isSwimming || (p.isInWater && p.isSprinting))) continue;
      const v = p.getViewDirection();
      p.applyKnockback({ x: v.x * TIDE_SWIM_PUSH, z: v.z * TIDE_SWIM_PUSH }, v.y * TIDE_SWIM_PUSH);
    } catch {
      // ignore
    }
  }
}, 1);

world.afterEvents.playerLeave.subscribe((ev) => {
  blinkReady.delete(ev.playerId);
  lastSafe.delete(ev.playerId);
  rescuedUntil.delete(ev.playerId);
  activeCache.delete(ev.playerId);
});

// ---------- fast equip (same as the Totem of Eternal Rebirth): use = swap the totem into the off-hand ----------
// The Ender totem keeps right-click for the blink, so it is skipped here (it can still be placed in the off-hand).
const FAST_EQUIP_SKIP = new Set([PREFIX + "ender"]);
const lastTotemSwap = new Map();

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  try {
    const id = itemStack?.typeId;
    if (player?.typeId !== "minecraft:player" || !id || !id.startsWith(PREFIX) || FAST_EQUIP_SKIP.has(id)) return;
    const k = player.id ?? player.name;
    if (system.currentTick - (lastTotemSwap.get(k) ?? -Infinity) < 4) return;
    const eq = player.getComponent("minecraft:equippable");
    if (!eq) return;
    const main = eq.getEquipment(EquipmentSlot.Mainhand);
    const off = eq.getEquipment(EquipmentSlot.Offhand);
    if (!main || main.typeId !== id) return;
    if (eq.setEquipment(EquipmentSlot.Mainhand, off) === false) return;
    try {
      if (eq.setEquipment(EquipmentSlot.Offhand, main) === false) {
        eq.setEquipment(EquipmentSlot.Mainhand, main);
        return;
      }
    } catch (error) {
      eq.setEquipment(EquipmentSlot.Mainhand, main);
      throw error;
    }
    lastTotemSwap.set(k, system.currentTick);
  } catch (e) {
    console.warn("[Infinity Totems] fast equip failed: " + e);
  }
});
