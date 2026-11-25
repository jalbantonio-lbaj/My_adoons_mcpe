import { MolangVariableMap, system } from "@minecraft/server";

/**
 * Avaritia's CUSTOM particle effects (vanilla particles are not used).
 * Definitions live in the RP: particles/avaritia_fx/*.particle.json, textures: textures/particle/avaritia/*.png.
 * The effect size is passed through Molang variables (variable.radius, variable.w ...) so one particle file works
 * for every size. Formulas and approach follow the "Particle Master" set (size/speed written in Molang
 * based on variable.particle_age / variable.particle_lifetime).
 */

/** Spawns a particle with Molang variables (vars: { radius: 6, ... }). */
export function fx(dim, id, loc, vars = {}) {
  try {
    const map = new MolangVariableMap();
    for (const [k, v] of Object.entries(vars)) map.setFloat(`variable.${k}`, v);
    dim.spawnParticle(id, loc, map);
  } catch {
    // chunk not loaded / particle not in the RP
  }
}

/**
 * SHIELD - Nova Burst ("Aegis Nova"): blue-dominant with gold accents: white-gold flash + sparkle star, rotating magic circle
 * and ground rays, blue shock rings (ground + sphere), light pillar, streak sparks, rising gold embers, debris and a soft mist.
 * Every layer scales with `radius`.
 */
export function novaExplosion(dim, loc, radius) {
  const r = Math.max(1, radius);
  const ground = { x: loc.x, y: loc.y + 0.05, z: loc.z };
  const mid = { x: loc.x, y: loc.y + 1, z: loc.z };
  fx(dim, "avaritia:nova_flash", mid, { radius: r });
  fx(dim, "avaritia:nova_star", mid, { radius: r });
  fx(dim, "avaritia:nova_sigil", ground, { radius: r });
  fx(dim, "avaritia:nova_rays", ground, { radius: r });
  fx(dim, "avaritia:nova_pillar", ground, { radius: r });
  fx(dim, "avaritia:nova_shockwave", ground, { radius: r });
  fx(dim, "avaritia:nova_bubble", mid, { radius: r });
  fx(dim, "avaritia:nova_sparks", mid, { radius: r });
  system.runTimeout(() => {
    fx(dim, "avaritia:nova_shockwave", ground, { radius: r * 0.65 });
    fx(dim, "avaritia:nova_embers", ground, { radius: r });
    fx(dim, "avaritia:nova_debris", mid, { radius: r });
  }, 3);
  system.runTimeout(() => {
    fx(dim, "avaritia:nova_shockwave", ground, { radius: r * 0.35 });
    fx(dim, "avaritia:nova_smoke", { x: loc.x, y: loc.y + 0.5, z: loc.z }, { radius: r });
  }, 6);
}

/**
 * Shield Nova Burst explosion (only used by the Infinity Shield): white-hot core flash, plasma fireball, ground + vertical
 * shockwave rings, twin light pillars, radial sparks, an upward spark fountain, glints, embers, dust ring, debris and smoke.
 * Every layer scales with `radius` and is staggered in time so the blast builds, peaks and then lingers.
 */
export function shieldNovaExplosion(dim, loc, radius) {
  const r = Math.max(1, radius);
  const ground = { x: loc.x, y: loc.y + 0.05, z: loc.z };
  const mid = { x: loc.x, y: loc.y + 0.2, z: loc.z };
  const chest = { x: loc.x, y: loc.y + 1, z: loc.z };
  const v = { radius: r };
  // t = 0: the blast itself
  fx(dim, "avaritia:snova_core", mid, v);
  fx(dim, "avaritia:snova_fireball", chest, v);
  fx(dim, "avaritia:snova_ring_ground", ground, v);
  fx(dim, "avaritia:snova_ring_xy", mid, v);
  fx(dim, "avaritia:snova_ring_yz", mid, v);
  fx(dim, "avaritia:snova_bubble", mid, v);
  fx(dim, "avaritia:snova_pillar", ground, v);
  fx(dim, "avaritia:snova_pillar_core", ground, v);
  fx(dim, "avaritia:snova_sparks", chest, v);
  fx(dim, "avaritia:snova_fountain", ground, v);
  fx(dim, "avaritia:snova_glints", chest, v);
  fx(dim, "avaritia:snova_dust", ground, v);
  fx(dim, "avaritia:snova_debris", chest, v);
  // t = 3 ticks: trailing ring + embers start lingering
  system.runTimeout(() => {
    fx(dim, "avaritia:snova_ring_ground2", ground, v);
    fx(dim, "avaritia:snova_embers", chest, v);
  }, 3);
  // t = 6 ticks: smoke column rises
  system.runTimeout(() => {
    fx(dim, "avaritia:snova_smoke", { x: loc.x, y: loc.y + 0.5, z: loc.z }, v);
  }, 6);
}

/**
 * TRIDENT - Storm Strike: violet-white flash + lightning bolts raining on a disc, ground cracks, violet and sea-blue
 * shock rings, a water crown splash, electric sparks and a stormy mist. Different colours/shapes from the shield's Nova.
 */
export function stormExplosion(dim, loc, radius) {
  const r = Math.max(1, radius);
  const ground = { x: loc.x, y: loc.y + 0.05, z: loc.z };
  const mid = { x: loc.x, y: loc.y + 1, z: loc.z };
  fx(dim, "avaritia:storm_flash", mid, { radius: r });
  fx(dim, "avaritia:storm_star", mid, { radius: r });
  fx(dim, "avaritia:storm_pillar", ground, { radius: r });
  fx(dim, "avaritia:storm_cracks", ground, { radius: r });
  fx(dim, "avaritia:storm_wave", ground, { radius: r });
  fx(dim, "avaritia:storm_sparks", mid, { radius: r });
  fx(dim, "avaritia:storm_bolt", ground, { radius: r });
  system.runTimeout(() => {
    fx(dim, "avaritia:storm_wave_sea", ground, { radius: r });
    fx(dim, "avaritia:storm_splash", ground, { radius: r });
    fx(dim, "avaritia:storm_bolt", ground, { radius: r });
  }, 3);
  system.runTimeout(() => {
    fx(dim, "avaritia:storm_wave", ground, { radius: r * 0.55 });
    fx(dim, "avaritia:storm_bolt", ground, { radius: r * 0.8 });
    fx(dim, "avaritia:storm_mist", { x: loc.x, y: loc.y + 0.5, z: loc.z }, { radius: r });
  }, 6);
}

/** Small impact (Spirit Trident hit / block / recall). */
export function hitFx(dim, loc) {
  fx(dim, "avaritia:nova_flash", loc, { radius: 0.8 });
  fx(dim, "avaritia:nova_sparks", loc, { radius: 1.2 });
}

/** A segment of energy beam along direction dir: width `width`, half length `halfLength`. */
export function beamSegment(dim, loc, dir, width, halfLength) {
  fx(dim, "avaritia:beam_segment", loc, { dx: dir.x, dy: dir.y, dz: dir.z, w: width, l: halfLength });
}

/** Spirit Trident guard effect: a glowing shield (ring + glowing disc) with a flash and sparks. */
export function guardFx(dim, loc, size = 1.8) {
  fx(dim, "avaritia:guard_ring", loc, { size });
  fx(dim, "avaritia:guard_glow", loc, { size });
  fx(dim, "avaritia:nova_flash", loc, { radius: 0.9 });
  fx(dim, "avaritia:nova_sparks", loc, { radius: 1.4 });
}

/**
 * Muzzle flash when Devour is activated. The sphere itself is the ptl:void_sphere_beam particle spawned by infinityBeams.js every tick.
 */
export function beamMuzzle(dim, origin) {
  fx(dim, "avaritia:devour_burst", origin, { r: 4 });
}
