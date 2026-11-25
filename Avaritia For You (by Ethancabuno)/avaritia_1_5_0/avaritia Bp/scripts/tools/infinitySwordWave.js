import { world, system, EntityDamageCause } from "@minecraft/server";
import { fx, hitFx } from "./infinityFx.js";
import { isFlaggedAgainst, isPet } from "./dangerFlags.js";

/**
 * Infinity Sword - "Spatial Slash" skill (a slash through space).
 *
 * Press RIGHT CLICK while holding the infinity sword: the sword swings diagonally RIGHT then diagonally LEFT in alternation (separate animations for first and third person), then fires a crescent-shaped wave of air, SURROUNDED by a layer of twinkling stars and
 * small cracks, giving the feeling that space is being torn apart. The wave CUTS IN HALF everything along its path: every creature takes one slash of
 * enormous damage, and (if CARVE_TERRAIN = true) the terrain is carved into a slash gorge.
 *   - Does not hit the shooter. Pets are NOT hit, unless they attacked the shooter (dangerFlags.js). Respects the "immortal" tag.
 *   - Does not break protected blocks (bedrock, command block...). All values below are adjustable.
 */

const SWORD_ID = "avaritia:infinity_sword";
const COOLDOWN_TICKS = 30;
const SWING_DELAY_TICKS = 3; // the wave flies out exactly when the sword swing reaches its peak
const SWAP_SWING = false; // true = flip the swing animation right <-> left if it looks opposite to the wave direction
const WAVE_RANGE = 72;
const WAVE_SPEED = 2.5; // blocks per tick
const WAVE_HALF_WIDTH = 7;
const WAVE_THICK = 2.5;
const WAVE_DAMAGE = 100000;
const WAVE_TILT_DEG = 30;
const ARC_PARTS = 9;
const ARC_CURVE = 2.6;

const CARVE_TERRAIN = true; // false = the wave stops/does not break blocks
const CARVE_THICK = 2; // thickness of the slash gorge (blocks)
const PROTECTED_BLOCKS = new Set([
  "minecraft:bedrock", "minecraft:barrier", "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_block", "minecraft:jigsaw", "minecraft:end_portal",
  "minecraft:end_portal_frame", "minecraft:end_gateway", "minecraft:border_block", "avaritia:neutronium_block"
]);

const EXCLUDED_TYPES = [
  "minecraft:item", "minecraft:xp_orb", "minecraft:armor_stand", "minecraft:arrow", "minecraft:thrown_trident",
  "minecraft:experience_bottle", "avaritia:heaven_arrow", "avaritia:heaven_arrow_rain",
  "avaritia:infinity_trident_giant", "avaritia:infinity_trident_spirit"
];

const cooldownUntil = {};
const flipSide = {};

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a) => Math.sqrt(dot(a, a));
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const norm = (a) => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

const streak = (dim, loc, dir, w, l, col, life = 0.3) =>
  fx(dim, "avaritia:fx_streak", loc, { dx: dir.x, dy: dir.y, dz: dir.z, w, l, cr: col[0], cg: col[1], cb: col[2], life });
const star = (dim, loc, s, col, life = 0.35) =>
  fx(dim, "avaritia:fx_star", loc, { s, cr: col[0], cg: col[1], cb: col[2], life });

function say(player, msg) {
  try {
    player.onScreenDisplay.setActionBar(msg);
  } catch {
    // ignore
  }
}

/** Carves a slash gorge through the terrain. Returns false if an unloaded chunk is hit. */
function carve(dim, c, s, n, f) {
  const seen = new Set();
  for (let t = -Math.ceil(WAVE_SPEED); t <= 0; t++) {
    for (let u = -WAVE_HALF_WIDTH; u <= WAVE_HALF_WIDTH; u++) {
      for (let v = 0; v < CARVE_THICK; v++) {
        const p = add(add(add(c, scale(f, t)), scale(s, u)), scale(n, v - CARVE_THICK / 2));
        const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
        const key = `${bx},${by},${bz}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const b = dim.getBlock({ x: bx, y: by, z: bz });
          if (!b) return false;
          if (b.isAir || PROTECTED_BLOCKS.has(b.typeId)) continue;
          b.setType("minecraft:air");
        } catch {
          // outside the build limits
        }
      }
    }
  }
  return true;
}

function drawWave(dim, c, f, s, n, tick) {
  const rnd = (k) => (Math.random() - 0.5) * 2 * k;
  const arcPos = (u) => add(add(c, scale(s, u * WAVE_HALF_WIDTH)), scale(f, -u * u * ARC_CURVE));
  const arcTan = (u) => norm(add(scale(s, WAVE_HALF_WIDTH), scale(f, -2 * u * ARC_CURVE)));
  const seg = (2 * WAVE_HALF_WIDTH) / ARC_PARTS;

  // Core: a thin white slash line + a blue-purple glow around it
  for (let k = 0; k < ARC_PARTS; k++) {
    const u = -1 + (2 * k) / (ARC_PARTS - 1);
    const pos = arcPos(u);
    const tg = arcTan(u);
    streak(dim, pos, tg, 1.6, seg, [0.35, 0.5, 1], 0.22);
    streak(dim, pos, tg, 0.45, seg, [1, 1, 1], 0.22);
    // Strip of cut space left behind after the slash blade
    streak(dim, pos, tg, 1.0, seg, [0.45, 0.4, 1], 0.7);
  }

  // STAR layer around the slash blade (two shells: close to the blade and farther out)
  for (let i = 0; i < 22; i++) {
    const u = Math.random() * 2 - 1;
    const outer = i % 3 === 0;
    const spread = outer ? 2.2 : 0.9;
    const pos = add(add(arcPos(u), scale(n, rnd(spread))), add(scale(f, rnd(spread)), scale(s, rnd(0.6))));
    const col = Math.random() < 0.3 ? [0.8, 0.65, 1] : [0.85 + Math.random() * 0.15, 0.95, 1];
    star(dim, pos, outer ? 0.4 + Math.random() * 0.5 : 0.6 + Math.random() * 0.8, col, 0.3 + Math.random() * 0.3);
  }
  // Large star at the center
  star(dim, c, 3, [1, 1, 1], 0.2);

  // Space cracks: short jagged rays radiating from the slash blade
  for (let i = 0; i < 6; i++) {
    const u = Math.random() * 2 - 1;
    const base = arcPos(u);
    const dir = norm(add(add(scale(n, rnd(1)), scale(f, rnd(0.8))), scale(s, rnd(0.5))));
    const L = 0.8 + Math.random() * 1.6;
    streak(dim, add(base, scale(dir, L)), dir, 0.1, L, [0.9, 0.95, 1], 0.35 + Math.random() * 0.3);
  }
  // Stars falling back along the slash path, fading slowly
  if (tick % 2 === 0) {
    for (let i = 0; i < 4; i++) {
      const u = Math.random() * 2 - 1;
      star(dim, add(arcPos(u), scale(n, rnd(1.2))), 0.5 + Math.random() * 0.5, [0.8, 0.9, 1], 1.1);
    }
  }
}

function splitFx(dim, loc, s) {
  hitFx(dim, loc);
  streak(dim, loc, s, 0.25, 3.5, [1, 1, 1], 0.9);
  streak(dim, loc, { x: 0, y: 1, z: 0 }, 0.2, 2.5, [1, 0.9, 0.5], 0.7);
  for (let i = 0; i < 5; i++) {
    star(dim, add(loc, { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 }), 0.6 + Math.random() * 0.6, [1, 0.95, 0.7], 0.6);
  }
}

function launchWave(player, slashRight) {
  const dim = player.dimension;
  const f = norm(player.getViewDirection());
  const head = player.getHeadLocation();
  const origin = { x: head.x + f.x * 1.5, y: head.y + f.y * 1.5 - 0.3, z: head.z + f.z * 1.5 };

  let right = cross(f, { x: 0, y: 1, z: 0 });
  if (len(right) < 0.1) right = { x: 1, y: 0, z: 0 };
  right = norm(right);
  const up = cross(right, f);
  // slashRight = right diagonal slash (a "/" streak, swung from the right shoulder to the left hip); false = left diagonal slash (a "\" streak)
  const ang = ((slashRight ? 1 : -1) * WAVE_TILT_DEG * Math.PI) / 180;
  const s = norm(add(scale(right, Math.cos(ang)), scale(up, Math.sin(ang))));
  const n = cross(f, s);

  try {
    dim.playSound("mob.warden.sonic_boom", head, { volume: 1.2, pitch: 1.7 });
    dim.playSound("item.trident.riptide_3", head, { volume: 1.5, pitch: 1.3 });
  } catch {
    // ignore
  }

  const hit = new Set();
  let d = 0;
  let tick = 0;
  let job = -1;
  const end = (at) => {
    try {
      system.clearRun(job);
    } catch {
      // ignore
    }
    if (at) {
      fx(dim, "avaritia:nova_flash", at, { radius: 4 });
      for (let i = 0; i < 8; i++) star(dim, add(at, { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }), 1 + Math.random(), [1, 0.95, 0.7], 0.7);
    }
  };

  job = system.runInterval(() => {
    d += WAVE_SPEED;
    tick++;
    if (d > WAVE_RANGE) {
      end(add(origin, scale(f, WAVE_RANGE)));
      return;
    }
    const c = add(origin, scale(f, d));

    try {
      const b = dim.getBlock({ x: Math.floor(c.x), y: Math.floor(c.y), z: Math.floor(c.z) });
      if (!b) {
        end();
        return;
      }
      if (!CARVE_TERRAIN && b.isSolid) {
        end(c);
        return;
      }
    } catch {
      end();
      return;
    }

    if (CARVE_TERRAIN && !carve(dim, c, s, n, f)) {
      end();
      return;
    }

    drawWave(dim, c, f, s, n, tick);
    // Bright slash streak that lingers for a while
    streak(dim, c, s, 0.18, WAVE_HALF_WIDTH, [1, 1, 1], 1.2);

    let victims = [];
    try {
      victims = dim.getEntities({ location: c, maxDistance: WAVE_HALF_WIDTH + WAVE_SPEED + 3, excludeTypes: EXCLUDED_TYPES });
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
      const v = { x: l.x - c.x, y: l.y + 0.9 - c.y, z: l.z - c.z };
      if (Math.abs(dot(v, f)) > WAVE_SPEED + 1.5) continue;
      if (Math.abs(dot(v, s)) > WAVE_HALF_WIDTH + 1) continue;
      if (Math.abs(dot(v, n)) > WAVE_THICK) continue;
      hit.add(e.id);
      try {
        const src = player.isValid ? { cause: EntityDamageCause.entityAttack, damagingEntity: player } : { cause: EntityDamageCause.entityAttack };
        e.applyDamage(WAVE_DAMAGE, src);
      } catch {
        // target takes no damage
      }
      splitFx(dim, { x: l.x, y: l.y + 1, z: l.z }, s);
    }
  }, 1);
}

world.afterEvents.itemUse.subscribe((ev) => {
  const player = ev.source;
  if (!player || ev.itemStack?.typeId !== SWORD_ID) return;
  const now = system.currentTick;
  const readyAt = cooldownUntil[player.id] ?? 0;
  if (now < readyAt) {
    say(player, `§7Spatial Slash cooldown: ${((readyAt - now) / 20).toFixed(1)}s`);
    return;
  }
  cooldownUntil[player.id] = now + COOLDOWN_TICKS;
  flipSide[player.id] = !flipSide[player.id];
  const right = flipSide[player.id];
  // REUSES the pack's existing regular slash animations (both first and third person have a right diagonal slash "/" = slash_2 and a left diagonal "\\" = slash_1).
  // The small animation only sets the flag v.avsw_skill_cut so the animation controller (avaritia_one_handed.json) plays exactly that slash.
  try {
    player.playAnimation(right !== SWAP_SWING ? "animation.avaritia.sword_cut_right" : "animation.avaritia.sword_cut_left", {
      blendOutTime: 0,
      controller: "avaritia_sword_cut_" + ((Math.random() * 1e6) << 0),
      stopExpression: "q.all_animations_finished"
    });
  } catch {
    // ignore
  }
  system.runTimeout(() => {
    if (player.isValid) launchWave(player, right);
  }, SWING_DELAY_TICKS);
});

world.afterEvents.playerLeave.subscribe((ev) => {
  delete cooldownUntil[ev.playerId];
  delete flipSide[ev.playerId];
});
