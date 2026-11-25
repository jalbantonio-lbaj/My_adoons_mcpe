import { BlockComponentPlayerInteractEvent, system, BlockComponentTickEvent } from "@minecraft/server";
import { Configs, getConfig } from "../sub/config";
import { configFailedMessage } from "../sub/messenger";
import { ModalFormData } from "@minecraft/server-ui";

function faceToOutput(face /* 'Up'|'Down'|'North'|'South'|'East'|'West' */) {
  switch (face) {
    case "Up": return "down";
    case "Down": return "up";
    case "North": return "south";
    case "South": return "north";
    case "West": return "east";
    case "East": return "west";
    default: return "down";
  }
}

function neighborByOutput(block, output /* 'down'|'north'|'south'|'east'|'west' */) {
  switch (output) {
    case "north": return block.north();
    case "south": return block.south();
    case "east": return block.east();
    case "west": return block.west();
    case "down":
    default: return block.below();
  }
}

const CHEST_IDS = new Set([
  "minecraft:chest",
  "minecraft:trapped_chest",
  "minecraft:copper_chest",
  "minecraft:exposed_copper_chest",
  "minecraft:weathered_copper_chest",
  "minecraft:oxidized_copper_chest",
  "minecraft:waxed_copper_chest",
  "minecraft:waxed_exposed_copper_chest",
  "minecraft:waxed_weathered_copper_chest",
  "minecraft:waxed_oxidized_copper_chest"
]);

function getValidChestContainer(neighbor) {
  if (!neighbor?.isValid) return null;
  if (!CHESTIDS_HAS(neighbor.typeId)) return null;
  const inv = neighbor.getComponent("inventory")?.container;
  return inv ?? null;
}

function CHESTIDS_HAS(id) { return CHEST_IDS.has(id); }

function findAndLockToChest(block) {
  const dirs = /** priority order */["down", "north", "south", "east", "west"];
  for (const dir of dirs) {
    const nb = neighborByOutput(block, dir);
    const container = getValidChestContainer(nb);
    if (container) {
      try {
        block.setPermutation(block.permutation.withState("gf_wu:output", dir));
      } catch { /* ignore if state missing */ }
      return { dir, container, block: nb };
    }
  }
  return null;
}

function resolveOutputTarget(block) {
  const current = block.permutation.getState("gf_wu:output") ?? "down";
  const targetBlock = neighborByOutput(block, current);
  const container = getValidChestContainer(targetBlock);

  if (container) {
    return { dir: current, container, block: targetBlock };
  }

  return findAndLockToChest(block);
}

export class SuctionHopperComponent {
  /** @param {BlockComponentPlayerInteractEvent} e */
  async onPlayerInteract(e) {
    const { player, block } = e;
    if (!getConfig(Configs.SuctionHopper)) {
      configFailedMessage(player);
      return;
    }

    const permutation = block.permutation;
    const currentRadius = permutation.getState("gf_wu:radius");

    const form = new ModalFormData()
      .title({ translate: "item.gf_wu:suction_hopper" })
      .slider({ translate: "gf_wu:suction_hopper.radius" }, 1, 16, { defaultValue: currentRadius });

    const respone = await form.show(player);
    if (respone.canceled) return;

    if (respone.formValues[0] != currentRadius) {
      block.setPermutation(permutation.withState("gf_wu:radius", respone.formValues[0]));
    }
  }

  beforeOnPlayerPlace(e /*: BlockComponentPlayerPlaceBeforeEvent */) {
    if (!getConfig(Configs.SuctionHopper)) return;

    const out = faceToOutput(e.face);
    try {
      const safeOut = (out === "up") ? "down" : out;
      e.permutationToPlace = e.permutationToPlace.withState("gf_wu:output", safeOut);

    } catch {
      // If state missing or invalid, leave default permutation
    }
  }

  /** @param {BlockComponentTickEvent} e */
  onTick(e /*: BlockComponentTickEvent */) {
    const { block, dimension } = e;
    if (!getConfig(Configs.SuctionHopper)) return;

    // Redstone guards (same as your original)
    if (block.getRedstonePower()) return;
    try {
      if ([block.above(), block.west(), block.north(), block.south(), block.east()].some(n => n.getRedstonePower())) return;
    } catch { }

    const resolved = resolveOutputTarget(block);
    const hasTarget = !!resolved;
    const targetContainer = resolved?.container ?? null;
    const targetBlock = resolved?.block ?? null;

    const teleportLocation = block.above().bottomCenter();
    const radius = block.permutation.getState("gf_wu:radius");
    const alreadySuctioned = dimension.getEntitiesAtBlockLocation(teleportLocation).map(ent => ent.id);

    dimension.getEntities({
      maxDistance: radius,
      location: block.center(),
      type: "minecraft:item",
    }).forEach(entity => {
      if (!alreadySuctioned.includes(entity.id)) entity.teleport(teleportLocation);

      if (!hasTarget || !targetContainer) return;

      if (targetBlock?.typeId === "minecraft:hopper") return;

      system.runTimeout(() => {
        if (!entity.isValid) return;
        const itemComp = entity.getComponent("item");
        if (!itemComp) return;

        const leftover = targetContainer.addItem(itemComp.itemStack);
        if (typeof leftover !== "undefined") return;
        entity.remove();
      }, 6);
    });
  }
}
