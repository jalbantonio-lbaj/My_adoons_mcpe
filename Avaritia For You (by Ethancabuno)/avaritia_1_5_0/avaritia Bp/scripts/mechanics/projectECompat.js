import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server";

/**
 * ===== PROJECT E / PROJECT MATTER COMPATIBILITY (EMC) =====
 * STANDALONE: does not touch other Avaritia files. Without Project E / Project Matter nothing happens.
 *
 * Why a scriptevent: each addon keeps its EMC table inside its own scripts and world dynamic
 * properties are private to each pack, so Avaritia can only use the commands those addons expose:
 *   Project E       :  /projecte:item add <item> <emc>          (saved by Project E in the world)
 *   Project Matter  :  /project_matter:set emc <emc>            (applies to the item in the MAIN HAND)
 * Each addon gets values computed with ITS OWN vanilla EMC table.
 * Both commands take a 32-bit integer (max 2,147,483,647). The MOST EXPENSIVE item of each table is sent as
 * exactly 2,147,483,647 and every other price is divided by the same factor (max / 2,147,483,647), so the
 * relative prices stay exact. Cheap items round to at least 1 EMC.
 *
 * AUTOMATIC: the first time an operator joins a world the prices are set by themselves (see AUTOMATIC SETUP below).
 * Manual commands (only needed to redo it):
 *   /scriptevent avaritia:emc_sync pe     -> Project E only
 *   /scriptevent avaritia:emc_sync pm     -> Project Matter only (your main hand is borrowed for about a minute and restored)
 *   /scriptevent avaritia:emc_sync all    -> both
 */
const CAP = 2147483647; // max value of the commands' 32-bit integer
const scaled = (v, f) => Math.min(CAP, Math.max(1, Math.round(v / f)));

// Exact prices (before scaling).
const EMC_PE = {
  "avaritia:admin_inventory_viewer": 1,
  "avaritia:heaven_arrow_ammo": 1,
  "avaritia:rf_burning": 1,
  "avaritia:rf_progress_01": 1,
  "avaritia:rf_progress_02": 1,
  "avaritia:rf_progress_03": 1,
  "avaritia:rf_progress_04": 1,
  "avaritia:rf_progress_05": 1,
  "avaritia:rf_progress_06": 1,
  "avaritia:rf_progress_07": 1,
  "avaritia:rf_progress_08": 1,
  "avaritia:rf_progress_09": 1,
  "avaritia:rf_progress_10": 1,
  "avaritia:rf_progress_11": 1,
  "avaritia:rf_progress_12": 1,
  "avaritia:rf_progress_13": 1,
  "avaritia:rf_progress_14": 1,
  "avaritia:rf_progress_15": 1,
  "avaritia:rf_progress_16": 1,
  "avaritia:rf_progress_17": 1,
  "avaritia:rf_progress_18": 1,
  "avaritia:rf_progress_19": 1,
  "avaritia:rf_progress_20": 1,
  "avaritia:compressed_crafting_table": 288,
  "avaritia:anim_ultimate_stew": 480,
  "avaritia:ultimate_stew": 480,
  "avaritia:anim_cosmic_meatballs": 512,
  "avaritia:cosmic_meatballs": 512,
  "avaritia:record_fragment": 768,
  "avaritia:eternal_fire_blue": 1024,
  "avaritia:eternal_fire_green": 1024,
  "avaritia:eternal_fire_light_blue": 1024,
  "avaritia:eternal_fire_orange": 1024,
  "avaritia:eternal_fire_pink": 1024,
  "avaritia:eternal_fire_purple": 1024,
  "avaritia:eternal_fire_rainbow": 1024,
  "avaritia:eternal_fire_red": 1024,
  "avaritia:eternal_fire_yellow": 1024,
  "avaritia:anim_pile_of_neutrons": 1536,
  "avaritia:pile_of_neutrons": 1536,
  "avaritia:double_compressed_crafting_table": 2592,
  "avaritia:anim_neutronium_nugget": 13824,
  "avaritia:neutronium_nugget": 13824,
  "avaritia:diamond_lattice": 40960,
  "avaritia:starfuel": 57856,
  "avaritia:anim_neutronium_ingot": 124416,
  "avaritia:neutronium_ingot": 124416,
  "avaritia:crystal_matrix": 442368,
  "halo:neon_crystal": 42369798,
  "avaritia:anim_soul_sand_singularity": 490000,
  "avaritia:soul_sand_singularity": 490000,
  "avaritia:anim_neutronium_gear": 511488,
  "avaritia:neutronium_gear": 511488,
  "avaritia:gacha_machine": 588866,
  "avaritia:anim_obsidian_singularity": 640000,
  "avaritia:obsidian_singularity": 640000,
  "avaritia:anim_endest_pearl": 669720,
  "avaritia:endest_pearl": 669720,
  "avaritia:anim_experience_singularity": 1000000,
  "avaritia:experience_singularity": 1000000,
  "avaritia:record_furnace": 1074208,
  "avaritia:anim_neutronium_block": 1119744,
  "avaritia:matter_cluster": 1119744,
  "avaritia:neutronium_block": 1119744,
  "avaritia:neutronium_block_item": 1119744,
  "avaritia:amethyst_singularity": 2560000,
  "avaritia:anim_amethyst_singularity": 2560000,
  "avaritia:anim_slime_singularity": 2880000,
  "avaritia:slime_singularity": 2880000,
  "avaritia:neutron_collector": 3166720,
  "avaritia:dire_crafting_table": 3541536,
  "avaritia:crystal_matrix_block": 3981312,
  "avaritia:seal_orb": 4208664,
  "avaritia:seal_orb_full": 4208664,
  "avaritia:skullfire_sword": 4568192,
  "avaritia:anim_redstone_singularity": 5760000,
  "avaritia:redstone_singularity": 5760000,
  "avaritia:anim_honey_singularity": 6400000,
  "avaritia:honey_singularity": 6400000,
  "avaritia:anim_neutronium_star": 9469440,
  "avaritia:neutronium_star": 9469440,
  "avaritia:anim_quartz_singularity": 10240000,
  "avaritia:quartz_singularity": 10240000,
  "avaritia:anim_coal_singularity": 11520000,
  "avaritia:anim_copper_singularity": 11520000,
  "avaritia:coal_singularity": 11520000,
  "avaritia:copper_singularity": 11520000,
  "avaritia:neutronium_compressor": 15928128,
  "avaritia:anim_iron_singularity": 23040000,
  "avaritia:iron_singularity": 23040000,
  "avaritia:anim_netherrack_singularity": 10000,
  "avaritia:netherrack_singularity": 10000,
  "avaritia:anim_glowstone_singularity": 15360000,
  "avaritia:glowstone_singularity": 15360000,
  "avaritia:anim_prismarine_singularity": 10240000,
  "avaritia:prismarine_singularity": 10240000,
  "avaritia:anim_end_stone_singularity": 10000,
  "avaritia:end_stone_singularity": 10000,
  "avaritia:anim_magma_singularity": 32000000,
  "avaritia:magma_singularity": 32000000,
  "avaritia:anim_bone_singularity": 4320000,
  "avaritia:bone_singularity": 4320000,
  "avaritia:anim_ice_singularity": 90000,
  "avaritia:ice_singularity": 90000,
  "avaritia:anim_lapis_singularity": 77760000,
  "avaritia:lapis_singularity": 77760000,
  "avaritia:anim_gold_singularity": 184320000,
  "avaritia:gold_singularity": 184320000,
  "avaritia:anim_diamond_singularity": 737280000,
  "avaritia:diamond_singularity": 737280000,
  "avaritia:anim_emerald_singularity": 1474560000,
  "avaritia:emerald_singularity": 1474560000,
  "avaritia:anim_netherite_singularity": 5160960000,
  "avaritia:netherite_singularity": 5160960000,
  "avaritia:anim_ultimate_singularity": 7772960000,
  "avaritia:ultimate_singularity": 7772960000,
  "avaritia:anim_infinity_catalyst": 7711659336,
  "avaritia:infinity_catalyst": 7711659336,
  "avaritia:anim_infinity_nugget": 9426184706,
  "avaritia:infinity_nugget": 9426184706,
  "avaritia:asgardandelion": 73924736904,
  "avaritia:asgardandelion_item": 73924736904,
  "avaritia:anim_infinity_ingot": 84835662360,
  "avaritia:infinity_ingot": 84835662360,
  "avaritia:infinity_flint_and_steel": 84835786780,
  "avaritia:infinity_fishing_rod": 169671573600,
  "avaritia:infinity_fishing_rod_cast": 169671573600,
  "avaritia:infinity_shears": 169672583216,
  "avaritia:anim_infinity_clock": 339342649440,
  "avaritia:infinity_clock": 339342649440,
  "avaritia:infinity_totem_frost": 339342649584,
  "avaritia:infinity_totem_shadow": 339345209440,
  "avaritia:infinity_totem_ender": 339345328320,
  "avaritia:infinity_totem_berserker": 339365689440,
  "avaritia:infinity_totem_mercy": 339368249440,
  "avaritia:infinity_totem_gale": 339383609440,
  "avaritia:infinity_totem_inferno": 339388729440,
  "avaritia:infinity_totem_tide": 339653689440,
  "avaritia:infinity_totem_fortune": 340079929440,
  "avaritia:infinity_totem_clairvoyance": 342291769440,
  "avaritia:infinity_totem_vitality": 345240889440,
  "avaritia:infinity_totem_void": 359986489440,
  "avaritia:biome_compass_1": 509016655056,
  "avaritia:biome_compass_10": 509016655056,
  "avaritia:biome_compass_11": 509016655056,
  "avaritia:biome_compass_12": 509016655056,
  "avaritia:biome_compass_13": 509016655056,
  "avaritia:biome_compass_14": 509016655056,
  "avaritia:biome_compass_15": 509016655056,
  "avaritia:biome_compass_16": 509016655056,
  "avaritia:biome_compass_17": 509016655056,
  "avaritia:biome_compass_18": 509016655056,
  "avaritia:biome_compass_19": 509016655056,
  "avaritia:biome_compass_2": 509016655056,
  "avaritia:biome_compass_20": 509016655056,
  "avaritia:biome_compass_21": 509016655056,
  "avaritia:biome_compass_22": 509016655056,
  "avaritia:biome_compass_23": 509016655056,
  "avaritia:biome_compass_24": 509016655056,
  "avaritia:biome_compass_25": 509016655056,
  "avaritia:biome_compass_26": 509016655056,
  "avaritia:biome_compass_27": 509016655056,
  "avaritia:biome_compass_28": 509016655056,
  "avaritia:biome_compass_29": 509016655056,
  "avaritia:biome_compass_3": 509016655056,
  "avaritia:biome_compass_30": 509016655056,
  "avaritia:biome_compass_31": 509016655056,
  "avaritia:biome_compass_32": 509016655056,
  "avaritia:biome_compass_33": 509016655056,
  "avaritia:biome_compass_4": 509016655056,
  "avaritia:biome_compass_5": 509016655056,
  "avaritia:biome_compass_6": 509016655056,
  "avaritia:biome_compass_7": 509016655056,
  "avaritia:biome_compass_8": 509016655056,
  "avaritia:biome_compass_9": 509016655056,
  "avaritia:infinity_chest": 678685301952,
  "avaritia:infinity_totem": 678689833152,
  "avaritia:infinity_hoe": 848357370096,
  "avaritia:infinity_boots": 848360604912,
  "halo:neon_boots": 849712457136,
  "avaritia:infinity_axe": 933193032456,
  "avaritia:infinity_shovel": 933193032456,
  "avaritia:infinity_trident": 1018032676128,
  "avaritia:infinity_bucket": 1018033188384,
  "avaritia:infinity_leggings": 1357384795008,
  "halo:neon_leggings": 1359201346434,
  "avaritia:infinity_destroyer": 1611882312648,
  "avaritia:infinity_pickaxe": 1611882312648,
  "avaritia:infinity_helmet": 1627302769752,
  "halo:neon_helmet": 1612521094434,
  "avaritia:infinity_chestplate": 2036063734848,
  "halo:neon_chestplate": 2037373341690,
  "avaritia:infinity_hammer": 2205731575920,
  "avaritia:infinity_mace": 2205731575920,
  "avaritia:infinity_shield": 2383133678568,
  "avaritia:infinity_block": 6871688651160,
  "avaritia:infinity_scythe": 8229059995416,
  "avaritia:infinity_spear": 14846241659496,
  "infinity_bow:bow": 68716890493248,
  "infinity_bow:bow_dragon": 68716890493248,
  "avaritia:infinity_sword": 109954732096200,
  "avaritia:infinity_crossbow": 123690400946352,
  "avaritia:infinity_crossbow_loaded": 123690400946352,
};

// Project Matter has its own EMC scale (e.g. Nether Star = 6,000,000), so it gets its own table.
const EMC_PM = {
  "avaritia:admin_inventory_viewer": 1,
  "avaritia:heaven_arrow_ammo": 1,
  "avaritia:rf_burning": 1,
  "avaritia:rf_progress_01": 1,
  "avaritia:rf_progress_02": 1,
  "avaritia:rf_progress_03": 1,
  "avaritia:rf_progress_04": 1,
  "avaritia:rf_progress_05": 1,
  "avaritia:rf_progress_06": 1,
  "avaritia:rf_progress_07": 1,
  "avaritia:rf_progress_08": 1,
  "avaritia:rf_progress_09": 1,
  "avaritia:rf_progress_10": 1,
  "avaritia:rf_progress_11": 1,
  "avaritia:rf_progress_12": 1,
  "avaritia:rf_progress_13": 1,
  "avaritia:rf_progress_14": 1,
  "avaritia:rf_progress_15": 1,
  "avaritia:rf_progress_16": 1,
  "avaritia:rf_progress_17": 1,
  "avaritia:rf_progress_18": 1,
  "avaritia:rf_progress_19": 1,
  "avaritia:rf_progress_20": 1,
  "avaritia:compressed_crafting_table": 288,
  "avaritia:anim_cosmic_meatballs": 512,
  "avaritia:anim_ultimate_stew": 512,
  "avaritia:cosmic_meatballs": 512,
  "avaritia:ultimate_stew": 512,
  "avaritia:record_fragment": 768,
  "avaritia:eternal_fire_blue": 1024,
  "avaritia:eternal_fire_green": 1024,
  "avaritia:eternal_fire_light_blue": 1024,
  "avaritia:eternal_fire_orange": 1024,
  "avaritia:eternal_fire_pink": 1024,
  "avaritia:eternal_fire_purple": 1024,
  "avaritia:eternal_fire_rainbow": 1024,
  "avaritia:eternal_fire_red": 1024,
  "avaritia:eternal_fire_yellow": 1024,
  "avaritia:anim_pile_of_neutrons": 1536,
  "avaritia:pile_of_neutrons": 1536,
  "avaritia:double_compressed_crafting_table": 2592,
  "avaritia:anim_neutronium_nugget": 13824,
  "avaritia:neutronium_nugget": 13824,
  "avaritia:diamond_lattice": 40960,
  "avaritia:anim_neutronium_ingot": 124416,
  "avaritia:neutronium_ingot": 124416,
  "avaritia:anim_soul_sand_singularity": 490000,
  "avaritia:soul_sand_singularity": 490000,
  "avaritia:anim_neutronium_gear": 511488,
  "avaritia:neutronium_gear": 511488,
  "avaritia:anim_obsidian_singularity": 640000,
  "avaritia:obsidian_singularity": 640000,
  "avaritia:anim_experience_singularity": 1000000,
  "avaritia:experience_singularity": 1000000,
  "avaritia:anim_neutronium_block": 1119744,
  "avaritia:matter_cluster": 1119744,
  "avaritia:neutronium_block": 1119744,
  "avaritia:neutronium_block_item": 1119744,
  "avaritia:amethyst_singularity": 1280000,
  "avaritia:anim_amethyst_singularity": 1280000,
  "avaritia:starfuel": 1523040,
  "avaritia:anim_honey_singularity": 1880000,
  "avaritia:honey_singularity": 1880000,
  "avaritia:anim_slime_singularity": 2880000,
  "avaritia:slime_singularity": 2880000,
  "avaritia:anim_redstone_singularity": 5760000,
  "avaritia:redstone_singularity": 5760000,
  "avaritia:anim_endest_pearl": 6530456,
  "avaritia:endest_pearl": 6530456,
  "avaritia:anim_neutronium_star": 9469440,
  "avaritia:neutronium_star": 9469440,
  "avaritia:anim_quartz_singularity": 10240000,
  "avaritia:quartz_singularity": 10240000,
  "avaritia:anim_coal_singularity": 11520000,
  "avaritia:anim_copper_singularity": 11520000,
  "avaritia:coal_singularity": 11520000,
  "avaritia:copper_singularity": 11520000,
  "avaritia:crystal_matrix": 12163840,
  "halo:neon_crystal": 55556454,
  "avaritia:gacha_machine": 12310338,
  "avaritia:record_furnace": 12795904,
  "avaritia:anim_iron_singularity": 23040000,
  "avaritia:iron_singularity": 23040000,
  "avaritia:anim_netherrack_singularity": 10000,
  "avaritia:netherrack_singularity": 10000,
  "avaritia:anim_glowstone_singularity": 15360000,
  "avaritia:glowstone_singularity": 15360000,
  "avaritia:anim_prismarine_singularity": 10240000,
  "avaritia:prismarine_singularity": 10240000,
  "avaritia:anim_end_stone_singularity": 10000,
  "avaritia:end_stone_singularity": 10000,
  "avaritia:anim_magma_singularity": 32000000,
  "avaritia:magma_singularity": 32000000,
  "avaritia:anim_bone_singularity": 4320000,
  "avaritia:bone_singularity": 4320000,
  "avaritia:anim_ice_singularity": 90000,
  "avaritia:ice_singularity": 90000,
  "avaritia:anim_lapis_singularity": 77760000,
  "avaritia:lapis_singularity": 77760000,
  "avaritia:neutron_collector": 85217024,
  "avaritia:dire_crafting_table": 97313312,
  "avaritia:seal_orb": 103841176,
  "avaritia:seal_orb_full": 103841176,
  "avaritia:crystal_matrix_block": 109474560,
  "avaritia:skullfire_sword": 127643648,
  "avaritia:neutronium_compressor": 133142848,
  "avaritia:anim_gold_singularity": 184320000,
  "avaritia:gold_singularity": 184320000,
  "avaritia:anim_diamond_singularity": 737280000,
  "avaritia:diamond_singularity": 737280000,
  "avaritia:anim_emerald_singularity": 1474560000,
  "avaritia:emerald_singularity": 1474560000,
  "avaritia:anim_netherite_singularity": 5160960000,
  "avaritia:netherite_singularity": 5160960000,
  "avaritia:anim_ultimate_singularity": 7767160000,
  "avaritia:ultimate_singularity": 7767160000,
  "avaritia:anim_infinity_catalyst": 7713185288,
  "avaritia:infinity_catalyst": 7713185288,
  "avaritia:anim_infinity_nugget": 9441073616,
  "avaritia:infinity_nugget": 9441073616,
  "avaritia:asgardandelion": 73924736904,
  "avaritia:asgardandelion_item": 73924736904,
  "avaritia:anim_infinity_ingot": 84969662552,
  "avaritia:infinity_ingot": 84969662552,
  "avaritia:infinity_flint_and_steel": 84969786972,
  "avaritia:infinity_fishing_rod": 169939573984,
  "avaritia:infinity_fishing_rod_cast": 169939573984,
  "avaritia:infinity_shears": 169964026544,
  "avaritia:anim_infinity_clock": 339878650208,
  "avaritia:infinity_clock": 339878650208,
  "avaritia:infinity_totem_frost": 339880150532,
  "avaritia:infinity_totem_shadow": 339882710208,
  "avaritia:infinity_totem_mercy": 339887670208,
  "avaritia:infinity_totem_berserker": 339903190208,
  "avaritia:infinity_totem_ender": 339906272032,
  "avaritia:infinity_totem_gale": 339921110208,
  "avaritia:infinity_totem_inferno": 339926230208,
  "avaritia:infinity_totem_tide": 340191190208,
  "avaritia:infinity_totem_fortune": 340617430208,
  "avaritia:infinity_totem_clairvoyance": 342829270208,
  "avaritia:infinity_totem_vitality": 345778390208,
  "avaritia:infinity_totem_void": 360523990208,
  "avaritia:biome_compass_1": 509867542096,
  "avaritia:biome_compass_10": 509867542096,
  "avaritia:biome_compass_11": 509867542096,
  "avaritia:biome_compass_12": 509867542096,
  "avaritia:biome_compass_13": 509867542096,
  "avaritia:biome_compass_14": 509867542096,
  "avaritia:biome_compass_15": 509867542096,
  "avaritia:biome_compass_16": 509867542096,
  "avaritia:biome_compass_17": 509867542096,
  "avaritia:biome_compass_18": 509867542096,
  "avaritia:biome_compass_19": 509867542096,
  "avaritia:biome_compass_2": 509867542096,
  "avaritia:biome_compass_20": 509867542096,
  "avaritia:biome_compass_21": 509867542096,
  "avaritia:biome_compass_22": 509867542096,
  "avaritia:biome_compass_23": 509867542096,
  "avaritia:biome_compass_24": 509867542096,
  "avaritia:biome_compass_25": 509867542096,
  "avaritia:biome_compass_26": 509867542096,
  "avaritia:biome_compass_27": 509867542096,
  "avaritia:biome_compass_28": 509867542096,
  "avaritia:biome_compass_29": 509867542096,
  "avaritia:biome_compass_3": 509867542096,
  "avaritia:biome_compass_30": 509867542096,
  "avaritia:biome_compass_31": 509867542096,
  "avaritia:biome_compass_32": 509867542096,
  "avaritia:biome_compass_33": 509867542096,
  "avaritia:biome_compass_4": 509867542096,
  "avaritia:biome_compass_5": 509867542096,
  "avaritia:biome_compass_6": 509867542096,
  "avaritia:biome_compass_7": 509867542096,
  "avaritia:biome_compass_8": 509867542096,
  "avaritia:biome_compass_9": 509867542096,
  "avaritia:infinity_chest": 679757302720,
  "avaritia:infinity_totem": 679857106464,
  "avaritia:infinity_hoe": 849697372016,
  "avaritia:infinity_boots": 849700606832,
  "halo:neon_boots": 851474432048,
  "avaritia:infinity_axe": 934667034568,
  "avaritia:infinity_shovel": 934667034568,
  "avaritia:infinity_trident": 1019746171680,
  "avaritia:infinity_bucket": 1019770126880,
  "avaritia:infinity_leggings": 1359763227520,
  "halo:neon_leggings": 1362146805154,
  "avaritia:infinity_destroyer": 1614533809544,
  "avaritia:infinity_pickaxe": 1614533809544,
  "avaritia:infinity_helmet": 1629851825304,
  "halo:neon_helmet": 1615475884418,
  "avaritia:infinity_chestplate": 2039385232704,
  "halo:neon_chestplate": 2041103625882,
  "avaritia:infinity_hammer": 2209321074160,
  "avaritia:infinity_mace": 2209321074160,
  "avaritia:infinity_shield": 2387449840552,
  "avaritia:infinity_block": 6882542666712,
  "avaritia:infinity_scythe": 8242058014040,
  "avaritia:infinity_spear": 14869691693096,
  "infinity_bow:bow": 68825536142016,
  "infinity_bow:bow_dragon": 68825536142016,
  "avaritia:infinity_sword": 110128444756872,
  "avaritia:infinity_crossbow": 123885878719536,
  "avaritia:infinity_crossbow_loaded": 123885878719536,
};

// One factor per table: price of the most expensive item / CAP.
const factorOf = (t) => Math.max(...Object.values(t)) / CAP;
const F_PE = factorOf(EMC_PE);
const F_PM = factorOf(EMC_PM);

const PM_WAIT_SAFE = 8;      // the value known to work (the original 3 only priced a few items)
const PM_WAIT_DEFAULT = 1;   // TEST value: fastest possible. If prices are missing/wrong run /scriptevent avaritia:emc_wait 8   // Project Matter registers the price a few ticks AFTER the command (custom command + system.run); too short a wait attaches the price to the next item or none

// Ticks to wait between two items of Project Matter. Tunable in game: /scriptevent avaritia:emc_wait <3-20> (saved in the world).
const PM_WAIT_KEY = "avaritia:emc_pm_wait";
function pmWait() {
  const v = world.getDynamicProperty(PM_WAIT_KEY);
  return typeof v === "number" && v >= 1 && v <= 40 ? Math.floor(v) : PM_WAIT_DEFAULT;
}
// Items priced 1 are only UI/progress icons (rf_progress_*, rf_burning...), not worth a turn of the main hand.
const PM_IDS = Object.keys(EMC_PM).filter((id) => EMC_PM[id] > 1);

function say(p, msg) { try { p.sendMessage(msg); } catch { /* ignore */ } }

// Sends one command; returns the error text on failure, or "" on success.
function tryCmd(player, cmd) {
  try {
    const r = player.runCommand(cmd);
    return r.successCount > 0 ? "" : "command returned 0";
  } catch (e) { return String(e).slice(0, 80); }
}

function syncProjectE(player, done) {
  const EMC = EMC_PE;
  const ids = Object.keys(EMC);
  let i = 0, ok = 0;
  const failed = [];
  const step = () => {
    if (!player.isValid) return done?.(ok, failed);
    for (let n = 0; n < 10 && i < ids.length; n++, i++) {
      const id = ids[i];
      let err = tryCmd(player, `projecte:item add ${id} ${scaled(EMC[id], F_PE)}`);
      if (err) err = tryCmd(player, `projecte:item add ${id} ${scaled(EMC[id], F_PE)}`); // one retry
      if (err) failed.push(`${id} (${err})`); else ok++;
    }
    if (i < ids.length) system.runTimeout(step, 2);
    else done?.(ok, failed);
  };
  step();
}

let pmRunning = false; // two syncs at once would save a temporary item as "the player's item" and leave it behind

function syncProjectMatter(player, done, opts = {}) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return done?.(0, []);
  if (pmRunning) { say(player, "§e[Avaritia] Project Matter sync is already running."); return done?.(0, []); }
  const slot = player.selectedSlotIndex;
  // Project Matter can only price "the item in the MAIN HAND", so the hand is borrowed for a moment.
  // Whatever the player was holding is saved and put back at the end (no need to empty the hand).
  let saved;
  try { saved = inv.getItem(slot)?.clone(); } catch { saved = undefined; }
  // Snapshot of the whole inventory, to sweep away any temporary item that could be left behind.
  const before = [];
  try { for (let k = 0; k < inv.size; k++) before.push(inv.getItem(k)?.typeId); } catch { /* ignore */ }
  const EMC = EMC_PM;
  const ids = PM_IDS;
  const WAIT = pmWait();
  const idSet = new Set(ids);
  let i = 0, ok = 0;
  const failed = [];
  const totalTicks = ids.length * WAIT + 80;
  pmRunning = true;
  if (opts.hide) {
    // Black screen + damage immunity while the hand is being used, so nothing flickers and nothing can hurt.
    try {
      player.camera.fade({ fadeColor: { red: 0, green: 0, blue: 0 }, fadeTime: { fadeInTime: 0.5, holdTime: totalTicks / 20, fadeOutTime: 0.5 } });
    } catch { /* camera API not available */ }
    try { player.addEffect("resistance", totalTicks, { amplifier: 4, showParticles: false }); } catch { /* ignore */ }
  }
  // Puts the player's real item back and removes every temporary Avaritia item that was not there before.
  const restore = () => {
    try {
      if (!player.isValid) return;
      inv.setItem(slot, saved);
      for (let k = 0; k < inv.size; k++) {
        const it = inv.getItem(k);
        if (it && (idSet.has(it.typeId) || it.typeId === "avaritia:heaven_arrow_ammo") && before[k] !== it.typeId) inv.setItem(k, undefined); // heaven_arrow_ammo: infinityBowInfiniteAmmo.js auto-adds it while the temporary infinity bow is in hand
      }
    } catch { /* ignore */ }
  };
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    // Project Matter prices the held item a few ticks AFTER the command: wait before taking the last item away.
    system.runTimeout(() => {
      restore();
      system.runTimeout(restore, 10); // second pass in case a late tick put something back
      pmRunning = false;
      if (opts.hide) { try { player.camera.clear(); } catch { try { player.runCommand("camera @s clear"); } catch { /* ignore */ } } try { player.removeEffect("resistance"); } catch { /* ignore */ } }
      done?.(ok, failed);
    }, Math.max(8, WAIT + 4));
  };
  let attempt = 0;
  const step = () => {
    if (!player.isValid) return finish();
    if (player.selectedSlotIndex !== slot) {
      say(player, "§c[Avaritia] Project Matter: you changed the selected slot, stopped.");
      return finish();
    }
    if (i >= ids.length) return finish();
    // Project Matter not installed / cheats off: the first prices all fail, so stop at once instead of looping for a minute.
    if (ok === 0 && failed.length >= 3) return finish();
    const id = ids[i];
    let err = "";
    try {
      inv.setItem(slot, new ItemStack(id, 1));
      if (inv.getItem(slot)?.typeId !== id) err = "item was changed by another script";
      else err = tryCmd(player, `project_matter:set emc ${scaled(EMC[id], F_PM)}`);
    } catch (e) { err = String(e).slice(0, 80); }
    if (err && attempt < 1) { attempt++; return system.runTimeout(step, WAIT); } // retry the same item once
    attempt = 0; i++;
    if (err) failed.push(`${id} (${err})`); else ok++;
    if (opts.hide && i % 10 === 0) { try { player.onScreenDisplay.setActionBar(`§7[Avaritia] Loading EMC prices... ${i}/${ids.length}`); } catch { /* ignore */ } }
    system.runTimeout(step, WAIT);
  };
  step();
}

function clearChatView(player) { for (let k = 0; k < 30; k++) say(player, " "); } // Project Matter prints one chat line per item; scroll them away

function report(player, name, total, ok, failed) {
  say(player, `§a[Avaritia] ${name}: ${ok}/${total} items registered`);
  if (failed.length) {
    say(player, `§c[Avaritia] ${name}: ${failed.length} failed:`);
    for (const f of failed.slice(0, 15)) say(player, `§c - ${f}`);
    if (failed.length > 15) say(player, `§c ... and ${failed.length - 15} more`);
  }
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "avaritia:emc_sync") return;
  const player = ev.sourceEntity;
  if (!player || player.typeId !== "minecraft:player") return;
  const mode = (ev.message || "all").trim().toLowerCase();
  const total = Object.keys(EMC_PE).length;
  const runPE = mode === "pe" || mode === "all";
  const runPM = mode === "pm" || mode === "all";
  if (!runPE && !runPM) return say(player, "§e[Avaritia] Use: /scriptevent avaritia:emc_sync pe | pm | all");

  const afterPE = () => {
    if (!runPM) return;
    say(player, `§7[Avaritia] Project Matter: syncing ${PM_IDS.length} items, about ${Math.ceil(PM_IDS.length * pmWait() / 20)} seconds. Do not switch slots (your held item is restored afterwards).`);
    syncProjectMatter(player, (ok, failed) => { clearChatView(player); report(player, "Project Matter", PM_IDS.length, ok, failed); }, { hide: true });
  };
  if (runPE) {
    say(player, `§7[Avaritia] Project E: syncing (prices divided by ${Math.round(F_PE)})...`);
    syncProjectE(player, (ok, failed) => { report(player, "Project E", total, ok, failed); afterPE(); });
  } else afterPE();
});

/**
 * AUTOMATIC SETUP: the first time an operator joins a world, both addons are priced by themselves, no command needed.
 * Done once per world and per price table: it is remembered in a world property of THIS pack, so it runs again only
 * if the price table changes (or if an addon was missing/failed that time).
 */
const AUTO_PE = "avaritia:emc_auto_pe";
const AUTO_PM = "avaritia:emc_auto_pm";
const TABLE_SIG = (() => {
  let h = 7;
  for (const t of [EMC_PE, EMC_PM]) for (const [k, v] of Object.entries(t)) {
    for (let c = 0; c < k.length; c++) h = (h * 31 + k.charCodeAt(c)) >>> 0;
    h = (h * 31 + (v % 1000003)) >>> 0;
  }
  return String(h);
})();
let autoBusy = false;

const autoTried = new Set(); // players already handled in this session (never loop)

function isOperator(player) {
  try { if (typeof player.isOp === "function" && player.isOp()) return true; } catch { /* ignore */ }
  try { if (Number(player.commandPermissionLevel) >= 1) return true; } catch { /* ignore */ }
  return false;
}

function autoSync(player) {
  if (autoBusy || !player?.isValid || autoTried.has(player.id)) return;
  if (!isOperator(player)) {
    autoTried.add(player.id);
    return say(player, "§e[Avaritia] EMC auto-setup skipped: you are not an operator. An operator can run /scriptevent avaritia:emc_sync all");
  }
  const needPE = world.getDynamicProperty(AUTO_PE) !== TABLE_SIG;
  const needPM = world.getDynamicProperty(AUTO_PM) !== TABLE_SIG;
  if (!needPE && !needPM) { autoTried.add(player.id); return; }
  autoTried.add(player.id);
  autoBusy = true;
  say(player, "§7[Avaritia] EMC auto-setup starting (Project E, then Project Matter)...");
  const total = Object.keys(EMC_PE).length;
  const res = {};
  const finishAll = () => {
    autoBusy = false;
    const parts = [];
    if (res.pe) parts.push(`Project E ${res.pe.ok}/${total}`);
    if (res.pm) parts.push(`Project Matter ${res.pm.ok}/${PM_IDS.length}`);
    const bad = (res.pe && res.pe.ok < total) || (res.pm && res.pm.ok < PM_IDS.length);
    clearChatView(player);
    say(player, bad
      ? `§e[Avaritia] EMC auto-setup incomplete (${parts.join(", ")}). Is the addon installed and cheats on? Run /scriptevent avaritia:emc_sync all to retry.`
      : `§a[Avaritia] EMC prices set automatically (${parts.join(", ")}).`);
  };
  const doPM = () => {
    if (!needPM) return finishAll();
    syncProjectMatter(player, (ok, failed) => {
      res.pm = { ok, failed };
      if (ok >= PM_IDS.length && pmWait() >= PM_WAIT_SAFE) world.setDynamicProperty(AUTO_PM, TABLE_SIG); // a fast test value is never remembered as "done"
      finishAll();
    }, { hide: true });
  };
  if (needPE) {
    syncProjectE(player, (ok, failed) => {
      res.pe = { ok, failed };
      if (ok >= total) world.setDynamicProperty(AUTO_PE, TABLE_SIG);
      doPM();
    });
  } else doPM();
}

// Two triggers, whichever comes first: the join event and a slow check (the join event can fire before scripts are ready).
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const player = ev.player;
  system.runTimeout(() => autoSync(player), 200); // let the other addons finish loading first
});
let autoStart = system.currentTick;
system.runInterval(() => {
  if (system.currentTick - autoStart < 200) return;
  for (const p of world.getAllPlayers()) autoSync(p);
}, 40);

/** /scriptevent avaritia:emc_status  -> shows why the automatic setup did or did not run. */
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "avaritia:emc_status") return;
  const player = ev.sourceEntity;
  if (!player || player.typeId !== "minecraft:player") return;
  say(player, `§7[Avaritia] operator: ${isOperator(player)} | Project E done: ${world.getDynamicProperty(AUTO_PE) === TABLE_SIG} | Project Matter done: ${world.getDynamicProperty(AUTO_PM) === TABLE_SIG} | wait: ${pmWait()} ticks | PM items: ${PM_IDS.length}`);
});

/**
 * /scriptevent avaritia:emc_held
 * Hold the item that shows 0 EMC in Project Matter and run this. It prints the item's real typeId, whether it is
 * in the price table, and (for Project Matter) sets the price for exactly that typeId.
 */
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "avaritia:emc_held") return;
  const player = ev.sourceEntity;
  if (!player || player.typeId !== "minecraft:player") return;
  const held = player.getComponent("equippable")?.getEquipment(EquipmentSlot.Mainhand);
  if (!held) return say(player, "§e[Avaritia] Hold the item first.");
  const id = held.typeId;
  say(player, `§7[Avaritia] Held item typeId: §f${id}`);
  const v = EMC_PM[id];
  if (v === undefined) {
    return say(player, "§c[Avaritia] This typeId is NOT in the price table. Send this id to the developer.");
  }
  const price = scaled(v, F_PM);
  const err = tryCmd(player, `project_matter:set emc ${price}`);
  say(player, err ? `§c[Avaritia] set emc failed: ${err}` : `§a[Avaritia] Sent set emc ${price} for ${id}.`);
});

/**
 * /scriptevent avaritia:emc_wait <ticks>   -> sets the wait between two Project Matter items (default 1 = test, safe value 8, 20 ticks = 1 s).
 * Lower = faster. If some items end up with 0 or a wrong price, raise it again. Without a number it shows the current value.
 * Then run /scriptevent avaritia:emc_sync pm to apply it.
 */
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "avaritia:emc_wait") return;
  const player = ev.sourceEntity;
  if (!player || player.typeId !== "minecraft:player") return;
  const n = parseInt((ev.message || "").trim(), 10);
  if (Number.isNaN(n)) return say(player, `§7[Avaritia] Project Matter wait: ${pmWait()} ticks (${PM_IDS.length} items, about ${Math.ceil(PM_IDS.length * pmWait() / 20)} s). Use: /scriptevent avaritia:emc_wait <1-40>`);
  const v = Math.min(40, Math.max(1, n));
  world.setDynamicProperty(PM_WAIT_KEY, v);
  say(player, `§a[Avaritia] Wait set to ${v} ticks: a full Project Matter sync now takes about ${Math.ceil(PM_IDS.length * v / 20)} seconds. Run /scriptevent avaritia:emc_sync pm to apply.`);
});
