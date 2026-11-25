export const recipes = [
  {
    pattern: [
      "GGFFFFFGG",
      "G FFFFF G",
      "G  HHH  G",
      "E HHHHH E",
      "G HHEHH G",
      "E HHHHH E",
      "G  HHH  G",
      "G       G",
      "GGGEGEGGG"
    ],
    keys: {
      G: "minecraft:iron_block",
      F: "minecraft:quartz_block",
      H: "minecraft:redstone_block",
      E: "dustveyn_ef:crystal_matrix_ingot"
    },
    result: {
      item: "dustveyn_ef:neutron_collector",
      amount: 1
    }
  },
  {
    pattern: [
      "IIIHHHIII",
      "C N   N C",
      "I N   N I",
      "C N   N C",
      "R N B N R",
      "C N   N C",
      "I N   N I",
      "C N   N C",
      "IIICICIII"
    ],
    keys: {
      I: "minecraft:iron_block",
      H: "minecraft:hopper",
      N: "dustveyn_ef:neutronium_ingot",
      B: "dustveyn_ef:neutronium_block",
      R: "minecraft:redstone_block",
      C: "dustveyn_ef:crystal_matrix_ingot"
    },
    result: {
      item: "dustveyn_ef:neutronium_compressor",
      amount: 1
    }
  },
  {
    pattern: [
      "         ",
      "ABCDEFGHA",
      "AIJKLMNOA",
      "APQSRTUVA",
      "AWXYZabcA",
      "AdefghijA",
      "AklmnopqA",
      " AsrtuvA ",
      "  AAAAA  "
    ],
    keys: {
      A: "dustveyn:endless_fabulous.neutronium_ingot",
      B: "minecraft:wheat",
      C: "minecraft:potato",
      D: "minecraft:carrot",
      E: "minecraft:beetroot",
      F: "minecraft:melon_slice",
      G: "minecraft:glistering_melon_slice",
      H: "minecraft:glow_berries",
      I: "minecraft:sweet_berries",
      J: "minecraft:apple",
      K: "minecraft:golden_apple",
      L: "minecraft:enchanted_golden_apple",
      M: "minecraft:golden_carrot",
      N: "minecraft:melon_block",
      O: "minecraft:pumpkin",
      P: "minecraft:porkchop",
      Q: "minecraft:beef",
      S: "minecraft:chicken",
      R: "minecraft:mutton",
      T: "minecraft:rabbit",
      U: "minecraft:cod",
      V: "minecraft:salmon",
      W: "minecraft:pufferfish",
      X: "minecraft:tropical_fish",
      Y: "minecraft:bread",
      Z: "minecraft:mushroom_stew",
      a: "minecraft:beetroot_soup",
      b: "minecraft:rabbit_stew",
      c: "minecraft:baked_potato",
      d: "minecraft:cookie",
      e: "minecraft:pumpkin_pie",
      f: "minecraft:cake",
      g: "minecraft:dried_kelp",
      h: "minecraft:cooked_chicken",
      i: "minecraft:cooked_porkchop",
      j: "minecraft:cooked_beef",
      k: "minecraft:cooked_mutton",
      l: "minecraft:cooked_rabbit",
      m: "minecraft:cooked_cod",
      n: "minecraft:cooked_salmon",
      o: "minecraft:milk_bucket",
      p: "minecraft:honey_bottle",
      q: "minecraft:spider_eye",
      s: "minecraft:poisonous_potato",
      r: "minecraft:rotten_flesh",
      t: "minecraft:sugar",
      u: "minecraft:red_mushroom",
      v: "minecraft:brown_mushroom"
    },
    result: {
      item: "dustveyn:endless_fabulous.cosmic_stew",
      amount: 1
    }
  },
  {
    pattern: [
      "       ED",
      "      EDE",
      "     EDE ",
      "    EDE  ",
      " C EDE   ",
      "  CDE    ",
      "  BC     ",
      " B  C    ",
      "A        "
    ],
    keys: {
      A: "minecraft:nether_star",
      B: [
        "minecraft:oak_log",
        "minecraft:spruce_log",
        "minecraft:birch_log",
        "minecraft:jungle_log",
        "minecraft:acacia_log",
        "minecraft:dark_oak_log",
        "minecraft:mangrove_log",
        "minecraft:crimson_stem",
        "minecraft:warped_stem",
        "minecraft:cherry_log",
        "minecraft:pale_oak_log",
        "minecraft:poplar_log"
      ],
      C: "minecraft:bone",
      D: "minecraft:blaze_powder",
      E: "dustveyn_ef:crystal_matrix_ingot"
    },
    result: {
      item: "dustveyn_ef:skullfire_sword",
      amount: 1
    }
  },
  {
    pattern: [
      "       AA",
      "      AAA",
      "     AAA ",
      "    AAA  ",
      "   AAA   ",
      "  AAA    ",
      " CDA     ",
      " CC      ",
      "B        "
    ],
    keys: {
      A: "dustveyn_ef:infinity_ingot",
      B: "dustveyn_ef:infinity_catalyst",
      C: "dustveyn_ef:neutronium_ingot",
      D: "dustveyn_ef:crystal_matrix_block"
    },
    result: {
      item: "dustveyn_ef:sword_of_the_death",
      amount: 1
    }
  },
  {
    pattern: [
      " AAA     ",
      "AAAACA   ",
      "AAAABA   ",
      "AAAADA   ",
      " AAAD    ",
      "    D    ",
      "    D     ",
      "    D    ",
      "    D    "
    ],
    keys: {
      A: "dustveyn:endless_fabulous.infinity_ingot",
      B: "dustveyn:endless_fabulous.crystal_matrix_block",
      C: "dustveyn:endless_fabulous.infinity_catalyst",
      D: "dustveyn:endless_fabulous.neutronium_ingot"
    },
    result: {
      item: "dustveyn:endless_fabulous.forest_destroyer",
      amount: 1
    }
  },
  {
    pattern: [
      "   EEE   ",
      " EEPPPEE ",
      " EPPPPPE ",
      "EPPPNPPPE",
      "EPPNSNPPE",
      "EPPPNPPPE",
      " EPPPPPE ",
      " EEPPPEE ",
      "   EEE   "
    ],
    keys: {
      E: "minecraft:end_stone",
      P: "minecraft:ender_pearl",
      N: "dustveyn_ef:neutronium_ingot",
      S: "minecraft:nether_star"
    },
    result: {
      item: "dustveyn_ef:endest_pearl",
      amount: 1
    }
  },
  {
    pattern: [
      "ABCDEFGHI",
      "JKLMN    ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         "
    ],
    keys: {
      A: "dustveyn_ef:pile_of_neutron",
      B: "dustveyn_ef:neutronium_nugget",
      C: "dustveyn_ef:neutronium_ingot",
      D: "dustveyn_ef:endest_pearl",
      E: "dustveyn_ef:disc_fragment",
      F: "dustveyn_ef:amethyst_crystal",
      G: "dustveyn_ef:copper_crystal",
      H: "dustveyn_ef:diamond_crystal",
      I: "dustveyn_ef:emerald_crystal",
      J: "dustveyn_ef:golden_crystal",
      K: "dustveyn_ef:iron_crystal",
      L: "dustveyn_ef:lapis_crystal",
      M: "dustveyn_ef:netherite_crystal",
      N: "dustveyn_ef:redstone_crystal",
    },
    result: {
      item: "dustveyn_ef:infinity_catalyst",
      amount: 1
    }
  },
  {
    pattern: [
      "AAAAAAAAA",
      "ABCCBCCBA",
      "ACBBCBBCA",
      "ABCCBCCBA",
      "AAAAAAAAA",
      "         ",
      "         ",
      "         ",
      "         "
    ],
    keys: {
      A: "dustveyn_ef:neutronium_ingot",
      B: "dustveyn_ef:crystal_matrix_ingot",
      C: "dustveyn_ef:infinity_catalyst"
    },
    result: {
      item: "dustveyn_ef:infinity_ingot",
      amount: 1
    }
  },
  {
    pattern: [
      "  aaaaa  ",
      " addddda ",
      "addddddda",
      "adcccccda",
      "addddddda",
      "aaacdcaaa",
      "   c c   ",
      "         ",
      "         "
    ],
    keys: {
      a: "dustveyn_ef:neutronium_ingot",
      d: "dustveyn_ef:infinity_ingot",
      c: "dustveyn_ef:infinity_catalyst"
    },
    result: {
      item: "dustveyn_ef:infinity_helmet",
      amount: 1
    }
  },
  {
    pattern: [
      "aaa   aaa",
      "adaaaaada",
      "cdddddddc",
      "aaadedaaa",
      "  addda  ",
      "  addda  ",
      "  addda  ",
      "a  aaa  a",
      "a       a"
    ],
    keys: {
      a: "dustveyn_ef:neutronium_ingot",
      d: "dustveyn_ef:infinity_ingot",
      c: "dustveyn_ef:infinity_catalyst",
      e: "dustveyn_ef:crystal_matrix_block"
    },
    result: {
      item: "dustveyn_ef:infinity_chestplate",
      amount: 1
    }
  },
  {
    pattern: [
      "aaaaaaaaa",
      "adddcddda",
      "adaaaaada",
      "ada   ada",
      "aea   aea",
      "aca   aca",
      "ada   ada",
      "ada   ada",
      "aaa   aaa"
    ],
    keys: {
      a: "dustveyn_ef:neutronium_ingot",
      d: "dustveyn_ef:infinity_ingot",
      c: "dustveyn_ef:infinity_catalyst",
      e: "dustveyn_ef:crystal_matrix_block"
    },
    result: {
      item: "dustveyn_ef:infinity_leggings",
      amount: 1
    }
  },
  {
    pattern: [
      " aaa aaa ",
      " ada ada ",
      " ada ada ",
      "aaca acaa",
      "adda adda",
      "aaaa aaaa",
      "         ",
      "         ",
      "         ",
    ],
    keys: {
      a: "dustveyn_ef:neutronium_ingot",
      d: "dustveyn_ef:infinity_ingot",
      c: "dustveyn_ef:infinity_catalyst"
    },
    result: {
      item: "dustveyn_ef:infinity_boots",
      amount: 1
    }
  },
  {
    pattern: [
      " AAABAAA ",
      "AAAACAAAA",
      "AA  D  AA",
      "    D    ",
      "    D    ",
      "    D    ",
      "    D    ",
      "    D    ",
      "    D    ",
    ],
    keys: {
      D: "dustveyn_ef:neutronium_ingot",
      A: "dustveyn_ef:infinity_ingot",
      B: "dustveyn_ef:infinity_catalyst",
      C: "dustveyn_ef:crystal_matrix_block"
    },
    result: {
      item: "dustveyn_ef:reality_shatterer",
      amount: 1
    }
  }
];

export const crystalRec = [
  {
    item: "minecraft:iron_block",
    tag: "ef_nc:minecraft:iron_block",
    max: 150,
    output: "dustveyn_ef:iron_crystal"
  },
  {
    item: "minecraft:copper_block",
    tag: "ef_nc:minecraft:copper_block",
    max: 320,
    output: "dustveyn_ef:copper_crystal"
  },
  {
    item: "minecraft:redstone_block",
    tag: "ef_nc:minecraft:redstone_block",
    max: 2000,
    output: "dustveyn_ef:redstone_crystal"
  },
  {
    item: "minecraft:netherite_block",
    tag: "ef_nc:minecraft:netherite_block",
    max: 100,
    output: "dustveyn_ef:netherite_crystal"
  },
  {
    item: "minecraft:gold_block",
    tag: "ef_nc:minecraft:gold_block",
    max: 800,
    output: "dustveyn_ef:golden_crystal"
  },
  {
    item: "minecraft:amethyst_block",
    tag: "ef_nc:minecraft:amethyst_block",
    max: 200,
    output: "dustveyn_ef:amethyst_crystal"
  },
  {
    item: "minecraft:emerald_block",
    tag: "ef_nc:minecraft:emerald_block",
    max: 600,
    output: "dustveyn_ef:emerald_crystal"
  },
  {
    item: "minecraft:diamond_block",
    tag: "ef_nc:minecraft:diamond_block",
    max: 430,
    output: "dustveyn_ef:diamond_crystal"
  },
  {
    item: "minecraft:lapis_block",
    tag: "ef_nc:minecraft:lapis_block",
    max: 3000,
    output: "dustveyn_ef:lapis_crystal"
  }
]