/**
 * Target tracking - the bit that tells the player which way to walk.
 *
 * Direction comes from two places: the locator bar marker (see waypoints.js)
 * and the action bar, which every couple of ticks shows the target's name,
 * distance and a text arrow with the angle to turn. Both are shown only
 * while the compass item is held.
 *
 * Target state is per player rather than one module-level interval shared by
 * everyone, so one player's search cannot cancel another's.
 */

import { EquipmentSlot, EntityComponentTypes, ItemStack, system, world } from "@minecraft/server";
import { isEnabled } from "./settings.js";

export const COMPASS_ITEM = "avaritia:biome_compass_1";
export const COMPASS_PREFIX = "avaritia:biome_compass_";

/** How often the bearing is re-read. 2 ticks is smooth and cheap. */
const UPDATE_INTERVAL = 2;

/** Half-width, in degrees, of the "dead ahead" band shown as a plain arrow. */
const AHEAD_TOLERANCE = 5.625;

/**
 * Fallback arrival radius, in blocks, when there is nothing exact to test.
 * Deliberately tight - the old 48 announced arrival while the target was still
 * well out of sight.
 */
const DEFAULT_ARRIVAL_DISTANCE = 8;

/** playerId -> { x, z, name, dimensionId, radius?, biomeId? } */
const targets = new Map();

// ---------------------------------------------------------------------------
// Target state
// ---------------------------------------------------------------------------

export function setTarget(player, target) {
	targets.set(player.id, { ...target, dimensionId: player.dimension.id });
}

export function clearTarget(player, { silent = false } = {}) {
	if (!targets.delete(player.id)) return false;

	if (!silent) player.onScreenDisplay.setActionBar("§7Compass cleared.");
	return true;
}

export function hasTarget(player) {
	return targets.has(player.id);
}

/** Current target of a player (x, z, name, dimensionId, ...) or undefined. */
export function getTarget(player) {
	return targets.get(player.id);
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

export function isCompass(itemStack) {
	return typeof itemStack?.typeId === "string" && itemStack.typeId.startsWith(COMPASS_PREFIX);
}

/**
 * A compass from the creative menu or a plain /give arrives without
 * keepOnDeath, so stamp it the first time the player opens the menu. The
 * compass is how you find your death location, so it is no use to you lying
 * in the pile you are trying to walk back to. There is no
 * minecraft:keep_on_death item component - the flag lives on the stack.
 */
export function ensureKeepOnDeath() {
	// Avaritia compasses are crafted items; they are not stamped keep-on-death.
}

// ---------------------------------------------------------------------------
// The bearing loop
// ---------------------------------------------------------------------------

/**
 * How far the target sits from straight ahead, in degrees, in the range
 * (-180, 180]. Negative is to the player's left, positive to their right, 0 is
 * dead ahead.
 *
 * Minecraft's yaw is south-zero: getRotation().y is 0 facing +Z (south), 90
 * facing -X (west), 180 facing -Z (north). atan2(-dx, dz) produces a bearing
 * in that same convention, so the two can be subtracted directly.
 */
function relativeBearing(player, target) {
	const dx = target.x - player.location.x;
	const dz = target.z - player.location.z;

	const bearing = Math.atan2(-dx, dz) * (180 / Math.PI);

	return ((bearing - player.getRotation().y + 540) % 360) - 180;
}

/** A short text bearing for the action bar. */
function arrow(relative) {
	if (Math.abs(relative) < AHEAD_TOLERANCE) return "§a▲";

	return relative < 0
		? `§e◄ ${Math.abs(relative).toFixed(0)}°`
		: `§e${relative.toFixed(0)}° ►`;
}

/**
 * For a biome, standing in it is the real test - the coordinates are only the
 * seed's estimate of where it starts, so a radius alone either fires early or
 * never fires at all. Cave targets must match at the player's actual height, too.
 */
function hasArrived(player, target, distance) {
	if (target.biomeId) {
		try {
			if (player.dimension.getBiome(player.location).id === target.biomeId) return true;
		} catch {
			// Unloaded or out of bounds - keep guidance until a match is confirmed.
		}

		return false;
	}

	return distance <= (target.radius ?? DEFAULT_ARRIVAL_DISTANCE);
}

function update(player) {
	const target = targets.get(player.id);
	if (!target) return;

	// Biome coordinates belong to the dimension they were found in.
	if (player.dimension.id !== target.dimensionId) {
		clearTarget(player, { silent: true });
		player.onScreenDisplay.setActionBar("§7Compass cleared - different dimension.");
		return;
	}

	const equippable = player.getComponent(EntityComponentTypes.Equippable);
	const held = equippable?.getEquipment(EquipmentSlot.Mainhand);
	const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
	if (!isCompass(held) && !isCompass(offhand)) return;

	const dx = target.x - player.location.x;
	const dz = target.z - player.location.z;
	const distance = Math.hypot(dx, dz);

	if (hasArrived(player, target, distance)) {
		clearTarget(player, { silent: true });
		player.onScreenDisplay.setActionBar(`§aYou have arrived at ${target.name}.`);
		player.playSound("random.levelup", { volume: 0.6 });
		return;
	}

	if (!isEnabled(player, "actionBar")) return;

	player.onScreenDisplay.setActionBar(
		`§f${target.name} §7| §b${distance.toFixed(0)}m §7| ${arrow(relativeBearing(player, target))} §7| §fX ${Math.round(target.x)} Z ${Math.round(target.z)}`,
	);
}

export function initializeNeedle() {
	system.runInterval(() => {
		for (const player of world.getAllPlayers()) {
			try {
				update(player);
			} catch {
				// One player erroring must not stop the rest updating.
			}
		}
	}, UPDATE_INTERVAL);

	world.afterEvents.playerLeave.subscribe((event) => targets.delete(event.playerId));
}
