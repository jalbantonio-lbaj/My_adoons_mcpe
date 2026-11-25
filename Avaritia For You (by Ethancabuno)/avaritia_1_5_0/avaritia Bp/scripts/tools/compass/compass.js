/**
 * Advanced Bedrock Compass - locator UI
 *
 * Biomes are resolved entirely in script via
 * Dimension.calculateClosestBiomeFromSeed (stable in @minecraft/server 2.9.0),
 * which returns a Vector3 straight to us. No blocks are placed, no gamerules
 * are touched and no command feedback is scraped out of chat - which is what
 * the older command-block-in-a-structure approach had to do.
 *
 * Structures have no script equivalent yet (getGeneratedStructures is a point
 * query - "what is at this spot" - not a search), and /locate reports its find
 * as chat feedback rather than through the CommandResult a script can read -
 * running it from script produces no visible output at all. So structures go
 * the long way round: paste a one-block structure holding a command block,
 * power it, let its output reach chat, then put the world back.
 *
 * That chat output only reaches operators. Nothing available to a script can
 * change that: /op is refused from script and from command blocks, and a
 * raised Player.commandPermissionLevel does not feed the broadcast. So in
 * multiplayer, structure search is an operator-only feature: the Structures
 * tab is greyed out for members, and locateStructure refuses them as a backstop.
 */

import { world, system, CommandPermissionLevel, GameMode } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { BIOMES, STRUCTURES, allBiomes, dimensionLabel, dimensionName, describeDimension, shortName } from "./targets.js";
import { DEATH_MARKER_TEXTURE, clearSavedMarkers, clearSearchMarker, hasSearchMarker, setSearchMarker } from "./waypoints.js";
import { COMPASS_ITEM, clearTarget, ensureKeepOnDeath, hasTarget, isCompass, setTarget } from "./needle.js";
import { describeDeath, forgetDeath, getDeaths } from "./deaths.js";
import { CompassScreen, TAB } from "./menu.js";
import { SETTINGS, isEnabled, toggleSetting } from "./settings.js";
import { readLastHit, writeLastHit } from "./lastHit.js";
import { openStructureCoordinates, rememberStructureSearch } from "./structureTracking.js";

import { addWaypointButtons } from "./savedWaypoints.js";

export { COMPASS_ITEM };

/** Bone white, so the death marker reads differently to any biome colour. */
const DEATH_MARKER_COLOR = { red: 0.93, green: 0.91, blue: 0.86 };

/**
 * BiomeSearchOptions.boundingSize is left unset on purpose. The engine rejects
 * large volumes - 12800 x 512 x 12800 comes back as "invalid bounding box for
 * x size" - and the accepted range is not documented anywhere, so rather than
 * guess at a cap we let the engine use its own default search volume.
 */

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * The menu builder keeps section actions together; CompassScreen sends only
 * the current page and handles sidebar navigation. See menu.js for the protocol.
 */
async function openMainMenu(player, { tab, deathIndex } = {}) {
	const screen = new CompassScreen();
	const here = player.dimension.id;
	const inDimension = (target) => target.dimensions.includes(here);

	// Gated sections stay visible but greyed out, and say why when tapped.
	if (here === "minecraft:the_end") {
		screen.disable(TAB.Biomes, "There are no biomes to find in the End.");
	} else {
		for (const biome of allBiomes().filter(inDimension)) {
			screen.button(TAB.Biomes, shortName(biome), biome.biomeImage ?? biome.icon, () => locateBiome(player, biome));
		}
	}

	// Structure results only reach operators (see the header).
	if (canReceiveCommandBlockOutput(player)) {
		for (const structure of STRUCTURES.filter(inDimension)) {
			screen.button(TAB.Structures, shortName(structure), structure.structureImage ?? structure.icon, () => locateStructure(player, structure));
		}
	} else {
		screen.disable(TAB.Structures, "Only operators can search for structures - ask the host to search, or for operator permission.");
	}

	addWaypointButtons(player, screen, TAB.Waypoints, () => openMainMenu(player, { tab: TAB.Waypoints }));
	addDeathButtons(player, screen, deathIndex);
	addSettingsButtons(player, screen);
	addClearButton(player, screen);

	return screen.show(player, { tab });
}

/** Creative players and game directors (or higher) may teleport. */
function canTeleport(player) {
	return player.getGameMode() === GameMode.Creative || player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
}

/** Button options that grey out a teleport for everyone else. */
function teleportGate(player) {
	return canTeleport(player) ? {} : { disabled: "Teleporting is only available to operators and players in Creative mode." };
}

/**
 * The death tab stays hidden until there is actually a death to show. It
 * lists the remembered deaths newest first; picking one reopens the menu on
 * that death's actions, with a row to get back to the list.
 */
function addDeathButtons(player, screen, deathIndex) {
	const deaths = getDeaths(player);
	if (!deaths.length) return;

	screen.reveal("[de]");

	const death = deaths[deathIndex];
	if (!death) {
		deaths.forEach((entry, index) => {
			screen.button(
				TAB.Death,
				`${entry.cause ? `Died by ${entry.cause}` : "Died"} at ${describeDeath(entry)}\n${describeDimension(entry.dimensionId)} §8- Day ${entry.day}`,
				"textures/ui/abc_death_marker",
				() => openMainMenu(player, { tab: TAB.Death, deathIndex: index }),
			);
		});
		return;
	}

	screen.heading(TAB.Death, `${death.cause ? `Died by ${death.cause}` : "Died"} at ${describeDeath(death)} in ${dimensionName(death.dimensionId)}`);
	screen.button(TAB.Death, "Back to deaths", "textures/ui/arrow_left", () => openMainMenu(player, { tab: TAB.Death }));

	// A bearing across dimensions is meaningless, so the button greys out and says where to go.
	const elsewhere = player.dimension.id !== death.dimensionId
		? { disabled: `Enter ${dimensionName(death.dimensionId)} to point the compass at this death.` } : {};
	screen.button(TAB.Death, "Point compass to it", "textures/items/abc_compass", () => {
		setTarget(player, { x: death.x, z: death.z, name: "Death location", radius: 6 });
		setSearchMarker(player, { dimension: player.dimension, x: death.x, y: death.y, z: death.z }, DEATH_MARKER_COLOR, DEATH_MARKER_TEXTURE);
		player.onScreenDisplay.setActionBar("§fCompass pointed at your death location.");
	}, elsewhere);

	screen.button(TAB.Death, "Teleport there", "textures/items/ender_pearl", () => teleportToDeath(player, death), teleportGate(player));

	screen.button(TAB.Death, "Forget it", "textures/ui/trash_default", () => {
		forgetDeath(player, deathIndex);
		player.sendMessage("§7Death location forgotten.");
		return openMainMenu(player, { tab: TAB.Death });
	});
}

function addSettingsButtons(player, screen) {
	// Toggles first: each row shows its state and flips it, reopening on this tab.
	for (const setting of SETTINGS) {
		const on = isEnabled(player, setting.key);
		screen.button(
			TAB.Settings,
			`${setting.label}\n${on ? "§2Enabled" : "§4Disabled"} §8- ${setting.detail}`,
			on ? "textures/ui/toggle_on" : "textures/ui/toggle_off",
			() => {
				const now = toggleSetting(player, setting.key);
				if (setting.key === "locatorBar" && !now) { clearSearchMarker(player); clearSavedMarkers(player); }
				return openMainMenu(player, { tab: TAB.Settings });
			},
		);
	}

	// Teleports are for creative players and game directors only; others see them greyed out.
	const gate = teleportGate(player);
	const last = readLastHit(player);
	if (last) {
		screen.button(TAB.Settings, `Teleport to last result\n§2${last.name} §8- ${last.x}, ${last.z}`, "textures/items/ender_pearl", () =>
			teleportToSurface(player, last.x, last.z, last.dimensionId), gate,
		);
	}

	screen.button(TAB.Settings, "Teleport to coordinates", "textures/ui/magnifyingGlass", () => openCoordinateTeleport(player), gate);
}

/** Sidebar shortcut to drop the marker and compass target, shown only while one exists. */
function addClearButton(player, screen) {
	if (!hasSearchMarker(player) && !hasTarget(player)) return;

	screen.reveal("[cl]");
	screen.button(TAB.Clear, "Clear target", "textures/ui/cancel", () => {
		clearSearchMarker(player);
		clearTarget(player, { silent: true });
		player.sendMessage("§7Marker and compass cleared.");
	});
}

/** Dropdown order for the coordinate teleport's dimension picker. */
const DIMENSION_CHOICES = [
	{ label: "Current dimension" },
	{ label: "Overworld", id: "minecraft:overworld" },
	{ label: "The Nether", id: "minecraft:nether" },
	{ label: "The End", id: "minecraft:the_end" },
];

/** Bedrock's hard world edge, in blocks. */
const WORLD_LIMIT = 30_000_000;

/**
 * Plain modal - a text field is not something the custom screen replaces.
 * Y is optional: left blank, the player lands on the surface (or, in the
 * Nether, the nearest open floor around mid-height). Invalid input re-shows
 * the form with what was typed still in place.
 */
async function openCoordinateTeleport(player) {
	const here = player.location;
	let values = { x: String(Math.floor(here.x)), y: "", z: String(Math.floor(here.z)), dimension: 0 };
	let error;

	for (;;) {
		const form = new ModalFormData().title("Teleport to coordinates");
		if (error) form.label(`§c${error}`);
		form
			.header("Destination")
			.textField("X", "e.g. 1200", { defaultValue: values.x, tooltip: "East-west position. Negative numbers are west of the world origin." })
			.textField("Z", "e.g. -840", { defaultValue: values.z, tooltip: "North-south position. Negative numbers are north of the world origin." })
			.textField("Y (optional)", "Leave blank to land safely", {
				defaultValue: values.y,
				tooltip: "Height. Leave blank to land on the surface - or, in the Nether, the nearest open floor. If the given height is inside rock or lava you are moved to the closest safe block.",
			})
			.divider()
			.dropdown("Dimension", DIMENSION_CHOICES.map((choice) => choice.label), {
				defaultValueIndex: values.dimension,
				tooltip: "Coordinates are used as-is in the chosen dimension - no Nether scaling is applied.",
			})
			.submitButton("Teleport");

		const entered = await form.show(player);
		if (entered.canceled) return;

		// Headers, labels and dividers occupy formValues slots as undefined.
		const [xStr, zStr, yStr, dimensionIndex] = entered.formValues.filter((value) => value !== undefined);
		values = { x: xStr.trim(), z: zStr.trim(), y: yStr.trim(), dimension: dimensionIndex };
		const dimensionId = DIMENSION_CHOICES[dimensionIndex].id ?? player.dimension.id;
		const x = Number(values.x), z = Number(values.z);
		const y = values.y === "" ? undefined : Number(values.y);

		if (values.x === "" || values.z === "" || !Number.isInteger(x) || !Number.isInteger(z)) {
			error = "X and Z must be whole numbers.";
			continue;
		}
		if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) {
			error = `X and Z must be within ${WORLD_LIMIT.toLocaleString()} of the origin.`;
			continue;
		}
		if (y !== undefined) {
			const { min, max } = world.getDimension(dimensionId).heightRange;
			if (!Number.isInteger(y)) {
				error = "Y must be a whole number, or left blank.";
				continue;
			}
			if (y < min || y >= max) {
				error = `Y must be between ${min} and ${max - 1} in ${dimensionName(dimensionId)}.`;
				continue;
			}
		}

		const crossing = dimensionId !== player.dimension.id;
		return teleportSafely(player, { x, y, z, dimensionId }, (spot) =>
			player.sendMessage(
				spot
					? `§aTeleported to §f${spot.x}, ${spot.y}, ${spot.z}${crossing ? ` §ain ${dimensionName(dimensionId)}` : ""}`
					: `§aTeleported to §f${x}, ${z}${crossing ? ` §ain ${dimensionName(dimensionId)}` : ""}`,
			),
		);
	}
}

// ---------------------------------------------------------------------------
// Locating
// ---------------------------------------------------------------------------

function locateBiome(player, biome) {
	if (!checkDimension(player, biome)) return;

	let hit;
	try {
		hit = player.dimension.calculateClosestBiomeFromSeed(player.location, biome.id);
	} catch (err) {
		// An unknown biome id throws rather than returning undefined, so the
		// message needs to separate "bad id" from "nothing within range".
		player.sendMessage(`§cCould not search for ${biome.id}: §7${err}`);
		return;
	}

	if (!hit) {
		player.sendMessage(`§eNo ${shortName(biome)} found within the search range.`);
		return;
	}

	const x = Math.round(hit.x);
	const z = Math.round(hit.z);
	const distance = Math.round(Math.hypot(x - player.location.x, z - player.location.z));

	writeLastHit(player, { name: shortName(biome), x, z });

	// The marker sits at the player's own height: the locator bar cares about
	// direction, and the Y the API returns is a generation-space value.
	const marked = setSearchMarker(
		player,
		{ dimension: player.dimension, x, y: player.location.y, z },
		biome.color,
	);

	setTarget(player, { x, z, name: shortName(biome), color: biome.color, biomeId: biome.id });

	player.sendMessage(`§aNearest ${shortName(biome)}: §f${x}, ${z} §7(${distance} blocks away)`);
	player.onScreenDisplay.setActionBar(
		marked ? `§a${shortName(biome)} §7marked on the locator bar` : `§a${shortName(biome)} §f${x}, ${z}`,
	);
}

/** Only one temporary placement may own the global output gamerule at a time. */
let structureSearchBusy = false;

function locateStructure(player, structure) {
	if (!checkDimension(player, structure)) return;
	if (!canReceiveCommandBlockOutput(player)) {
		player.sendMessage("\u00a7cStructure search only works for operators - the game reports structure locations to operators alone. Ask the host to search, or to give you operator permission in the player list.");
		return;
	}
	if (structureSearchBusy) {
		player.sendMessage("\u00a7eAnother structure search is finishing. Try again in a moment.");
		return;
	}
	if (!world.gameRules.commandBlocksEnabled) {
		player.sendMessage("\u00a7cStructure search needs the commandBlocksEnabled gamerule turned on.");
		return;
	}
	const dimension = player.dimension;
	const spot = findScratchSpot(player);
	if (!spot) {
		player.sendMessage("\u00a7cNo safe empty space to run the search here - move somewhere more open.");
		return;
	}
	const power = { x: spot.x, y: spot.y + 1, z: spot.z };
	const previousOutput = world.gameRules.commandBlockOutput;
	const pending = [
		{ location: spot, typeId: "minecraft:command_block", permutation: dimension.getBlock(spot).permutation },
		{ location: power, typeId: "minecraft:redstone_block", permutation: dimension.getBlock(power).permutation },
	];
	structureSearchBusy = true;
	let outputRestored = false;
	const restore = () => {
		// Remove power first. Retry unloaded blocks, and never erase a replacement
		// placed by a player or another addon during the temporary search.
		for (let i = pending.length - 1; i >= 0; i--) {
			const entry = pending[i];
			try {
				const block = dimension.getBlock(entry.location);
				if (!block) continue;
				if (block.typeId === entry.typeId) block.setPermutation(entry.permutation);
				pending.splice(i, 1);
			} catch {} // Chunk may be unloaded; retain the reservation until cleanup.
		}
		if (!outputRestored) {
			world.gameRules.commandBlockOutput = previousOutput;
			outputRestored = true;
		}
		if (pending.length) { system.runTimeout(restore, 20); return; }
		structureSearchBusy = false;
	};
	try {
		world.gameRules.commandBlockOutput = true;
		player.runCommand(`structure load ${structureName(structure.id)} ${spot.x} ${spot.y} ${spot.z}`);
		player.runCommand(`setblock ${power.x} ${power.y} ${power.z} redstone_block`);
		rememberStructureSearch(player, structure);
	} catch (err) {
		restore();
		player.sendMessage(`\u00a7cCould not run the search: \u00a77${err}`);
		return;
	}
	system.runTimeout(() => {
		restore();
		openStructureCoordinates(player).catch(error => {
			try { player.sendMessage("\u00a7cCould not open coordinate entry: " + error); } catch {}
		});
	}, 4);
	player.sendMessage(`\u00a77Searching for ${shortName(structure)}...`);
}

/** Command-block output is delivered to operators only. */
function canReceiveCommandBlockOutput(player) {
	return player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
}

function structureName(id) {
	return `abc_${id.replace("minecraft:", "")}`;
}

/** A two-block air placement surrounded by air, including a two-block buffer
 * around its power source. Unknown/unloaded neighbours are never considered safe.
 * Use only readable space near the player; never overwrite existing world blocks. */
function findScratchSpot(player) {
	const dimension = player.dimension;
	const { min, max } = dimension.heightRange;
	const x = Math.floor(player.location.x), z = Math.floor(player.location.z);
	const from = Math.max(min + 2, Math.floor(player.location.y) + 2);
	for (let y = from; y < Math.min(from + 20, max - 3); y++) {
		let safe = true;
		for (let dx = -2; dx <= 2 && safe; dx++) {
			for (let dz = -2; dz <= 2 && safe; dz++) {
				for (let dy = -2; dy <= 3; dy++) {
					if (!peekBlock(dimension, { x: x + dx, y: y + dy, z: z + dz })?.isAir) { safe = false; break; }
				}
			}
		}
		if (safe) return { x, y, z };
	}
	return undefined;
}

/** Warn rather than silently return nothing when the target is elsewhere. */
function checkDimension(player, target) {
	if (target.dimensions.includes(player.dimension.id)) return true;
	player.sendMessage(`§c${shortName(target)} only generates in ${dimensionLabel(target)}.`);
	return false;
}

// ---------------------------------------------------------------------------
// Teleporting
// ---------------------------------------------------------------------------

/** getBlock throws for unloaded chunks in current APIs; treat that as "not loaded". */
function peekBlock(dimension, location) {
	try {
		return dimension.getBlock(location);
	} catch {
		return undefined;
	}
}

/** How far out (in blocks) the safe-spot search will look before giving up. */
const SAFE_SPOT_RADIUS = 48;
/** Vertical window around the death spot; lava-lake shores are usually a little above it. */
const SAFE_SPOT_BELOW = 10, SAFE_SPOT_ABOVE = 24;

/** Conservative full-cube support list: stable API has no collision-shape query.
 * Partial blocks, unknown/custom blocks and damaging ground are skipped. */
const SAFE_GROUND = new Set([
	"stone", "cobblestone", "mossy_cobblestone", "granite", "diorite", "andesite",
	"deepslate", "cobbled_deepslate", "tuff", "calcite", "dirt", "grass_block",
	"grass", "coarse_dirt", "rooted_dirt", "podzol", "mycelium", "moss_block",
	"clay", "mud", "packed_mud", "sandstone", "red_sandstone", "bedrock",
	"netherrack", "basalt", "polished_basalt", "smooth_basalt", "blackstone",
	"end_stone", "end_bricks", "obsidian", "crying_obsidian", "bricks",
	"stonebrick", "stone_bricks", "nether_brick", "nether_bricks", "snow",
	"snow_block", "ice", "packed_ice", "blue_ice", "crimson_nylium", "warped_nylium",
].map(id => "minecraft:" + id));
function isSafeGround(block) {
	if (!block || block.isAir || block.isLiquid || block.isWaterlogged) return false;
	return SAFE_GROUND.has(block.typeId) || /^minecraft:[a-z_]+_(planks|log|wood|wool|concrete|terracotta)$/.test(block.typeId);
}

/**
 * Best standable block on one square ring of columns around the origin: air
 * with air above and solid, non-liquid ground below. Each column is read
 * bottom-up in one pass so a ring of radius r costs ~8r column scans.
 */
function scanRing(dimension, origin, radius) {
	const { min, max } = dimension.heightRange;
	const ox = Math.floor(origin.x), oy = Math.floor(origin.y), oz = Math.floor(origin.z);
	const from = Math.max(min, oy - SAFE_SPOT_BELOW), to = Math.min(max - 2, oy + SAFE_SPOT_ABOVE);
	let best;
	const column = (x, z) => {
		let below = peekBlock(dimension, { x, y: from - 1, z });
		let here = peekBlock(dimension, { x, y: from, z });
		for (let y = from; y <= to; y++) {
			const above = peekBlock(dimension, { x, y: y + 1, z });
			if (here?.isAir && above?.isAir && isSafeGround(below)) {
				const distance = (x - ox) ** 2 + (y - oy) ** 2 * 2 + (z - oz) ** 2;
				if (!best || distance < best.distance) best = { x, y, z, distance, ground: below.typeId };
			}
			below = here;
			here = above;
		}
	};
	if (radius === 0) column(ox, oz);
	else {
		for (let d = -radius; d <= radius; d++) {
			column(ox + d, oz - radius);
			column(ox + d, oz + radius);
			if (Math.abs(d) < radius) {
				column(ox - radius, oz + d);
				column(ox + radius, oz + d);
			}
		}
	}
	return best;
}

/**
 * Shielded teleport that ends on standable ground.
 *
 * The destination chunk is often unloaded (another dimension, or far away), so
 * the ground cannot be inspected first. The player is shielded, dropped on the
 * requested spot, and once the blocks are readable moved to the nearest safe
 * footing - expanding one ring per tick so a lava ocean does not stall the
 * server. With y undefined the landing height is worked out on arrival: the
 * surface in the Overworld and End, or a mid-height search in the Nether where
 * the "surface" would be the bedrock roof.
 *
 * done(spot) is called only after a safe landing. Failures return the player
 * to their original position and report the failure directly.
 */
const activeTeleports = new Set();
function teleportSafely(player, { x, y, z, dimensionId }, done) {
	const log = (message) => console.warn(`[abc] teleport: ${message}`);
	const dimension = world.getDimension(dimensionId ?? player.dimension.id);
	const nether = dimension.id === "minecraft:nether";
	const column = { x: Math.floor(x), z: Math.floor(z) };
	if (activeTeleports.has(player.id)) {
		player.sendMessage("\u00a7eYour previous teleport is still finishing.");
		return;
	}
	const original = { location: { ...player.location }, dimension: player.dimension };
	const hop = Math.max(dimension.heightRange.min + 2, Math.min(dimension.heightRange.max - 2, y ?? (nether ? 64 : 200)));
	activeTeleports.add(player.id);

	try {
		player.addEffect("fire_resistance", 400, { showParticles: false });
		player.addEffect("resistance", 400, { amplifier: 4, showParticles: false });
		player.teleport({ x: column.x + 0.5, y: hop, z: column.z + 0.5 }, { dimension });

		let origin, waited = 0, radius = 0;
		const fail = (error) => {
			system.clearRun(poll);
			activeTeleports.delete(player.id);
			log(`failed: ${error}`);
			try {
				player.teleport(original.location, { dimension: original.dimension });
				player.extinguishFire(false);
				player.sendMessage("\u00a7cNo safe landing was found. Returned to your previous location.");
			} catch (rollbackError) { log(`could not return player: ${rollbackError}`); }
		};
		const finish = (safe) => {
			system.clearRun(poll);
			if (safe) {
				player.teleport({ x: safe.x + 0.5, y: safe.y, z: safe.z + 0.5 }, { dimension });
				if (safe.x !== origin.x || safe.y !== origin.y || safe.z !== origin.z) {
					log(`${origin.x}, ${origin.y}, ${origin.z} -> ${safe.x}, ${safe.y}, ${safe.z} on ${safe.ground} (ring ${radius})`);
				}
			} else {
				return fail("destination did not load or no standable ground was found");
			}
			activeTeleports.delete(player.id);
			player.extinguishFire(false);
			done(safe);
		};
		const poll = system.runInterval(() => {
			try {
				// Hold the player at the staging height while loading/scanning, so a
				// slow destination search cannot let them fall into the End void.
				player.teleport({ x: column.x + 0.5, y: hop, z: column.z + 0.5 }, { dimension });
				if (!origin) {
					const probe = peekBlock(dimension, { x: column.x, y: Math.floor(hop), z: column.z });
					if (!probe && ++waited < 60) return;
					if (!probe) {
						log(`chunk at ${column.x}, ${column.z} in ${dimension.id} still unloaded after ${waited} ticks`);
						return finish(undefined);
					}
					let start = Math.floor(hop);
					if (y === undefined && !nether) {
						const top = dimension.getTopmostBlock(column);
						if (top) start = top.y + 1;
					}
					origin = { x: column.x, y: start, z: column.z };
				}
				const safe = scanRing(dimension, origin, radius);
				if (safe) return finish(safe);
				if (++radius > SAFE_SPOT_RADIUS) return finish(undefined);
			} catch (error) {
				fail(error);
			}
		}, 1);
	} catch (error) {
		activeTeleports.delete(player.id);
		try { player.teleport(original.location, { dimension: original.dimension }); } catch {}
		player.sendMessage("\u00a7cCould not teleport safely: " + error);
	}
}

function teleportToDeath(player, death) {
	teleportSafely(player, death, () =>
		player.sendMessage(`§aTeleported to your death location: §f${describeDeath(death)}`),
	);
}

/** Surface landing at an XZ, for search results that only know the column. */
function teleportToSurface(player, x, z, dimensionId) {
	teleportSafely(player, { x, z, dimensionId }, (spot) =>
		player.sendMessage(spot ? `§aTeleported to §f${spot.x}, ${spot.y}, ${spot.z}` : `§aTeleported to §f${x}, ${z}`),
	);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function initializeCompass() {
	world.afterEvents.itemUse.subscribe((event) => {
		if (!isCompass(event.itemStack)) return;

		const player = event.source;

		system.run(() => ensureKeepOnDeath(player));

		// Sneak + use cancels the current search without opening the menu.
		if (player.isSneaking && hasTarget(player)) {
			system.run(() => {
				clearSearchMarker(player);
				clearTarget(player);
			});
			return;
		}

		// Forms cannot open from inside a read-only event handler.
		system.run(() => openMainMenu(player));
	});
}
