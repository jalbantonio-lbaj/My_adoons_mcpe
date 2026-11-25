/**
 * Locator bar markers.
 *
 * Dropping a marker on the locator bar is what this addon is actually for -
 * a coordinate in chat tells you where something is, a marker tells you which
 * way to walk. Player.locatorBar and LocationWaypoint are both stable in
 * @minecraft/server 2.9.0, so no experiment toggle is needed.
 *
 * Only one search marker is kept per player: a new search replaces the old one
 * rather than filling the bar up, which also keeps us clear of
 * LocatorBar.maxCount.
 */

import { LocationWaypoint, WaypointTexture, world } from "@minecraft/server";
import { isEnabled } from "./settings.js";

/** One marker per player, so the previous one can be removed on replace. */
const active = new Map();
/** Saved waypoints are independent of the single biome/structure/death target. */
const savedActive = new Map();

/**
 * Skull drawn for the death marker; lives in the resource pack. Icon size is
 * relative (0-1) rather than pixels - 1 draws it at the full marker size.
 */
export const DEATH_MARKER_TEXTURE = { path: "textures/ui/abc_death_marker", iconWidth: 1, iconHeight: 1 };
/** Neutral pin: the locator API applies each saved waypoint's colour once. */
export const SAVED_MARKER_TEXTURE = { path: "textures/ui/locator/waypoint", iconWidth: 1, iconHeight: 1 };

/**
 * A texture selector is a list of distance-bounded textures - the marker can
 * change icon as the player closes in. One entry with no upper bound means
 * "this icon at every distance".
 *
 * The texture is either a WaypointTexture preset or a CustomTexture
 * ({ path, iconWidth, iconHeight }) whose path points at a texture in the
 * resource pack - which is also how per-biome art would be done.
 */
function selector(texture = WaypointTexture.Circle) {
	return { textureBoundsList: [{ texture, lowerBound: 0 }] };
}

/**
 * Point the locator bar at a target. Returns false if the bar refused it, so
 * the caller can still report the coordinates rather than looking broken.
 */
export function setSearchMarker(player, dimensionLocation, color, texture) {
	clearSearchMarker(player);
	if (!isEnabled(player, "locatorBar")) return false;

	try {
		const waypoint = new LocationWaypoint(dimensionLocation, selector(texture), color);
		player.locatorBar.addWaypoint(waypoint);
		active.set(player.id, waypoint);
		return true;
	} catch (err) {
		console.warn(`[abc] could not add waypoint: ${err}`);
		return false;
	}
}

export function clearSearchMarker(player) {
	const waypoint = active.get(player.id);
	active.delete(player.id);
	if (!waypoint) return false;

	try {
		// remove() on the waypoint itself also detaches it from the bar, and
		// survives the player having cleared it by other means.
		if (waypoint.isValid) waypoint.remove();
	} catch {
		// Already gone - nothing to undo.
	}

	return true;
}

export function hasSearchMarker(player) {
	const waypoint = active.get(player.id);
	try {
		return Boolean(waypoint?.isValid);
	} catch {
		return false;
	}
}

// The waypoint belongs to the player and leaves with them; this just stops the
// map holding entries for players who are no longer here.
world.afterEvents.playerLeave.subscribe((event) => {
	active.delete(event.playerId);
	savedActive.delete(event.playerId);
});

export function hasSavedMarker(player, id) {
	const marker = savedActive.get(player.id)?.get(id);
	try { return Boolean(marker?.isValid && player.locatorBar.hasWaypoint(marker)); } catch { return false; }
}
export function clearSavedMarker(player, id) {
	const markers = savedActive.get(player.id);
	const marker = markers?.get(id);
	markers?.delete(id);
	if (!markers?.size) savedActive.delete(player.id);
	try { if (marker?.isValid) marker.remove(); } catch {}
	return Boolean(marker);
}
export function clearSavedMarkers(player) {
	for (const id of [...(savedActive.get(player.id)?.keys() ?? [])]) clearSavedMarker(player, id);
}
/** Capacity errors must leave every existing marker untouched. */
export function toggleSavedMarker(player, entry, color) {
	if (hasSavedMarker(player, entry.id)) { clearSavedMarker(player, entry.id); return "removed"; }
	clearSavedMarker(player, entry.id);
	if (!isEnabled(player, "locatorBar")) return "disabled";
	if (player.dimension.id !== entry.dimensionId) return "dimension";
	let marker;
	try {
		if (player.locatorBar.count >= player.locatorBar.maxCount) return "full";
		marker = new LocationWaypoint({ dimension: player.dimension, x: entry.x, y: entry.y, z: entry.z }, selector(SAVED_MARKER_TEXTURE), color);
		player.locatorBar.addWaypoint(marker);
		const markers = savedActive.get(player.id) ?? new Map();
		markers.set(entry.id, marker);
		savedActive.set(player.id, markers);
		return "added";
	} catch (error) {
		try { if (marker?.isValid) marker.remove(); } catch {}
		console.warn(`[abc] could not add saved waypoint: ${error}`);
		return "failed";
	}
}
