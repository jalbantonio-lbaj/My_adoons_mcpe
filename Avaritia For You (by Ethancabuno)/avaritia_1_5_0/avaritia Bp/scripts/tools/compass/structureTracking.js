import { ModalFormData } from "@minecraft/server-ui";
import { world } from "@minecraft/server";
import { setTarget } from "./needle.js";
import { setSearchMarker } from "./waypoints.js";
import { shortName } from "./targets.js";
import { writeLastHit } from "./lastHit.js";
const lastSearch = new Map();
const STRUCTURE_COLOR = { red: 0.95, green: 0.70, blue: 0.25 };
const MAX_COORDINATE = 29999984;
const OVERLAY_TITLE = "ABC:LOCATE_OVERLAY";
const openForms = new Set();
export function rememberStructureSearch(player, structure) {
	lastSearch.set(player.id, { name: shortName(structure), structureId: structure.id, locatorIcon: structure.locatorIcon, dimensionId: player.dimension.id });
}
function coordinate(value) {
	if (typeof value !== "string" || !/^[+-]?\d+$/.test(value.trim())) return undefined;
	const number = Number(value.trim());
	return Number.isSafeInteger(number) && Math.abs(number) <= MAX_COORDINATE ? number : undefined;
}
export async function openStructureCoordinates(player) {
	if (openForms.has(player.id)) return;
	const dimension = player.dimension;
	const search = lastSearch.get(player.id);
	if (search && search.dimensionId !== dimension.id) {
		player.sendMessage("\u00a7eReturn to the dimension where you located the structure before entering its coordinates.");
		return;
	}
	const name = search?.name ?? "Structure";
	openForms.add(player.id);
	try {
		player.onScreenDisplay.setTitle(OVERLAY_TITLE + "|" + (search?.structureId ?? ""), { fadeInDuration: 0, stayDuration: 72000, fadeOutDuration: 0 });
		let xText = "", zText = "";
		for (;;) {
			const form = new ModalFormData().title("ABC:STRUCTURE_COORDS|Track " + name)
				.textField("X coordinate from the locate message", "e.g. -1048", { defaultValue: xText })
				.textField("Z coordinate from the locate message (Y is not needed)", "e.g. -872", { defaultValue: zText });
			const response = await form.show(player);
			if (response.canceled) return;
			xText = typeof response.formValues?.[0] === "string" ? response.formValues[0] : "";
			zText = typeof response.formValues?.[1] === "string" ? response.formValues[1] : "";
			const x = coordinate(xText), z = coordinate(zText);
			if (x === undefined || z === undefined) {
				player.sendMessage("\u00a7cEnter whole-number X and Z coordinates between -29999984 and 29999984.");
				continue;
			}
			if (player.dimension.id !== dimension.id) {
				player.sendMessage("\u00a7eYour dimension changed. Reopen the compass and enter coordinates in the structure's dimension.");
				return;
			}
			setTarget(player, { x, z, name, color: STRUCTURE_COLOR });
			writeLastHit(player, { name, x, z });
			const marked = setSearchMarker(player, { dimension, x, y: player.location.y, z }, search?.locatorIcon ? { red: 1, green: 1, blue: 1 } : STRUCTURE_COLOR, search?.locatorIcon);
			player.sendMessage("\u00a7aCompass pointed at " + name + ": \u00a7f" + x + ", " + z);
			player.onScreenDisplay.setActionBar(marked ? "\u00a7a" + name + " marked on the locator bar" : "\u00a7a" + name + " \u00a7f" + x + ", " + z);
			return;
		}
	} finally {
		openForms.delete(player.id);
		try { player.onScreenDisplay.setTitle("ABC:LOCATE_OVERLAY_OFF", { fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 }); } catch {}
	}
}
world.afterEvents.playerLeave.subscribe(event => { lastSearch.delete(event.playerId); openForms.delete(event.playerId); });
