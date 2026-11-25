import * as MC from "@minecraft/server";

// Stores the owner (shooter) of rain arrows spawned by the script (they have no source).
const owners = new Map(); // arrowId -> ownerId

export function registerOwner(arrow, owner) {
  if (!owner) return;
  try { owners.set(arrow.id, owner.id); } catch (e) {}
  try {
    const p = arrow.getComponent("minecraft:projectile");
    if (p) p.owner = owner;
  } catch (e) {}
  const id = arrow.id;
  MC.system.runTimeout(() => owners.delete(id), 200);
}

/** Returns the shooter id of a projectile (source -> component owner -> map). */
export function getShooterId(projectile, source) {
  if (source) return source.id;
  try {
    const o = projectile.getComponent("minecraft:projectile")?.owner;
    if (o) return o.id;
  } catch (e) {}
  return owners.get(projectile.id);
}

export function isHeavenArrow(projectile) {
  return !!projectile &&
    (projectile.typeId === "avaritia:heaven_arrow" || projectile.typeId === "avaritia:heaven_arrow_rain");
}
