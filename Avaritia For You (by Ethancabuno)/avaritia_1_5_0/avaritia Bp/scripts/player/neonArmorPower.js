// NEON HALO - armor power: per-piece effects + FULL SET bonus.
// - Each effect lasts 6000 s and is refreshed every 5 s, so it never drops near the "flicker" zone (<10 s left).
// - Taking a piece off removes that piece's effects IMMEDIATELY (worn pieces are checked every few ticks).
// - Durability: the engine caps max_durability at 32767, so wear is additionally divided in script so every piece
//   lasts 1000x its original durability.
import * as MC from "@minecraft/server";
const { world, system } = MC;

const IDS = {
  head: "halo:neon_helmet",
  chest: "halo:neon_chestplate",
  legs: "halo:neon_leggings",
  feet: "halo:neon_boots",
};
const SLOTS = {
  head: MC.EquipmentSlot.Head, chest: MC.EquipmentSlot.Chest,
  legs: MC.EquipmentSlot.Legs, feet: MC.EquipmentSlot.Feet,
};

const CHECK_TICKS = 5;        // how often worn pieces are checked (fast enough that removal feels instant)
const REFRESH_TICKS = 100;    // re-apply every 5 s
const DURATION = 6000 * 20;   // 6000 s in ticks

// effect, amplifier (0 = level I)
const PER_PIECE = {
  head:  [["night_vision", 0], ["water_breathing", 0]],
  chest: [["resistance", 1], ["regeneration", 1]],
  legs:  [["jump_boost", 2], ["fire_resistance", 0]],
  feet:  [["speed", 9]],   // Speed X - far beyond the infinity boots (Speed V)
};
// extra bonus only when ALL FOUR neon pieces are worn
const FULL_SET = [
  ["resistance", 3],       // Resistance IV (replaces the chest's II)
  ["regeneration", 2],     // Regeneration III
  ["strength", 2],         // Strength III
  ["health_boost", 4],     // +20 max health (10 extra hearts)
  ["saturation", 0],
];

// ----- durability: 1000x the original value -----
const MAX_DUR = 32767; // engine limit for max_durability
const ORIG_DUR = { head: 4200, chest: 6100, legs: 5700, feet: 4900 };
const DURABILITY_MULT = 1000;

const state = new Map(); // player.id -> { mask, lastRefresh, dur: { key: { last, acc } } }

function desired(has) {
  const m = new Map(); // effect -> highest amplifier
  const add = (list) => { for (const [e, a] of list) if (!m.has(e) || m.get(e) < a) m.set(e, a); };
  let worn = 0;
  for (const k of Object.keys(has)) if (has[k]) { add(PER_PIECE[k]); worn++; }
  if (worn === 4) add(FULL_SET);
  return m;
}

function applyAll(player, eff) {
  for (const [e, a] of eff) {
    try { player.addEffect(e, DURATION, { amplifier: a, showParticles: false }); } catch { /* ignore */ }
  }
}

function wearScale(key, equipment, st) {
  // Divide wear so the piece lasts DURABILITY_MULT x its original durability.
  let item;
  try { item = equipment.getEquipment(SLOTS[key]); } catch { return; }
  if (!item || item.typeId !== IDS[key]) { delete st.dur[key]; return; }
  const dur = item.getComponent("minecraft:durability");
  if (!dur) return;
  const cur = dur.damage;
  const rec = st.dur[key];
  if (!rec) { st.dur[key] = { last: cur, acc: 0 }; return; }
  const d = cur - rec.last;
  if (d <= 0) { rec.last = cur; return; } // repaired or unchanged
  const hitsPerPoint = (ORIG_DUR[key] * DURABILITY_MULT) / MAX_DUR; // game hits needed for 1 real point of damage
  rec.acc += d;
  const points = Math.floor(rec.acc / hitsPerPoint);
  rec.acc -= points * hitsPerPoint;
  const target = Math.min(rec.last + points, dur.maxDurability - 1);
  if (target !== cur) {
    dur.damage = target;
    try { equipment.setEquipment(SLOTS[key], item); } catch { /* ignore */ }
  }
  rec.last = target;
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    let eq;
    try { eq = player.getComponent("minecraft:equippable"); } catch { continue; }
    if (!eq) continue;

    const has = {};
    let mask = 0, i = 0;
    for (const k of Object.keys(SLOTS)) {
      let id;
      try { id = eq.getEquipment(SLOTS[k])?.typeId; } catch { id = undefined; }
      has[k] = id === IDS[k];
      if (has[k]) mask |= (1 << i);
      i++;
    }

    let st = state.get(player.id);
    if (!st) { st = { mask: 0, lastRefresh: -1e9, dur: {} }; state.set(player.id, st); }

    const prevHas = {};
    i = 0;
    for (const k of Object.keys(SLOTS)) { prevHas[k] = !!(st.mask & (1 << i)); i++; }

    if (mask !== st.mask) {
      // something was put on / taken off: strip effects that are no longer granted, then apply the new set at once
      const before = desired(prevHas), after = desired(has);
      for (const [e, a] of before) {
        if (!after.has(e) || after.get(e) !== a) {
          try { player.removeEffect(e); } catch { /* ignore */ }
        }
      }
      st.mask = mask;
      st.lastRefresh = -1e9; // force a refresh below
    }

    if (mask === 0) { st.dur = {}; continue; }

    if (now - st.lastRefresh >= REFRESH_TICKS) {
      applyAll(player, desired(has));
      st.lastRefresh = now;
    }

    for (const k of Object.keys(SLOTS)) if (has[k]) wearScale(k, eq, st);
  }
}, CHECK_TICKS);

world.afterEvents.playerLeave.subscribe((ev) => { state.delete(ev.playerId); });
