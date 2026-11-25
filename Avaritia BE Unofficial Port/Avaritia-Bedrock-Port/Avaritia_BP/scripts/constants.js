import { world, system, DimensionTypes } from '@minecraft/server'

export const TICKS_PER_PILE = 7111;
export const MAX_PILES = 64;
export const COLLECTOR_TAG = "avaritia:collector_holder";
export const COMPRESSOR_TAG = "avaritia:compressor_holder";
export const EXTREME_TAG = "avaritia:extreme_holder";
export const EXTREME_HOLDER = "avaritia:extreme_crafting_entity";
export const EXTREME_OUTPUT = 81;
export const DIMS = ["overworld", "nether", "the_end"];

export const TICK_GROUP_PROPERTY_ID = "avaritia:tick_group";
export const OPEN_UI_PLAYERS_PROPERTY_ID = "avaritia:open_ui_players";
export const GROUP_COUNT = 5;
export const DEFAULT_SCHEDULER_PROFILE = "fast";
export const SCHEDULER_PROFILES = {
    fast: {
        label: "Fast",
        closedInterval: 20,
    },
    normal: {
        label: "Normal",
        closedInterval: 40,
    },
    low: {
        label: "Low",
        closedInterval: 80,
    },
};

export const MELEE_MESSAGES = [
    (victim, killer) => `§r${victim} was obliterated by ${killer}.§r`,
    (victim, killer) => `§r${killer} obliterated ${victim}.§r`,
    (victim, killer) => `§r${victim} was shred to ribbons by ${killer}.§r`,
    (victim, killer) => `§r${killer} shred ${victim} to ribbons.§r`,
    (victim, killer) => `§r${victim} was annhilated by ${killer}.§r`,
    (victim, killer) => `§r${killer} annhilated ${victim}.§r`,
    (victim, killer) => `§r${victim} was excised from existence by ${killer}.§r`,
    (victim, killer) => `§r${killer} excised ${victim} from existence.§r`,
    (victim, killer) => `§r${victim} was overkilled by ${killer}.§r`,
    (victim, killer) => `§r${killer} overkilled ${victim}.§r`,
]
export const RANGED_MESSAGES = [
    (victim, killer) => `§r${victim} was sent to hell by ${killer}.§r`,
    (victim, killer) => `§r${killer} sent ${victim} to hell.§r`,
    (victim, killer) => `§r${victim} was sent to judgement by ${killer}.§r`,
    (victim, killer) => `§r${killer} sent ${victim} to judgement.§r`,
    (victim, killer) => `§r${victim} was judged by The Heavens due to ${killer}.§r`,
    (victim, killer) => `§rThe Heavens judged ${victim} due to ${killer}.§r`,
    (victim, killer) => `§rThe Heavens sent ${victim} to Hell due to ${killer}.§r`,
]
export const UNDESTRUCTABLE_BLOCKS = [
    "minecraft:bedrock",
    "minecraft:barrier",
    "minecraft:structure_block",
    "minecraft:jigsaw",
    "minecraft:end_portal_frame",
    "minecraft:allow",
    "minecraft:deny",
    "minecraft:border_block",
    /^minecraft:.*command_block$/
];