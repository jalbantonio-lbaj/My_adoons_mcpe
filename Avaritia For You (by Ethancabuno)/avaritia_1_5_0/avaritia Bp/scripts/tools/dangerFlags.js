import { Player, system, world } from "@minecraft/server";

/**
 * Mechanism for detecting HARMFUL attackers against PLAYERS and PETS (added on top of, not replacing, the old mechanism).
 *
 *  - When a PLAYER or a PET attacks a player (or that player's pet),
 *    the attacker gets a DANGER FLAG for 5 minutes, tracked SEPARATELY for the attacked player.
 *  - Devour (infinity crossbow) can hit any player; pets can NOT be hit,
 *    unless they carry a danger flag against the shooter themselves (they attacked the shooter / the shooter's pet).
 *  - Spirit Tridents still attack mobs as before; when a pet attacks, the tridents only guard and do not retaliate.
 *  - Regular mobs (not players / pets) keep the old behavior and do not use this flag.
 */

export const DANGER_TICKS = 20 * 60 * 5; // 5 minutes
const PET_OWNER_FALLBACK_RADIUS = 32; // could not read the pet's owner: treat it as targeting a nearby player

const SKIP_TYPES = new Set(["avaritia:infinity_trident_spirit"]);
const flagged = new Map(); // attackerId -> Map(victimPlayerId -> expiry tick)

/** Pet: tamed (wolf, cat, parrot, horse, donkey...). */
export function isPet(e) {
  try {
    if (!e || !e.isValid) return false;
    const tame = e.getComponent("minecraft:tameable");
    if (tame && tame.isTamed) return true;
    const mount = e.getComponent("minecraft:tamemount");
    if (mount && mount.isTamed) return true;
    if (e.getComponent("minecraft:is_tamed")) return true;
  } catch {
    // could not read the component -> treat as not a pet
  }
  return false;
}

/** List of player ids "protected" by the victim: the player themselves, or the pet's owner. */
function protectedPlayerIds(victim) {
  if (victim instanceof Player) return [victim.id];
  if (!isPet(victim)) return [];
  try {
    const tame = victim.getComponent("minecraft:tameable");
    const ownerId = tame?.tamedToPlayerId ?? tame?.tamedToPlayer?.id;
    if (ownerId) return [ownerId];
  } catch {
    // ignore
  }
  try {
    return victim.dimension.getPlayers({ location: victim.location, maxDistance: PET_OWNER_FALLBACK_RADIUS }).map((p) => p.id);
  } catch {
    return [];
  }
}

/** Flags `attacker` (player / pet) as dangerous to player `victimPlayerId` for 5 minutes. */
export function flagDangerous(attacker, victimPlayerId) {
  try {
    if (!attacker || !attacker.isValid || SKIP_TYPES.has(attacker.typeId)) return;
    if (!(attacker instanceof Player) && !isPet(attacker)) return;
    if (attacker.id === victimPlayerId) return;
    let m = flagged.get(attacker.id);
    if (!m) {
      m = new Map();
      flagged.set(attacker.id, m);
    }
    m.set(victimPlayerId, system.currentTick + DANGER_TICKS);
  } catch {
    // ignore
  }
}

/** Is `entity` carrying a danger flag against player `playerId`? */
export function isFlaggedAgainst(entity, playerId) {
  try {
    const m = flagged.get(entity.id);
    if (!m) return false;
    const until = m.get(playerId);
    if (until === undefined) return false;
    if (system.currentTick > until) {
      m.delete(playerId);
      if (m.size === 0) flagged.delete(entity.id);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Use beforeEvents so the flag is still recorded even when the hit is blocked (trident blocks the hit) or deals no damage.
world.beforeEvents.entityHurt.subscribe((data) => {
  try {
    const attacker = data.damageSource?.damagingEntity;
    const victim = data.hurtEntity;
    if (!attacker || !victim || attacker.id === victim.id) return;
    if (!(attacker instanceof Player) && !isPet(attacker)) return;
    for (const pid of protectedPlayerIds(victim)) flagDangerous(attacker, pid);
  } catch {
    // ignore
  }
});

world.afterEvents.entityDie.subscribe((data) => {
  try {
    flagged.delete(data.deadEntity.id);
  } catch {
    // ignore
  }
});

// Clean up expired flags every 10 seconds.
system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, m] of flagged) {
    for (const [pid, until] of m) if (now > until) m.delete(pid);
    if (m.size === 0) flagged.delete(id);
  }
}, 200);
