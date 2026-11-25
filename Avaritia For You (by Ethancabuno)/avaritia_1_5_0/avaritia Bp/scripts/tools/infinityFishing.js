import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";

/**
 * ===== INFINITY FISHING ROD - cast, line, bite, reel-in =====
 * Mechanics (rewards stay in infinityUtility.js and are passed in as `onCatch`):
 *   1. Use the rod -> the hook is thrown in an arc and a visible LINE (chain of avaritia:infinity_rope
 *      entities, drawn by the resource pack) is pulled from the rod tip to the hook.
 *   2. The hook floats on water AND lava, the line sags and follows the player.
 *   3. After a short wait something bites: the hook shakes, splashes and the action bar says "Pull!".
 *   4. Use the rod while it bites -> reel-in challenge (jump / sneak prompts). Win = catch.
 *      Too slow or a missed prompt = the fish gets away.
 *   5. Use the rod before a bite = reel the line back in. The line is also cut if you unequip the rod,
 *      die, change dimension or walk too far away.
 * No bait, no durability (it is the infinity rod).
 */

const ROD_ID = "avaritia:infinity_fishing_rod";
const HOOK_ID = "avaritia:infinity_hook";
const ROPE_ID = "avaritia:infinity_rope";
const ROD_CAST_ID = "avaritia:infinity_fishing_rod_cast"; // same rod, shown without the hanging line while it is cast

// Where the line leaves the rod, relative to the player's eyes: x = right(-)/left(+), y = up, z = forward.
// Same values as FISHING++ (x -0.2, y 0.1, z 0.4). Tweak these if the line still does not start exactly at the rod tip.
const ROD_TIP_OFFSET = { x: -0.2, y: 0.1, z: 0.4 };

const MAX_DISTANCE = 40;       // line snaps further than this
const MAX_SEGMENTS = 28;       // rope entities per line
const BITE_MIN = 40;           // ticks of waiting before a bite
const BITE_MAX = 110;
const BITE_WINDOW = 50;        // ticks you have to pull after the hook shakes
const REEL_ROUNDS = 3;         // prompts in the reel-in challenge (0 = instant catch)
const REEL_ROUND_TICKS = 50;   // time per prompt
const NO_LIQUID_TIMEOUT = 160; // hook landed on dry ground

const LIQUIDS = new Set(["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"]);

/** playerId -> session */
const sessions = new Map();
const lastUse = new Map();

// ------------------------------------------------------------------ small vector helpers
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
const rad = (d) => (d * Math.PI) / 180;

function actionbar(player, text) {
  try { player.onScreenDisplay.setActionBar(text); } catch (e) {}
}
function holdingRod(player) {
  try {
    const id = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
    return id === ROD_ID || id === ROD_CAST_ID;
  } catch (e) { return false; }
}

/** Swaps the rod in an inventory slot between the normal and the "cast" variant (keeps name, lore, enchants). */
function swapRod(player, slot, toId) {
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    const old = inv?.getItem(slot);
    if (!old || old.typeId === toId || (old.typeId !== ROD_ID && old.typeId !== ROD_CAST_ID)) return;
    const n = new ItemStack(toId, 1);
    try { n.nameTag = old.nameTag; } catch (e) {}
    try { n.setLore(old.getLore()); } catch (e) {}
    try {
      const oe = old.getComponent("minecraft:enchantable"), ne = n.getComponent("minecraft:enchantable");
      if (oe && ne) ne.addEnchantments(oe.getEnchantments());
    } catch (e) {}
    inv.setItem(slot, n);
  } catch (e) {}
}
function blockAt(dim, p) {
  try { return dim.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }); } catch (e) { return undefined; }
}
function inLiquid(hook) {
  const b = blockAt(hook.dimension, hook.location);
  return !!b && LIQUIDS.has(b.typeId);
}
function isLavaAt(hook) {
  const b = blockAt(hook.dimension, hook.location);
  return !!b && b.typeId.includes("lava");
}

/** Where the line leaves the rod: a little right / up / forward of the player's eyes. */
function rodTip(player) {
  const head = player.getHeadLocation();
  const rot = player.getRotation();
  const yaw = rad(rot.y), pitch = rad(rot.x);
  const off = ROD_TIP_OFFSET;
  const right = mul({ x: Math.cos(yaw), y: 0, z: Math.sin(yaw) }, off.x);
  const up = mul({ x: -Math.sin(yaw) * Math.sin(pitch), y: Math.cos(pitch), z: Math.cos(yaw) * Math.sin(pitch) }, off.y);
  const fwd = mul({ x: -Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }, off.z);
  return add(add(add(head, right), up), fwd);
}

// ------------------------------------------------------------------ rope (the visible line)
function spawnRope(s, p) {
  try {
    const e = s.player.dimension.spawnEntity(ROPE_ID, p);
    e.setProperty("avaritia:x", p.x); e.setProperty("avaritia:y", p.y); e.setProperty("avaritia:z", p.z);
    e.setProperty("avaritia:target_x", p.x); e.setProperty("avaritia:target_y", p.y); e.setProperty("avaritia:target_z", p.z);
    return e;
  } catch (err) { return undefined; }
}

/** Pushes the logical rope positions (s.pos) to the rope entities. Entity i draws a bar from pos[i] to pos[i+1]. */
function syncRopes(s) {
  while (s.ropes.length < s.pos.length) {
    const e = spawnRope(s, s.pos[s.ropes.length]);
    if (!e) break;
    s.ropes.push(e); s.cache.push(null);
  }
  const n = Math.min(s.ropes.length, s.pos.length);
  for (let i = 0; i < n; i++) {
    let e = s.ropes[i];
    if (!e?.isValid) continue;
    const p = s.pos[i];
    const t = i < n - 1 ? s.pos[i + 1] : p;
    // The client draws the bar relative to the entity's position. Teleporting an entity makes the client slide it
    // over a few ticks while the properties jump at once, so the line start visibly lags behind the rod tip
    // (FISHING++ never moves its rope entities). So when a rope entity has drifted away, REPLACE it with a fresh one
    // spawned exactly at its point instead of teleporting it.
    try {
      const el = e.location;
      if (Math.abs(el.x - p.x) + Math.abs(el.y - p.y) + Math.abs(el.z - p.z) > 3) {
        const ne = spawnRope(s, p);
        if (ne) {
          try { e.remove(); } catch (err) {}
          s.ropes[i] = ne; e = ne; s.cache[i] = null;
        }
      }
    } catch (err) {}
    const key = [p.x, p.y, p.z, t.x, t.y, t.z, i < n - 1];
    const c = s.cache[i];
    if (c && c.every((v, k) => (k === 6 ? v === key[k] : Math.abs(v - key[k]) < 0.003))) continue;
    s.cache[i] = key;
    try {
      e.setProperty("avaritia:x", p.x); e.setProperty("avaritia:y", p.y); e.setProperty("avaritia:z", p.z);
      e.setProperty("avaritia:target_x", t.x); e.setProperty("avaritia:target_y", t.y); e.setProperty("avaritia:target_z", t.z);
      e.setProperty("avaritia:initialized", i < n - 1);
    } catch (err) {}
  }
}

/** Makes the line hang between the rod tip and the hook. */
function relaxRope(s, taut) {
  const n = s.pos.length;
  if (n < 3) return;
  const a = s.pos[0], b = s.pos[n - 1];
  const dist = len(sub(a, b));
  let droop = Math.min(3, Math.max(0.3, dist * 0.1));
  if (taut) droop *= 0.2;
  for (let i = 1; i < n - 1; i++) {
    const t = i / (n - 1);
    const target = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - droop * 4 * t * (1 - t),
      z: a.z + (b.z - a.z) * t,
    };
    const p = s.pos[i];
    s.pos[i] = { x: p.x + (target.x - p.x) * 0.35, y: p.y + (target.y - p.y) * 0.35, z: p.z + (target.z - p.z) * 0.35 };
  }
}

// ------------------------------------------------------------------ session lifecycle
function stopShake(player) {
  try { player.runCommand("camerashake stop @s"); } catch (e) {}
}

function endSession(s, message, sound) {
  sessions.delete(s.player.id);
  if (s.player.isValid) swapRod(s.player, s.slot, ROD_ID);
  for (const r of s.ropes) { try { if (r?.isValid) r.remove(); } catch (e) {} }
  try { if (s.hook?.isValid) s.hook.remove(); } catch (e) {}
  if (s.player.isValid) {
    stopShake(s.player);
    if (message) actionbar(s.player, message);
    if (sound) { try { s.player.playSound(sound); } catch (e) {} }
  }
}

function castRod(player, onCatch) {
  const dir = player.getViewDirection();
  const start = add(player.getHeadLocation(), dir);
  let hook;
  try { hook = player.dimension.spawnEntity(HOOK_ID, start); } catch (e) { return; }
  try { hook.getComponent("minecraft:projectile").owner = player; } catch (e) {}
  const tip = rodTip(player);
  const s = {
    player, hook, onCatch,
    phase: "flight", tick: 0, vel: mul(dir, 1),
    pos: [tip, { ...start }], ropes: [], cache: [],
    slot: player.selectedSlotIndex,
    landedAt: -1, hitBlock: false, biteAt: -1, biteEnd: -1, nextNibble: 0, reel: undefined,
  };
  sessions.set(player.id, s);
  swapRod(player, s.slot, ROD_CAST_ID);
  try { player.playSound("random.bow", { pitch: 0.45 }); } catch (e) {}
}

world.afterEvents.projectileHitBlock.subscribe((ev) => {
  for (const s of sessions.values()) if (s.hook?.isValid && s.hook.id === ev.projectile?.id) s.hitBlock = true;
});

function splash(hook, count) {
  const lava = isLavaAt(hook);
  for (let i = 0; i < count; i++) {
    try { hook.dimension.spawnParticle(lava ? "minecraft:lava_particle" : "minecraft:water_splash_particle", add(hook.location, { x: (Math.random() - 0.5) * 0.6, y: 0.2, z: (Math.random() - 0.5) * 0.6 })); } catch (e) {}
  }
}

function startBite(s) {
  s.phase = "bite";
  s.biteEnd = system.currentTick + BITE_WINDOW;
  try { s.hook.triggerEvent("avaritia:shaking"); } catch (e) {}
  try { s.hook.applyImpulse({ x: 0, y: -0.1, z: 0 }); } catch (e) {}
  splash(s.hook, 6);
  try { s.hook.dimension.playSound(isLavaAt(s.hook) ? "liquid.lavapop" : "random.splash", s.hook.location, { volume: 0.7 }); } catch (e) {}
  actionbar(s.player, "§bSomething bit! §fUse the rod to pull!");
}

function newPrompt(s) {
  const need = Math.random() < 0.5 ? "jump" : "sneak";
  s.reel.need = need;
  s.reel.deadline = system.currentTick + REEL_ROUND_TICKS;
  s.reel.armed = false; // the key must be released first
}
function promptDone(s) {
  const p = s.player;
  return s.reel.need === "jump" ? !!p.isJumping : !!p.isSneaking;
}

function beginReel(s) {
  if (REEL_ROUNDS <= 0) return finishCatch(s);
  s.phase = "reel";
  try { s.hook.triggerEvent("avaritia:pulling"); } catch (e) {}
  s.reel = { round: 0, total: REEL_ROUNDS, need: "jump", deadline: 0, armed: false };
  newPrompt(s);
}

function finishCatch(s) {
  const player = s.player;
  const lava = isLavaAt(s.hook);
  const loc = { ...s.hook.location };
  splash(s.hook, 12);
  try { s.hook.dimension.playSound(lava ? "liquid.lavapop" : "random.splash", loc, { volume: 0.8 }); } catch (e) {}
  const cb = s.onCatch;
  endSession(s, undefined, "random.levelup");
  try { cb?.(player, loc, lava); } catch (e) {}
}

function tickSession(s, now) {
  const player = s.player;
  if (!player.isValid || !s.hook?.isValid) return endSession(s);
  if (!holdingRod(player)) return endSession(s);
  if (player.dimension.id !== s.hook.dimension.id) return endSession(s);
  if (len(sub(player.location, s.hook.location)) > MAX_DISTANCE) return endSession(s, "§cThe line snapped!", "random.break");

  s.tick++;
  const hookPos = add(s.hook.location, { x: 0, y: 0.2, z: 0 });

  // ---------- flight: throw in an arc and lay the line
  if (s.phase === "flight") {
    s.hook.clearVelocity();
    s.hook.applyImpulse(s.vel);
    s.vel = mul(sub(s.vel, { x: 0, y: 0.05, z: 0 }), 0.99);
    s.pos[0] = rodTip(player);
    if (s.tick % 2 === 0 && s.pos.length < MAX_SEGMENTS) s.pos.splice(s.pos.length - 1, 0, { ...hookPos });
    s.pos[s.pos.length - 1] = hookPos;
    syncRopes(s);
    const landed = s.tick > 2 && (inLiquid(s.hook) || s.hitBlock || s.hook.isOnGround);
    if (landed || s.tick > 100) {
      s.phase = "wait";
      s.landedAt = now;
      try { s.hook.clearVelocity(); } catch (e) {}
      s.biteAt = -1;
    }
    return;
  }

  // ---------- floating: line follows the player
  s.pos[0] = rodTip(player);
  s.pos[s.pos.length - 1] = hookPos;
  relaxRope(s, s.phase === "bite" || s.phase === "reel");
  syncRopes(s);

  if (s.phase === "wait") {
    if (!inLiquid(s.hook)) {
      if (now - s.landedAt > NO_LIQUID_TIMEOUT) endSession(s, "§7Nothing to catch here");
      return;
    }
    if (s.biteAt < 0) s.biteAt = now + BITE_MIN + Math.floor(Math.random() * (BITE_MAX - BITE_MIN));
    if (now >= s.nextNibble) {
      s.nextNibble = now + 15 + Math.floor(Math.random() * 15);
      if (Math.random() < 0.55) {
        splash(s.hook, 2);
        try { s.hook.applyImpulse({ x: 0, y: -0.03, z: 0 }); } catch (e) {}
      }
    }
    if (now >= s.biteAt) startBite(s);
    return;
  }

  if (s.phase === "bite") {
    if (now % 4 === 0) splash(s.hook, 1);
    if (now % 10 === 0) {
      try { s.hook.applyImpulse({ x: (Math.random() - 0.5) * 0.06, y: -0.06, z: (Math.random() - 0.5) * 0.06 }); } catch (e) {}
    }
    if (now > s.biteEnd) {
      endSession(s, "§cThe fish got away...", "note.bass");
    }
    return;
  }

  if (s.phase === "reel") {
    const r = s.reel;
    if (now % 10 === 0) { try { player.runCommand("camerashake add @s 0.04 0.4 positional"); } catch (e) {} }
    if (now % 5 === 0) {
      try { s.hook.applyImpulse({ x: (Math.random() - 0.5) * 0.1, y: -0.05, z: (Math.random() - 0.5) * 0.1 }); } catch (e) {}
      splash(s.hook, 2);
    }
    const done = promptDone(s);
    if (!done) r.armed = true;
    if (r.armed && done) {
      r.round++;
      try { player.playSound("note.bell"); } catch (e) {}
      if (r.round >= r.total) return finishCatch(s);
      newPrompt(s);
      return;
    }
    if (now > r.deadline) {
      endSession(s, "§cThe fish got away...", "note.bass");
      return;
    }
    if (now % 3 === 0) {
      const left = Math.max(0, Math.ceil((r.deadline - now) / 20));
      actionbar(player, `§6Reel ${r.round + 1}/${r.total}  §f» §b${r.need === "jump" ? "JUMP" : "SNEAK"}§f!  §7${left}s`);
    }
  }
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const s of [...sessions.values()]) {
    try { tickSession(s, now); } catch (e) { try { endSession(s); } catch (e2) {} }
  }
}, 1);

world.afterEvents.playerLeave.subscribe((ev) => {
  const s = sessions.get(ev.playerId);
  if (s) { try { endSession(s); } catch (e) {} }
  lastUse.delete(ev.playerId);
});

// Safety net: a "cast" rod with no line out (crash, reload, dropped session) goes back to the normal rod
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (sessions.has(player.id)) continue;
    try {
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (!inv) continue;
      for (let i = 0; i < inv.size; i++) {
        if (inv.getItem(i)?.typeId === ROD_CAST_ID) swapRod(player, i, ROD_ID);
      }
    } catch (e) {}
  }
}, 20);

// Hooks / rope pieces left behind by a crash or reload are removed on startup
system.runTimeout(() => {
  for (const id of ["overworld", "nether", "the_end"]) {
    try {
      const dim = world.getDimension(id);
      for (const type of [HOOK_ID, ROPE_ID]) for (const e of dim.getEntities({ type })) { try { e.remove(); } catch (err) {} }
    } catch (e) {}
  }
}, 60);

/**
 * Called when the player uses the rod.
 *  - no line out        -> cast
 *  - fish is biting     -> start the reel-in challenge
 *  - otherwise          -> reel the line back in
 * onCatch(player, location, inLava) is called when a fish is caught (the rewards live there).
 */
export function useRod(player, onCatch) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -99) < 6) return;
  lastUse.set(player.id, now);
  const s = sessions.get(player.id);
  if (!s) return castRod(player, onCatch);
  if (s.phase === "bite") return beginReel(s);
  if (s.phase === "reel") return;
  endSession(s, "§7Reeled in", "random.click");
}
