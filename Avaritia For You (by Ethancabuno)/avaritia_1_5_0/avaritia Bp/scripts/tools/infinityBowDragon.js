import { world, system, EntityDamageCause, EquipmentSlot, ItemStack, ItemEnchantableComponent, ItemDurabilityComponent } from "@minecraft/server";
import { fx, hitFx } from "./infinityFx.js";
import { isFlaggedAgainst, isPet } from "./dangerFlags.js";

/**
 * Infinity Bow - "Dragon Soul" skill (phantom dragon).
 *
 * Works EXACTLY like the infinity crossbow handles Devour: the bow has its own "CHARGED" variant (infinity_bow:bow_dragon) with NO minecraft:shooter /
 * minecraft:projectile, so the engine NEVER spawns an arrow. The script decides what the shot releases.
 *   1) Hold the bow and HOLD SNEAK for a full 5 SECONDS => the bow switches to the "Dragon Soul charged" variant (keeps enchants/name). Releasing Sneak early = cancel.
 *   2) USE (right click) when the bow is charged => fires a blue PHANTOM DRAGON in the Eastern style (wingless, long snake-like body,
 *      fiery mane, long horns, golden eyes, fangs) made of light, see-through, flying through every obstacle.
 *      ABSOLUTELY NO arrow (the charged variant has no arrow-firing mechanism). After firing the bow returns to its normal variant.
 *   3) The normal bow still fires regular arrows; to get the dragon again you must charge up from scratch.
 *   - The dragon AUTOMATICALLY SEEKS the nearest enemy (monsters + anyone who attacked the shooter), winds toward it and ONE-SHOTS it; then dashes to
 *     the next target. With no target it flies straight along the aiming direction.
 *   - Does not hit the shooter. Pets are NOT hit, unless they attacked the shooter (dangerFlags.js). Respects the "immortal" tag.
 *   - Does not break terrain. All values below are adjustable.
 */

const BOW_ID = "infinity_bow:bow";
const BOW_DRAGON_ID = "infinity_bow:bow_dragon"; // DRAGON-CHARGED bow variant (no shooter/projectile => no arrow is spawned)
const CHARGE_TICKS = 100; // 5 seconds
const SHOW_BAR_FROM = 40; // show the charge bar after 2 seconds
const STORED_PROP = "avaritia:bow_dragon_stored"; // (old) dynamic property from the previous version; if still present, automatically switches to the charged bow variant
const lastFire = new Map(); // playerId -> tick the dragon was just fired (prevents double activation itemUse + itemStartUse)
const charge = new Map(); // playerId -> ticks charged so far (only increases while holding Sneak with the bow); when full the bow switches to the charged variant

const DRAGON_SCALE = 2.0; // scales up the whole dragon
const DRAGON_SPEED = 2.6; // blocks per tick
const DRAGON_RANGE = 320; // no target: flies straight at most this many blocks
const DRAGON_MAX_TICKS = 300; // maximum lifetime (15 seconds)
const SEEK_RANGE = 160; // enemy search range
const TURN_RATE = 0.14; // 0..1: steering amount per tick when chasing a target
const RETARGET_EVERY = 8; // with no target, search again every this many ticks
const TARGET_PLAYERS = false; // true = the dragon also chases other players
const SEGMENTS = 34;
const SEG_SPACING = 1.6;
const HIT_RADIUS = 24; // hit radius around the dragon's head and body
const DAMAGE = 100000;

const EXCLUDED_TYPES = [
  "minecraft:item", "minecraft:xp_orb", "minecraft:armor_stand", "minecraft:arrow", "minecraft:thrown_trident",
  "minecraft:experience_bottle", "avaritia:heaven_arrow", "avaritia:heaven_arrow_rain",
  "avaritia:infinity_trident_giant", "avaritia:infinity_trident_spirit"
];


const UP = { x: 0, y: 1, z: 0 };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a) => Math.sqrt(dot(a, a));
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (a) => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const frameOf = (d) => {
  let r = cross(d, UP);
  if (len(r) < 0.1) r = { x: 1, y: 0, z: 0 };
  r = norm(r);
  return { r, u: norm(cross(r, d)) };
};

const streak = (dim, loc, dir, w, l, col, life = 0.3) =>
  fx(dim, "avaritia:fx_streak", loc, { dx: dir.x, dy: dir.y, dz: dir.z, w, l, cr: col[0], cg: col[1], cb: col[2], life });
const star = (dim, loc, s, col, life = 0.3) =>
  fx(dim, "avaritia:fx_star", loc, { s, cr: col[0], cg: col[1], cb: col[2], life });
const orb = (dim, loc, s, col, life = 0.3) =>
  fx(dim, "avaritia:fx_orb", loc, { s, cr: col[0], cg: col[1], cb: col[2], life });

function say(player, msg) {
  try {
    player.onScreenDisplay.setActionBar(msg);
  } catch {
    // ignore
  }
}

function launchDragon(player) {
  const dim = player.dimension;
  const K = DRAGON_SCALE;
  const head0 = player.getHeadLocation();
  let dir = norm(player.getViewDirection());
  const origin = add(head0, scale(dir, 4 + 6 * K));

  try {
    dim.playSound("mob.enderdragon.growl", head0, { volume: 3, pitch: 0.7 });
    dim.playSound("random.explode", head0, { volume: 1.2, pitch: 0.6 });
  } catch {
    // ignore
  }
  fx(dim, "avaritia:nova_flash", origin, { radius: 8 });

  const dstreak = (loc, d2, w, l, col, life) => streak(dim, loc, d2, w * K, l * K, col, life);
  const dstar = (loc, sz, col, life) => star(dim, loc, sz * K, col, life);
  const dorb = (loc, sz, col, life) => orb(dim, loc, sz * K, col, life);

  const hit = new Set();
  const hist = []; // history of the head's flight path: { p, r, u } (newest at the end)
  const histMax = Math.ceil(((SEGMENTS * SEG_SPACING + 4) * K) / DRAGON_SPEED) + 8;
  let H = origin;
  let target = null;
  let nextSeek = 0;
  let tick = 0;
  let job = -1;

  const stop = () => {
    try {
      system.clearRun(job);
    } catch {
      // ignore
    }
  };

  const validTarget = (e) => {
    try {
      if (!e?.isValid || hit.has(e.id) || e.id === player.id) return false;
      if (e.hasTag("immortal")) return false;
      if (!e.getComponent("minecraft:health")) return false;
      if (isPet(e) && !isFlaggedAgainst(e, player.id)) return false;
      return true;
    } catch {
      return false;
    }
  };
  const isEnemy = (e) => {
    try {
      if (isFlaggedAgainst(e, player.id)) return true;
      if (e.typeId === "minecraft:player") return TARGET_PLAYERS;
      return e.matches({ families: ["monster"] });
    } catch {
      return false;
    }
  };
  const pickTarget = () => {
    let list = [];
    try {
      list = dim.getEntities({ location: H, maxDistance: SEEK_RANGE, excludeTypes: EXCLUDED_TYPES });
    } catch {
      return null;
    }
    let best = null;
    let bd = Infinity;
    for (const e of list) {
      if (!validTarget(e) || !isEnemy(e)) continue;
      const v = sub(e.location, H);
      const d2 = dot(v, v);
      if (d2 < bd) {
        bd = d2;
        best = e;
      }
    }
    return best;
  };

  /** Point on the dragon's body `dist` blocks behind the head along the flight path; null if the dragon has not "emerged" that far yet. */
  const bodyAt = (dist) => {
    let acc = 0;
    for (let j = hist.length - 1; j > 0; j--) {
      const a = hist[j];
      const b = hist[j - 1];
      const dl = len(sub(a.p, b.p));
      if (acc + dl >= dist) {
        const t = (dist - acc) / (dl || 1);
        return { p: add(a.p, scale(sub(b.p, a.p), t)), r: a.r, u: a.u };
      }
      acc += dl;
    }
    return null;
  };

  job = system.runInterval(() => {
    tick++;
    if (tick > DRAGON_MAX_TICKS) {
      stop();
      return;
    }

    // ---- Finding enemies & steering ----
    if (target && !validTarget(target)) target = null;
    if (!target && tick >= nextSeek) {
      target = pickTarget();
      nextSeek = tick + RETARGET_EVERY;
    }
    if (target) {
      try {
        const tl = target.location;
        const want = sub({ x: tl.x, y: tl.y + 0.9, z: tl.z }, H);
        const dist = len(want);
        const turn = dist < 50 ? 0.32 : TURN_RATE;
        dir = norm(add(dir, scale(sub(norm(want), dir), turn)));
      } catch {
        target = null;
      }
    } else if (len(sub(H, origin)) > DRAGON_RANGE) {
      stop();
      return;
    }

    H = add(H, scale(dir, DRAGON_SPEED));
    try {
      if (!dim.getBlock({ x: Math.floor(H.x), y: Math.floor(H.y), z: Math.floor(H.z) })) {
        stop();
        return;
      }
    } catch {
      stop();
      return;
    }
    const fr = frameOf(dir);
    const right = fr.r;
    const up = fr.u;
    hist.push({ p: H, r: right, u: up });
    if (hist.length > histMax) hist.shift();

    // local coordinates around the head: (forward, right, up)
    const lc = (fa, ra, ua) => add(add(H, scale(dir, fa * K)), add(scale(right, ra * K), scale(up, ua * K)));
    const dirLc = (fa, ra, ua) => norm(add(add(scale(dir, fa), scale(right, ra)), scale(up, ua)));
    const seg = (a, b, w, col) => {
      const dv = sub(b, a);
      const l = len(dv);
      if (l < 0.01) return;
      streak(dim, add(a, scale(dv, 0.5)), scale(dv, 1 / l), w * K, l / 2, col);
    };

    // ---- Body: giant winding serpent, dark blue + bright core + fiery mane along the spine ----
    const phase = tick * 0.28;
    const amp = (i) => Math.min(1, i / 8) * 3.2 * K;
    const bodyPts = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const bp = bodyAt((i * SEG_SPACING + 1.5) * K);
      if (!bp) break;
      const t = i / SEGMENTS;
      const A = amp(i);
      const p = add(add(bp.p, scale(bp.r, A * Math.sin(phase - i * 0.5))), scale(bp.u, A * 0.6 * Math.sin(phase * 0.9 - i * 0.38)));
      if (i % 4 === 2) bodyPts.push(p);
      const sz = i < 4 ? 2.6 : 2.6 * (1 - ((i - 4) / SEGMENTS) * 0.8);
      dorb(p, sz, [0.08 + 0.15 * t, 0.4 - 0.2 * t, 1]);
      if (i % 2 === 0) {
        dorb(p, sz * 0.55, [0.55, 0.95, 1]);
        if (i >= 2) {
          const flick = 0.6 + 0.4 * Math.sin(tick * 0.6 + i);
          const dv = i % 4 === 0 ? bp.u : norm(add(bp.u, scale(bp.r, i % 8 === 2 ? 0.8 : -0.8)));
          const ln = (1.4 + sz * 0.8) * flick;
          dstreak(add(p, scale(dv, (sz * 0.8 + ln) * K)), dv, 0.45, ln, [0.35, 0.85, 1]);
        }
      }
      if (tick % 2 === 0 && i % 4 === 1) {
        dstar(add(p, { x: (Math.random() - 0.5) * 4 * K, y: (Math.random() - 0.5) * 4 * K, z: (Math.random() - 0.5) * 4 * K }), 0.5 + Math.random() * 0.5, [0.7, 0.95, 1], 0.5);
      }
    }

    // ---- Dragon head ----
    dorb(H, 3.6, [0.2, 0.6, 1]); // skull
    dorb(H, 2.2, [0.6, 0.95, 1]);
    dorb(lc(2.6, 0, -0.3), 2.3, [0.25, 0.7, 1]); // snout
    for (const side of [-1, 1]) {
      dorb(lc(4.1, side * 0.8, 0.1), 0.7, [0.9, 1, 1]); // nostrils
      const eye = lc(1.4, side * 1.5, 1.3);
      dstar(eye, 1.5, [1, 0.95, 0.2], 0.25); // golden eyes
      dorb(eye, 1.3, [1, 0.85, 0.15]);
      dstar(eye, 0.6, [1, 1, 1], 0.25);
    }
    // upper jaw / lower jaw (opening and biting in rhythm), glowing throat, fangs
    seg(lc(1.2, 0, -0.5), lc(5.2, 0, -0.5), 0.8, [0.6, 0.95, 1]);
    const open = 0.3 + 0.2 * Math.sin(tick * 0.4);
    const ld = dirLc(Math.cos(open), 0, -Math.sin(open));
    const jawStart = lc(1, 0, -1);
    const jawEnd = add(jawStart, scale(ld, 4.4 * K));
    seg(jawStart, jawEnd, 0.75, [0.5, 0.9, 1]);
    dorb(lc(2.8, 0, -1.1), 1.5, [0.9, 1, 1]);
    for (const side of [-1, 1]) {
      for (let j = 0; j < 3; j++) {
        const b = lc(2.6 + j * 0.9, side * 0.75, -0.6);
        seg(b, add(b, scale(up, -K)), 0.22, [1, 1, 1]);
      }
      for (let j = 0; j < 2; j++) {
        const b = add(add(jawStart, scale(ld, (2 + j) * K)), scale(right, side * 0.7 * K));
        seg(b, add(b, scale(up, 0.9 * K)), 0.22, [1, 1, 1]);
      }
      // long horns curving backward, tips bending downward
      const hp = [lc(0.6, side, 1.5), lc(-0.9, side * 3, 3), lc(-3.4, side * 5.2, 3.6), lc(-4.9, side * 6.4, 2.5)];
      for (let j = 0; j < 3; j++) seg(hp[j], hp[j + 1], 0.5, [0.85, 0.97, 1]);
      // long winding whiskers
      let prev = lc(3.4, side * 0.9, 0);
      for (let j = 1; j <= 4; j++) {
        const nx = lc(3.4 - j * 2.4, side * (0.9 + j * 1.1), Math.sin(phase + j) * 0.9);
        seg(prev, nx, 0.16, [0.7, 0.95, 1]);
        prev = nx;
      }
    }
    // fiery mane around the head
    const MANE = 20;
    for (let m = 0; m < MANE; m++) {
      const th = (m / MANE) * Math.PI * 2;
      const rad = add(scale(right, Math.cos(th)), scale(up, Math.sin(th)));
      const base = add(add(H, scale(rad, 2.2 * K)), scale(dir, -0.4 * K));
      const dv = norm(add(scale(rad, 0.8), scale(dir, -1.3 + 0.25 * Math.sin(tick * 0.5 + m))));
      const L = 2 + 1.4 * Math.abs(Math.sin(tick * 0.5 + m * 1.7));
      dstreak(add(base, scale(dv, L * K)), dv, 0.55, L, [0.25 + 0.3 * (m % 2), 0.75, 1]);
    }

    if (tick % 24 === 1) {
      try {
        dim.playSound("mob.enderdragon.growl", H, { volume: 1.5, pitch: 0.7 });
      } catch {
        // ignore
      }
    }

    // ---- ONE-SHOT every creature in the dragon's head/body area ----
    const pts = [H, ...bodyPts];
    let victims = [];
    try {
      victims = dim.getEntities({ location: H, maxDistance: (SEGMENTS * SEG_SPACING + 4) * K + HIT_RADIUS, excludeTypes: EXCLUDED_TYPES });
    } catch {
      victims = [];
    }
    for (const e of victims) {
      if (!e?.isValid || hit.has(e.id) || e.id === player.id) continue;
      try {
        if (e.hasTag("immortal")) continue;
        if (!e.getComponent("minecraft:health")) continue;
      } catch {
        continue;
      }
      if (isPet(e) && !isFlaggedAgainst(e, player.id)) continue;
      const l = e.location;
      const c = { x: l.x, y: l.y + 0.9, z: l.z };
      let near = false;
      for (const q of pts) {
        if (len(sub(c, q)) <= HIT_RADIUS) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      hit.add(e.id);
      try {
        const src = player.isValid ? { cause: EntityDamageCause.entityAttack, damagingEntity: player } : { cause: EntityDamageCause.entityAttack };
        e.applyDamage(DAMAGE, src);
        if (e.isValid && e.typeId !== "minecraft:player") {
          const hp = e.getComponent("minecraft:health");
          if (hp && hp.currentValue > 0) e.kill();
        }
      } catch {
        // target takes no damage
      }
      hitFx(dim, c);
      for (let i = 0; i < 4; i++) star(dim, add(c, { x: (Math.random() - 0.5) * 2, y: Math.random() * 2, z: (Math.random() - 0.5) * 2 }), 0.8, [0.7, 1, 1], 0.6);
    }
  }, 1);
}

// ----- "Charged" bow (like the loaded crossbow) -----
const isStored = (p) => {
  try {
    return p.getDynamicProperty(STORED_PROP) === true;
  } catch {
    return false;
  }
};
const clearStored = (p) => {
  try {
    p.setDynamicProperty(STORED_PROP, undefined);
  } catch {
    // ignore
  }
};

/** Switch to another item but keep enchants, name, lore, durability. */
function convertItem(from, to) {
  const next = new ItemStack(to, from.amount);
  try {
    const fromDur = from.getComponent(ItemDurabilityComponent.componentId);
    const nextDur = next.getComponent(ItemDurabilityComponent.componentId);
    if (fromDur && nextDur) nextDur.damage = fromDur.damage;
  } catch {
    // ignore
  }
  try {
    const enchants = from.getComponent(ItemEnchantableComponent.componentId)?.getEnchantments();
    if (enchants && enchants.length) next.getComponent(ItemEnchantableComponent.componentId)?.addEnchantments(enchants);
  } catch {
    // ignore
  }
  try {
    if (from.nameTag) next.nameTag = from.nameTag;
    const lore = from.getLore();
    if (lore && lore.length) next.setLore(lore);
    next.keepOnDeath = from.keepOnDeath;
  } catch {
    // ignore
  }
  return next;
}

const mainSlot = (p) => {
  try {
    return p.getComponent("minecraft:equippable")?.getEquipmentSlot(EquipmentSlot.Mainhand);
  } catch {
    return undefined;
  }
};

const barText = (el) => {
  const frac = Math.min(1, el / CHARGE_TICKS);
  const filled = Math.floor(frac * 20);
  return `§bDragon Soul §f${"█".repeat(filled)}§8${"█".repeat(20 - filled)} §7${(el / 20).toFixed(1)}/${(CHARGE_TICKS / 20).toFixed(1)}s §8(hold Sneak)`;
};

/** Charged bow + use => release the dragon (no arrow at all), then return the bow to the normal variant. */
function fireStoredDragon(p) {
  const now = system.currentTick;
  if (lastFire.get(p.id) === now) return;
  const slot = mainSlot(p);
  const item = slot?.getItem();
  if (!slot || !item || item.typeId !== BOW_DRAGON_ID) return;
  lastFire.set(p.id, now);
  try {
    slot.setItem(convertItem(item, BOW_ID));
  } catch {
    // ignore
  }
  launchDragon(p);
  say(p, "§b§l✦ DRAGON SOUL ✦");
}

world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.source && ev.itemStack?.typeId === BOW_DRAGON_ID) fireStoredDragon(ev.source);
});
world.afterEvents.itemStartUse.subscribe((ev) => {
  if (ev.source && ev.itemStack?.typeId === BOW_DRAGON_ID) fireStoredDragon(ev.source);
});

world.afterEvents.playerLeave.subscribe((ev) => {
  charge.delete(ev.playerId);
  lastFire.delete(ev.playerId);
});

system.runInterval(() => {
  const now = system.currentTick;
  for (const p of world.getAllPlayers()) {
    const slot = mainSlot(p);
    let held;
    try {
      held = slot?.getItem();
    } catch {
      held = undefined;
    }
    let el = charge.get(p.id) ?? 0;
    if (!held || (held.typeId !== BOW_ID && held.typeId !== BOW_DRAGON_ID)) {
      if (el > 0) charge.delete(p.id);
      continue;
    }
    if (held.typeId === BOW_DRAGON_ID) {
      charge.delete(p.id);
      if (now % 20 === 0) say(p, "§b§lDragon charged §r§7- use to release the dragon");
      continue;
    }
    // Old version still has the dynamic property "dragon stored": switch to the charged bow variant.
    if (isStored(p)) {
      clearStored(p);
      try {
        slot.setItem(convertItem(held, BOW_DRAGON_ID));
      } catch {
        // ignore
      }
      continue;
    }
    if (p.isSneaking) {
      el += 1;
      charge.set(p.id, el);
      if (el >= CHARGE_TICKS) {
        charge.delete(p.id);
        try {
          slot.setItem(convertItem(held, BOW_DRAGON_ID));
        } catch {
          // ignore
        }
        try {
          p.dimension.playSound("random.levelup", p.location, { volume: 1, pitch: 1.4 });
        } catch {
          // ignore
        }
        say(p, "§b§l✦ Dragon charged ✦ §r§7use to release the dragon");
        continue;
      }
      if (el >= SHOW_BAR_FROM) {
        say(p, barText(el));
        if (el % 4 === 0) {
          const frac = el / CHARGE_TICKS;
          const c = p.getHeadLocation();
          const r = 3.2 * (1 - frac) + 0.8;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + el * 0.15;
            star(p.dimension, { x: c.x + Math.cos(a) * r, y: c.y - 0.6 + Math.sin(el * 0.2 + i) * 0.4, z: c.z + Math.sin(a) * r }, 0.5 + frac * 0.6, [0.5 + 0.5 * frac, 0.9, 1], 0.3);
          }
        }
      }
    } else if (el > 0) {
      charge.delete(p.id); // released Sneak early: cancel
      if (el >= SHOW_BAR_FROM) say(p, "§7Dragon Soul cancelled (not fully charged)");
    }
  }
}, 1);
