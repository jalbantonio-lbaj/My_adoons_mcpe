/**
 * Per-player preferences.
 *
 * Kept as one JSON dynamic property on the player so they follow the profile
 * across rejoins. Every setting is a boolean toggle shown as a row on the
 * Settings tab; add to SETTINGS and read it with isEnabled() where it applies.
 */

const SETTINGS_PROPERTY = "abc:settings";

/** Key -> label, description of what "on" does, and the default. */
export const SETTINGS = [
	{ key: "actionBar", label: "Action bar directions", detail: "Distance and bearing while holding the compass", enabled: true },
	{ key: "locatorBar", label: "Locator bar marker", detail: "Marks the target on the locator bar", enabled: true },
];

function read(player) {
	const raw = player.getDynamicProperty(SETTINGS_PROPERTY);
	if (typeof raw !== "string") return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

export function isEnabled(player, key) {
	const stored = read(player)[key];
	if (typeof stored === "boolean") return stored;
	return SETTINGS.find((setting) => setting.key === key)?.enabled ?? true;
}

/** Flips one setting and returns its new state. */
export function toggleSetting(player, key) {
	const next = !isEnabled(player, key);
	player.setDynamicProperty(SETTINGS_PROPERTY, JSON.stringify({ ...read(player), [key]: next }));
	return next;
}
