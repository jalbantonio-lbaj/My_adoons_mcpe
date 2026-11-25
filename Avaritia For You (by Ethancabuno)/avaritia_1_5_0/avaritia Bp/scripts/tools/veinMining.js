import * as MC from "@minecraft/server";

// Configuração do VeinMining
const veinMining_Config = {
  limits: {
    leaves: 64, // Máximo de folhas coletadas
    logs: 256   // Máximo de troncos coletados
  },
  affectedBlocks: {
    logs: ["_log", "_stem"],
    leaves: ["_leaves", "wart_block", "mangrove_roots"]
  }
};

// Determina se um bloco é madeira ou folha
function getBlockCategory(block) {
  if (veinMining_Config.affectedBlocks.leaves.some(suffix => block.typeId.endsWith(suffix))) return "leaves";
  if (veinMining_Config.affectedBlocks.logs.some(suffix => block.typeId.endsWith(suffix))) return "logs";
  return null;
}

// Busca blocos conectados de madeira e folhas (folhas limitadas a 6 blocos de distância)
function findConnectedBlocks(startBlock) {
  const queue = [{ block: startBlock, distance: 0 }];
  const mappedBlocks = { leaves: [], logs: [] };
  const visited = new Set();
  let leavesCount = 0;
  let logsCount = 0;

  while (queue.length > 0) {
    const { block: currentBlock, distance } = queue.shift();
    const blockKey = `${currentBlock.location.x},${currentBlock.location.y},${currentBlock.location.z}`;
    if (visited.has(blockKey)) continue;
    visited.add(blockKey);

    const category = getBlockCategory(currentBlock);
    if (!category) continue;

    if (category === "logs" && logsCount < veinMining_Config.limits.logs) {
      mappedBlocks.logs.push(currentBlock);
      logsCount++;

      // Para cada tronco, iniciamos uma nova busca de folhas com limite de 6 blocos
      findLeavesAround(currentBlock, mappedBlocks, visited);
      
    } else if (category === "leaves" && leavesCount < veinMining_Config.limits.leaves) {
      if (distance <= 6) {  // Apenas folhas dentro do raio de 6 blocos são removidas
        mappedBlocks.leaves.push(currentBlock);
        leavesCount++;
      }
    } else continue;

    const offsets = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
    ];

    for (const offset of offsets) {
      const neighborPos = {
        x: currentBlock.location.x + offset.x,
        y: currentBlock.location.y + offset.y,
        z: currentBlock.location.z + offset.z
      };
      const neighborBlock = currentBlock.dimension.getBlock(neighborPos);
      if (neighborBlock) queue.push({ block: neighborBlock, distance: distance + 1 });
    }
  }

  return mappedBlocks;
}

// Busca folhas em um raio de 6 blocos ao redor da madeira
function findLeavesAround(logBlock, mappedBlocks, visited) {
  const queue = [{ block: logBlock, distance: 0 }];
  
  while (queue.length > 0) {
    const { block: currentBlock, distance } = queue.shift();
    if (distance > 6) continue;

    const offsets = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0, z: 1, y: 0 }, { x: 0, z: -1, y: 0 }
    ];

    for (const offset of offsets) {
      const neighborPos = {
        x: currentBlock.location.x + offset.x,
        y: currentBlock.location.y + offset.y,
        z: currentBlock.location.z + offset.z
      };
      const neighborBlock = currentBlock.dimension.getBlock(neighborPos);
      const blockKey = `${neighborPos.x},${neighborPos.y},${neighborPos.z}`;

      if (neighborBlock && !visited.has(blockKey) && getBlockCategory(neighborBlock) === "leaves") {
        mappedBlocks.leaves.push(neighborBlock);
        visited.add(blockKey);
        queue.push({ block: neighborBlock, distance: distance + 1 });
      }
    }
  }
}

// Remove blocos em lotes para evitar travamentos
function removeBlocksAsync(blocks, player, location, index = 0) {
  if (index >= blocks.length) return;

  const batchSize = 16;
  const endIndex = Math.min(index + batchSize, blocks.length);

  for (let i = index; i < endIndex; i++) {
    const block = blocks[i];
    if (!block) continue;

    if (player.getGameMode() !== "creative") {
      block.dimension.runCommand(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air destroy`);
      block.dimension.runCommand(
        `execute positioned ${block.location.x} ${block.location.y} ${block.location.z} ` +
        `as @e[r=2,c=3,type=item] at @s run tp @s ${location.x} ${location.y} ${location.z}`
      );
    } else {
      block.dimension.runCommand(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air`);
    }
  }

  MC.system.run(() => removeBlocksAsync(blocks, player, location, endIndex));
}

// Função principal do VeinMining
function veinMining(block, player) {
  const equipment = player.getComponent("equippable");
  const item = equipment?.getEquipment("Mainhand");

  if (!player.isSneaking && item?.typeId === "avaritia:infinity_axe") {
    const category = getBlockCategory(block);
    if (!category || category !== "logs") return;

    const connectedBlocks = findConnectedBlocks(block);
    const blocksToRemove = [...connectedBlocks.logs, ...connectedBlocks.leaves];
    // FIX: veinMining() runs synchronously inside world.beforeEvents.playerBreakBlock, and beforeEvents
    // is "restricted execution" - it does not allow calling natives that change the world (dimension.runCommand,
    // setBlock, etc.) right there. The first batch of removeBlocksAsync calls runCommand() directly
    // -> throws "Native function [Dimension::runCommand] cannot be used in restricted execution.",
    // and because the error is thrown before the MC.system.run() line at the end of the function, the later batches never
    // run either (the entire vein mining is cancelled from the very first block). Wrap the first call in
    // MC.system.run() so it is deferred to the next tick, out of the restricted context of beforeEvents.
    MC.system.run(() => removeBlocksAsync(blocksToRemove, player, block.location));
  }
}

// Detecta quando um jogador quebra um bloco
MC.world.beforeEvents.playerBreakBlock.subscribe((eventData) => {
  const block = eventData.block;
  const player = eventData.player;

  if (getBlockCategory(block)) {
    veinMining(block, player);
  }
});