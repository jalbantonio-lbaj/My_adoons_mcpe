import * as MC from "@minecraft/server";
import "./compass/index.js";
import { getTarget } from "./compass/needle.js";

/**
 * ===== BIOME COMPASS (avaritia:biome_compass_1 .. _33) =====
 * Menus, searching, markers and the action bar live in ./compass/ (adapted from
 * Advanced Bedrock Compass, MIT - see NOTICE_compass.txt). This file only turns the
 * current target into the needle frame of the Avaritia compass item.
 */
const { world, system, ItemStack, EquipmentSlot } = MC;

const PREFIX = "avaritia:biome_compass_";
const FRAMES = 32;
const NO_TARGET_FRAME = 33;
const UPDATE_TICKS = 2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function transformItem(old, newType) {
  if (old.typeId === newType) return old;
  const it = new ItemStack(newType, old.amount);
  try { it.nameTag = old.nameTag; } catch { /* ignore */ }
  try { it.setLore(old.getLore()); } catch { /* ignore */ }
  try { it.keepOnDeath = old.keepOnDeath; } catch { /* ignore */ }
  try { it.lockMode = old.lockMode; } catch { /* ignore */ }
  try {
    for (const id of old.getDynamicPropertyIds()) it.setDynamicProperty(id, old.getDynamicProperty(id));
  } catch {
    // ignore
  }
  return it;
}

function frameFor(player, target, isOffhand) {
  const yaw = (player.getRotation().y * Math.PI) / 180;
  const dir = { x: -Math.sin(yaw), z: Math.cos(yaw) }; // horizontal facing
  const right = { x: -dir.z, z: dir.x };
  const side = isOffhand ? -1 : 1;
  const ox = player.location.x + side * right.x;
  const oz = player.location.z + side * right.z;
  const x = target.x + 0.5 - ox;
  const z = target.z + 0.5 - oz;
  const norm = Math.hypot(x, z);
  if (norm === 0) return 1;
  let angle = Math.atan2(z / norm, x / norm) - Math.atan2(dir.z, dir.x);
  if (angle < 0) angle += 2 * Math.PI;
  const v = clamp(Math.round((angle / (2 * Math.PI)) * FRAMES), 1, FRAMES);
  return Number.isNaN(v) ? 1 : v;
}

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    let eq;
    try {
      eq = p.getComponent("minecraft:equippable");
    } catch {
      continue;
    }
    if (!eq) continue;
    for (const [equip, isOff] of [[EquipmentSlot.Mainhand, false], [EquipmentSlot.Offhand, true]]) {
      try {
        const slot = eq.getEquipmentSlot(equip);
        if (!slot.hasItem() || !slot.typeId.startsWith(PREFIX)) continue;
        const target = getTarget(p);
        let frame = NO_TARGET_FRAME;
        if (target && target.dimensionId === p.dimension.id) frame = frameFor(p, target, isOff);
        const typeId = PREFIX + frame;
        if (slot.typeId !== typeId) slot.setItem(transformItem(slot.getItem(), typeId));
      } catch {
        // ignore
      }
    }
  }
}, UPDATE_TICKS);
