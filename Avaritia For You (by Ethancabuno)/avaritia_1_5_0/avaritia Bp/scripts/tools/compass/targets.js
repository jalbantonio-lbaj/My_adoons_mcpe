import { BiomeTypes } from "@minecraft/server";
/**
 * Advanced Bedrock Compass - locate targets
 *
 * Complete supplied Bedrock biome catalogue and locatable structures.
 * Numeric biome IDs are metadata; searches use namespaced resource IDs.
 *
 * Bedrock keeps a number of pre-1.13 biome identifiers - ice_plains rather
 * than snowy_plains, mesa rather than badlands, swampland rather than swamp.
 * The ids below are the Bedrock ones, which is what both the biome API and
 * /locate expect. Where the name players know differs, the label says so.
 */

/**
 * Button icons are vanilla texture paths. ActionFormData renders any texture
 * the client can resolve, and the vanilla resource pack is always present, so
 * every entry gets a recognisable picture without shipping any art. Paths were
 * checked against the 1.26.40 sample resource pack - a wrong one renders as a
 * blank square rather than erroring, so they are easy to get silently wrong.
 */

/** Shorthand for a locator-bar marker colour. */
const rgb = (red, green, blue) => ({ red, green, blue });
/** Terrain-inspired marker colours; hexadecimal RGB becomes normalized API colour. */
const hex = value => rgb(
	parseInt(value.slice(0, 2), 16) / 255,
	parseInt(value.slice(2, 4), 16) / 255,
	parseInt(value.slice(4, 6), 16) / 255,
);

/** Which dimension a target can be found in, so we can warn before searching. */
export const Dim = {
	Overworld: "minecraft:overworld",
	Nether: "minecraft:nether",
	End: "minecraft:the_end",
};

export const BIOMES = [
	{ id: "minecraft:ocean", biomeImage: "textures/ui/biomes/ocean", numericId: 0, name: "Ocean", dimensions: [Dim.Overworld], color: hex("4285D8"), icon: "textures/blocks/ice" },
	{ id: "minecraft:deep_ocean", biomeImage: "textures/ui/biomes/deep_ocean", numericId: 24, name: "Deep Ocean", dimensions: [Dim.Overworld], color: hex("365BC3"), icon: "textures/blocks/ice" },
	{ id: "minecraft:frozen_ocean", biomeImage: "textures/ui/biomes/frozen_ocean", numericId: 46, name: "Frozen Ocean", dimensions: [Dim.Overworld], color: hex("A4D6F1"), icon: "textures/blocks/snow" },
	{ id: "minecraft:deep_frozen_ocean", biomeImage: "textures/ui/biomes/deep_frozen_ocean", numericId: 47, name: "Deep Frozen Ocean", dimensions: [Dim.Overworld], color: hex("7FACD6"), icon: "textures/blocks/snow" },
	{ id: "minecraft:cold_ocean", biomeImage: "textures/ui/biomes/cold_ocean", numericId: 44, name: "Cold Ocean", dimensions: [Dim.Overworld], color: hex("608CC8"), icon: "textures/blocks/ice" },
	{ id: "minecraft:deep_cold_ocean", biomeImage: "textures/ui/biomes/deep_cold_ocean", numericId: 45, name: "Deep Cold Ocean", dimensions: [Dim.Overworld], color: hex("506CA9"), icon: "textures/blocks/ice" },
	{ id: "minecraft:lukewarm_ocean", biomeImage: "textures/ui/biomes/lukewarm_ocean", numericId: 42, name: "Lukewarm Ocean", dimensions: [Dim.Overworld], color: hex("42ACA9"), icon: "textures/blocks/ice" },
	{ id: "minecraft:deep_lukewarm_ocean", biomeImage: "textures/ui/biomes/deep_lukewarm_ocean", numericId: 43, name: "Deep Lukewarm Ocean", dimensions: [Dim.Overworld], color: hex("398987"), icon: "textures/blocks/ice" },
	{ id: "minecraft:warm_ocean", biomeImage: "textures/ui/biomes/warm_ocean", numericId: 40, name: "Warm Ocean", dimensions: [Dim.Overworld], color: hex("42CCC1"), icon: "textures/blocks/ice" },
	{ id: "minecraft:river", biomeImage: "textures/ui/biomes/river", numericId: 7, name: "River", dimensions: [Dim.Overworld], color: hex("5B9EE1"), icon: "textures/blocks/ice" },
	{ id: "minecraft:frozen_river", biomeImage: "textures/ui/biomes/frozen_river", numericId: 11, name: "Frozen River", dimensions: [Dim.Overworld], color: hex("B6E3F3"), icon: "textures/blocks/snow" },
	{ id: "minecraft:beach", biomeImage: "textures/ui/biomes/beach", numericId: 16, name: "Beach", dimensions: [Dim.Overworld], color: hex("E7D696"), icon: "textures/blocks/sand" },
	{ id: "minecraft:stone_beach", biomeImage: "textures/ui/biomes/stony_shore", numericId: 25, name: "Stony Shore", dimensions: [Dim.Overworld], color: hex("A0A6AB"), icon: "textures/blocks/gravel" },
	{ id: "minecraft:cold_beach", biomeImage: "textures/ui/biomes/snowy_beach", numericId: 26, name: "Snowy Beach", dimensions: [Dim.Overworld], color: hex("D3DFE6"), icon: "textures/blocks/snow" },
	{ id: "minecraft:forest", biomeImage: "textures/ui/biomes/forest", numericId: 4, name: "Forest", dimensions: [Dim.Overworld], color: hex("5F9B45"), icon: "textures/blocks/leaves_oak" },
	{ id: "minecraft:flower_forest", biomeImage: "textures/ui/biomes/flower_forest", numericId: 132, name: "Flower Forest", dimensions: [Dim.Overworld], color: hex("D58BAE"), icon: "textures/blocks/leaves_oak" },
	{ id: "minecraft:birch_forest", biomeImage: "textures/ui/biomes/birch_forest", numericId: 27, name: "Birch Forest", dimensions: [Dim.Overworld], color: hex("9ABE60"), icon: "textures/blocks/leaves_birch" },
	{ id: "minecraft:birch_forest_mutated", biomeImage: "textures/ui/biomes/old_growth_birch_forest", numericId: 155, name: "Old Growth Birch Forest", dimensions: [Dim.Overworld], color: hex("83A85A"), icon: "textures/blocks/leaves_birch" },
	{ id: "minecraft:roofed_forest", biomeImage: "textures/ui/biomes/dark_forest", numericId: 29, name: "Dark Forest", dimensions: [Dim.Overworld], color: hex("56783C"), icon: "textures/blocks/leaves_big_oak" },
	{ id: "minecraft:pale_garden", biomeImage: "textures/ui/biomes/pale_garden", numericId: 193, name: "Pale Garden", dimensions: [Dim.Overworld], color: hex("B7C0B0"), icon: "textures/blocks/pale_oak_leaves" },
	{ id: "minecraft:jungle", biomeImage: "textures/ui/biomes/jungle", numericId: 21, name: "Jungle", dimensions: [Dim.Overworld], color: hex("4B9C36"), icon: "textures/blocks/leaves_jungle" },
	{ id: "minecraft:jungle_edge", biomeImage: "textures/ui/biomes/sparse_jungle", numericId: 23, name: "Sparse Jungle", dimensions: [Dim.Overworld], color: hex("76AB48"), icon: "textures/blocks/leaves_jungle" },
	{ id: "minecraft:bamboo_jungle", biomeImage: "textures/ui/biomes/bamboo_jungle", numericId: 48, name: "Bamboo Jungle", dimensions: [Dim.Overworld], color: hex("9FC943"), icon: "textures/blocks/leaves_jungle" },
	{ id: "minecraft:taiga", biomeImage: "textures/ui/biomes/taiga", numericId: 5, name: "Taiga", dimensions: [Dim.Overworld], color: hex("579278"), icon: "textures/blocks/leaves_spruce" },
	{ id: "minecraft:cold_taiga", biomeImage: "textures/ui/biomes/snowy_taiga", numericId: 30, name: "Snowy Taiga", dimensions: [Dim.Overworld], color: hex("AACCC5"), icon: "textures/blocks/snow" },
	{ id: "minecraft:mega_taiga", biomeImage: "textures/ui/biomes/old_growth_pine_taiga", numericId: 32, name: "Old Growth Pine Taiga", dimensions: [Dim.Overworld], color: hex("7E9160"), icon: "textures/blocks/leaves_spruce" },
	{ id: "minecraft:redwood_taiga_mutated", biomeImage: "textures/ui/biomes/old_growth_spruce_taiga", numericId: 160, name: "Old Growth Spruce Taiga", dimensions: [Dim.Overworld], color: hex("4F8365"), icon: "textures/blocks/leaves_spruce" },
	{ id: "minecraft:mushroom_island", biomeImage: "textures/ui/biomes/mushroom_fields", numericId: 14, name: "Mushroom Fields", dimensions: [Dim.Overworld], color: hex("BE707F"), icon: "textures/blocks/mycelium_side" },
	{ id: "minecraft:swampland", biomeImage: "textures/ui/biomes/swamp", numericId: 6, name: "Swamp", dimensions: [Dim.Overworld], color: hex("728A43"), icon: "textures/blocks/mud" },
	{ id: "minecraft:mangrove_swamp", biomeImage: "textures/ui/biomes/mangrove_swamp", numericId: 191, name: "Mangrove Swamp", dimensions: [Dim.Overworld], color: hex("58875F"), icon: "textures/blocks/snow" },
	{ id: "minecraft:savanna", biomeImage: "textures/ui/biomes/savanna", numericId: 35, name: "Savanna", dimensions: [Dim.Overworld], color: hex("C3BA54"), icon: "textures/blocks/grass_side_carried" },
	{ id: "minecraft:savanna_plateau", biomeImage: "textures/ui/biomes/savanna_plateau", numericId: 36, name: "Savanna Plateau", dimensions: [Dim.Overworld], color: hex("AEA14A"), icon: "textures/blocks/grass_side_carried" },
	{ id: "minecraft:savanna_mutated", biomeImage: "textures/ui/biomes/windswept_savanna", numericId: 163, name: "Windswept Savanna", dimensions: [Dim.Overworld], color: hex("C5A45A"), icon: "textures/blocks/grass_side_carried" },
	{ id: "minecraft:plains", biomeImage: "textures/ui/biomes/plains", numericId: 1, name: "Plains", dimensions: [Dim.Overworld], color: hex("81B657"), icon: "textures/blocks/grass_side_carried" },
	{ id: "minecraft:sunflower_plains", biomeImage: "textures/ui/biomes/sunflower_plains", numericId: 129, name: "Sunflower Plains", dimensions: [Dim.Overworld], color: hex("E7C64C"), icon: "textures/blocks/grass_side_carried" },
	{ id: "minecraft:desert", biomeImage: "textures/ui/biomes/desert", numericId: 2, name: "Desert", dimensions: [Dim.Overworld], color: hex("EBC471"), icon: "textures/blocks/sand" },
	{ id: "minecraft:ice_plains", biomeImage: "textures/ui/biomes/snowy_plains", numericId: 12, name: "Snowy Plains", dimensions: [Dim.Overworld], color: hex("DCEFF2"), icon: "textures/blocks/snow" },
	{ id: "minecraft:ice_plains_spikes", biomeImage: "textures/ui/biomes/ice_spikes", numericId: 140, name: "Ice Spikes", dimensions: [Dim.Overworld], color: hex("8EDAF1"), icon: "textures/blocks/snow" },
	{ id: "minecraft:extreme_hills", biomeImage: "textures/ui/biomes/windswept_hills", numericId: 3, name: "Windswept Hills", dimensions: [Dim.Overworld], color: hex("A5AA9B"), icon: "textures/blocks/gravel" },
	{ id: "minecraft:extreme_hills_plus_trees", biomeImage: "textures/ui/biomes/windswept_forest", numericId: 34, name: "Windswept Forest", dimensions: [Dim.Overworld], color: hex("839E6E"), icon: "textures/blocks/gravel" },
	{ id: "minecraft:extreme_hills_mutated", biomeImage: "textures/ui/biomes/windswept_gravelly_hills", numericId: 131, name: "Windswept Gravelly Hills", dimensions: [Dim.Overworld], color: hex("A2A0A4"), icon: "textures/blocks/gravel" },
	{ id: "minecraft:mesa", biomeImage: "textures/ui/biomes/badlands", numericId: 37, name: "Badlands", dimensions: [Dim.Overworld], color: hex("D07B46"), icon: "textures/blocks/hardened_clay_stained_orange" },
	{ id: "minecraft:mesa_plateau_stone", biomeImage: "textures/ui/biomes/wooded_badlands_plateau", numericId: 38, name: "Wooded Badlands", dimensions: [Dim.Overworld], color: hex("A88349"), icon: "textures/blocks/hardened_clay_stained_orange" },
	{ id: "minecraft:mesa_bryce", biomeImage: "textures/ui/biomes/eroded_badlands", numericId: 165, name: "Eroded Badlands", dimensions: [Dim.Overworld], color: hex("E08A4D"), icon: "textures/blocks/hardened_clay_stained_orange" },
	{ id: "minecraft:meadow", biomeImage: "textures/ui/biomes/meadow", numericId: 186, name: "Meadow", dimensions: [Dim.Overworld], color: hex("9BBC6D"), icon: "textures/blocks/grass_side_carried" },
	{ id: "minecraft:cherry_grove", biomeImage: "textures/ui/biomes/cherry_grove", numericId: 192, name: "Cherry Grove", dimensions: [Dim.Overworld], color: hex("EFA0C2"), icon: "textures/blocks/cherry_leaves_opaque" },
	{ id: "minecraft:grove", biomeImage: "textures/ui/biomes/grove", numericId: 185, name: "Grove", dimensions: [Dim.Overworld], color: hex("B5CCC0"), icon: "textures/blocks/snow" },
	{ id: "minecraft:snowy_slopes", biomeImage: "textures/ui/biomes/snowy_slopes_1_18", numericId: 184, name: "Snowy Slopes", dimensions: [Dim.Overworld], color: hex("EAF1F2"), icon: "textures/blocks/snow" },
	{ id: "minecraft:jagged_peaks", biomeImage: "textures/ui/biomes/jagged_peaks", numericId: 182, name: "Jagged Peaks", dimensions: [Dim.Overworld], color: hex("BDC9D5"), icon: "textures/blocks/gravel" },
	{ id: "minecraft:frozen_peaks", biomeImage: "textures/ui/biomes/frozen_peaks", numericId: 183, name: "Frozen Peaks", dimensions: [Dim.Overworld], color: hex("ACCFE7"), icon: "textures/blocks/snow" },
	{ id: "minecraft:stony_peaks", biomeImage: "textures/ui/biomes/stony_peaks", numericId: 189, name: "Stony Peaks", dimensions: [Dim.Overworld], color: hex("AAA995"), icon: "textures/blocks/gravel" },
	{ id: "minecraft:lush_caves", biomeImage: "textures/ui/biomes/lush_caves", numericId: 187, name: "Lush Caves", dimensions: [Dim.Overworld], color: hex("82BB48"), icon: "textures/blocks/moss_block" },
	{ id: "minecraft:dripstone_caves", biomeImage: "textures/ui/biomes/dripstone_caves_light", numericId: 188, name: "Dripstone Caves", dimensions: [Dim.Overworld], color: hex("BB8E6D"), icon: "textures/blocks/dripstone_block" },
	{ id: "minecraft:deep_dark", biomeImage: "textures/ui/biomes/deep_dark_light", numericId: 190, name: "Deep Dark", dimensions: [Dim.Overworld], color: hex("3A9692"), icon: "textures/blocks/sculk" },
	{ id: "minecraft:sulfur_caves", biomeImage: "textures/ui/biomes/sulfur_caves_light", numericId: 194, name: "Sulfur Caves", dimensions: [Dim.Overworld], color: hex("D9CF4B"), icon: "textures/blocks/sulfur" },
	{ id: "minecraft:dappled_forest", biomeImage: "textures/ui/biomes/dappled_forest", numericId: 195, name: "Dappled Forest", dimensions: [Dim.Overworld], color: hex("C2BD64"), icon: "textures/blocks/leaves_oak" },
	{ id: "minecraft:ice_caves", optional: true, name: "Ice Caves", dimensions: [Dim.Overworld], color: hex("9FD7F5"), icon: "textures/blocks/packed_ice" },
	{ id: "minecraft:hell", biomeImage: "textures/ui/biomes/nether", numericId: 8, name: "Nether Wastes", dimensions: [Dim.Nether], color: hex("C26856"), icon: "textures/blocks/netherrack" },
	{ id: "minecraft:crimson_forest", biomeImage: "textures/ui/biomes/crimson_forest", numericId: 179, name: "Crimson Forest", dimensions: [Dim.Nether], color: hex("DB4C66"), icon: "textures/blocks/crimson_nylium_side" },
	{ id: "minecraft:warped_forest", biomeImage: "textures/ui/biomes/warped_forest", numericId: 180, name: "Warped Forest", dimensions: [Dim.Nether], color: hex("43C5AB"), icon: "textures/blocks/warped_nylium_side" },
	{ id: "minecraft:soulsand_valley", biomeImage: "textures/ui/biomes/soul_sand_valley", numericId: 178, name: "Soul Sand Valley", dimensions: [Dim.Nether], color: hex("88BEC9"), icon: "textures/blocks/soul_sand" },
	{ id: "minecraft:basalt_deltas", biomeImage: "textures/ui/biomes/basalt_deltas", numericId: 181, name: "Basalt Deltas", dimensions: [Dim.Nether], color: hex("9697A3"), icon: "textures/blocks/basalt_side" },
	{ id: "minecraft:the_end", numericId: 9, name: "The End", dimensions: [Dim.End], color: hex("DDD6A0"), icon: "textures/blocks/end_stone" },
];

/**
 * Ids as /locate structure accepts them - snake_case, which is not always the
 * spelling used elsewhere in the game. Run "/locate structure " in chat and
 * let autocomplete list them if one ever stops working.
 *
 * Abandoned camps are appended after these as their own run of cards - see
 * ABANDONED_CAMPS below.
 */
const MAIN_STRUCTURES = [
	{ id: "minecraft:village", locatorIcon: { path: "textures/ui/locator/structures/village", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/village_vibrant_visuals", name: "Village", dimensions: [Dim.Overworld], icon: "textures/items/emerald" },
	{ id: "minecraft:pillager_outpost", locatorIcon: { path: "textures/ui/locator/structures/pillager_outpost", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/pillager_outpost_vibrant_visuals", name: "Pillager Outpost", dimensions: [Dim.Overworld], icon: "textures/items/crossbow_standby" },
	{ id: "minecraft:mansion", locatorIcon: { path: "textures/ui/locator/structures/mansion", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/woodland_mansion_vibrant_visuals", name: "Woodland Mansion", dimensions: [Dim.Overworld], icon: "textures/blocks/planks_big_oak" },
	{ id: "minecraft:temple", locatorIcon: { path: "textures/ui/locator/structures/temple", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/desert_pyramid_vibrant_visuals", name: "Temple", dimensions: [Dim.Overworld], icon: "textures/blocks/sandstone_normal" },
	{ id: "minecraft:trial_chambers", locatorIcon: { path: "textures/ui/locator/structures/trial_chambers", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/trial_chambers_vibrant_visuals", name: "Trial Chambers", dimensions: [Dim.Overworld], icon: "textures/items/ominous_trial_key" },
	{ id: "minecraft:ancient_city", locatorIcon: { path: "textures/ui/locator/structures/ancient_city", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/ancient_city_vibrant_visuals", name: "Ancient City", dimensions: [Dim.Overworld], icon: "textures/items/echo_shard" },
	{ id: "minecraft:stronghold", locatorIcon: { path: "textures/ui/locator/structures/stronghold", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/stronghold_vibrant_visuals", name: "Stronghold", dimensions: [Dim.Overworld], icon: "textures/items/ender_eye" },
	{ id: "minecraft:mineshaft", locatorIcon: { path: "textures/ui/locator/structures/mineshaft", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/mineshaft_vibrant_visuals", name: "Mineshaft", dimensions: [Dim.Overworld], icon: "textures/items/minecart_normal" },
	{ id: "minecraft:trail_ruins", locatorIcon: { path: "textures/ui/locator/structures/trail_ruins", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/trail_ruins_vibrant_visuals", name: "Trail Ruins", dimensions: [Dim.Overworld], icon: "textures/items/brush" },
	{ id: "minecraft:monument", locatorIcon: { path: "textures/ui/locator/structures/monument", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/ocean_monument_vibrant_visuals", name: "Ocean Monument", dimensions: [Dim.Overworld], icon: "textures/blocks/prismarine_bricks" },
	{ id: "minecraft:shipwreck", locatorIcon: { path: "textures/ui/locator/structures/shipwreck", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/shipwreck_vibrant_visuals", name: "Shipwreck", dimensions: [Dim.Overworld], icon: "textures/items/boat" },
	{ id: "minecraft:ruins", locatorIcon: { path: "textures/ui/locator/structures/ruins", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/ocean_ruins_vibrant_visuals", name: "Ocean Ruins", dimensions: [Dim.Overworld], icon: "textures/blocks/prismarine_rough" },
	{ id: "minecraft:buried_treasure", locatorIcon: { path: "textures/ui/locator/structures/buried_treasure", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/buried_treasure_vibrant_visuals", name: "Buried Treasure", dimensions: [Dim.Overworld], icon: "textures/items/map_filled" },
	{ id: "minecraft:ruined_portal", locatorIcon: { path: "textures/ui/locator/structures/ruined_portal", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/ruined_portal_vibrant_visuals", name: "Ruined Portal", dimensions: [Dim.Overworld, Dim.Nether], icon: "textures/blocks/obsidian" },
	{ id: "minecraft:fortress", locatorIcon: { path: "textures/ui/locator/structures/fortress", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/nether_fortress_vibrant_visuals", name: "Nether Fortress", dimensions: [Dim.Nether], icon: "textures/blocks/nether_brick" },
	{ id: "minecraft:bastion_remnant", locatorIcon: { path: "textures/ui/locator/structures/bastion_remnant", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/bastion_remnant_vibrant_visuals", name: "Bastion Remnant", dimensions: [Dim.Nether], icon: "textures/blocks/blackstone" },
	{ id: "minecraft:end_city", locatorIcon: { path: "textures/ui/locator/structures/end_city", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/end_city_vibrant_visuals", name: "End City", dimensions: [Dim.End], icon: "textures/blocks/end_bricks" },
	{ id: "minecraft:abandoned_camp", locatorIcon: { path: "textures/ui/locator/structures/abandoned_camp", iconWidth: 1, iconHeight: 1 }, structureImage: "textures/ui/structures/abandoned_camp_forest", name: "Abandoned Camp (any)", dimensions: [Dim.Overworld], icon: "textures/ui/locator/structures/abandoned_camp" },
];

/**
 * Abandoned camps have one /locate id per biome they spawn in - the id is
 * "minecraft:abandoned_camp_" followed by the biome id, so each card borrows
 * that biome's picture. The list is what "/locate structure abandoned_camp_"
 * autocompletes; every entry must name a biome in BIOMES.
 */
const CAMP_BIOMES = [
	"bamboo_jungle", "birch_forest", "birch_forest_mutated", "cherry_grove", "cold_taiga", "dappled_forest",
	"extreme_hills_plus_trees", "flower_forest", "forest", "jungle_edge", "meadow", "mega_taiga",
	"mesa_plateau_stone", "pale_garden", "redwood_taiga_mutated", "savanna", "swampland", "taiga",
];
const CAMP_ICON = "textures/ui/locator/structures/abandoned_camp";
/**
 * Camp-specific card pictures, keyed by biome id; a camp without one falls
 * back to its biome's picture. Built from the camp screenshots folder with
 * "npm run build:camp-images -- <folder>" - the output names come from the
 * source filenames listed in tools/structure-image-map.json.
 */
const CAMP_IMAGES = {
	bamboo_jungle: "textures/ui/structures/abandoned_camp_bamboo_jungle",
	birch_forest: "textures/ui/structures/abandoned_camp_birch_forest",
	birch_forest_mutated: "textures/ui/structures/abandoned_camp_old_growth_birch",
	cherry_grove: "textures/ui/structures/abandoned_camp_cherry_grove",
	cold_taiga: "textures/ui/structures/abandoned_camp_snowy_taiga",
	dappled_forest: "textures/ui/structures/abandoned_camp_dappled_forest",
	extreme_hills_plus_trees: "textures/ui/structures/abandoned_camp_windswept",
	flower_forest: "textures/ui/structures/abandoned_camp_flower_forest",
	forest: "textures/ui/structures/abandoned_camp_forest",
	jungle_edge: "textures/ui/structures/abandoned_camp_sparse_jungle",
	meadow: "textures/ui/structures/abandoned_camp_meadow",
	mega_taiga: "textures/ui/structures/abandoned_camp_old_growth_pine",
	mesa_plateau_stone: "textures/ui/structures/abandoned_camp_wooded_badlands",
	pale_garden: "textures/ui/structures/abandoned_camp_pale_garden",
	redwood_taiga_mutated: "textures/ui/structures/abandoned_camp_old_growth_spruce",
	savanna: "textures/ui/structures/abandoned_camp_savanna",
	swampland: "textures/ui/structures/abandoned_camp_swamp",
	taiga: "textures/ui/structures/abandoned_camp_taiga",
};
export const ABANDONED_CAMPS = CAMP_BIOMES.map((biomeId) => {
	const biome = BIOMES.find((entry) => entry.id === "minecraft:" + biomeId);
	if (!biome) throw new Error("Abandoned camp names an unknown biome: " + biomeId);
	return {
		id: "minecraft:abandoned_camp_" + biomeId,
		locatorIcon: { path: CAMP_ICON, iconWidth: 1, iconHeight: 1 },
		structureImage: CAMP_IMAGES[biomeId] ?? biome.biomeImage,
		name: "Camp: " + biome.name,
		dimensions: [Dim.Overworld],
		icon: CAMP_ICON,
		camp: true,
	};
});

export const STRUCTURES = [...MAIN_STRUCTURES, ...ABANDONED_CAMPS];

/** Human-readable name for a single dimension id. */
export function dimensionName(dimensionId) {
	if (dimensionId === Dim.Nether) return "the Nether";
	if (dimensionId === Dim.End) return "the End";
	return "the Overworld";
}

/** Human-readable list of where a target can be found, for messages. */
export function dimensionLabel(target) {
	const names = target.dimensions.map(dimensionName);

	return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}

/** Strip the "\n§7legacy_id" hint so messages stay on one line. */
export function shortName(target) {
	return target.name.split("\n")[0];
}

/** Dimension caption for light buttons, shared by deaths and saved waypoints. */
export function describeDimension(dimensionId) {
	const color = ({ "minecraft:nether": "\u00a74", "minecraft:the_end": "\u00a75" })[dimensionId] ?? "\u00a72";
	const name = dimensionName(dimensionId);
	return color + name.charAt(0).toUpperCase() + name.slice(1);
}

/** "mypack:cool_biome" -> "Cool Biome". */
function prettyId(id) {
	return String(id).split(":").pop().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

/**
 * Listed biomes plus any biome another add-on registers (non-minecraft namespace),
 * so custom biomes show up in the menu without anyone typing an id.
 */
export function allBiomes() {
	const known = new Set(BIOMES.map((biome) => biome.id));
	const extra = [];
	try {
		for (const type of BiomeTypes.getAll()) {
			const id = type.id;
			if (known.has(id) || id.startsWith("minecraft:")) continue;
			extra.push({
				id, name: prettyId(id), dimensions: [Dim.Overworld, Dim.Nether, Dim.End],
				color: hex("B388FF"), icon: "textures/blocks/end_stone",
			});
		}
	} catch {
		// BiomeTypes unavailable - the built-in list is still complete.
	}
	extra.sort((a, b) => a.name.localeCompare(b.name));
	// "optional" entries (newer biomes) are listed only when the running game actually has them.
	const listed = BIOMES.filter((biome) => {
		if (!biome.optional) return true;
		try { return Boolean(BiomeTypes.get(biome.id)); } catch { return false; }
	});
	return [...listed, ...extra];
}
