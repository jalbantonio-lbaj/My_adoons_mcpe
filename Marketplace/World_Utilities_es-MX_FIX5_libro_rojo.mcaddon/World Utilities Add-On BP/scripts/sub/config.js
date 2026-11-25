// config.js
import { world, system, Player, GameMode } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { failed } from './messenger';

/**
 * Enum of config keys (kept for external imports)
 */
const Configs = {
  AmethystBreaker: "amethyst_breaker",
  ChunkBorders: "chunk_borders",
  BridgeBuilder: "bridge_builder",
  BridgeBuilderWater: "bridge_builder_water",
  BridgeBuilderLava: "bridge_builder_lava",
  BridgeBuilderDecaySeconds: "bridge_builder_decay_seconds",
  DeathWaypoint: "death_waypoint",
  Disenchanter: "disenchanter",
  Endframebreaker: "end_frame_breaker",
  QuarryPickaxe: "quarry_pickaxe",
  ExcavatorShovel: "excavator_shovel",
  DeepDiggerShovel: "deep_digger_shovel",
  ExperienceExtractor: "experience_extractor",
  ExplosivePickaxe: "explosive_pickaxe",
  FastPlace: "fast_place",
  GrabBag: "grab_bag",
  HarvesterHoe: "harvester_hoe",
  Jetpack: "jetpack",
  JetpackSpeed: "jetpack_speed",
  Lock: "lock",
  Magnet: "magnet",
  MinersEssentials: "miners_essentials",
  MinersLatern: "miners_lantern",
  MultiblockPickaxe: "multiblock_pickaxe",
  OmniTool: "omni_tool",
  OceanRider: "ocean_rider",
  OceanRiderSpeed: "ocean_rider_speed",
  PlayerVaults: "player_vaults",
  PortalPad: "portal_pad",
  SafariNet: "safari_net",
  StashSnatcher: "stash_snatcher",
  ScubaTank: "scuba_tank",
  SpawnerWrench: "spawner_wrench",
  SuctionHopper: "suction_hopper",
  TanningRack: "tanning_rack",
  TreeCapitator: "tree_capitator",
  VeinMiner: "vein_miner",
  VoidChest: "void_chest",
  WateringCan: "watering_can",

  RemoveAllChunkMinions: "remove_all_chunk_minions",
  MaxHomes: "max_homes",
  HomeTeleportTime: "home_teleport_time",
  MaxWarps: "max_warps",
  WarpTeleportTime: "warp_teleport_time",
  CanAllPlayersModifyWarps: "can_all_players_modify_warps",
  MaxChunkMinions: "max_chunk_minions",
  MagnetRange: "magnet_range",

  Durability: "durability",
  SpawnerWrenchDurability: "spawner_wrench_durability",
  AmethystBreakerDurability: "amethyst_breaker_durability",
  EndFrameBreakerDurability: "end_frame_breaker_durability",
  QuarryPickaxeDurability: "quarry_pickaxe_durability",
  ExcavatorShovelDurability: "excavator_shovel_durability",
  DeepDiggerShovelDurability: "deep_digger_shovel_durability",
  ExplosivePickaxeDurability: "explosive_pickaxe_durability",
  HarvesterHoeDurability: "harvester_hoe_durability",
  MultiblockPickaxeDurability: "multiblock_pickaxe_durability",
  OmniToolDurability: "omni_tool_durability",
  SafariNetDurability: "safari_net_durability",
  StashSnatcherDurability: "stash_snatcher_durability",
  WateringCanDurability: "watering_can_durability",

  VeinminerGravel: "vein_miner_gravel",
  VeinMinerBlockDurability: "vein_miner_block_durability",
  CapitatorLeafBreak: "tree_capitator_leaves",
  TreeCapitatorBlockDurability: "tree_capitator_block_durability",
  DeathWaypointAccessibleToAll: "death_waypoint_accessible_to_all",
  MagnetEffectsXp: "magnet_effects_xp",
  ChooseSpawner: "choose_spawner",
  NeedItemInInventory: "need_item_in_inventory",
};

/**
 * Config metadata
 * - value (boolean|number)
 * - volatile (boolean): do not persist to DP when true
 * - min/max (for sliders)
 * - hintKey (string, optional): translation key for tooltip under label
 *   You can also use `hint: "plain text"` if you don't want to localize.
 */
const configs = {
  // feature toggles
  amethyst_breaker: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.amethyst_breaker" },
  choose_spawner: { value: false, volatile: false, hintKey: "gf_wu:configuration_hint.choose_spawner" },
  chunk_borders: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.chunk_borders" },
  bridge_builder: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.bridge_builder" },
  bridge_builder_water: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.bridge_builder_water" },
  bridge_builder_lava: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.bridge_builder_lava" },
  bridge_builder_decay_seconds: { value: 5, volatile: false, min: 3, max: 10, hintKey: "gf_wu:configuration_hint.bridge_builder_decay_seconds" },
  death_waypoint: { value: false, volatile: false, hintKey: "gf_wu:configuration_hint.death_waypoint" },
  disenchanter: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.disenchanter" },
  end_frame_breaker: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.end_frame_breaker" },
  quarry_pickaxe: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.quarry_pickaxe" },
  excavator_shovel: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.excavator_shovel" },
  deep_digger_shovel: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.deep_digger_shovel" },
  experience_extractor: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.experience_extractor" },
  explosive_pickaxe: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.explosive_pickaxe" },
  fast_place: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.fast_place" },
  grab_bag: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.grab_bag" },
  harvester_hoe: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.harvester_hoe" },
  jetpack: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.jetpack" },
  lock: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.lock" },
  magnet: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.magnet" },
  miners_essentials: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.miners_essentials" },
  miners_lantern: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.miners_lantern" },
  multiblock_pickaxe: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.multiblock_pickaxe" },
  omni_tool: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.omni_tool" },
  ocean_rider: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.ocean_rider" },
  ocean_rider_speed: { value: 2, volatile: false, min: 1, max: 3, hintKey: "gf_wu:configuration_hint.ocean_rider_speed" },
  player_vaults: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.player_vaults" },
  portal_pad: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.portal_pad" },
  safari_net: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.safari_net" },
  stash_snatcher: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.stash_snatcher" },
  scuba_tank: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.scuba_tank" },
  spawner_wrench: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.spawner_wrench" },
  suction_hopper: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.suction_hopper" },
  tanning_rack: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.tanning_rack" },
  tree_capitator: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.tree_capitator" },
  vein_miner: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.vein_miner" },
  void_chest: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.void_chest" },
  watering_can: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.watering_can" },

  // numeric / misc
  max_homes: { value: 3, volatile: false, min: 0, max: 10, hintKey: "gf_wu:configuration_hint.max_homes" },
  home_teleport_time: { value: 0, volatile: false, min: 0, max: 15, hintKey: "gf_wu:configuration_hint.home_teleport_time" },
  max_warps: { value: 5, volatile: false, min: 0, max: 10, hintKey: "gf_wu:configuration_hint.max_warps" },
  warp_teleport_time: { value: 0, volatile: false, min: 0, max: 15, hintKey: "gf_wu:configuration_hint.warp_teleport_time" },
  can_all_players_modify_warps: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.can_all_players_modify_warps" },
  max_chunk_minions: { value: 3, volatile: false, min: 0, max: 10, hintKey: "gf_wu:configuration_hint.max_chunk_minions" },
  remove_all_chunk_minions: { value: false, volatile: true, hintKey: "gf_wu:configuration_hint.remove_all_chunk_minions" },
  magnet_range: { value: 7, volatile: false, min: 1, max: 10, hintKey: "gf_wu:configuration_hint.magnet_range" },
  jetpack_speed: { value: 2, volatile: false, min: 1, max: 3, hintKey: "gf_wu:configuration_hint.jetpack_speed" },

  // global toggles
  durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.durability" },
  spawner_wrench_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.spawner_wrench_durability" },
  amethyst_breaker_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.amethyst_breaker_durability" },
  end_frame_breaker_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.end_frame_breaker_durability" },
  quarry_pickaxe_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.quarry_pickaxe_durability" },
  excavator_shovel_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.excavator_shovel_durability" },
  deep_digger_shovel_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.deep_digger_shovel_durability" },
  explosive_pickaxe_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.explosive_pickaxe_durability" },
  harvester_hoe_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.harvester_hoe_durability" },
  multiblock_pickaxe_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.multiblock_pickaxe_durability" },
  omni_tool_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.omni_tool_durability" },
  safari_net_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.safari_net_durability" },
  stash_snatcher_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.stash_snatcher_durability" },
  watering_can_durability: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.watering_can_durability" },

  vein_miner_gravel: { value: false, volatile: false, hintKey: "gf_wu:configuration_hint.vein_miner_gravel" },
  vein_miner_block_durability: { value: false, volatile: false, hintKey: "gf_wu:configuration_hint.vein_miner_block_durability" },
  tree_capitator_leaves: { value: false, volatile: false, hintKey: "gf_wu:configuration_hint.tree_capitator_leaves" },
  tree_capitator_block_durability: { value: false, volatile: false, hintKey: "gf_wu:configuration_hint.tree_capitator_block_durability" },
  death_waypoint_accessible_to_all: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.death_waypoint_accessible_to_all" },
  magnet_effects_xp: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.magnet_effects_xp" },
  need_item_in_inventory: { value: true, volatile: false, hintKey: "gf_wu:configuration_hint.need_item_in_inventory" },
};

/* ------------ Sections (like guide book) ------------ */
const CONTROLLER_SECTIONS = [
  { id: 'global', title: { translate: 'gf_wu:configuration.global' }, texture: 'textures/gamefam/world_utils/items/world_settings' },

  { id: 'vein_miner', title: { translate: 'gf_wu:vein_miner.button' }, texture: 'textures/gamefam/world_utils/items/vein_miner' },
  { id: 'tree_capitator', title: { translate: 'gf_wu:tree_capitator.button' }, texture: 'textures/gamefam/world_utils/items/tree_capitator' },
  { id: 'miners_essentials', title: { translate: 'gf_wu:miners_essentials.button' }, texture: 'textures/gamefam/world_utils/items/miners_essentials' },
  { id: 'chunk_borders', title: { translate: 'gf_wu:chunk_borders.button' }, texture: 'textures/gamefam/world_utils/items/chunk_borders' },
  { id: 'bridge_builder', title: { translate: 'gf_wu:bridge_builder.button' }, texture: 'textures/gamefam/world_utils/items/bridge_builder' },
  { id: 'magnet', title: { translate: 'gf_wu:magnet.button' }, texture: 'textures/gamefam/world_utils/items/magnet.png' },
  { id: 'fast_place', title: { translate: 'gf_wu:fast_place.button' }, texture: 'textures/gamefam/world_utils/items/fast_place' },
  { id: 'explosive_pickaxe', title: { translate: 'gf_wu:explosive_pickaxe.button' }, texture: 'textures/gamefam/world_utils/items/explosive_pickaxe' },
  { id: 'multiblock_pickaxe', title: { translate: 'gf_wu:multiblock_pickaxe.button' }, texture: 'textures/gamefam/world_utils/items/multiblock_pickaxe' },
  { id: 'quarry_pickaxe', title: { translate: 'gf_wu:quarry_pickaxe.button' }, texture: 'textures/gamefam/world_utils/items/quarry_pickaxe' },
  { id: 'end_frame_breaker', title: { translate: 'gf_wu:end_frame_breaker.button' }, texture: 'textures/gamefam/world_utils/items/end_frame_breaker' },
  { id: 'omni_tool', title: { translate: 'gf_wu:omni_tool.button' }, texture: 'textures/gamefam/world_utils/items/omni_tool' },
  { id: 'spawner_tools', title: { translate: 'gf_wu:spawner_wrench.button' }, texture: 'textures/gamefam/world_utils/items/spawner_wrench' },
  { id: 'harvester_hoe', title: { translate: 'gf_wu:harvester_hoe.button' }, texture: 'textures/gamefam/world_utils/items/harvester_hoe' },
  { id: 'excavator_shovel', title: { translate: 'gf_wu:excavator_shovel.button' }, texture: 'textures/gamefam/world_utils/items/excavator_shovel' },
  { id: 'deep_digger_shovel', title: { translate: 'gf_wu:deep_digger_shovel.button' }, texture: 'textures/gamefam/world_utils/items/deep_digger_shovel' },
  { id: 'safari_net', title: { translate: 'gf_wu:safari_net.button' }, texture: 'textures/gamefam/world_utils/items/safari_net' },
  { id: 'stash_snatcher', title: { translate: 'gf_wu:stash_snatcher.button' }, texture: 'textures/gamefam/world_utils/stash_snatcher/stash_snatcher1' },
  { id: 'ocean_rider', title: { translate: 'gf_wu:ocean_rider.button' }, texture: 'textures/gamefam/world_utils/ocean_rider' },
  { id: 'player_vaults', title: { translate: 'gf_wu:player_vaults.button' }, texture: 'textures/gamefam/world_utils/items/vault' },
  { id: 'miners_lantern', title: { translate: 'gf_wu:miners_lantern.button' }, texture: 'textures/gamefam/world_utils/items/miners_lantern' },
  { id: 'death_waypoint', title: { translate: 'gf_wu:death_waypoint.button' }, texture: 'textures/gamefam/world_utils/items/death_waypoint' },
  { id: 'void_chest', title: { translate: 'gf_wu:void_chest.button' }, texture: 'textures/gamefam/world_utils/items/void_chest' },
  { id: 'homes', title: { translate: 'gf_wu:homes.button' }, texture: 'textures/gamefam/world_utils/items/homes' },
  { id: 'lock', title: { translate: 'gf_wu:lock.button' }, texture: 'textures/gamefam/world_utils/items/lock' },
  { id: 'experience_extractor', title: { translate: 'gf_wu:experience_extractor.button' }, texture: 'textures/gamefam/world_utils/items/experience_extractor' },
  { id: 'chunk_minion', title: { translate: 'gf_wu:chunk_minion.button' }, texture: 'textures/gamefam/world_utils/items/chunk_minion' },
  { id: 'disenchanter', title: { translate: 'gf_wu:disenchanter.button' }, texture: 'textures/gamefam/world_utils/items/disenchanter' },
  { id: 'portal_pad', title: { translate: 'gf_wu:portal_pad.button' }, texture: 'textures/gamefam/world_utils/items/portal_pad' },
  { id: 'jetpack', title: { translate: 'gf_wu:jetpack.button' }, texture: 'textures/gamefam/world_utils/items/jetpack' },
  { id: 'grab_bag', title: { translate: 'gf_wu:grab_bag.button' }, texture: 'textures/gamefam/world_utils/items/grab_bag' },
  { id: 'scuba_tank', title: { translate: 'gf_wu:scuba_tank.button' }, texture: 'textures/gamefam/world_utils/items/scuba_tank' },
  { id: 'warps', title: { translate: 'gf_wu:warps.button' }, texture: 'textures/gamefam/world_utils/items/warp' },
  { id: 'amethsyt_breaker', title: { translate: 'gf_wu:amethyst_breaker.button' }, texture: 'textures/gamefam/world_utils/items/amethyst_breaker' },
  { id: 'suction_hopper', title: { translate: 'gf_wu:suction_hopper.button' }, texture: 'textures/gamefam/world_utils/items/suction_hopper' },
  { id: 'tanning_rack', title: { translate: 'gf_wu:tanning_rack.button' }, texture: 'textures/gamefam/world_utils/items/tanning_rack' },
  { id: 'watering_can', title: { translate: 'gf_wu:watering_can.button' }, texture: 'textures/gamefam/world_utils/items/watering_can' },
];

const SECTION_FIELDS = {
  global: [
    'durability',
    'need_item_in_inventory',
  ],

  vein_miner: ['vein_miner', 'vein_miner_gravel', 'vein_miner_block_durability'],
  tree_capitator: ['tree_capitator', 'tree_capitator_leaves', 'tree_capitator_block_durability'],
  miners_essentials: ['miners_essentials'],
  chunk_borders: ['chunk_borders'],
  bridge_builder: ['bridge_builder', 'bridge_builder_water', 'bridge_builder_lava', 'bridge_builder_decay_seconds'],
  magnet: ['magnet', 'magnet_range', 'magnet_effects_xp'],
  fast_place: ['fast_place'],

  explosive_pickaxe: ['explosive_pickaxe', 'explosive_pickaxe_durability'],
  multiblock_pickaxe: ['multiblock_pickaxe', 'multiblock_pickaxe_durability'],
  quarry_pickaxe: ['quarry_pickaxe', 'quarry_pickaxe_durability'],
  end_frame_breaker: ['end_frame_breaker', 'end_frame_breaker_durability'],
  omni_tool: ['omni_tool', 'omni_tool_durability'],
  spawner_tools: ['spawner_wrench', 'spawner_wrench_durability', 'choose_spawner'],
  harvester_hoe: ['harvester_hoe', 'harvester_hoe_durability'],
  excavator_shovel: ['excavator_shovel', 'excavator_shovel_durability'],
  deep_digger_shovel: ['deep_digger_shovel', 'deep_digger_shovel_durability'],
  safari_net: ['safari_net', 'safari_net_durability'],
  stash_snatcher: ['stash_snatcher', 'stash_snatcher_durability'],
  ocean_rider: ['ocean_rider', 'ocean_rider_speed'],
  player_vaults: ['player_vaults'],

  miners_lantern: ['miners_lantern'],
  death_waypoint: ['death_waypoint', 'death_waypoint_accessible_to_all'],
  void_chest: ['void_chest'],
  homes: ['max_homes', 'home_teleport_time'],
  lock: ['lock'],
  experience_extractor: ['experience_extractor'],
  chunk_minion: ['max_chunk_minions', 'remove_all_chunk_minions'],
  disenchanter: ['disenchanter'],
  portal_pad: ['portal_pad'],
  jetpack: ['jetpack', 'jetpack_speed'],
  grab_bag: ['grab_bag'],
  scuba_tank: ['scuba_tank'],
  warps: ['max_warps', 'warp_teleport_time', 'can_all_players_modify_warps'],
  amethsyt_breaker: ['amethyst_breaker', 'amethyst_breaker_durability'],
  suction_hopper: ['suction_hopper'],
  tanning_rack: ['tanning_rack'],
  watering_can: ['watering_can', 'watering_can_durability'],
};

const DURABILITY_KEYS = [
  'spawner_wrench_durability',
  'amethyst_breaker_durability',
  'end_frame_breaker_durability',
  'quarry_pickaxe_durability',
  'excavator_shovel_durability',
  'deep_digger_shovel_durability',
  'explosive_pickaxe_durability',
  'harvester_hoe_durability',
  'multiblock_pickaxe_durability',
  'omni_tool_durability',
  'safari_net_durability',
  'stash_snatcher_durability',
  'watering_can_durability'
];

function tooltipFor(key) {
  const meta = configs[key] || {};
  if (meta.hint) return meta.hint;
  if (meta.hintKey) return { translate: meta.hintKey };
  return undefined;
}

async function showControllerSection(player, sectionId) {
  const keys = SECTION_FIELDS[sectionId] || [];
  const header =
    sectionId === 'global'
      ? ({ translate: 'gf_wu:configuration.global' })
      : (CONTROLLER_SECTIONS.find(s => s.id === sectionId)?.title ?? 'Controller');

  const form = new ModalFormData().title(header);

  // Build the form with tooltips
  keys.forEach(key => {
    const cfg = configs[key];
    if (!cfg) return;

    const label = { translate: `gf_wu:configuration.${key}` };
    const tip = tooltipFor(key);

    if (typeof cfg.value === 'boolean') {
      form.toggle(label, { defaultValue: !!cfg.value, tooltip: tip });
    } else if (typeof cfg.value === 'number') {
      form.slider(label, cfg.min, cfg.max, { defaultValue: cfg.value, tooltip: tip });
    }
  });

  player.playSound('item.book.page_turn');
  const res = await form.show(player);
  if (res.canceled) { showCreativeMenu(player); return; }

  // --- NEW: capture previous durability value (if present in this section) ---
  const durabilityIdx = keys.indexOf('durability');
  const prevDurability = durabilityIdx >= 0 ? configs['durability']?.value : undefined;

  // --- NEW: capture previous NeedItemInInventory value ---
  const needItemIdx = keys.indexOf('need_item_in_inventory');
  const prevNeedItem = needItemIdx >= 0 ? configs['need_item_in_inventory']?.value : undefined;

  // Apply updated values
  keys.forEach((key, i) => {
    const cfg = configs[key];
    if (!cfg) return;
    const newVal = res.formValues[i];
    if (cfg.value !== newVal) {
      cfg.value = newVal;
      if (!cfg.volatile) world.setDynamicProperty(`gf_wu:${key}`, newVal);
    }
  });

  if (durabilityIdx >= 0) {
    const newDurability = configs['durability']?.value;
    if (newDurability !== prevDurability) {
      DURABILITY_KEYS.forEach(k => {
        if (!configs[k]) return;
        configs[k].value = !!newDurability;
        if (!configs[k].volatile) {
          world.setDynamicProperty(`gf_wu:${k}`, !!newDurability);
        }
      });

      player.playSound('random.orb');
    }
  }

  if (needItemIdx >= 0) {
    const newNeedItem = configs['need_item_in_inventory']?.value;
    if (newNeedItem !== prevNeedItem) {
      const currentLevel = world.getDynamicProperty('gf_wu:config_level') || 0;
      world.setDynamicProperty('gf_wu:config_level', currentLevel + 1);

      const allPlayers = world.getAllPlayers();
      for (const p of allPlayers) {
        p.setDynamicProperty('gf_wu:persistent_effects', undefined);
        p.setDynamicProperty('gf_wu:state:vein_miner', undefined);
        p.setDynamicProperty('gf_wu:state:chunk_borders', undefined);
        p.setDynamicProperty('gf_wu:state:bridge_builder', undefined);
        p.setDynamicProperty('gf_wu:state:fast_place', undefined);
        p.setDynamicProperty('gf_wu:state:magnet', undefined);
        p.setDynamicProperty('gf_wu:state:miners_essentials', undefined);
        p.setDynamicProperty('gf_wu:state:treecapitator', undefined);
      }

      player.playSound('random.orb');
    }
  }

  // One-shot action: remove all chunk minions (unchanged)
  if (keys.includes('remove_all_chunk_minions')) {
    const idx = keys.indexOf('remove_all_chunk_minions');
    if (res.formValues[idx] === true) {
      ['overworld', 'nether', 'the_end']
        .map(id => world.getDimension(id))
        .flatMap(d => d.getEntities({ type: 'gf_wu:chunk_minion' }))
        .forEach(e => e.triggerEvent('poof'));

      const areas = world.getDynamicProperty('gf_wu:ticking_areas');
      if (areas) {
        areas.split(',').forEach(num => {
          world.getDimension('overworld').runCommand(`tickingarea remove gf_wu:chunk_${num}`);
        });
      }
      world.setDynamicProperty('gf_wu:ticking_areas', undefined);
      configs['remove_all_chunk_minions'].value = false;
    }
  }

  showCreativeMenu(player);
}

/**
 * Controller home (like guide book).
 */
function showCreativeMenu(player) {
  if (!((player.playerPermissionLevel >= 2 || player.getGameMode() === GameMode.Creative))) {
    failed({ translate: 'gf_wu:configuration.requires_op' }, player);
    return;
  }

  const form = new ActionFormData().title({ translate: 'gf_wu:configuration.name' });
  CONTROLLER_SECTIONS.forEach(sec => {
    form.button(sec.title, sec.texture);
  });
  form.button({ translate: 'gf_wu:controller_exit' });

  player.playSound('item.book.page_turn');
  form.show(player).then(res => {
    if (res.canceled) return;
    if (res.selection === CONTROLLER_SECTIONS.length) return;

    const chosen = CONTROLLER_SECTIONS[res.selection];
    if (chosen) showControllerSection(player, chosen.id);
  });
}

/**
 * getConfig accessor (unchanged signature)
 */
function getConfig(configId) {
  return (configs[configId] || {}).value;
}

/* ------------ persistence ------------ */
system.beforeEvents.startup.subscribe(() => {
  system.run(() => {
    Object.entries(configs).forEach(([key, meta]) => {
      if (meta.volatile) return;
      const dpKey = `gf_wu:${key}`;
      const stored = world.getDynamicProperty(dpKey);
      if (stored === undefined) world.setDynamicProperty(dpKey, meta.value);
      else meta.value = stored;
    });

    if (!world.getDynamicProperty('gf_wu:safariNetCount')) world.setDynamicProperty('gf_wu:safariNetCount', 0);
    if (!world.getDynamicProperty('gf_wu:stashSnatcherCount')) world.setDynamicProperty('gf_wu:stashSnatcherCount', 1);
    if (!world.getDynamicProperty('grabBagCount')) world.setDynamicProperty('grabBagCount', 0);
    if (!world.getDynamicProperty('gf_wu:chunkMinionCount')) world.setDynamicProperty('gf_wu:chunkMinionCount', 0);

    if (!world.getDynamicProperty('gf_wu:config_level')) world.setDynamicProperty('gf_wu:config_level', 0);
  });
});

// Check and update durability settings based on global toggle and add-on version
system.beforeEvents.startup.subscribe(() => {
  const currentVersion = "1.3.0";
  system.run(() => {
    const worldVersion = world.getDynamicProperty("addon_version");
    if (worldVersion !== currentVersion) {
      world.setDynamicProperty("addon_version", currentVersion);
      const globalDurability = configs.durability.value;

      if (!globalDurability) {
        // Disable durability for all items except specified ones
        configs.spawner_wrench_durability.value = true;
        configs.amethyst_breaker_durability.value = true;
        configs.end_frame_breaker_durability.value = true;
        configs.safari_net_durability.value = true;

        // Disable durability for other items
        Object.keys(configs).forEach(key => {
          if (key.endsWith("_durability") && !["spawner_wrench_durability", "amethyst_breaker_durability", "end_frame_breaker_durability", "safari_net_durability"].includes(key)) {
            configs[key].value = false;
          }
        });
      } else {
        // Enable durability for all items
        Object.keys(configs).forEach(key => {
          if (key.endsWith("_durability")) {
            configs[key].value = true;
          }
        });
      }
    }
  })
});

function getPersistentEffects(player) {
  const effectsData = player.getDynamicProperty('gf_wu:persistent_effects');
  if (effectsData) {
    try {
      return new Set(JSON.parse(effectsData));
    } catch (error) {
      console.warn('Failed to parse persistent effects for player:', error);
      return new Set();
    }
  }
  return new Set();
}

function removePersistentEffect(player, effectType) {
  const currentEffects = getPersistentEffects(player);

  currentEffects.delete(effectType);

  if (currentEffects.size === 0) {
    player.setDynamicProperty('gf_wu:persistent_effects', undefined);
  } else {
    player.setDynamicProperty('gf_wu:persistent_effects', JSON.stringify(Array.from(currentEffects)));
  }
}

/**
 * Sync a player's persistent effects based on their inventory
 * @param {import('@minecraft/server').Player} player 
 */
function syncPlayerPersistentEffects(player) {
  const inventory = player.getComponent('inventory')?.container;
  if (!inventory) return;

  const itemChecks = [
    { effect: "vein_miner", itemId: "gf_wu:vein_miner" },
    { effect: "chunk_borders", itemId: "gf_wu:chunk_borders" },
    { effect: "bridge_builder", itemId: "gf_wu:bridge_builder" },
    { effect: "fast_place", itemId: "gf_wu:fast_place" },
    { effect: "magnet", itemId: "gf_wu:magnet" },
    { effect: "miners_essentials", itemId: "gf_wu:miners_essentials" },
    { effect: "treecapitator", itemId: "gf_wu:treecapitator" }
  ];

  itemChecks.forEach(({ effect, itemId }) => {
    let hasItem = false;

    // Check inventory for the item (both _on and base versions)
    for (let i = 0; i < inventory.size; i++) {
      const item = inventory.getItem(i);
      if (item && (item.typeId === itemId || item.typeId === `${itemId}_on`)) {
        hasItem = true;
        break;
      }
    }

    // Check main hand
    const equippable = player.getComponent('equippable');
    const mainHand = equippable?.getEquipment('Mainhand');
    if (mainHand && (mainHand.typeId === itemId || mainHand.typeId === `${itemId}_on`)) {
      hasItem = true;
    }

    // Remove persistent effect if item not found
    if (!hasItem) {
      removePersistentEffect(player, effect);
    }
  });

  // Update player's config_level to match world's config_level
  const worldConfigLevel = world.getDynamicProperty('gf_wu:config_level') || 0;
  player.setDynamicProperty('gf_wu:config_level', worldConfigLevel);
}

system.runInterval(() => {
  const players = world.getAllPlayers();
  const worldConfigLevel = world.getDynamicProperty('gf_wu:config_level') || 0;

  for (const player of players) {
    // Check if player's config_level is out of sync with world's config_level
    const playerConfigLevel = player.getDynamicProperty('gf_wu:config_level');
    if (playerConfigLevel !== worldConfigLevel) {
      // Player needs to be synced
      syncPlayerPersistentEffects(player);
    }

    // Remove persistent effects if the feature config is disabled
    if (!getConfig(Configs.VeinMiner)) removePersistentEffect(player, "vein_miner");
    if (!getConfig(Configs.ChunkBorders)) removePersistentEffect(player, "chunk_borders");
    if (!getConfig(Configs.BridgeBuilder)) removePersistentEffect(player, "bridge_builder");
    if (!getConfig(Configs.FastPlace)) removePersistentEffect(player, "fast_place");
    if (!getConfig(Configs.Magnet)) removePersistentEffect(player, "magnet");
    if (!getConfig(Configs.MinersEssentials)) removePersistentEffect(player, "miners_essentials");
    if (!getConfig(Configs.TreeCapitator)) removePersistentEffect(player, "treecapitator");

    // Remove persistent effects if NeedItemInInventory is enabled and player doesn't have the item
    if (getConfig(Configs.NeedItemInInventory)) {
      syncPlayerPersistentEffects(player);
    }
  }
}, 1)

export { showCreativeMenu, getConfig, Configs };
