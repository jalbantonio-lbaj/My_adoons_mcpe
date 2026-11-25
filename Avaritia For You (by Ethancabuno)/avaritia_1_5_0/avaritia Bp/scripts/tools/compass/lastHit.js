/**
 * The last successful search result, for the Settings "Teleport to last
 * result" button. Biome hits and confirmed structure coordinates both land
 * here; stored on the player so it survives rejoining.
 */

const LAST_HIT_PROPERTY = "abc:last_hit";

/** @param {{ name: string, x: number, z: number }} hit */
export function writeLastHit(player, hit) {
	player.setDynamicProperty(LAST_HIT_PROPERTY, JSON.stringify({ ...hit, dimensionId: player.dimension.id }));
}

/** @returns {{ name: string, x: number, z: number, dimensionId: string } | undefined} */
export function readLastHit(player) {
	const raw = player.getDynamicProperty(LAST_HIT_PROPERTY);
	if (typeof raw !== "string") return undefined;
	try {
		const hit = JSON.parse(raw);
		return Number.isFinite(hit?.x) && Number.isFinite(hit?.z)
			&& ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].includes(hit.dimensionId) ? hit : undefined;
	} catch {
		return undefined;
	}
}
