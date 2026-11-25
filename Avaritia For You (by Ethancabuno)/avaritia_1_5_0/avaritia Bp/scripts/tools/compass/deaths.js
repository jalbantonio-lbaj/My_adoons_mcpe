/**
 * Death location memory.
 *
 * Records where a player has died so the compass can point them back to it.
 * The most recent deaths are kept, newest first, as a dynamic property on the
 * player, so they survive rejoining and a world reload, and die with the
 * player profile rather than lingering in a module map.
 *
 * The dimension is stored alongside the coordinates: dying in the Nether and
 * respawning in the Overworld is the common case, and a bearing across
 * dimensions would be meaningless.
 */

import { world } from "@minecraft/server";

const DEATHS_PROPERTY = "abc:deaths";
/** Pre-0.7 single-death slot; folded into the list on first read. */
const LEGACY_DEATH_PROPERTY = "abc:last_death";
export const MAX_DEATHS = 10;

/** @typedef {{x: number, y: number, z: number, dimensionId: string, day: number, cause?: string}} Death */

function parseDeaths(raw) {
	if (typeof raw !== "string") return [];
	try {
		const parsed = JSON.parse(raw);
		const list = Array.isArray(parsed) ? parsed : [parsed];
		return list.filter((death) => Number.isFinite(death?.x) && Number.isFinite(death?.z));
	} catch {
		return [];
	}
}

function saveDeaths(player, deaths) {
	player.setDynamicProperty(DEATHS_PROPERTY, deaths.length ? JSON.stringify(deaths.slice(0, MAX_DEATHS)) : undefined);
}

/** @returns {Death[]} Most recent first. */
export function getDeaths(player) {
	const deaths = parseDeaths(player.getDynamicProperty(DEATHS_PROPERTY));
	const legacy = parseDeaths(player.getDynamicProperty(LEGACY_DEATH_PROPERTY));
	if (legacy.length) {
		deaths.push(...legacy);
		saveDeaths(player, deaths);
		player.setDynamicProperty(LEGACY_DEATH_PROPERTY, undefined);
	}
	return deaths;
}

/** @returns {Death | undefined} */
export function getLastDeath(player) {
	return getDeaths(player)[0];
}

export function recordDeath(player, death) {
	saveDeaths(player, [death, ...getDeaths(player)]);
}

/** Drops one remembered death by its position in getDeaths(). */
export function forgetDeath(player, index) {
	const deaths = getDeaths(player);
	if (index < 0 || index >= deaths.length) return false;
	deaths.splice(index, 1);
	saveDeaths(player, deaths);
	return true;
}

export function clearDeaths(player) {
	player.setDynamicProperty(DEATHS_PROPERTY, undefined);
	player.setDynamicProperty(LEGACY_DEATH_PROPERTY, undefined);
}

/** Damage causes that read better than their enum name, or need one at all. */
const CAUSE_LABELS = {
	blockExplosion: "an explosion",
	entityExplosion: "an explosion",
	fallingBlock: "a falling block",
	fireTick: "fire",
	flyIntoWall: "flying into a wall",
	magic: "magic",
	magma: "magma",
	maceSmash: "a mace",
	ramAttack: "a ram",
	selfDestruct: "self destruction",
	sonicBoom: "a sonic boom",
	soulCampfire: "a soul campfire",
	starve: "starvation",
	suffocation: "suffocation",
	temperature: "the cold",
	void: "the void",
	none: undefined,
	override: undefined,
	suicide: undefined,
};

/** "minecraft:zombie_villager" -> "Zombie Villager". */
function entityName(entity) {
	try {
		if (entity?.typeId === "minecraft:player") return entity.name;
		if (entity?.nameTag) return entity.nameTag;
		return entity?.typeId?.replace("minecraft:", "").split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
	} catch {
		return undefined;
	}
}

/**
 * What killed the player, in a form that fits "Died by ___". Attackers and
 * projectile shooters are named; everything else falls back to the damage
 * cause, and a cause with no useful label yields undefined.
 */
export function describeCause(damageSource) {
	if (!damageSource) return undefined;
	const attacker = entityName(damageSource.damagingEntity);
	if (attacker) return attacker;
	const projectile = entityName(damageSource.damagingProjectile);
	if (projectile) return projectile;
	const cause = damageSource.cause;
	if (!cause) return undefined;
	return cause in CAUSE_LABELS ? CAUSE_LABELS[cause] : cause.replace(/([A-Z])/g, " $1").toLowerCase();
}

/** Short label for the menu, e.g. "-412, 68, 903". */
export function describeDeath(death) {
	return `${Math.round(death.x)}, ${Math.round(death.y)}, ${Math.round(death.z)}`;
}

export function initializeDeathTracking() {
	world.afterEvents.entityDie.subscribe(
		(event) => {
			const player = event.deadEntity;

			// The location has to be read now - after the respawn it is gone.
			const { x, y, z } = player.location;

			recordDeath(player, { x, y, z, dimensionId: player.dimension.id, day: world.getDay(), cause: describeCause(event.damageSource) });

			player.sendMessage("§7Your death location has been saved to your compass.");
		},
		// Filtering in the subscription is cheaper than checking every mob death.
		{ entityTypes: ["minecraft:player"] },
	);
}
