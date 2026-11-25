import * as MC from "@minecraft/server";
import * as MCUI from "@minecraft/server-ui";

// NOTE: like armorEffects.js/compressor.js - "world.afterEvents.worldInitialize"
// no longer exists in the current API. world.getDynamicProperty()/setDynamicProperty()
// can be used directly, with no need to register via propertyRegistry first.

function getWorldData() {
  const data = MC.world.getDynamicProperty("avaritia:blockData");
  return data ? JSON.parse(data) : {};
}

function setWorldData(data) {
  MC.world.setDynamicProperty("avaritia:blockData", JSON.stringify(data));
}

function getBlockKey(location) {
  return `${location.x},${location.y},${location.z}`;
}

function initializeBlockData(blockKey) {
  const data = getWorldData();
  if (!data[blockKey]) {
    data[blockKey] = { neutrons: 0, timer: 0 };
    setWorldData(data);
  }
}

export function updateBlockData(block) {
  const blockKey = getBlockKey(block.location);
  initializeBlockData(blockKey);
  const data = getWorldData();
  const blockData = data[blockKey];
  blockData.timer++;
  if (blockData.timer >= 6000) {
    if (blockData.neutrons < 64) {
      blockData.neutrons++;
    }
    blockData.timer = 0;
  }
  data[blockKey] = blockData;
  setWorldData(data);
}

function getConnectedCollectors(player, origin, visited = new Set()) {
  const queue = [origin];
  const found = [];
  const maxSearch = 64;

  while (queue.length > 0 && found.length < maxSearch) {
    const current = queue.pop();
    const key = getBlockKey(current);

    if (visited.has(key)) continue;
    visited.add(key);

    const block = MC.world.getDimension(player.dimension.id).getBlock(current);
    if (!block || block.typeId != "avaritia:neutron_collector") continue;

    found.push(block);
    const directions = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
    ];

    for (const dir of directions) {
      if (queue.length < maxSearch) {
        queue.push({ x: current.x + dir.x, y: current.y + dir.y, z: current.z + dir.z });
      }
    }
  }

  return found;
}

export function neutronCollector(player, block) {
  if (!block || !player) return;
  const data = getWorldData();
  const blockKey = getBlockKey(block.location);
  const blockData = data[blockKey];
  const connectedCollectors = getConnectedCollectors(player, block.location);
  let totalNeutrons = 0;
  let collectorCount = 0;
  for (const collector of connectedCollectors) {
    const key = getBlockKey(collector.location);
    if (data[key]) totalNeutrons += data[key].neutrons;
    collectorCount++;
  }
  if (totalNeutrons > 0 && !player.isSneaking) {
    const form = new MCUI.ModalFormData();
    form.title("§l%neutron_collector.name");
    form.slider(`§e%pile_of_neutrons.name: §f${totalNeutrons}/${64 * collectorCount}\n§eColetores Conectados: §f${collectorCount - 1}\n§l%gui.collect`, 1, totalNeutrons, { valueStep: 1, defaultValue: totalNeutrons });
    form.show(player).then((result) => {
      if (result.canceled) return;
      const selection = result.formValues[0];
      player.runCommand(`give @s avaritia:pile_of_neutrons ${selection}`);
      let remaining = selection;
      for (const collector of connectedCollectors) {
        const key = getBlockKey(collector.location);
        if (data[key] && data[key].neutrons > 0) {
          const deduct = Math.min(data[key].neutrons, remaining);
          data[key].neutrons -= deduct;
          remaining -= deduct;
          if (remaining <= 0) break;
        }
      }
      setWorldData(data);
      player.runCommand(`tellraw @s {"rawtext":[{"translate":"message.avaritia.neutron"},{"text":" §e${selection}."}]}`);
    });
  }
  if (totalNeutrons == 0 && !player.isSneaking) {
    player.playSound("note.bass");
    const percentage = Math.floor((blockData.timer / 6000) * 1000) / 10;
    player.runCommand(`titleraw @s actionbar {"rawtext":[{"translate":"§c%message.avaritia.neutron2"},{"text":" ${Math.floor(blockData.timer / 20)}s (${percentage.toFixed(1)}%)."}]}`);
  }
  if (player.isSneaking) {
    const percentage = Math.floor((blockData.timer / 6000) * 1000) / 10;
    player.runCommand(`titleraw @s actionbar {"rawtext":[{"text":"§e${Math.floor(blockData.timer / 20)}s §f(${percentage.toFixed(1)}%)."}]}`);
  }
}

MC.world.afterEvents.playerBreakBlock.subscribe((eventData) => {
  const block = eventData.block;
  if (!block) return;
  const blockKey = getBlockKey(block.location);
  const data = getWorldData();
  if (data[blockKey]) {
    const blockData = data[blockKey];
    if (blockData.neutrons > 0) {
      block.dimension.spawnItem(new MC.ItemStack("avaritia:pile_of_neutrons", blockData.neutrons), block.location);
    }
    delete data[blockKey];
    setWorldData(data);
  }
});