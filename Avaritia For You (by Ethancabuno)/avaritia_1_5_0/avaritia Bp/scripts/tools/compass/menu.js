/** Sidebar slots, section entries, then two waypoint footer actions. */
import { ActionFormData } from "@minecraft/server-ui";

export const TAB = { Biomes: "bi:", Structures: "st:", Waypoints: "wp:", Death: "de:", Settings: "se:", Clear: "cl:" };
/** Six rows of three cards. Keeping this fixed prevents catalogue growth from
 * making every form (including Settings and Deaths) progressively heavier. */
export const TARGET_SLOTS = 18;
export const PAGE_SLOTS = 2;
export const FOOTER_SLOTS = 2;
/**
 * Width, in characters, of an action row's first line. A newline in a label
 * knocks the whole label out of the Minecraft Ten font, so two-line rows are
 * sent as one string: line one padded (evenly, to stay centred) to this width,
 * line two straight after. The UI splits at the same count - keep in step
 * with ROW_LINE in tools/build-compass-ui.js.
 */
export const ROW_LINE = 60;
function rowLabel(label) {
	const [first = "", ...rest] = label.split("\n");
	const line = first.slice(0, ROW_LINE);
	const pad = ROW_LINE - line.length;
	return " ".repeat(Math.floor(pad / 2)) + line + " ".repeat(Math.ceil(pad / 2)) + rest.join(" ");
}
const SECTIONS = [
	{ tab: TAB.Biomes, label: "Biomes", icon: "textures/ui/abc_nav_biomes" },
	{ tab: TAB.Structures, label: "Structures", icon: "textures/ui/abc_nav_structures" },
	{ tab: TAB.Waypoints, label: "Waypoints", icon: "textures/items/compass_item" },
	{ tab: TAB.Death, label: "Death location", icon: "textures/ui/abc_death_marker" },
	{ tab: TAB.Settings, label: "Settings", icon: "textures/ui/gear" },
	// Not a section: a sidebar action, shown only while the [cl] marker is set.
	{ tab: TAB.Clear, label: "Clear target", icon: "textures/ui/cancel", action: true },
];
export const NAV_COUNT = SECTIONS.length;

/**
 * Button text prefixes. The UI strips the first three characters of every
 * label and dims anything carrying DISABLED - keep in step with
 * tools/build-compass-ui.js.
 */
const NAV = "nv:", ACTION = "ac:", DISABLED = "dx:", EMPTY = "--:";

export class CompassScreen {
	#actions = [];
	#markers = new Set();
	#headings = new Map();
	#disabled = new Map();
	#footer = [];
	footer(label, icon, run) {
		if (this.#footer.length >= 2) throw new Error("Only two waypoint footer actions are supported");
		this.#footer.push({ label, icon, run }); return this;
	}
	/**
	 * Adds an entry to a section. Pass `disabled` with the reason to show it
	 * greyed out; tapping it then explains why instead of running.
	 */
	button(tab, label, icon, run, { disabled } = {}) {
		if (!SECTIONS.some(section => section.tab === tab)) throw new Error("Unknown compass section: " + tab);
		this.#actions.push({ tab, label, icon, run, disabled });
		return this;
	}
	/** Greys out a whole section. Selecting it shows the reason in place of its content. */
	disable(tab, reason) {
		if (!SECTIONS.some(section => section.tab === tab && !section.action)) throw new Error("Unknown compass section: " + tab);
		this.#disabled.set(tab, reason);
		return this;
	}
	reveal(marker) { this.#markers.add(marker); return this; }
	/** Replaces a section's default heading, e.g. for a detail view within it. */
	heading(tab, text) { this.#headings.set(tab, text); return this; }
	get length() { return this.#actions.filter(action => !this.#isNavAction(action.tab)).length; }
	#isNavAction(tab) { return SECTIONS.some(section => section.tab === tab && section.action); }

	async show(player, { tab } = {}) {
		if (!this.length && !this.#footer.length && !this.#disabled.size) return;
		const populated = section => !section.action && !this.#disabled.has(section.tab) && (this.#actions.some(action => action.tab === section.tab) || section.tab === TAB.Waypoints);
		let selected = SECTIONS.find(section => section.tab === tab && (populated(section) || this.#disabled.has(section.tab)))?.tab
			?? SECTIONS.find(populated)?.tab ?? TAB.Waypoints;
		// Set when a disabled entry was tapped: shown once, in place of the heading.
		let notice;
		const pages = new Map();
		for (;;) {
			const section = SECTIONS.find(section => section.tab === selected);
			const actions = this.#disabled.has(selected) ? [] : this.#actions.filter(action => action.tab === selected);
			const pageCount = Math.max(1, Math.ceil(actions.length / TARGET_SLOTS));
			const page = Math.min(pages.get(selected) ?? 0, pageCount - 1);
			pages.set(selected, page);
			const offset = page * TARGET_SLOTS;
			const visible = actions.slice(offset, offset + TARGET_SLOTS);
			const dimension = ({ "minecraft:overworld": "Overworld", "minecraft:nether": "The Nether", "minecraft:the_end": "The End" })[player.dimension.id] ?? player.dimension.id;
			const targets = selected === TAB.Biomes || selected === TAB.Structures || selected === TAB.Waypoints;
			// Target tabs are headed by the dimension alone; the others by their section name.
			const baseHeading = this.#headings.get(selected) ?? (!actions.length ? "No " + section.label.toLowerCase() + " available in " + dimension
				: (selected === TAB.Biomes || selected === TAB.Structures ? dimension : section.label));
			const heading = pageCount > 1 ? `${baseHeading} - Page ${page + 1}/${pageCount}` : baseHeading;
			const reason = notice ?? this.#disabled.get(selected);
			notice = undefined;
			// Visibility is carried in the title: button text bindings on the button
			// itself do not reliably hide its native face or remove empty rows.
			const slots = visible.map((_, index) => "[slot:" + (index + SECTIONS.length) + "]").join("");
			const activeWaypointSlots = selected === TAB.Waypoints ? visible.map((_, index) =>
				this.#markers.has("[wp-active:" + (offset + index) + "]") ? "[wp-slot-active:" + index + "]" : "",
			).join("") : "";
			const pageActions = [
				page > 0 ? { label: "Previous Page", icon: "textures/ui/arrow_left", page: page - 1, marker: "[page-prev]" } : undefined,
				page + 1 < pageCount ? { label: "Next Page", icon: "textures/ui/arrow_right", page: page + 1, marker: "[page-next]" } : undefined,
			];
			const paging = pageCount > 1 ? "[paging]" : "";
			const pageMarkers = pageActions.map(action => action?.marker ?? "").join("");
			const form = new ActionFormData()
				.title("CUSTOMUI:ABC[tab:" + selected.slice(0, 2) + "]" + [...this.#markers].join("") + activeWaypointSlots + paging + pageMarkers + (reason ? "[notice]" : "") + slots)
				.body(reason ?? heading);
			for (const nav of SECTIONS) form.button((this.#disabled.has(nav.tab) ? DISABLED : NAV) + nav.label, nav.icon);
			for (let i = 0; i < TARGET_SLOTS; i++) {
				const action = visible[i];
				if (action) form.button(prefix(action) + (selected === TAB.Waypoints ? action.label.split("\n")[0] : targets ? action.label : rowLabel(action.label)), action.icon);
				else form.button(EMPTY);
			}
			for (const action of pageActions) form.button(action ? ACTION + action.label : EMPTY, action?.icon);
			for (let i = 0; i < FOOTER_SLOTS; i++) {
				const action = selected === TAB.Waypoints ? this.#footer[i] : undefined;
				form.button(action ? ACTION + action.label : EMPTY, action?.icon);
			}
			// Independent text entries avoid engine formatting/slicing of combined fields.
			for (let i = 0; i < TARGET_SLOTS; i++) {
				const lines = selected === TAB.Waypoints ? visible[i]?.label.split("\n") : undefined;
				form.button(lines ? prefix(visible[i]) + (lines[1] ?? "") : EMPTY);
				form.button(lines ? prefix(visible[i]) + (lines[2] ?? "") : EMPTY);
			}
			const response = await form.show(player);
			if (response.canceled) return;
			const index = response.selection;
			if (index < SECTIONS.length) {
				const nav = SECTIONS[index];
				if (nav.action) {
					const action = this.#actions.find(action => action.tab === nav.tab);
					if (action && this.#markers.has("[cl]")) return action.run();
					continue;
				}
				if (nav.tab === TAB.Death && !this.#markers.has("[de]")) continue;
				selected = nav.tab;
			} else {
				const slot = index - SECTIONS.length;
				if (slot >= TARGET_SLOTS && slot < TARGET_SLOTS + PAGE_SLOTS) {
					const pageAction = pageActions[slot - TARGET_SLOTS];
					if (pageAction) pages.set(selected, pageAction.page);
					continue;
				}
				const action = slot < TARGET_SLOTS ? visible[slot] : selected !== TAB.Waypoints ? undefined
					: slot < TARGET_SLOTS + PAGE_SLOTS + FOOTER_SLOTS ? this.#footer[slot - TARGET_SLOTS - PAGE_SLOTS]
					: visible[Math.floor((slot - TARGET_SLOTS - PAGE_SLOTS - FOOTER_SLOTS) / 2)];
				if (action?.disabled) { notice = action.disabled; continue; }
				if (action) return action.run();
			}
		}
	}
}

function prefix(action) {
	return action.disabled ? DISABLED : ACTION;
}
