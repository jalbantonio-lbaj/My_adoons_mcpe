import * as MC from "@minecraft/server";
import * as MCUI from "@minecraft/server-ui";

// NOTE: like armorEffects.js - "world.afterEvents.worldInitialize" no longer exists
// in the current API, and setDynamicProperty()/getDynamicProperty() can be used directly,
// with no need to register via propertyRegistry first. The old subscribe code threw a TypeError
// as soon as this file was imported -> CRASHING the entire script pack.

function getPlayerData(player) {
  const data = player.getDynamicProperty("avaritia:playerData");
  return data ? JSON.parse(data) : {};
}

function setPlayerData(player, data) {
  player.setDynamicProperty("avaritia:playerData", JSON.stringify(data));
}

function colorProgress(getMaterial, maxProgress) {
  const percentage = getMaterial / maxProgress;
  if (percentage > 0.66) return '§a';
  if (percentage > 0.33) return '§e';
  return '§c';
}

function initializePlayerSingularities(player) {
  const data = getPlayerData(player);
  if (!data.singularities) {
    data.singularities = {};
    for (const singularityId in singularities) {
      data.singularities[singularityId] = 0;
    }
    setPlayerData(player, data);
  }
  return data;
}

const singularities = {
  "avaritia:coal_singularity": { "material": "minecraft:coal_block", "max_value": 10000 },
  "avaritia:diamond_singularity": { "material": "minecraft:diamond_block", "max_value": 10000 },
  "avaritia:emerald_singularity": { "material": "minecraft:emerald_block", "max_value": 10000 },
  "avaritia:quartz_singularity": { "material": "minecraft:quartz_block", "max_value": 10000 },
  "avaritia:lapis_singularity": { "material": "minecraft:lapis_block", "max_value": 10000 },
  "avaritia:slime_singularity": { "material": "minecraft:slime", "max_value": 10000 },
  "avaritia:honey_singularity": { "material": "minecraft:honey_block", "max_value": 10000 },
  "avaritia:redstone_singularity": { "material": "minecraft:redstone_block", "max_value": 10000 },
  "avaritia:gold_singularity": { "material": "minecraft:gold_block", "max_value": 10000 },
  "avaritia:iron_singularity": { "material": "minecraft:iron_block", "max_value": 10000 },
  "avaritia:netherite_singularity": { "material": "minecraft:netherite_block", "max_value": 10000 },
  "avaritia:obsidian_singularity": { "material": "minecraft:obsidian", "max_value": 10000 },
  "avaritia:soul_sand_singularity": { "material": "minecraft:soul_sand", "max_value": 10000 },
  "avaritia:copper_singularity": { "material": "minecraft:copper_block", "max_value": 10000 },
  "avaritia:amethyst_singularity": { "material": "minecraft:amethyst_block", "max_value": 10000 },
  "avaritia:netherrack_singularity": { "material": "minecraft:netherrack", "max_value": 10000 },
  "avaritia:glowstone_singularity": { "material": "minecraft:glowstone", "max_value": 10000 },
  "avaritia:prismarine_singularity": { "material": "minecraft:prismarine", "max_value": 10000 },
  "avaritia:end_stone_singularity": { "material": "minecraft:end_stone", "max_value": 10000 },
  "avaritia:magma_singularity": { "material": "minecraft:magma", "max_value": 10000 },
  "avaritia:bone_singularity": { "material": "minecraft:bone_block", "max_value": 10000 },
  "avaritia:ice_singularity": { "material": "minecraft:packed_ice", "max_value": 10000 },
  "avaritia:experience_singularity": { "xp_required": 10000 }
};

function depositXP(player) {
  const singularityId = "avaritia:experience_singularity";
  const singularity = singularities[singularityId];
  const data = initializePlayerSingularities(player);
  const currentProgress = data.singularities[singularityId] || 0;
  const playerXP = player.level;
  const remainingProgress = singularity.xp_required - currentProgress;
  const maxSelectable = Math.min(playerXP, remainingProgress);
  if (playerXP == 0) {
    player.runCommand(`tellraw @s {"rawtext":[{"translate":"§c%message.avaritia.missing_ingredients (Xp levels)"}]}`);
    player.playSound("note.bass");
    return;
  };
  let sliderForm = new MCUI.ModalFormData();
  sliderForm.title(`§l%${singularityId.split(":")[1]}.name`);
  sliderForm.slider(
    `%container.compressor.description\n§eMax: ${maxSelectable}\nValue`,
    1, maxSelectable, { valueStep: 1, defaultValue: maxSelectable }
  );
  sliderForm.show(player).then((response) => {
    if (!response.canceled) {
      const depositAmount = response.formValues[0];
      if (playerXP >= depositAmount) {
        data.singularities[singularityId] = (data.singularities[singularityId] || 0) + depositAmount;
        player.runCommand(`xp -${depositAmount}l @s`);
        if (data.singularities[singularityId] >= singularity.xp_required) {
          player.runCommand(`give @s ${singularityId}`);
          data.singularities[singularityId] = 0;
          player.playSound("random.levelup");
        } else player.playSound("random.orb");
        setPlayerData(player, data);
        neutronCompressor(player);
      } else player.playSound("note.bass");
    } else neutronCompressor(player);
  });
}

// Menu do compressor de singularidade
export function neutronCompressor(player) {
  initializePlayerSingularities(player);
  const data = getPlayerData(player);
  let form = new MCUI.ActionFormData();
  form.title("§l%container.extreme_compression");
  form.body("container.compressor.description");
  for (const singularityId in singularities) {
    const singularity = singularities[singularityId];
    const currentProgress = data.singularities[singularityId] || 0;
    const maxProgress = singularity.max_value || singularity.xp_required;
    const materialName = singularity.material ? `%tile.${singularity.material.split(":")[1]}.name` : "Xp levels";
    const color = colorProgress(currentProgress, maxProgress);
    const getMaterial = singularityId == "avaritia:experience_singularity" ? player.level : getItemCountInInventory(player, singularity.material);
    form.button(`§l${getMaterial > 0 ? '§2' : '§o'}%${singularityId.split(":")[1]}.name§r\n${materialName}: ${color}${currentProgress}§r/${maxProgress}`);
  }

  form.show(player).then((response) => {
    if (response.selection != undefined) {
      const selectedSingularity = Object.keys(singularities)[response.selection];
      if (response.canceled) return block.setPermutation(block.permutation.withState("avaritia:open", false));
      if (selectedSingularity == "avaritia:experience_singularity") {
        depositXP(player);
      } else {
        depositMaterial(player, selectedSingularity);
      }
    }
  });
}

function depositMaterial(player, singularityId) {
  const singularity = singularities[singularityId];
  const data = initializePlayerSingularities(player);
  const currentProgress = data.singularities[singularityId] || 0;
  const playerMaterialCount = getItemCountInInventory(player, singularity.material);
  const remainingProgress = singularity.max_value - currentProgress;
  const maxSelectable = Math.min(playerMaterialCount, remainingProgress);
  if (playerMaterialCount == 0) {
    player.runCommand(`tellraw @s {"rawtext":[{"translate":"§c%message.avaritia.missing_ingredients (%tile.${singularity.material.split(':')[1]}.name)"}]}`);
    player.playSound("note.bass");
    return;
  };
  let sliderForm = new MCUI.ModalFormData();
  sliderForm.title(`§l%${singularityId.split(":")[1]}.name`);
  sliderForm.slider(
    `%container.compressor.description\n§eMax: ${maxSelectable}\nValue`,
    1, maxSelectable, { valueStep: 1, defaultValue: maxSelectable }
  );
  sliderForm.show(player).then((response) => {
    if (!response.canceled) {
      const depositAmount = response.formValues[0];
      if (playerMaterialCount >= depositAmount) {
        data.singularities[singularityId] += depositAmount;
        player.runCommand(`clear @s ${singularity.material} 0 ${depositAmount}`);
        if (data.singularities[singularityId] >= singularity.max_value) {
          player.runCommand(`give @s ${singularityId}`);
          data.singularities[singularityId] = 0;
          player.playSound("random.levelup");
        } else player.playSound("random.orb");
        setPlayerData(player, data);
        neutronCompressor(player);
      } else player.playSound("note.bass");
    } else neutronCompressor(player);
  });
}

function getItemCountInInventory(player, itemId) {
  if (!player || !itemId) return 0;
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return 0;
  let totalCount = 0;
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item && item.typeId == itemId) {
      totalCount += item?.amount;
    }
  }
  return totalCount;
}