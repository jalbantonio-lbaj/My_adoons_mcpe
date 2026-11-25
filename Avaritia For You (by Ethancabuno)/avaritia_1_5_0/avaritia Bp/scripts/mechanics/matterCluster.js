import * as MC from "@minecraft/server";
import * as MCUI from "@minecraft/server-ui";

const maxValue = 999999999; // FIX: raised the limit from 4096 to nearly unlimited on request.

// NOTE: like armorEffects.js/compressor.js/neutronCollector.js -
// "world.afterEvents.worldInitialize" no longer exists in the current API.

function generateUniqueKey() {
  return Math.random().toString(36).substring(2, 15);
}

function formatItemName(itemId) {
  return itemId
    .split(":")[1]
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getMatterClusterKey(matterCluster) {
  const lore = matterCluster.getLore();
  const keyLine = lore.find((line) => line.startsWith("§r§7Key: "));
  return keyLine ? keyLine.replace("§r§7Key: ", "").trim() : null;
}

function isClusterFull(clusterData) {
  let totalItems = Object.values(clusterData).reduce((a, b) => a + b, 0);
  return totalItems >= maxValue;
}

export function hasSpaceForItem(player, quantity) {
  const inventory = player.getComponent("inventory").container;

  for (let i = 0; i < inventory.size; i++) {
    if (!inventory.getItem(i)) {
      return true;
    }
  }

  let clusterStorage = player.getDynamicProperty("avaritia:matter_clusters");
  clusterStorage = clusterStorage ? JSON.parse(clusterStorage) : {};

  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item && item.typeId == "avaritia:matter_cluster") {
      const key = getMatterClusterKey(item);
      if (!key || !clusterStorage[key]) continue;

      let totalItems = Object.values(clusterStorage[key]).reduce((a, b) => a + b, 0);
      let remainingSpace = maxValue - totalItems;

      if (remainingSpace >= quantity) {
        return true;
      }
    }
  }

  return false;
}

export function addToMatterCluster(player, itemId, quantity) {
  const noBlocks = ["minecraft:air", "minecraft:water", "minecraft:lava"];
  if (noBlocks.includes(itemId)) return;

  const inventory = player.getComponent("inventory").container;
  let clusters = [];

  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item && item.typeId == "avaritia:matter_cluster") {
      clusters.push(item);
    }
  }

  let clusterStorage = player.getDynamicProperty("avaritia:matter_clusters");
  clusterStorage = clusterStorage ? JSON.parse(clusterStorage) : {};

  let targetCluster = null;
  let targetKey = null;

  for (const cluster of clusters) {
    const key = getMatterClusterKey(cluster);
    if (!key) continue;

    if (!clusterStorage[key]) clusterStorage[key] = {};
    if (!isClusterFull(clusterStorage[key])) {
      targetCluster = cluster;
      targetKey = key;
      break;
    }
  }

  if (!targetCluster) {
    targetCluster = new MC.ItemStack("avaritia:matter_cluster", 1);
    targetKey = generateUniqueKey();
    targetCluster.lockMode = "inventory";
    targetCluster.keepOnDeath = true;
    targetCluster.setLore([
      `§r§7Owner: ${player.name}`,
      `§r§7Key: ${targetKey}`,
    ]);
    inventory.addItem(targetCluster);
    clusterStorage[targetKey] = {};
  }

  if (!clusterStorage[targetKey][itemId]) {
    clusterStorage[targetKey][itemId] = 0;
  }

  let totalItems = Object.values(clusterStorage[targetKey]).reduce((a, b) => a + b, 0);
  let remainingSpace = maxValue - totalItems;
  let amountToAdd = Math.min(quantity, remainingSpace);

  if (amountToAdd > 0) {
    clusterStorage[targetKey][itemId] += amountToAdd;
    player.setDynamicProperty("avaritia:matter_clusters", JSON.stringify(clusterStorage));
  }

  if (quantity > amountToAdd) {
    addToMatterCluster(player, itemId, quantity - amountToAdd);
  }
}

function removeEmptyMatterClusters(player) {
  const inventory = player.getComponent("inventory").container;
  let clusterStorage = player.getDynamicProperty("avaritia:matter_clusters");
  clusterStorage = clusterStorage ? JSON.parse(clusterStorage) : {};

  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item && item.typeId == "avaritia:matter_cluster") {
      const key = getMatterClusterKey(item);
      if (!key || !clusterStorage[key]) {
        inventory.setItem(i, null);
      }
    }
  }
}

export function showMatterClusterUI(player, matterCluster) {
  if (!matterCluster || matterCluster.typeId != "avaritia:matter_cluster") return;

  const clusterKey = getMatterClusterKey(matterCluster);
  if (!clusterKey) return;

  let clusterStorage = player.getDynamicProperty("avaritia:matter_clusters");
  clusterStorage = clusterStorage ? JSON.parse(clusterStorage) : {};

  if (!clusterStorage[clusterKey]) return player.sendMessage("§cYou do not have access to this Matter Cluster.");

  let totalItems = Object.values(clusterStorage[clusterKey]).reduce((a, b) => a + b, 0);
  let percent = totalItems / maxValue;
  let isFull = percent == 1 ? "§c" : "§f";

  const items = Object.keys(clusterStorage[clusterKey]);
  if (items.length == 0) return;
  
  let form = new MCUI.ActionFormData();
  form.title("§l%matter_cluster.name");
  form.body(`§fStorage: ${isFull}${totalItems}§f/${maxValue}`);
  form.button("§l%gui.avaritia.extract_all");
  form.button("§l%gui.avaritia.delete");

  items.forEach((itemId) => {
    form.button(`§l${formatItemName(itemId)}\n§r-[ ${clusterStorage[clusterKey][itemId]} ]-`);
  });

  form.show(player).then((response) => {
    if (response.selection != undefined) {
      if (response.selection == 0) {
        for (const itemId of items) {
          const quantity = clusterStorage[clusterKey][itemId];
          player.runCommand(`give @s ${itemId} ${quantity}`);
        }
        delete clusterStorage[clusterKey];
      } else if (response.selection == 1) {
        delete clusterStorage[clusterKey];
      } else {
        const itemId = items[response.selection - 2];
        const quantity = clusterStorage[clusterKey][itemId];
        player.runCommand(`give @s ${itemId} ${quantity}`);
        delete clusterStorage[clusterKey][itemId];
        if (Object.keys(clusterStorage[clusterKey]).length == 0) {
          delete clusterStorage[clusterKey];
        }
      }
      player.setDynamicProperty("avaritia:matter_clusters", JSON.stringify(clusterStorage));
      removeEmptyMatterClusters(player);
    }
  });
}

function isEntityValid(entity) {
  try {
    // isValid is a method in some API versions and a property in others -> support both.
    const v = entity.isValid;
    return typeof v === "function" ? entity.isValid() : v !== false;
  } catch {
    return false;
  }
}

MC.world.afterEvents.entityDie.subscribe((eventData) => {
  const entity = eventData.deadEntity;
  if (!isEntityValid(entity) || entity.typeId !== "minecraft:item") return;

  let itemComponent;
  try {
    itemComponent = entity.getComponent("item");
  } catch {
    return; // entity was already removed in this very tick (item merge/despawn) -> skip
  }
  if (!itemComponent) return;

  const item = itemComponent.itemStack;
  if (!item || item.typeId !== "avaritia:matter_cluster") return;

  const clusterKey = getMatterClusterKey(item);
  if (!clusterKey) return;

  let clusterStorage = entity.dimension.getDynamicProperty("avaritia:matter_clusters");
  clusterStorage = clusterStorage ? JSON.parse(clusterStorage) : {};

  if (clusterStorage[clusterKey]) {
    delete clusterStorage[clusterKey];
    entity.dimension.setDynamicProperty("avaritia:matter_clusters", JSON.stringify(clusterStorage));
  }
});

const matterClusterTracker = new Map();

MC.world.afterEvents.entitySpawn.subscribe((eventData) => {
  const entity = eventData.entity;
  if (!isEntityValid(entity) || entity.typeId !== "minecraft:item") return;

  let itemComponent;
  try {
    itemComponent = entity.getComponent("item");
  } catch {
    return;
  }
  if (!itemComponent) return;

  const item = itemComponent.itemStack;
  if (!item || item.typeId != "avaritia:matter_cluster") return;

  const clusterKey = getMatterClusterKey(item);
  if (!clusterKey) return;

  matterClusterTracker.set(entity, { key: clusterKey, time: 0 });
});

MC.system.runInterval(() => {
  for (const [entity, data] of matterClusterTracker.entries()) {
    if (!isEntityValid(entity)) {
      matterClusterTracker.delete(entity);
      continue;
    }

    data.time++;

    if (data.time >= 3600) {
      let clusterStorage = entity.dimension.getDynamicProperty("avaritia:matter_clusters");
      clusterStorage = clusterStorage ? JSON.parse(clusterStorage) : {};

      if (clusterStorage[data.key]) {
        delete clusterStorage[data.key];
        entity.dimension.setDynamicProperty("avaritia:matter_clusters", JSON.stringify(clusterStorage));
      }

      entity.triggerEvent("minecraft:despawn");
      matterClusterTracker.delete(entity);
    }
  }
}, 20);