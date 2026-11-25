// Neon Halo full set: a 3x3 shockwave centered on the wearer. The damage is calculated from the wearer's own speed
// (blocks per tick, player.getVelocity()), so standing still / walking = no damage, sprinting and flying fast = hurts.
//
//   damage = BASE_DAMAGE + (speed - MIN_SPEED) * DAMAGE_PER_SPEED          (speed in blocks/tick; walking ~0.22, sprint ~0.28, neon flight 1+)
//
// Tune everything with the constants below.
import { world, system, EquipmentSlot, EntityDamageCause } from "@minecraft/server";
import { isScriptPhasing } from "./scriptFlight.js";

const SET = [
  [EquipmentSlot.Head,  "halo:neon_helmet"],
  [EquipmentSlot.Chest, "halo:neon_chestplate"],
  [EquipmentSlot.Legs,  "halo:neon_leggings"],
  [EquipmentSlot.Feet,  "halo:neon_boots"],
];
const REQUIRE_FULL_SET = true;   // false = the zone works with only the chestplate on
const HALF_SIZE = 1.5;           // 3x3 zone: +-1.5 blocks in X and Z around the player (centered on the player)
const Y_BELOW = 1.0;             // zone height: from 1 block under the feet ...
const Y_ABOVE = 2.8;             // ... to just above the head
const MIN_SPEED = 0.30;          // blocks/tick below which nothing happens (a sprint is ~0.28)
const BASE_DAMAGE = 100;         // minimum damage of every hit once the speed is above MIN_SPEED
const DAMAGE_PER_SPEED = 12;     // extra damage per 1 block/tick above MIN_SPEED (1 damage = half a heart)
const MAX_DAMAGE = Infinity;     // no cap (set a number to limit it)
const HIT_COOLDOWN_TICKS = 8;    // same target can be hit again after this many ticks
const HIT_PLAYERS = false;       // true = also hurt other players in the zone
const SPARE_PETS = true;         // tamed pets (dogs, cats, horses, parrots...) are never hurt by the dash

// tamed animals carry the minecraft:is_tamed component
function isPet(e) {
  try { return !!e.getComponent("minecraft:is_tamed"); } catch { return false; }
}

const lastHit = new Map(); // entity.id -> tick
let tick = 0;

function wearsSet(player) {
  const eq = player.getComponent("minecraft:equippable");
  if (!eq) return false;
  const need = REQUIRE_FULL_SET ? SET : [SET[1]];
  for (const [slot, id] of need) {
    if (eq.getEquipment(slot)?.typeId !== id) return false;
  }
  return true;
}

system.runInterval(() => {
  tick++;
  for (const player of world.getAllPlayers()) {
    try {
      if (!wearsSet(player) || isScriptPhasing(player)) continue;
      const v = player.getVelocity();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed <= MIN_SPEED) continue;
      const damage = Math.min(MAX_DAMAGE, BASE_DAMAGE + (speed - MIN_SPEED) * DAMAGE_PER_SPEED);
      if (damage <= 0) continue;

      const p = player.location;
      for (const e of player.dimension.getEntities({ location: p, maxDistance: HALF_SIZE * 1.5 + 1 })) {
        if (e.id === player.id) continue;
        if (!HIT_PLAYERS && e.typeId === "minecraft:player") continue;
        if (SPARE_PETS && isPet(e)) continue;
        if (!e.getComponent("minecraft:health")) continue;
        const l = e.location;
        if (Math.abs(l.x - p.x) > HALF_SIZE || Math.abs(l.z - p.z) > HALF_SIZE) continue; // 3x3 square
        if (l.y < p.y - Y_BELOW || l.y > p.y + Y_ABOVE) continue;
        const prev = lastHit.get(e.id);
        if (prev !== undefined && tick - prev < HIT_COOLDOWN_TICKS) continue;
        lastHit.set(e.id, tick);
        try { e.applyDamage(damage, { cause: EntityDamageCause.entityAttack, damagingEntity: player }); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  if (tick % 200 === 0) for (const [id, t] of lastHit) if (tick - t > 200) lastHit.delete(id); // cleanup
}, 1);
