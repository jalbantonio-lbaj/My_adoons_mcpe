import { system, world } from '@minecraft/server'

let EXTREME_RECIPES = [
  {
    pattern: [
      "IIQQQQQII",
      "I QQQQQ I",
      "I  RRR  I",
      "M RRRRR M",
      "I RRMRR I",
      "M RRRRR M",
      "I  RRR  I",
      "I       I",
      "IIIMIMIII"
    ],
    key: { I: "minecraft:iron_block", Q: "minecraft:quartz_block", R: "minecraft:redstone_block", M: "avaritia:crystal_matrix_ingot" },
    result: { item: "avaritia:neutron_collector", count: 1 }
  },
  {
    pattern: [
      "IIIHHHIII",
      "M N   N M",
      "I N   N I",
      "M N   N M",
      "RNN B NNR",
      "M N   N M",
      "I N   N I",
      "M N   N M",
      "IIIMIMIII"
    ],
    key: {I: "minecraft:iron_block", H: "minecraft:hopper", M: "avaritia:crystal_matrix_ingot", N: "avaritia:neutronium_ingot", R: "minecraft:redstone_block", B: "avaritia:neutronium_block" },
    result: { item: "avaritia:neutronium_compressor", count: 1 }
  },
  {
    pattern: [
      "       MP",
      "      MPM",
      "     MPM ",
      "    MPM  ",
      " B MPM   ",
      "  BPM    ",
      "  LB     ",
      " L  B    ",
      "N        "
    ],
    key: { N : "minecraft:nether_star", M: "avaritia:crystal_matrix_ingot", P: "minecraft:blaze_powder", B: "minecraft:bone", L: {"tag": "minecraft:logs"} },
    result: { item: "avaritia:skullfire_sword", count: 1 }
  },
  {
    pattern: [
      "   SSS   ",
      " SSEEESS ",
      " SEEEEES ",
      "SEEENEEES",
      "SEENRNEES",
      "SEEENEEES",
      " SEEEEES ",
      " SSEEESS ",
      "   SSS   "
    ],
    key: { S: "minecraft:end_stone", E: "minecraft:ender_pearl", N: "avaritia:neutronium_ingot", R: "minecraft:nether_star" },
    result: { item: "avaritia:endest_pearl", count: 1 }
  },
  {
    pattern: [
      "NPPBBMMCC",
      "SSTTFFKKR",
      "RVVYYEE  ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         "
    ],
    key: { N: "avaritia:neutron_pile", P: "minecraft:porkchop", B: "minecraft:beef", M: "minecraft:mutton", C: "minecraft:cod", S: "minecraft:salmon", T: "minecraft:tropical_fish", F: "minecraft:pufferfish", K: "minecraft:chicken", R: "minecraft:rabbit", Y: "minecraft:spider_eye", V: "minecraft:rotten_flesh", E: "minecraft:egg" },
    result: { item: "avaritia:cosmic_meatballs", count: 2 }
  },
  {
  pattern: [
    "NWWCCPPAA",
    "MMTTRRBBH",
    "HSSEEGGUU",
    "ww       ",
    "         ",
    "         ",
    "         ",
    "         ",
    "         "
  ],
  key: { N: "avaritia:neutron_pile", W: "minecraft:wheat", C: "minecraft:carrot", P: "minecraft:potato", A: "minecraft:apple", M: "minecraft:melon_slice", T: "minecraft:cactus", R: "minecraft:red_mushroom", B: "minecraft:brown_mushroom", H: "minecraft:beetroot", S: "minecraft:sugar_cane", E: "minecraft:sweet_berries", G: "minecraft:glow_berries", U: "minecraft:pumpkin", w: "minecraft:nether_wart" },
  result: { item: "avaritia:ultimate_stew", count: 4 }
  },
  {
    pattern: [
      "NNNNNNNNN",
      "NMCCMCCMN",
      "NCMMCMMCN",
      "NMCCMCCMN",
      "NNNNNNNNN",
      "         ",
      "         ",
      "         ",
      "         "
    ],
    key: {N: "avaritia:neutronium_ingot", M: "avaritia:crystal_matrix_ingot", C: "avaritia:infinity_catalyst" },
    result: { item: "avaritia:infinity_ingot", count: 1 }
  },
  {
    pattern: [
      "         ",
      "NNNNNNNNN",
      "NMCCMCCMN",
      "NCMMCMMCN",
      "NMCCMCCMN",
      "NNNNNNNNN",
      "         ",
      "         ",
      "         "
    ],
    key: {N: "avaritia:neutronium_ingot", M: "avaritia:crystal_matrix_ingot", C: "avaritia:infinity_catalyst" },
    result: { item: "avaritia:infinity_ingot", count: 1 }
  },
  {
    pattern: [
      "         ",
      "         ",
      "NNNNNNNNN",
      "NMCCMCCMN",
      "NCMMCMMCN",
      "NMCCMCCMN",
      "NNNNNNNNN",
      "         ",
      "         "
    ],
    key: {N: "avaritia:neutronium_ingot", M: "avaritia:crystal_matrix_ingot", C: "avaritia:infinity_catalyst" },
    result: { item: "avaritia:infinity_ingot", count: 1 }
  },
  {
    pattern: [
      "         ",
      "         ",
      "         ",
      "NNNNNNNNN",
      "NMCCMCCMN",
      "NCMMCMMCN",
      "NMCCMCCMN",
      "NNNNNNNNN",
      "         "
    ],
    key: {N: "avaritia:neutronium_ingot", M: "avaritia:crystal_matrix_ingot", C: "avaritia:infinity_catalyst" },
    result: { item: "avaritia:infinity_ingot", count: 1 }
  },
  {
    pattern: [
      "         ",
      "         ",
      "         ",
      "         ",
      "NNNNNNNNN",
      "NMCCMCCMN",
      "NCMMCMMCN",
      "NMCCMCCMN",
      "NNNNNNNNN"
    ],
    key: {N: "avaritia:neutronium_ingot", M: "avaritia:crystal_matrix_ingot", C: "avaritia:infinity_catalyst" },
    result: { item: "avaritia:infinity_ingot", count: 1 }
  },
  {
    pattern: [
      "       MM",
      "      MMM",
      "     MMM ",
      "    MMM  ",
      " B MMM   ",
      "  BMM    ",
      "  LB     ",
      " L  B    ",
      "N        "
    ],
    key: { N : "avaritia:infinity_catalyst", M: "avaritia:infinity_ingot", B: "avaritia:crystal_matrix_ingot", L: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:sword_of_the_cosmos", count: 1 }
  },
  {
    pattern: [
      "   II    ",
      "  I W    ",
      " I  W    ",
      "I   W    ",
      "M   W    ",
      "I   W    ",
      " I  W    ",
      "  I W    ",
      "   II    "
    ],
    key: { I : "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot",M: "avaritia:crystal_matrix_block", W : {"tag":"minecraft:wool" } },
    result: { item: "avaritia:longbow_of_the_heavens", count: 1 }
  },
  {
    pattern: [
      "    II   ",
      "   I W   ",
      "  I  W   ",
      " I   W   ",
      " M   W   ",
      " I   W   ",
      "  I  W   ",
      "   I W   ",
      "    II   "
    ],
    key: { I : "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot",M: "avaritia:crystal_matrix_block", W : {"tag":"minecraft:wool" } },
    result: { item: "avaritia:longbow_of_the_heavens", count: 1 }
  },
  {
    pattern: [
      "     II  ",
      "    I W  ",
      "   I  W  ",
      "  I   W  ",
      "  M   W  ",
      "  I   W  ",
      "   I  W  ",
      "    I W  ",
      "     II  "
    ],
    key: { I : "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot",M: "avaritia:crystal_matrix_block", W : {"tag":"minecraft:wool" } },
    result: { item: "avaritia:longbow_of_the_heavens", count: 1 }
  },
  {
    pattern: [
      "      II ",
      "     I W ",
      "    I  W ",
      "   I   W ",
      "   M   W ",
      "   I   W ",
      "    I  W ",
      "     I W ",
      "      II "
    ],
    key: { I : "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot",M: "avaritia:crystal_matrix_block", W : {"tag":"minecraft:wool" } },
    result: { item: "avaritia:longbow_of_the_heavens", count: 1 }
  },
  {
    pattern: [
      "       II",
      "      I W",
      "     I  W",
      "    I   W",
      "    M   W",
      "    I   W",
      "     I  W",
      "      I W",
      "       II"
    ],
    key: { I : "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot",M: "avaritia:crystal_matrix_block", W : {"tag":"minecraft:wool" } },
    result: { item: "avaritia:longbow_of_the_heavens", count: 1 }
  },
  {
    pattern: [
      " IIIIIII ",
      "IIIIMIIII",
      "II  N  II",
      "    N    ",
      "    N    ",
      "    N    ",
      "    N    ",
      "    N    ",
      "    N    "
    ],
    key: { I: "avaritia:infinity_ingot", M: "avaritia:crystal_matrix_block", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:world_breaker", count: 1 }
  },
  {
    pattern: [
      "      III",
      "     IIBI",
      "      III",
      "     N I ",
      "    N    ",
      "   N     ",
      "  N      ",
      " N       ",
      "N        "
    ],
    key: { I: "avaritia:infinity_ingot", B: "avaritia:infinity_block", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:planet_eater", count: 1 }
  },
  {
    pattern: [
      " I       ",
      "IIIII    ",
      "IIII     ",
      " IN      ",
      "  N      ",
      "  N      ",
      "  N      ",
      "  N      ",
      "  N      "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:natures_ruin", count: 1 }
  },
  {
    pattern: [
      "  I      ",
      " IIIII   ",
      " IIII    ",
      "  IN     ",
      "   N     ",
      "   N     ",
      "   N     ",
      "   N     ",
      "   N     "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:natures_ruin", count: 1 }
  },
  {
    pattern: [
      "   I     ",
      "  IIIII  ",
      "  IIII   ",
      "   IN    ",
      "    N    ",
      "    N    ",
      "    N    ",
      "    N    ",
      "    N    "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:natures_ruin", count: 1 }
  },
  {
    pattern: [
      "    I    ",
      "   IIIII ",
      "   IIII  ",
      "    IN   ",
      "     N   ",
      "     N   ",
      "     N   ",
      "     N   ",
      "     N   "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:natures_ruin", count: 1 }
  },
  {
    pattern: [
      "     I   ",
      "    IIIII",
      "    IIII ",
      "     IN  ",
      "      N  ",
      "      N  ",
      "      N  ",
      "      N  ",
      "      N  "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:natures_ruin", count: 1 }
  },
  {
    pattern: [
      "     N   ",
      " IIIIII  ",
      "IIIIIIII ",
      "I     II ",
      "      N  ",
      "      N  ",
      "      N  ",
      "      N  ",
      "      N  "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:hoe_of_the_green_earth", count: 1 }
  },
  {
    pattern: [
      "      N  ",
      "  IIIIII ",
      " IIIIIIII",
      " I     II",
      "       N ",
      "       N ",
      "       N ",
      "       N ",
      "       N "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:hoe_of_the_green_earth", count: 1 }
  },
  {
    pattern: [
      "  NNNNN  ",
      " NIIIIIN ",
      " N CIC N ",
      " NIIIIIN ",
      " NIIIIIN ",
      " NI I IN ",
      "         ",
      "         ",
      "         "
    ],
    key: { I: "avaritia:infinity_ingot", C: "avaritia:infinity_catalyst", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_helmet", count: 1 }
  },
  {
    pattern: [
      "  NNNNN  ",
      " NIIIIIN ",
      " N CIC N ",
      " NIIIIIN ",
      " NIIIIIN ",
      " NI I IN ",
      "         ",
      "         ",
      "         "
    ],
    key: { I: "avaritia:infinity_ingot", C: "avaritia:infinity_catalyst", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_helmet", count: 1 }
  },
  {
    pattern: [
      "         ",
      "  NNNNN  ",
      " NIIIIIN ",
      " N CIC N ",
      " NIIIIIN ",
      " NIIIIIN ",
      " NI I IN ",
      "         ",
      "         "
    ],
    key: { I: "avaritia:infinity_ingot", C: "avaritia:infinity_catalyst", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_helmet", count: 1 }
  },
  {
    pattern: [
      "         ",
      "         ",
      "  NNNNN  ",
      " NIIIIIN ",
      " N CIC N ",
      " NIIIIIN ",
      " NIIIIIN ",
      " NI I IN ",
      "         "
    ],
    key: { I: "avaritia:infinity_ingot", C: "avaritia:infinity_catalyst", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_helmet", count: 1 }
  },
  {
    pattern: [
      "         ",
      "         ",
      "         ",
      "  NNNNN  ",
      " NIIIIIN ",
      " N CIC N ",
      " NIIIIIN ",
      " NIIIIIN ",
      " NI I IN "
    ],
    key: { I: "avaritia:infinity_ingot", C: "avaritia:infinity_catalyst", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_helmet", count: 1 }
  },
  {
    pattern: [
      " NN   NN ",
      "NNN   NNN",
      "NNN   NNN",
      " NIIIIIN ",
      " NIIBIIN ",
      " NIIIIIN ",
      " NIIIIIN ",
      " NIIIIIN ",
      "  NNNNN  "
    ],
    key: { I: "avaritia:infinity_ingot", B: "avaritia:crystal_matrix_block", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_breastplate", count: 1 }
  },
  {
    pattern: [
      "NNNNNNNNN",
      "NIIICIIIN",
      "NINNCNNIN",
      "NIN   NIN",
      "NBN   NBN",
      "NIN   NIN",
      "NIN   NIN",
      "NIN   NIN",
      "NIN   NIN"
    ],
    key: { I: "avaritia:infinity_ingot", B: "avaritia:crystal_matrix_block", N: "avaritia:neutronium_ingot", C: "avaritia:infinity_catalyst" },
    result: { item: "avaritia:infinity_pants", count: 1 }
  },
  {
    pattern: [
      " NNN NNN ",
      " NIN NIN ",
      " NIN NIN ",
      "NNIN NINN",
      "NIIN NIIN",
      "NNNN NNNN",
      "         ",
      "         ",
      "         "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_boots", count: 1 }
  },
  {
    pattern: [
      "         ",
      " NNN NNN ",
      " NIN NIN ",
      " NIN NIN ",
      "NNIN NINN",
      "NIIN NIIN",
      "NNNN NNNN",
      "         ",
      "         "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_boots", count: 1 }
  },
  {
    pattern: [
      "         ",
      "         ",
      " NNN NNN ",
      " NIN NIN ",
      " NIN NIN ",
      "NNIN NINN",
      "NIIN NIIN",
      "NNNN NNNN",
      "         "
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_boots", count: 1 }
  },
  {
    pattern: [
      "         ",
      "         ",
      "         ",
      " NNN NNN ",
      " NIN NIN ",
      " NIN NIN ",
      "NNIN NINN",
      "NIIN NIIN",
      "NNNN NNNN"
    ],
    key: { I: "avaritia:infinity_ingot", N: "avaritia:neutronium_ingot" },
    result: { item: "avaritia:infinity_boots", count: 1 }
  }
];

system.afterEvents.scriptEventReceive.subscribe((event) => {
  const id = event.id
  const message = event.message

  if(id === "avaritia:register_xtreme_recipe") {
    try {
      const data = JSON.parse(message);

      if (!Array.isArray(data.pattern) || !data.key || !data.result) {
        throw new Error("Invalid structure")
      }
      EXTREME_RECIPES.push({
        pattern: data.pattern,
        key: data.key,
        result: data.result
      })
    } catch (error) {
    console.error(error)
    } 
  }
}, { "namespaces": ["avaritia"] });

export { EXTREME_RECIPES}

/*
to register a custom 9x9 recipe:

import { system } from '@minecraft/server'


function registerExtremeRecipe(pattern, key, result) {
  const recipe = {
    pattern: pattern,
    key: key,
    result: result
  };

  const registration = JSON.stringify(recipe);

  system.sendScriptEvent("avaritia:register_xtreme_recipe", registration)
}

system.runTimeout(() => {
  registerExtremeRecipe(
    [
      "A       A", //pattern, like a normal 3x3 patter but 9x9
      "B       B",
      "         ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         "
    ],
    {
      A: "myaddon:item1", B: "myaddon:item2" //recipe items, can be any item in the game
    },
    {
      item: "namespace:resultitem", count: 1 //itemcount, can be 1, 2, 3, 4, etc.
    }
  )
}, 20);

*/