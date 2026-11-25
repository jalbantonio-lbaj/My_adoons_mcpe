import * as MC from "@minecraft/server";
import { getShooterId, isHeavenArrow } from "./bowOwner.js";

function isInfinitySwordHit(attacker, target) {
  if (!attacker || !target) return false;
  if (attacker.typeId !== "minecraft:player") return false;
  const equip = attacker.getComponent("minecraft:equippable");
  if (!equip) return false;
  const mainHand = equip.getEquipment(MC.EquipmentSlot.Mainhand);
  return !!mainHand && mainHand.typeId === "avaritia:infinity_sword";
}

function killTarget(target, reasonLabel) {
  if (target.hasTag("immortal")) {
    return;
  }
  const health = target.getComponent("minecraft:health");
  if (!health) {
    return;
  }
  try {
    health.setCurrentValue(0);
  } catch (e) {
  }
}

/** MAIN PATH: beforeEvents.entityHurt - runs BEFORE vanilla damage is
 *  applied, fully cancels the original damage (ev.cancel = true) to bypass armor/shield/damage
 *  resistance/i-frames... and then forces health to 0. NOTE: this API is only officially stable
 *  (out of Beta) since @minecraft/server 2.6.0 - if the player's client does not support
 *  that level, this handler may never be called (no error, it just silently
 *  does nothing). That is why there is also a FALLBACK PATH below.
 */
MC.world.beforeEvents.entityHurt.subscribe((ev) => {
  try {
    const attacker = ev.damageSource && ev.damageSource.damagingEntity;
    const target = ev.hurtEntity;
    if (!isInfinitySwordHit(attacker, target)) return;

    ev.cancel = true;

    // beforeEvents run in read-only mode -> state must not be modified right here,
    // defer to system.run() so it runs outside read-only mode before setting health.
    MC.system.run(() => killTarget(target, "beforeEvents.entityHurt"));
  } catch (e) {
    console.warn(e);
  }
});

/** FALLBACK PATH: afterEvents.entityHitEntity - definitely NOT a Beta API
 *  (already used reliably for the skullfire_sword effect below). Runs AFTER vanilla
 *  damage has been applied (the target may have already lost a bit of health normally), so
 *  we only need to check that the target is still alive and then force health to 0 - still achieves
 *  the one-shot effect whether or not the main path (beforeEvents.entityHurt) runs.
 */
MC.world.afterEvents.entityHitEntity.subscribe((eventData) => {
  try {
    const attacker = eventData.damagingEntity;
    const target = eventData.hitEntity;
    if (isInfinitySwordHit(attacker, target)) {
      const health = target.getComponent("minecraft:health");
      if (health && health.currentValue > 0) {
        killTarget(target, "afterEvents.entityHitEntity (fallback)");
      }
    }
  } catch (e) {
    console.warn(e);
  }
});

function isInfinityBowShot(source, projectile) {
  if (!projectile || (projectile.typeId !== "avaritia:heaven_arrow" && projectile.typeId !== "avaritia:heaven_arrow_rain")) return false;
  // FIX (on new request): previously only DIRECTLY SHOT arrows (with a source that is the
  // player) insta-killed, child arrows of the rain-of-arrows effect (heavenArrowRain.js,
  // spawned directly via dimension.spawnEntity, NO source) did not. Now
  // the user wants BOTH to insta-kill equally, so the source filter condition is dropped entirely
  // - all that is needed is the entity "avaritia:heaven_arrow" (only the
  // infinity_bow and its arrow rain use this entity) to insta-kill, regardless of
  // who/what fired/spawned it.
  return true;
}

/** infinity_bow: hitting a target (both direct shots AND rain arrows) with an
 *  avaritia:heaven_arrow arrow kills it instantly (same one-shot mechanism as the
 *  infinity_sword above), regardless of how much the entity's impact_damage
 *  already dealt - always forces health to 0 after the hit, still respecting the
 *  "immortal" tag via killTarget(). */
MC.world.afterEvents.projectileHitEntity.subscribe((eventData) => {
  try {
    const { projectile, source } = eventData;
    if (!isInfinityBowShot(source, projectile)) return;
    const target = eventData.getEntityHit()?.entity;
    if (!target) return;
    // skip if it hit another arrow (e.g. an arrow stuck in the ground)
    if (target.typeId.includes("arrow")) return;
    // FIX: do not kill the shooter themselves (including rain arrows that have no source)
    if (target.id === getShooterId(projectile, source)) return;
    killTarget(target, "afterEvents.projectileHitEntity (infinity bow)");
  } catch (e) {
    console.warn(e);
  }
});

/** FIX: cancel heaven_arrow damage/knockback against the shooter themselves. */
MC.world.beforeEvents.entityHurt.subscribe((ev) => {
  try {
    const proj = ev.damageSource && ev.damageSource.damagingProjectile;
    if (!isHeavenArrow(proj)) return;
    if (ev.hurtEntity.id === getShooterId(proj, ev.damageSource.damagingEntity)) ev.cancel = true;
  } catch (e) {
    console.warn(e);
  }
});

/** Skullfire Sword (skullfire_sword): killing a skeleton with this weapon -> drops an extra wither skeleton skull. */
MC.world.afterEvents.entityHitEntity.subscribe((eventData) => {
  try {
    const hitEntity = eventData.hitEntity;
    const attacker = eventData.damagingEntity;
    if (!attacker || !hitEntity) return;

    const health = hitEntity.getComponent("health")?.currentValue;
    const equipment = attacker.getComponent("equippable");
    if (!equipment) return;
    const item = equipment?.getEquipment("Mainhand");
    if (!item) return;

    const noGM1 = attacker.getGameMode() != "creative";
    if (item.typeId == "avaritia:skullfire_sword" && noGM1) {
      if (hitEntity.typeId.includes("skeleton") && hitEntity.typeId.includes("minecraft:")) {
        if (health <= 0 && attacker.typeId == "minecraft:player") {
          hitEntity.runCommand("summon add:drop_item");
          hitEntity.runCommand("replaceitem entity @e[r=1,type=add:drop_item] slot.inventory 0 wither_skeleton_skull 1");
        }
      }
    }
  } catch (e) {
    console.warn(e);
  }
});

/** PORTED FROM v16.2 -> v27 (unrelated to the 5 removed items): infinity_hammer
 *  (the sneak-click variant of infinity_pickaxe, see itemUse.js) hitting a mob with a
 *  melee attack (entityAttack) knocks it back harder than normal. */
MC.world.afterEvents.entityHurt.subscribe((eventData) => {
  try {
    const hitEntity = eventData.hurtEntity;
    const attacker = eventData.damageSource?.damagingEntity;
    const dmgCause = eventData.damageSource?.cause;
    if (!attacker || !hitEntity) return;

    const equipment = attacker.getComponent("equippable");
    if (!equipment) return;
    const item = equipment?.getEquipment("Mainhand");
    if (!item) return;

    if (item.typeId.endsWith("hammer") && dmgCause == "entityAttack") {
      const { x, z } = attacker.getViewDirection();
      // FIX: the old 4-parameter applyKnockback() (x, z, hStrength, vStrength) of v16.2 was
      // REMOVED in the current "@minecraft/server" - the new signature is applyKnockback(horizontalForce:
      // {x, z}, verticalStrength: number), with x/z ALREADY multiplied by the strength (no separate
      // hStrength parameter). Keeps the strength factors 5 (horizontal) / 3 (vertical) as in v16.2.
      hitEntity.applyKnockback({ x: x * 5, z: z * 5 }, 3);
    }
  } catch (e) {
    console.warn(e);
  }
});
