import { world, system, ItemStack } from "@minecraft/server";

/**
 * ===== ENGINE FOR THE avaritia:altar ENTITY (9x9 GRID) =====
 * This file now ONLY contains the recipe scoring/matching "engine" for the avaritia:altar entity.
 * The v9 part that placed the table via item (ec:extreme_crafting_table) and the infinity sword
 * (ec:infinity_sword) has been removed because they are not original Avaritia items -
 * the altar is now activated via avaritia:dire_crafting_table
 * (see direAltar.js).
 *
 * The RECIPES list below is taken from the document "All Dire
 * Crafting Table recipes — Avaritia v1.13 (Minecraft 1.7.10)" (extracted from
 * the bytecode of the original Java mod), ONLY including PART I - the original recipes that need no
 * other mods. Part II (AE2 / Thermal Expansion / Witchery / Blood Magic /
 * Botania / Thaumcraft / Tinker's Construct) is skipped because the items
 * linked to those mods do not exist in this Bedrock addon.
 *
 * Slot 0..80  = 9x9 ingredient grid
 * Slot 81     = result cell (output)
 * (size entity la 91 -> con du 9 slot du phong)
 */
const GRID_SIZE = 9;
const TOTAL_GRID_SLOTS = GRID_SIZE * GRID_SIZE; // 81
const OUTPUT_SLOT = 81;

/**
 * ===== RECIPE LIST =====
 *
 * SHAPED recipes (type: "shaped"):
 *   pattern: array of strings, each character represents 1 cell (using the key map below)
 *            '.' means a required empty cell within the recipe's bounding box.
 *   key:     map character -> itemId
 *   result:  item + output quantity
 *   Matching works the "Avaritia" way: only the smallest rectangle containing the recipe's
 *   non-empty cells has to match exactly, and it may be placed at ANY position
 *   in the 9x9 grid (not necessarily the top-left corner), as long as the entire
 *   rest of the 9x9 grid is empty.
 *
 * SHAPELESS recipes (type: "shapeless"):
 *   ingredients: array of { id, count } - each item type needs exactly this quantity,
 *                placed in ANY cell of the 9x9 grid (position does not matter).
 *   result:      item + output quantity
 *   Matches when all items in the 9x9 grid CONSIST ONLY of exactly the types + quantities
 *   listed in ingredients (nothing extra, nothing missing, no other items mixed in).
 */
const RECIPES = [
  // ========================================
  // ===== WEAPONS / TOOLS / EQUIPMENT GROUP =====
  // ========================================


  // ===== 1. World Breaker (Infinity Pickaxe) =====
  {
    id: "infinity_pickaxe",
    type: "shaped",
    pattern: [
      ".IIIIIII.",
      "IIIICIIII",
      "II..N..II",
      "....N....",
      "....N....",
      "....N....",
      "....N....",
      "....N...."
    ],
    key: {
      I: "avaritia:infinity_ingot",
      C: "avaritia:crystal_matrix_block",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_pickaxe", amount: 1 }
  },

  // ===== 2. Nature's Ruin (Infinity Axe) =====
  {
    id: "infinity_axe",
    type: "shaped",
    pattern: [
      ".I...",
      "IIIII",
      "IIII.",
      ".IN..",
      "..N..",
      "..N..",
      "..N..",
      "..N..",
      "..N.."
    ],
    key: {
      I: "avaritia:infinity_ingot",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_axe", amount: 1 }
  },

  // ===== 3. Planet Eater (Infinity Shovel) =====
  {
    id: "infinity_shovel",
    type: "shaped",
    pattern: [
      "......III",
      ".....IIII",
      "......III",
      ".....N.I.",
      "....N....",
      "...N.....",
      "..N......",
      ".N.......",
      "N........"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_shovel", amount: 1 }
  },

  // ===== 4. Infinity Hoe =====
  // Shape per the Dire Crafting Table screenshot: 2 rows of infinity_ingot arranged
  // diagonally (4 + 4), plus 2 infinity_ingot in the 3rd row, then a neutronium_ingot handle
  // running diagonally down to the bottom left. Total: 10 infinity_ingot + 6 neutronium_ingot.
  // Pattern is tightly trimmed (8x8, no empty rows/columns at the edges) - uses the
  // recipe's bounding box.
  {
    id: "infinity_hoe",
    type: "shaped",
    pattern: [
      "..IIII..",
      "...IIII.",
      ".....NII",
      "....N...",
      "...N....",
      "..N.....",
      ".N......",
      "N......."
    ],
    key: {
      I: "avaritia:infinity_ingot",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_hoe", amount: 1 }
  },

  // ===== 5. Sword of the Cosmos (Infinity Sword) =====
  {
    id: "infinity_sword",
    type: "shaped",
    pattern: [
      ".......II",
      "......III",
      ".....III.",
      "....III..",
      ".C.III...",
      "..CII....",
      "..NC.....",
      ".N..C....",
      "X........"
    ],
    key: {
      I: "avaritia:infinity_block",
      C: "avaritia:crystal_matrix",
      N: "avaritia:neutronium_ingot",
      X: "avaritia:infinity_catalyst"
    },
    result: { id: "avaritia:infinity_sword", amount: 1 }
  },

  // ===== 6. Skullfire Sword =====
  {
    id: "skullfire_sword",
    type: "shaped",
    pattern: [
      ".......IX",
      "......IXI",
      ".....IXI.",
      "....IXI..",
      ".B.IXI...",
      "..BXI....",
      "..WB.....",
      ".W..B....",
      "D........"
    ],
    key: {
      I: "avaritia:crystal_matrix",
      X: "minecraft:blaze_powder",
      B: "minecraft:bone",
      D: "minecraft:nether_star",
      W: "minecraft:oak_log"
    },
    result: { id: "avaritia:skullfire_sword", amount: 1 }
  },

  // ===== 7. Infinity Mace =====
  // The mace head is a diamond-shaped cluster of infinity_ingot (with one spike pointing down in the middle),
  // the handle runs diagonally with 3 neutronium_ingot to the bottom-left, the base is crystal_matrix_block.
  // (The shapeless recipe mace + nether_star + breeze_rod in the regular crafting table still exists.)
  {
    id: "infinity_mace",
    type: "shaped",
    pattern: [
      ".....I...",
      "....IIII.",
      "...IIIII.",
      "..IIIIIII",
      "...IIIII.",
      "...NIII..",
      "..N..I...",
      ".N.......",
      "C........"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      N: "avaritia:neutronium_ingot",
      C: "avaritia:crystal_matrix_block"
    },
    result: { id: "avaritia:infinity_mace", amount: 1 }
  },

  // ===== 7a. Infinity Shield =====
  // Per the Dire Crafting Table screenshot: infinity_ingot frame 7x9, the inner border consists of
  // crystal_matrix_block (2 top corners + 2 bottom corners), crystal_matrix (ingot),
  // neutronium_ingot, the core is infinity_catalyst.
  {
    id: "infinity_shield",
    type: "shaped",
    pattern: [
      "IIIIIII",
      "ICMNMCI",
      "INNMNNI",
      "INMNMNI",
      "IMNSNMI",
      "INMNMNI",
      "INNMNNI",
      "ICMNMCI",
      "IIIIIII"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      C: "avaritia:crystal_matrix_block",
      M: "avaritia:crystal_matrix",
      N: "avaritia:neutronium_ingot",
      S: "avaritia:infinity_catalyst"
    },
    result: { id: "avaritia:infinity_shield", amount: 1 }
  },

  // ===== 7c. Infinity Trident =====
  // 3 mui (infinity_ingot), thanh ngang, can neutronium_ingot, de crystal_matrix_block.
  {
    id: "infinity_trident",
    type: "shaped",
    pattern: [
      "..I.I.I..",
      "..I.I.I..",
      "..IIIII..",
      "...NIN...",
      "....N....",
      "....N....",
      "....N....",
      "....N....",
      "....C...."
    ],
    key: {
      I: "avaritia:infinity_ingot",
      N: "avaritia:neutronium_ingot",
      C: "avaritia:crystal_matrix_block"
    },
    result: { id: "avaritia:infinity_trident", amount: 1 }
  },

  // ===== 7d. Infinity Crossbow =====
  // The Devour skill erases every creature (except pets) so the recipe uses ALL infinity_block
  // instead of infinity_ingot: 2 crossbow arms + string + stock are all infinity_block.
  {
    id: "infinity_crossbow",
    type: "shaped",
    pattern: [
      ".I.....I.",
      "..I...I..",
      "IIIIIIIII",
      "...III...",
      "..INNNI..",
      "...NCN...",
      "...NNN...",
      "....N....",
      "....N...."
    ],
    key: {
      I: "avaritia:infinity_block",
      N: "avaritia:neutronium_ingot",
      C: "avaritia:crystal_matrix_block"
    },
    result: { id: "avaritia:infinity_crossbow", amount: 1 }
  },

  // ===== 7b. Infinity Spear =====
  // Shape per the Dire Crafting Table screenshot: the spear head is a cluster of infinity_ingot
  // in the top-right corner, 2 infinity_block along the spear shaft (rows 2-3), a diagonal handle of 6 neutronium_ingot
  // down to the bottom-left corner. Total: 13 infinity_ingot + 2 infinity_block + 6 neutronium_ingot.
  {
    id: "infinity_spear",
    type: "shaped",
    pattern: [
      "......III",
      "....IIIBI",
      ".....IBII",
      ".....NII.",
      "....N..I.",
      "...N.....",
      "..N......",
      ".N.......",
      "N........"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      B: "avaritia:infinity_block",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_spear", amount: 1 }
  },

  // ===== 7c. Infinity Scythe =====
  // Shape per the Dire Crafting Table screenshot: the scythe blade is 2 rows of infinity_ingot
  // (5 + 7) in the top-left corner, connected to the head cluster in the middle with 1 infinity_block, a diagonal handle
  // of 6 neutronium_ingot down to the bottom-left corner.
  // Total: 16 infinity_ingot + 1 infinity_block + 6 neutronium_ingot.
  {
    id: "infinity_scythe",
    type: "shaped",
    pattern: [
      ".IIIII...",
      "IIIIIII..",
      ".....IBI.",
      ".....NII.",
      "....N....",
      "...N.....",
      "..N......",
      ".N.......",
      "N........"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      B: "avaritia:infinity_block",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_scythe", amount: 1 }
  },

  // ===== 8. Longbow of the Heavens (Infinity Bow) =====
  {
    id: "infinity_bow",
    type: "shaped",
    pattern: [
      "...II",
      "..I.W",
      ".I..W",
      "I...W",
      "X...W",
      "I...W",
      ".I..W",
      "..I.W",
      "...II"
    ],
    key: {
      I: "avaritia:infinity_block",
      X: "avaritia:crystal_matrix_block",
      W: [
        "minecraft:white_wool",
        "minecraft:orange_wool",
        "minecraft:magenta_wool",
        "minecraft:light_blue_wool",
        "minecraft:yellow_wool",
        "minecraft:lime_wool",
        "minecraft:pink_wool",
        "minecraft:gray_wool",
        "minecraft:light_gray_wool",
        "minecraft:cyan_wool",
        "minecraft:purple_wool",
        "minecraft:blue_wool",
        "minecraft:brown_wool",
        "minecraft:green_wool",
        "minecraft:red_wool",
        "minecraft:black_wool"
      ]
    },
    result: { id: "infinity_bow:bow", amount: 1 }
  },

  // ===== 9. Infinity Helmet =====
  {
    id: "infinity_helmet",
    type: "shaped",
    pattern: [
      "..NNNNN..",
      ".NIIIIIN.",
      ".N.XIX.N.",
      ".NIIIIIN.",
      ".NIIIIIN.",
      ".NI.I.IN."
    ],
    key: {
      I: "avaritia:infinity_ingot",
      X: "avaritia:infinity_catalyst",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_helmet", amount: 1 }
  },

  // ===== 10. Infinity Breastplate =====
  {
    id: "infinity_chestplate",
    type: "shaped",
    pattern: [
      ".NN...NN.",
      "NNN...NNN",
      "NNN...NNN",
      ".NIIIIIN.",
      ".NIIXIIN.",
      ".NIIIIIN.",
      ".NIIIIIN.",
      ".NIIIIIN.",
      "..NNNNN.."
    ],
    key: {
      I: "avaritia:infinity_ingot",
      X: "avaritia:crystal_matrix_block",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_chestplate", amount: 1 }
  },

  // ===== 11. Infinity Pants (Leggings) =====
  {
    id: "infinity_leggings",
    type: "shaped",
    pattern: [
      "NNNNNNNNN",
      "NIIIXIIIN",
      "NINNXNNIN",
      "NIN...NIN",
      "NCN...NCN",
      "NIN...NIN",
      "NIN...NIN",
      "NIN...NIN",
      "NNN...NNN"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      X: "avaritia:crystal_matrix_block",
      C: "avaritia:crystal_matrix",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_leggings", amount: 1 }
  },

  // ===== 12. Infinity Boots =====
  {
    id: "infinity_boots",
    type: "shaped",
    pattern: [
      ".NNN.NNN.",
      ".NIN.NIN.",
      ".NIN.NIN.",
      "NNIN.NINN",
      "NIIN.NIIN",
      "NNNN.NNNN"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:infinity_boots", amount: 1 }
  },

  // ========================================
  // ===== MATERIALS / MACHINES GROUP =====
  // ========================================


  // ===== 13. Neutron Collector =====
  {
    id: "neutron_collector",
    type: "shaped",
    pattern: [
      "IIQQQQQII",
      "I.QQQQQ.I",
      "I..RRR..I",
      "X.RRRRR.X",
      "I.RRXRR.I",
      "X.RRRRR.X",
      "I..RRR..I",
      "I.......I",
      "IIIXIXIII"
    ],
    key: {
      I: "minecraft:iron_block",
      Q: "minecraft:quartz_block",
      R: "minecraft:redstone_block",
      X: "avaritia:crystal_matrix"
    },
    result: { id: "avaritia:neutron_collector", amount: 1 }
  },

  // ===== 14. Neutronium Compressor =====
  {
    id: "neutronium_compressor",
    type: "shaped",
    pattern: [
      "IIIHHHIII",
      "X.N...N.X",
      "I.N...N.I",
      "X.N...N.X",
      "RNN.O.NNR",
      "X.N...N.X",
      "I.N...N.I",
      "X.N...N.X",
      "IIIXIXIII"
    ],
    key: {
      I: "minecraft:iron_block",
      H: "minecraft:hopper",
      R: "minecraft:redstone_block",
      X: "avaritia:crystal_matrix",
      N: "avaritia:neutronium_ingot",
      O: "avaritia:neutronium_star"
    },
    result: { id: "avaritia:neutronium_compressor", amount: 1 }
  },

  // ===== 15. Record Furnace =====
  // Iron Block frame, 4 Gold Block corners, the inner ring alternating Jukebox (music
  // disc theme) and Neutronium Ingot, Crystal Matrix in the center.
  {
    id: "record_furnace",
    type: "shaped",
    pattern: [
      "GIIIG",
      "IJNJI",
      "INCNI",
      "IJNJI",
      "GIIIG"
    ],
    key: {
      G: "minecraft:gold_block",
      I: "minecraft:iron_block",
      J: "minecraft:jukebox",
      N: "avaritia:neutronium_ingot",
      C: "avaritia:crystal_matrix"
    },
    result: { id: "avaritia:record_furnace", amount: 1 }
  },

  // ===== 15b. Gacha Machine =====
  // Shape per the texture: Iron Block outer shell (like the other machines), gold frame
  // (Gold Block) wrapping the glass window, Crystal Matrix is the capsule in the middle,
  // Hopper here is the capsule drop slot.
  {
    id: "gacha_machine",
    type: "shaped",
    pattern: [
      "IIIII",
      "IFFFI",
      "ILCLI",
      "IFFFI",
      "IIHII"
    ],
    key: {
      I: "minecraft:iron_block",
      F: "minecraft:gold_block",
      L: "minecraft:glass",
      C: "avaritia:crystal_matrix",
      H: "minecraft:hopper"
    },
    result: { id: "avaritia:gacha_machine", amount: 1 }
  },

  // ===== 16. Star Fuel =====
  // The whole 9x9 grid is filled with Coal Blocks, except the exact center cell (row 5, column 5)
  // which is 1 Nether Star.
  {
    id: "starfuel",
    type: "shaped",
    pattern: [
      "CCCCCCCCC",
      "CCCCCCCCC",
      "CCCCCCCCC",
      "CCCCCCCCC",
      "CCCCSCCCC",
      "CCCCCCCCC",
      "CCCCCCCCC",
      "CCCCCCCCC",
      "CCCCCCCCC"
    ],
    key: {
      C: "minecraft:coal_block",
      S: "minecraft:nether_star"
    },
    result: { id: "avaritia:starfuel", amount: 4 }
  },

  // ===== 17. Ultimate Stew (shapeless) =====
  {
    id: "ultimate_stew",
    type: "shapeless",
    ingredients: [
      { id: "minecraft:wheat", count: 1 },
      { id: "minecraft:carrot", count: 1 },
      { id: "minecraft:potato", count: 1 },
      { id: "minecraft:apple", count: 1 },
      { id: "minecraft:melon_slice", count: 1 },
      { id: "minecraft:pumpkin", count: 1 },
      { id: "minecraft:cactus", count: 1 },
      { id: "minecraft:red_mushroom", count: 1 },
      { id: "minecraft:brown_mushroom", count: 1 }
    ],
    result: { id: "avaritia:ultimate_stew", amount: 1 }
  },

  // ===== 18. Cosmic Meatballs (shapeless) =====
  {
    id: "cosmic_meatballs",
    type: "shapeless",
    ingredients: [
      { id: "minecraft:beef", count: 2 },
      { id: "minecraft:chicken", count: 2 },
      { id: "minecraft:porkchop", count: 2 },
      { id: "minecraft:cod", count: 2 }
    ],
    result: { id: "avaritia:cosmic_meatballs", amount: 1 }
  },

  // ===== 19. Endest Pearl =====
  {
    id: "endest_pearl",
    type: "shaped",
    pattern: [
      "...EEE...",
      ".EEPPPEE.",
      ".EPPPPPE.",
      "EPPPNPPPE",
      "EPPNSNPPE",
      "EPPPNPPPE",
      ".EPPPPPE.",
      ".EEPPPEE.",
      "...EEE..."
    ],
    key: {
      E: "minecraft:end_stone",
      P: "minecraft:ender_pearl",
      S: "minecraft:nether_star",
      N: "avaritia:neutronium_ingot"
    },
    result: { id: "avaritia:endest_pearl", amount: 1 }
  },

  // ===== 20. Ultimate Singularity (shapeless - needs all 23 base singularities) =====
  {
    id: "ultimate_singularity",
    type: "shapeless",
    ingredients: [
      { id: "avaritia:coal_singularity", count: 1 },
      { id: "avaritia:diamond_singularity", count: 1 },
      { id: "avaritia:emerald_singularity", count: 1 },
      { id: "avaritia:quartz_singularity", count: 1 },
      { id: "avaritia:lapis_singularity", count: 1 },
      { id: "avaritia:slime_singularity", count: 1 },
      { id: "avaritia:honey_singularity", count: 1 },
      { id: "avaritia:redstone_singularity", count: 1 },
      { id: "avaritia:gold_singularity", count: 1 },
      { id: "avaritia:iron_singularity", count: 1 },
      { id: "avaritia:netherite_singularity", count: 1 },
      { id: "avaritia:obsidian_singularity", count: 1 },
      { id: "avaritia:soul_sand_singularity", count: 1 },
      { id: "avaritia:copper_singularity", count: 1 },
      { id: "avaritia:amethyst_singularity", count: 1 },
      { id: "avaritia:experience_singularity", count: 1 },
      { id: "avaritia:netherrack_singularity", count: 1 },
      { id: "avaritia:glowstone_singularity", count: 1 },
      { id: "avaritia:prismarine_singularity", count: 1 },
      { id: "avaritia:end_stone_singularity", count: 1 },
      { id: "avaritia:magma_singularity", count: 1 },
      { id: "avaritia:bone_singularity", count: 1 },
      { id: "avaritia:ice_singularity", count: 1 }
    ],
    result: { id: "avaritia:ultimate_singularity", amount: 1 }
  },

  // ===== 21. Infinity Catalyst (shapeless) =====
  // Added "record_fragment" as an ingredient - matching the original
  // Infinity Catalyst recipe from Re:Avaritia (the PC mod this addon is based on), this
  // item was previously missed when porting to Bedrock so it could be crafted but
  // had no use.
  {
    id: "infinity_catalyst",
    type: "shapeless",
    ingredients: [
      { id: "avaritia:ultimate_singularity", count: 1 },
      { id: "avaritia:starfuel", count: 1 },
      { id: "avaritia:ultimate_stew", count: 1 },
      { id: "avaritia:cosmic_meatballs", count: 1 },
      { id: "avaritia:endest_pearl", count: 1 },
      { id: "avaritia:record_fragment", count: 1 }
    ],
    result: { id: "avaritia:infinity_catalyst", amount: 1 }
  },

  // ===== 22. Infinity Ingot =====
  {
    id: "infinity_ingot",
    type: "shaped",
    pattern: [
      "NNNNNNNNN",
      "NCXXCXXCN",
      "NXCCXCCXN",
      "NCXXCXXCN",
      "NNNNNNNNN"
    ],
    key: {
      C: "avaritia:crystal_matrix",
      N: "avaritia:neutronium_ingot",
      X: "avaritia:infinity_catalyst"
    },
    result: { id: "avaritia:infinity_ingot", amount: 1 }
  },

  // ===== 23. Block of Infinity (fill the 9x9 with Infinity Ingot = 81 ingots) =====
  {
    id: "infinity_block",
    type: "shaped",
    pattern: [
      "IIIIIIIII","IIIIIIIII","IIIIIIIII",
      "IIIIIIIII","IIIIIIIII","IIIIIIIII",
      "IIIIIIIII","IIIIIIIII","IIIIIIIII"
    ],
    key: { I: "avaritia:infinity_ingot" },
    result: { id: "avaritia:infinity_block", amount: 1 }
  },

  // ===== 24. Split Block of Infinity: 1 block -> 81 Infinity Ingots =====
  // One craft only yields at most 64 (stack limit), so 64 is the main result and the remaining
  // 17 ingots (field "bonus") are added automatically when the player takes the item.
  {
    id: "infinity_block_split",
    type: "shaped",
    pattern: ["B"],
    key: { B: "avaritia:infinity_block" },
    result: { id: "avaritia:infinity_ingot", amount: 64 },
    bonus: { id: "avaritia:infinity_ingot", amount: 17 }
  },

  // ===== 25-29. Infinity utility tools =====
  {
    id: "infinity_totem",
    type: "shaped",
    pattern: ["ICICI", "CNNNC", "INTNI", "CNNNC", "ICICI"],
    key: { I: "avaritia:infinity_ingot", C: "avaritia:crystal_matrix", N: "avaritia:neutronium_ingot", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem", amount: 1 }
  },
  {
    id: "infinity_fishing_rod",
    type: "shaped",
    pattern: ["...IS", "..I.S", ".N..S", "N...S"],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot", S: "minecraft:string" },
    result: { id: "avaritia:infinity_fishing_rod", amount: 1 }
  },
  {
    id: "infinity_shears",
    type: "shaped",
    pattern: ["I...I", ".N.N.", "..S..", ".C.C.", "..N.."],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot", C: "avaritia:crystal_matrix", S: "minecraft:shears" },
    result: { id: "avaritia:infinity_shears", amount: 1 }
  },
  {
    id: "infinity_bucket",
    type: "shaped",
    pattern: ["NIIIN", "ICBCI", "IIXII", ".INI.", "..I.."],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot", C: "avaritia:crystal_matrix", X: "avaritia:crystal_matrix_block", B: "minecraft:bucket" },
    result: { id: "avaritia:infinity_bucket", amount: 1 }
  },
  {
    id: "biome_compass",
    type: "shaped",
    pattern: [".NIN.", "IDCDI", "NCKCN", "IDCDI", ".NIN."],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot", C: "avaritia:crystal_matrix", D: "avaritia:diamond_lattice", K: "minecraft:compass" },
    result: { id: "avaritia:biome_compass_17", amount: 1 }
  },
  {
    id: "infinity_flint_and_steel",
    type: "shaped",
    pattern: ["I.", "FN"],
    key: { I: "avaritia:infinity_ingot", F: "minecraft:flint", N: "avaritia:neutronium_ingot" },
    result: { id: "avaritia:infinity_flint_and_steel", amount: 1 }
  },

  // ===== Infinity Totems (12 elemental totems; centre = Totem of Undying) =====
  {
    id: "infinity_totem_tide",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:lapis_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_tide", amount: 1 }
  },
  {
    id: "infinity_totem_ender",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:endest_pearl", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_ender", amount: 1 }
  },
  {
    id: "infinity_totem_fortune",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:gold_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_fortune", amount: 1 }
  },
  {
    id: "infinity_totem_berserker",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:redstone_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_berserker", amount: 1 }
  },
  {
    id: "infinity_totem_vitality",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:emerald_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_vitality", amount: 1 }
  },
  {
    id: "infinity_totem_gale",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:quartz_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_gale", amount: 1 }
  },
  {
    id: "infinity_totem_mercy",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:honey_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_mercy", amount: 1 }
  },
  {
    id: "infinity_totem_clairvoyance",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:diamond_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_clairvoyance", amount: 1 }
  },
  {
    id: "infinity_totem_inferno",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:coal_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_inferno", amount: 1 }
  },
  {
    id: "infinity_totem_shadow",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:obsidian_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_shadow", amount: 1 }
  },
  {
    id: "infinity_totem_frost",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "minecraft:blue_ice", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_frost", amount: 1 }
  },
  {
    id: "infinity_totem_void",
    type: "shaped",
    pattern: ["IEI", "ETE", "IEI"],
    key: { I: "avaritia:infinity_ingot", E: "avaritia:netherite_singularity", T: "minecraft:totem_of_undying" },
    result: { id: "avaritia:infinity_totem_void", amount: 1 }
  },

  // ========================================
  // ===== NEON HALO ARMOR (custom, no original recipe) =====
  // ========================================

  // ===== Neon Halo Helmet (shapeless upgrade of the Infinity piece) =====
  {
    id: "neon_crystal",
    type: "shaped",
    pattern: [
      "CRC",
      "LEL",
      "CRC"
    ],
    key: {
      C: "avaritia:crystal_matrix",
      R: "avaritia:redstone_singularity",
      L: "avaritia:lapis_singularity",
      E: "avaritia:endest_pearl"
    },
    result: { id: "halo:neon_crystal", amount: 4 }
  },
  {
    id: "neon_helmet",
    type: "shaped",
    pattern: [
      "..NNNNN..",
      ".NIIIIIN.",
      ".N.XIX.N.",
      ".NIIIIIN.",
      ".NIIIIIN.",
      ".NI.I.IN."
    ],
    key: {
      I: "avaritia:infinity_ingot",
      X: "avaritia:crystal_matrix_block",
      N: "halo:neon_crystal"
    },
    result: { id: "halo:neon_helmet", amount: 1 }
  },

  // ===== Neon Halo Chestplate (shapeless upgrade of the Infinity piece) =====
  {
    id: "neon_chestplate",
    type: "shaped",
    pattern: [
      ".NN...NN.",
      "NNN...NNN",
      "NNN...NNN",
      ".NIIIIIN.",
      ".NIIXIIN.",
      ".NIIIIIN.",
      ".NIIIIIN.",
      ".NIIIIIN.",
      "..NNNNN.."
    ],
    key: {
      I: "avaritia:infinity_ingot",
      X: "avaritia:crystal_matrix_block",
      N: "halo:neon_crystal"
    },
    result: { id: "halo:neon_chestplate", amount: 1 }
  },

  // ===== Neon Halo Leggings (shapeless upgrade of the Infinity piece) =====
  {
    id: "neon_leggings",
    type: "shaped",
    pattern: [
      "NNNNNNNNN",
      "NIIIXIIIN",
      "NINNXNNIN",
      "NIN...NIN",
      "NCN...NCN",
      "NIN...NIN",
      "NIN...NIN",
      "NIN...NIN",
      "NNN...NNN"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      X: "avaritia:crystal_matrix_block",
      C: "avaritia:crystal_matrix",
      N: "halo:neon_crystal"
    },
    result: { id: "halo:neon_leggings", amount: 1 }
  },

  // ===== Neon Halo Boots (shapeless upgrade of the Infinity piece) =====
  {
    id: "neon_boots",
    type: "shaped",
    pattern: [
      ".NNN.NNN.",
      ".NIN.NIN.",
      ".NIN.NIN.",
      "NNIN.NINN",
      "NIIN.NIIN",
      "NNNN.NNNN"
    ],
    key: {
      I: "avaritia:infinity_ingot",
      N: "halo:neon_crystal"
    },
    result: { id: "halo:neon_boots", amount: 1 }
  }

];

/**
 * ===== 2-PHASE MECHANISM FOR THE OUTPUT CELL (prevents desync + prevents dupes) =====
 *
 * Because the output cell (slot 81) is just an ordinary inventory slot of the entity (shown
 * through a chest-style UI), NOT a special "result" slot like the vanilla crafting table,
 * it cannot automatically know "the player clicked to take the item" - it can
 * only be inferred by comparing the output cell's state between ticks.
 *
 * So the engine works in 2 phases:
 *   PHASE 1 - PREVIEW: when the grid matches a recipe and the output cell is empty, place the
 *     RESULT ITEM in the output cell BUT DO NOT consume ingredients yet. At the same time save
 *     the exact "consume plan" (which cells, which items) matching the grid AT THAT
 *     MOMENT into temporary memory (altarStates).
 *   PHASE 2 - CONFIRM: every tick afterwards, if the output cell still holds the preview unchanged,
 *     check whether the grid still matches that recipe:
 *       - Still matches -> do nothing, keep waiting.
 *       - No longer matches (the player removed/swapped ingredients) -> CANCEL the preview
 *         (remove it from the output cell) WITHOUT consuming anything, because the preview was never
 *         truly "taken".
 *     If the output cell CHANGES FROM HAVING AN ITEM TO EMPTY (regardless of where the player took it
 *     - into the inventory, temporarily into another cell of the 9x9 grid, or straight
 *     into another chest/storage) -> this is the sign that the preview was really taken,
 *     and only then are the INGREDIENTS CONSUMED exactly once per the saved plan.
 *
 * Because ingredients are consumed ONLY once, exactly when the output cell
 * becomes empty again (not when the recipe matches), the player
 * CANNOT get unlimited items by pulling the preview out and putting it back into another
 * cell in the grid before storing it - since the first time the output cell empties, the
 * ingredients are consumed immediately, and a new preview only reappears if the ingredients (already
 * consumed) are still enough to match the recipe again.
 *
 * state of each altar (key = entity.id):
 *   reserved: null, or {
 *     recipeId, resultId, resultAmount,
 *     consumePlan: { type, plan: [{ idx, id, take }, ...] }
 *   }
 */
const altarStates = new Map();

// state.reserved must survive leaving/re-entering the world (altarStates is only
// temporary memory, wiped completely when the script restarts) - otherwise the output cell
// would still display the item (the container data is really saved) but the system would forget
// which ingredients it promised to consume, leading to taking items for FREE without spending
// ingredients. Saved/read via the altar entity's own dynamic property so it is stored in the
// world save and survives reloads.
const RESERVED_PROP = "avaritia:reserved";

function saveReserved(entity, reserved) {
  try {
    if (reserved) {
      entity.setDynamicProperty(RESERVED_PROP, JSON.stringify(reserved));
    } else {
      entity.setDynamicProperty(RESERVED_PROP, undefined);
    }
  } catch (e) {
    // safety: if the entity was just unloaded/invalid, skip it, no crash loop
  }
}

function loadReserved(entity) {
  try {
    const raw = entity.getDynamicProperty(RESERVED_PROP);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** Gets the 9x9 grid (2D array of typeId or null) from the container */
function readGrid(container) {
  const grid = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      const idx = r * GRID_SIZE + c;
      const item = container.getItem(idx);
      row.push(item ? item.typeId : null);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Normalizes the pattern: drops empty rows/columns at the outer edge.
 *
 * This is very important for the 9x9 grid: many recipes are written with
 * "." padding at the edges (e.g. Helmet/Hoe). The bounding box of the
 * actual ingredients does not include that padding, so the matcher must use
 * the trimmed pattern instead of the original pattern size.
 */
function getEffectivePattern(recipe) {
  const rows = recipe.pattern.map(row => String(row));
  if (!rows.length) return [];

  let top = 0;
  let bottom = rows.length - 1;
  let left = 0;
  let right = Math.max(...rows.map(row => row.length)) - 1;

  const isEmptyCell = ch => ch === "." || ch === " ";
  const rowEmpty = row => {
    for (let c = 0; c < row.length; c++) {
      if (!isEmptyCell(row[c])) return false;
    }
    return true;
  };
  const colEmpty = c => {
    for (const row of rows) {
      if (c < row.length && !isEmptyCell(row[c])) return false;
    }
    return true;
  };

  while (top <= bottom && rowEmpty(rows[top])) top++;
  while (bottom >= top && rowEmpty(rows[bottom])) bottom--;
  while (left <= right && colEmpty(left)) left++;
  while (right >= left && colEmpty(right)) right--;

  if (top > bottom || left > right) return [];

  return rows.slice(top, bottom + 1).map(row => {
    let out = "";
    for (let c = left; c <= right; c++) out += row[c] ?? ".";
    return out;
  });
}

/** Computes the bounding box of the non-null cells in the grid */
function boundingBox(grid) {
  let minR = -1, maxR = -1, minC = -1, maxC = -1;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] !== null) {
        if (minR === -1) minR = r;
        maxR = r;
        if (minC === -1 || c < minC) minC = c;
        if (maxC === -1 || c > maxC) maxC = c;
      }
    }
  }
  if (minR === -1) return null;
  return { minR, maxR, minC, maxC, height: maxR - minR + 1, width: maxC - minC + 1 };
}

/** Tries to match 1 SHAPED recipe against the current grid (returns true/false) */
function matchesRecipe(grid, box, recipe) {
  const pattern = getEffectivePattern(recipe);
  if (!pattern.length) return false;

  const patH = pattern.length;
  const patW = pattern[0].length;
  if (box.height !== patH || box.width !== patW) return false;

  for (let r = 0; r < patH; r++) {
    for (let c = 0; c < patW; c++) {
      const ch = pattern[r][c];
      const gridItem = grid[box.minR + r][box.minC + c];
      if (ch === "." || ch === " ") {
        if (gridItem !== null) return false;
      } else {
        const wantedId = recipe.key[ch];
        if (Array.isArray(wantedId)) {
          if (gridItem === null || !wantedId.includes(gridItem)) return false;
        } else {
          if (gridItem !== wantedId) return false;
        }
      }
    }
  }
  return true;
}

/** Counts every item (typeId -> quantity) across the whole 9x9 grid, used for shapeless recipes */
function countGridItems(container) {
  const counts = {};
  for (let idx = 0; idx < TOTAL_GRID_SLOTS; idx++) {
    const item = container.getItem(idx);
    if (!item) continue;
    counts[item.typeId] = (counts[item.typeId] || 0) + item.amount;
  }
  return counts;
}

/**
 * Tries to match a SHAPELESS recipe.
 *
 * Position within the 81 cells does not matter. Each ingredient type must be ENOUGH (>=) in
 * quantity - extra is OK, it just must not be short or mixed with foreign items outside the
 * list. An ingredient can also declare its id as an array to support several
 * equivalent variants.
 */
function matchesShapeless(gridCounts, recipe) {
  const required = {};
  const allowedByKey = {};

  for (const ing of recipe.ingredients) {
    const ids = Array.isArray(ing.id) ? ing.id : [ing.id];
    const count = Number(ing.count) || 0;
    if (count <= 0) continue;

    // For a single-ID ingredient, keep the exact check as before.
    if (ids.length === 1) {
      required[ids[0]] = (required[ids[0]] || 0) + count;
    } else {
      // Choice group: the total number of items belonging to the group must equal count.
      allowedByKey[ids.join("|")] = { ids, count };
    }
  }

  // Fixed IDs must be ENOUGH (>=) in quantity - extra is OK.
  for (const [id, count] of Object.entries(required)) {
    if ((gridCounts[id] || 0) < count) return false;
  }

  // There must be no IDs outside the list.
  const allowedIds = new Set(Object.keys(required));
  for (const group of Object.values(allowedByKey)) {
    for (const id of group.ids) allowedIds.add(id);
  }
  for (const id of Object.keys(gridCounts)) {
    if (!allowedIds.has(id)) return false;
  }

  // Choice groups must be ENOUGH (>=) in quantity - extra is OK.
  for (const group of Object.values(allowedByKey)) {
    let total = 0;
    for (const id of group.ids) total += gridCounts[id] || 0;
    if (total < group.count) return false;
  }

  return true;
}

/** Finds the recipe matching the current grid, returns { recipe, box } or null (box = null for shapeless) */
function findMatch(grid, container) {
  const box = boundingBox(grid);
  if (!box) return null;

  // Try shaped recipes first
  for (const recipe of RECIPES) {
    if (recipe.type === "shapeless") continue;
    if (matchesRecipe(grid, box, recipe)) return { recipe, box };
  }

  // Then try shapeless recipes
  const counts = countGridItems(container);
  for (const recipe of RECIPES) {
    if (recipe.type !== "shapeless") continue;
    if (matchesShapeless(counts, recipe)) return { recipe, box: null };
  }

  return null;
}

/**
 * Builds the "consume plan" (list of { idx, id, take }) for the recipe
 * and the grid AT THE MOMENT OF MATCHING - used to consume EXACTLY these cells/quantities
 * later, regardless of whether the player has touched the grid by the time of the actual
 * consumption (see applyConsumePlan - it re-checks each cell for safety).
 */
function buildConsumePlan(container, recipe, box) {
  if (recipe.type === "shapeless") {
    const remaining = {};
    for (const ing of recipe.ingredients) remaining[ing.id] = ing.count;

    const plan = [];
    for (let idx = 0; idx < TOTAL_GRID_SLOTS; idx++) {
      const item = container.getItem(idx);
      if (!item) continue;
      const need = remaining[item.typeId];
      if (!need) continue;

      const take = Math.min(need, item.amount);
      plan.push({ idx, id: item.typeId, take });
      remaining[item.typeId] -= take;
      if (remaining[item.typeId] <= 0) delete remaining[item.typeId];
    }
    return { type: "shapeless", plan };
  }

  const pattern = getEffectivePattern(recipe);
  const patH = pattern.length;
  const patW = pattern[0].length;
  const plan = [];
  for (let r = 0; r < patH; r++) {
    for (let c = 0; c < patW; c++) {
      const ch = pattern[r][c];
      if (ch === "." || ch === " ") continue;
      const idx = (box.minR + r) * GRID_SIZE + (box.minC + c);
      const actualItem = container.getItem(idx);
      const takeId = actualItem ? actualItem.typeId : recipe.key[ch];
      plan.push({ idx, id: takeId, take: 1 });
    }
  }
  return { type: "shaped", plan };
}

/**
 * Applies the saved consume plan. Only consumes at cells that still hold EXACTLY the item type recorded
 * when the plan was made (safe if something changed unexpectedly between plan
 * creation and consumption - this almost never happens because the preview is
 * cancelled as soon as the grid changes, but it is still guarded against to avoid consuming wrongly/negative quantities).
 */
function applyConsumePlan(container, consumePlan) {
  for (const { idx, id, take } of consumePlan.plan) {
    const item = container.getItem(idx);
    if (!item || item.typeId !== id) continue;
    if (item.amount <= take) {
      container.setItem(idx, undefined);
    } else {
      const newStack = item.clone();
      newStack.amount = item.amount - take;
      container.setItem(idx, newStack);
    }
  }
}

/**
 * ===== ANTI "ITEM SWAP" AT THE OUTPUT CELL =====
 * On touch interfaces (select an item then tap another cell to SWAP), the player can
 * select the preview item in the output cell then tap any item in the inventory: the preview goes
 * into the inventory, and the inventory item stays in the output cell. The output cell is then NOT empty so
 * the old version thought "the player put another item in themselves" and cancelled the reservation without consuming
 * ingredients -> free items (repeatable infinitely).
 *
 * New rule: the output cell only counts as "preview intact" when it has the exact item, the exact
 * quantity (and the exact marker if any). Any difference (empty, swapped,
 * merged with more, partially taken) means the preview was touched -> CONSUME INGREDIENTS
 * exactly once per the saved plan.
 *
 * Hard case: the crafted item is NOT stackable (sword, armor...) and the player
 * already owns an identical one and swaps it in -> the output cell is still the "exact item, exact
 * quantity". To tell them apart, this kind of preview gets a random marker
 * (a dynamic property on the ItemStack); the player's own item does not have that marker so it is
 * detected. If the API version does not support dynamic properties on ItemStack then
 * skip this step (only compare item + quantity as above), no error.
 */
const PREVIEW_MARK_PROP = "avaritia:preview_token";

function newPreviewToken() {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

/** Attaches a marker to the preview if the item is not stackable. Returns the token, or null if it could not be attached. */
function markPreview(item) {
  try {
    if (item.maxAmount !== 1) return null;
    const token = newPreviewToken();
    item.setDynamicProperty(PREVIEW_MARK_PROP, token);
    return token;
  } catch (e) {
    return null;
  }
}

function isPreviewUntouched(currentOutput, reserved) {
  if (!currentOutput) return false;
  if (currentOutput.typeId !== reserved.resultId) return false;
  if (currentOutput.amount !== reserved.resultAmount) return false;
  if (reserved.token) {
    try {
      if (currentOutput.getDynamicProperty(PREVIEW_MARK_PROP) !== reserved.token) return false;
    } catch (e) {
      // could not read the marker -> cannot prove otherwise, keep the conclusion based on item + quantity
    }
  }
  return true;
}

/**
 * The marker is only TEMPORARY: it only matters while the preview sits in the
 * output cell. As soon as the preview is taken, we rescan (altar cells + nearby player
 * inventories) and REMOVE the marker from the item, so the crafted item is completely clean, carrying
 * no properties. Scans for at most CLEANUP_WINDOW_TICKS (in case the player
 * is still holding the item on the cursor, not yet put in the inventory), and stops once it is found and removed.
 */
const CLEANUP_WINDOW_TICKS = 1200; // 60 seconds
const CLEANUP_PLAYER_RADIUS = 24;

function stripMarkerFromContainer(container, token) {
  let found = false;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (!item) continue;
    let value;
    try { value = item.getDynamicProperty(PREVIEW_MARK_PROP); } catch (e) { return found; }
    if (value !== token) continue;
    try {
      item.setDynamicProperty(PREVIEW_MARK_PROP, undefined);
      container.setItem(i, item);
      found = true;
    } catch (e) {}
  }
  return found;
}

function runMarkerCleanup(entity, state) {
  const c = state.cleanup;
  if (!c) return;
  if (system.currentTick > c.until) {
    state.cleanup = null;
    return;
  }
  let found = false;
  const altarInv = entity.getComponent("minecraft:inventory");
  if (altarInv && altarInv.container) {
    found = stripMarkerFromContainer(altarInv.container, c.token) || found;
  }
  const players = entity.dimension.getPlayers({ location: entity.location, maxDistance: CLEANUP_PLAYER_RADIUS });
  for (const player of players) {
    const inv = player.getComponent("minecraft:inventory");
    if (inv && inv.container) {
      found = stripMarkerFromContainer(inv.container, c.token) || found;
    }
  }
  if (found) state.cleanup = null;
}

/**
 * Awards the extra reward (recipe.bonus) when the preview is taken: prefers putting it into the inventory of
 * the player nearest the altar, and anything that does not fit is dropped on the ground at the altar.
 */
const BONUS_PLAYER_RADIUS = 8;
function giveBonus(entity, bonus) {
  try {
    const dimension = entity.dimension;
    const players = dimension.getPlayers({ location: entity.location, maxDistance: BONUS_PLAYER_RADIUS });
    let target = null, best = Infinity;
    for (const p of players) {
      const dx = p.location.x - entity.location.x, dy = p.location.y - entity.location.y, dz = p.location.z - entity.location.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; target = p; }
    }
    const stack = new ItemStack(bonus.id, bonus.amount);
    const leftover = target ? target.getComponent("minecraft:inventory")?.container?.addItem(stack) : stack;
    if (leftover) dimension.spawnItem(leftover, entity.location);
  } catch (e) {}
}

function tickAltar(entity, state) {
  const inv = entity.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
  const container = inv.container;

  const currentOutput = container.getItem(OUTPUT_SLOT);

  if (state.reserved) {
    if (!isPreviewUntouched(currentOutput, state.reserved)) {
      // The preview is NOT intact in the output cell: taken (cell empty), SWAPPED
      // with another item, merged with more, partially taken... All of these mean the player
      // touched the preview. This is the ONLY moment ingredients are consumed - consume exactly
      // once then clear the reservation (see the "ANTI ITEM SWAP" section above).
      applyConsumePlan(container, state.reserved.consumePlan);
      if (state.reserved.bonus) giveBonus(entity, state.reserved.bonus);
      if (state.reserved.token) {
        // Removes the temporary marker from the item that was just taken (see runMarkerCleanup).
        state.cleanup = { token: state.reserved.token, until: system.currentTick + CLEANUP_WINDOW_TICKS };
      }
      state.reserved = null;
      saveReserved(entity, null);
    } else {
      // The preview is still intact in the output cell -> check whether the recipe still
      // matches the current grid (the player may have removed/swapped
      // ingredients while the preview was displayed).
      const grid = readGrid(container);
      const match = findMatch(grid, container);
      const stillMatches = match && match.recipe.id === state.reserved.recipeId;
      if (!stillMatches) {
        // No longer matches -> remove the preview from the output cell. Safe because
        // ingredients were never consumed for this preview.
        container.setItem(OUTPUT_SLOT, undefined);
        state.reserved = null;
        saveReserved(entity, null);
      } else {
        return; // still waiting for the player to take the item, nothing more to do yet
      }
    }
  }

  // No preview is reserving anymore (or it was just released above) ->
  // try to find a new matching recipe. If the output cell is busy (something belonging to the player,
  // not our own preview) then wait, do not overwrite.
  if (container.getItem(OUTPUT_SLOT)) return;

  const grid = readGrid(container);
  const match = findMatch(grid, container);
  if (!match) return;

  const consumePlan = buildConsumePlan(container, match.recipe, match.box);
  const previewItem = new ItemStack(match.recipe.result.id, match.recipe.result.amount);
  const token = markPreview(previewItem);
  container.setItem(OUTPUT_SLOT, previewItem);
  state.reserved = {
    recipeId: match.recipe.id,
    resultId: match.recipe.result.id,
    resultAmount: match.recipe.result.amount,
    token,
    bonus: match.recipe.bonus || null,
    consumePlan
  };
  saveReserved(entity, state.reserved);
}

// ===== EVENT-DRIVEN TICKING (needs @minecraft/server >= 2.8.0) =====
// Before: EVERY tick, getEntities() was run in 3 dimensions and every altar was ticked, even when
// nobody had the 9x9 UI open. Now: an altar is ticked every tick ONLY while its container is open
// (entityContainerOpened / entityContainerClosed), plus until its marker cleanup is finished.
// A slow full scan (SAFETY_SCAN_TICKS) stays as a safety net: if the open event is ever missed,
// crafting still works (with up to ~1s delay) instead of breaking.
const ALTAR_ENTITY_TYPE = "avaritia:altar";
const SAFETY_SCAN_TICKS = 20;
const watchedAltars = new Map(); // altar id -> { entity, opens, closing }

function processAltar(altar) {
  let state = altarStates.get(altar.id);
  if (!state) {
    state = { reserved: loadReserved(altar) };
    altarStates.set(altar.id, state);
  }
  try {
    tickAltar(altar, state);
  } catch (e) {
    // safety: skip faulty entities, do not crash the whole loop
  }
  if (state.cleanup) {
    try {
      runMarkerCleanup(altar, state);
    } catch (e) {
      // safety: ignore marker cleanup errors, they do not affect crafting
    }
  }
  return state;
}

try {
  world.afterEvents.entityContainerOpened?.subscribe((ev) => {
    const e = ev && ev.entity;
    if (!e || e.typeId !== ALTAR_ENTITY_TYPE) return;
    const w = watchedAltars.get(e.id);
    if (w) { w.entity = e; w.opens++; w.closing = false; }
    else watchedAltars.set(e.id, { entity: e, opens: 1, closing: false });
  });
  world.afterEvents.entityContainerClosed?.subscribe((ev) => {
    const e = ev && ev.entity;
    if (!e || e.typeId !== ALTAR_ENTITY_TYPE) return;
    const w = watchedAltars.get(e.id);
    if (!w) return;
    w.opens = Math.max(0, w.opens - 1);
    if (w.opens === 0) w.closing = true; // one more tick below, then it is released
  });
} catch (e) {
  // module without these events: the safety scan below keeps everything working
}

// Fast loop: only altars that are open (or finishing).
system.runInterval(() => {
  for (const [id, w] of watchedAltars) {
    let valid = false;
    try { valid = !!w.entity && w.entity.isValid; } catch (e) { valid = false; }
    if (!valid) { watchedAltars.delete(id); continue; }
    const state = processAltar(w.entity);
    if (w.closing && !state.cleanup) watchedAltars.delete(id);
  }
}, 0);

// Safety net: slow full scan (same behaviour as the old every-tick loop, just rarer).
system.runInterval(() => {
  const liveIds = new Set();

  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    const dimension = world.getDimension(dimensionId);
    const altars = dimension.getEntities({ type: ALTAR_ENTITY_TYPE });
    for (const altar of altars) {
      liveIds.add(altar.id);
      if (watchedAltars.has(altar.id)) continue; // already handled by the fast loop
      processAltar(altar);
    }
  }

  // Cleans up temporary memory of altars that no longer exist (destroyed, long unloaded, ...)
  // to avoid memory leaks over long play sessions.
  for (const id of altarStates.keys()) {
    if (!liveIds.has(id)) altarStates.delete(id);
  }
}, SAFETY_SCAN_TICKS);
