/** Persistent, private player waypoints. Locator visibility is session-only. */
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { clearSavedMarker, hasSavedMarker, toggleSavedMarker } from "./waypoints.js";
import { dimensionName, describeDimension } from "./targets.js";

const PROPERTY = "abc:waypoints";
export const MAX_WAYPOINTS = 60;
export const MAX_NAME_LENGTH = 24;
const WORLD_LIMIT = 30_000_000;
const hex = value => ({ red: parseInt(value.slice(0, 2), 16) / 255, green: parseInt(value.slice(2, 4), 16) / 255, blue: parseInt(value.slice(4, 6), 16) / 255 });
export const WAYPOINT_COLORS = [
	["red", "Red", "EF5350", "c"], ["orange", "Orange", "FFA726", "6"],
	["yellow", "Yellow", "FFEE58", "e"], ["lime", "Lime", "9CCC65", "a"],
	["green", "Green", "43A047", "2"], ["cyan", "Cyan", "26C6DA", "b"],
	["blue", "Blue", "42A5F5", "9"], ["purple", "Purple", "AB47BC", "5"],
	["pink", "Pink", "EC80B0", "d"], ["white", "White", "F5F5F5", "f"],
].map(([id, label, value, textColor]) => ({ id, label, textColor, color: hex(value), icon: "textures/ui/waypoints/" + id }));
export function waypointColor(id) { return WAYPOINT_COLORS.find(color => color.id === id) ?? WAYPOINT_COLORS[0]; }

/** Bad stored data must never be silently overwritten by adding/removing. */
export function getSavedWaypoints(player) {
	const raw = player.getDynamicProperty(PROPERTY);
	if (raw === undefined) return [];
	let list;
	try { list = JSON.parse(raw); } catch { throw new Error("Saved waypoint data could not be read."); }
	if (!Array.isArray(list) || list.some(entry => !entry || typeof entry.id !== "string" || typeof entry.name !== "string"
		|| !Number.isInteger(entry.x) || !Number.isInteger(entry.z) || Math.abs(entry.x) >= WORLD_LIMIT || Math.abs(entry.z) >= WORLD_LIMIT
		|| !Number.isFinite(entry.y) || !["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].includes(entry.dimensionId)
		|| !WAYPOINT_COLORS.some(color => color.id === entry.colorId)) || new Set(list.map(entry => entry.id)).size !== list.length) {
		throw new Error("Saved waypoint data could not be read.");
	}
	return list;
}
function save(player, entries) { player.setDynamicProperty(PROPERTY, entries.length ? JSON.stringify(entries) : undefined); }
export function validateWaypoint(values) {
	if (!values.name.trim() || values.name.trim().length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f\u00a7]/.test(values.name)) return `Use a name of 1-${MAX_NAME_LENGTH} characters without formatting or line breaks.`;
	if (![values.x, values.z].every(value => /^[+-]?\d+$/.test(value.trim()) && Math.abs(Number(value)) < WORLD_LIMIT)) return "X and Z must be whole numbers between -29,999,999 and 29,999,999.";
	if (!WAYPOINT_COLORS[values.color]) return "Choose a marker colour.";
}
export function addSavedWaypoint(player, values, origin) {
	const error = validateWaypoint(values);
	if (error) throw new Error(error);
	const entries = getSavedWaypoints(player);
	if (entries.length >= MAX_WAYPOINTS) throw new Error(`You can save up to ${MAX_WAYPOINTS} waypoints. Remove one to add another.`);
	let id;
	do { id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); } while (entries.some(entry => entry.id === id));
	const entry = { id, name: values.name.trim(), x: Number(values.x), z: Number(values.z), y: origin.y, dimensionId: origin.dimensionId, colorId: WAYPOINT_COLORS[values.color].id };
	save(player, [...entries, entry]);
	return entry;
}
export function removeSavedWaypoint(player, id) {
	const entries = getSavedWaypoints(player);
	if (!entries.some(entry => entry.id === id)) return false;
	save(player, entries.filter(entry => entry.id !== id));
	clearSavedMarker(player, id);
	return true;
}
export async function openAddWaypoint(player) {
	const origin = { y: player.location.y, dimensionId: player.dimension.id };
	let values = { name: "", x: String(Math.floor(player.location.x)), z: String(Math.floor(player.location.z)), color: 0 };
	let error;
	for (;;) {
		const form = new ModalFormData().title("Add New Waypoint");
		if (error) form.label("\u00a7c" + error);
		form.textField("Name", "e.g. Home", { defaultValue: values.name, tooltip: `A name to recognise this location in your waypoint list. Use 1-${MAX_NAME_LENGTH} characters.` })
			.textField("X", "East / west", { defaultValue: values.x, tooltip: "East-west position. Prefilled with your current block coordinate; change it to save another location. Negative numbers are west of the world origin." })
			.textField("Z", "North / south", { defaultValue: values.z, tooltip: "North-south position. Prefilled with your current block coordinate; change it to save another location. Negative numbers are north of the world origin." })
			.dropdown("Marker colour", WAYPOINT_COLORS.map(color => "\u00a7" + color.textColor + color.label + "\u00a7r"), { defaultValueIndex: values.color, tooltip: "Choose the colour of this waypoint marker on the locator bar. Click its saved card to show or hide the marker." })
			.label("Saved in " + dimensionName(origin.dimensionId) + ".")
			.submitButton("Save Waypoint");
		const response = await form.show(player);
		if (response.canceled) return;
		const [name, x, z, color] = response.formValues.filter(value => value !== undefined);
		values = { name, x, z, color };
		error = validateWaypoint(values);
		if (error) continue;
		try {
			addSavedWaypoint(player, values, origin);
			player.sendMessage("\u00a7aWaypoint saved.");
		} catch (err) { player.sendMessage("\u00a7c" + err.message); }
		return;
	}
}
export async function openRemoveWaypoint(player) {
	const entries = getSavedWaypoints(player);
	if (!entries.length) { player.sendMessage("\u00a77You have no saved waypoints to remove."); return; }
	const form = new ActionFormData().title("Remove Waypoint").body("Choose a waypoint to delete.");
	for (const entry of entries) form.button(`${entry.name}\n${entry.x}, ${entry.z} - ${dimensionName(entry.dimensionId)}`, waypointColor(entry.colorId).icon);
	form.button("Back", "textures/ui/arrow_left");
	const response = await form.show(player);
	if (response.canceled || !entries[response.selection]) return;
	const entry = entries[response.selection];
	const confirmation = await new ActionFormData().title("Remove Waypoint")
		.body(`Delete ${entry.name} at ${entry.x}, ${entry.z} in ${dimensionName(entry.dimensionId)}?`)
		.button("Cancel").button("Remove Waypoint", "textures/ui/trash_default").show(player);
	if (!confirmation.canceled && confirmation.selection === 1) {
		removeSavedWaypoint(player, entry.id);
		player.sendMessage("\u00a77Waypoint removed.");
	}
}
/** Populate the grid, including a useful empty state and permanent footer. */
export function addWaypointButtons(player, screen, tab, reopen) {
	let entries;
	try { entries = getSavedWaypoints(player); } catch (error) {
		screen.heading(tab, "Waypoints unavailable");
		player.sendMessage("\u00a7c" + error.message);
		return;
	}
	screen.heading(tab, `Waypoints (${entries.length}/${MAX_WAYPOINTS})`);
	screen.reveal("[wp-controls]");
	if (!entries.length) screen.reveal("[wp-empty]");
	for (const [index, entry] of entries.entries()) {
		if (hasSavedMarker(player, entry.id)) screen.reveal("[wp-active:" + index + "]");
		screen.button(tab, `${entry.name}\nX: ${entry.x}, Z: ${entry.z}\n${describeDimension(entry.dimensionId)}`, waypointColor(entry.colorId).icon, () => {
			const result = toggleSavedMarker(player, entry, waypointColor(entry.colorId).color);
			const messages = { added: `\u00a7a${entry.name} added to the locator bar.`, removed: `\u00a77${entry.name} removed from the locator bar.`, dimension: `\u00a7eEnter ${dimensionName(entry.dimensionId)} to show this waypoint.`, disabled: "\u00a7eEnable locator bar markers in Settings first.", full: "\u00a7eYour locator bar is full. Hide a marker before adding another.", failed: "\u00a7cCould not add this waypoint to the locator bar." };
			player.sendMessage(messages[result]);
			return reopen();
		});
	}
	const open = async action => {
		try { await action(player); } catch (error) { player.sendMessage("\u00a7cCould not open waypoint form: " + error.message); }
		return reopen();
	};
	screen.footer("Add New Waypoint", "textures/items/compass_item", () => open(openAddWaypoint));
	screen.footer("Remove Waypoint", "textures/ui/trash_default", () => open(openRemoveWaypoint));
}
