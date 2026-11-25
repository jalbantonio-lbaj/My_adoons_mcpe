import { world, system } from "@minecraft/server";
world.beforeEvents.worldInitialize.subscribe(event => {
    event.blockComponentRegistry.registerCustomComponent("redstone_lamps_plus:redstone", RedstoneComponent);
})

const RedstoneComponent = {
    onTick(event) {
      const block = event.block;
      const pos = block.location;
      const dim = block.dimension;
  
      const directions = [
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: -1, z: 0 }
      ];
      const updatePowerLevel = () => {
        let maxPowerLevel = 0;
        
        for (const direction of directions) {
          const neighborPos = {
            x: pos.x + direction.x,
            y: pos.y + direction.y,
            z: pos.z + direction.z
          };
  
          try {
            const neighborBlock = dim.getBlock(neighborPos);
            const currentPowerLevel = neighborBlock.getRedstonePower();
  
            if (currentPowerLevel && currentPowerLevel > maxPowerLevel) {
              maxPowerLevel = currentPowerLevel;
            }
          } catch (error) {
          }
        }
        return maxPowerLevel;
      };
      try {
        if (!block || block.typeId === "minecraft:air") return;
        const powerLevel = updatePowerLevel();
        const isPowered = powerLevel > 0;
        const newPermutation = block.permutation
          .withState("ubd:powered", isPowered ? 1 : 0)
        block.setPermutation(newPermutation);
      } catch (e){
      }
    }
  };

  
const horizontalStrength = 0.5;
// Map to store active fans and their intervals
const activeFans = new Map();

// Register custom component
world.beforeEvents.worldInitialize.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(
      "ubd:fan",
      fanComponent
    );
  });

// Start the fan logic for a specific fan
function startFanLogic(block, updatePowerLevel) {
  const blockKey = `${block.x},${block.y},${block.z}`;
  if (!activeFans.has(blockKey)) {
    const intervalId = system.runInterval(() => {
      const currentPowerLevel = updatePowerLevel();
      executeFanLogic(block, currentPowerLevel);
    }, 4);
    activeFans.set(blockKey, intervalId);
  }
}

// Stop the fan logic for a specific fan
function stopFanLogic(block) {
  const blockKey = `${block.x},${block.y},${block.z}`;
  if (activeFans.has(blockKey)) {
    system.clearRun(activeFans.get(blockKey));
    activeFans.delete(blockKey);
  }
}

function executeFanLogic(block, powerLevel) {
    try {
        // If powerLevel is 0, we don't need to do anything
        if (powerLevel <= 0) {
            return;
        }

        const pos = block.location;
        const dim = block.dimension;
        const pushDistance = Math.max(1, Math.ceil(powerLevel / 2)); // Ensure minimum push distance of 1
        const direction = block.permutation.getState("minecraft:facing_direction");
        const fanDir = getFanDirection(direction);
        const endPos = {
            x: Math.floor(pos.x + fanDir.x * pushDistance),
            y: Math.floor(pos.y + fanDir.y * pushDistance),
            z: Math.floor(pos.z + fanDir.z * pushDistance)
        };

        for (let a = 1; a <= 16; a++) {
            if (a / 4 === 4) {
                spawnWindParticles(pos, endPos, dim, pushDistance);
            }
        }

        // Check entities in each block in front of the fan
        for (let i = 1; i <= pushDistance; i++) {
            const checkPos = {
                x: Math.floor(pos.x + fanDir.x * i),
                y: Math.floor(pos.y + fanDir.y * i),
                z: Math.floor(pos.z + fanDir.z * i)
            };

            const entitiesAtBlock = dim.getEntitiesAtBlockLocation(checkPos);

            for (const entity of entitiesAtBlock) {
                if (entity.typeId === "minecraft:item") {
                    const impulse = { 
                        x: fanDir.x * horizontalStrength, 
                        y: fanDir.y * horizontalStrength, 
                        z: fanDir.z * horizontalStrength 
                    };
                    entity.applyImpulse(impulse);
                } else {
                    entity.applyKnockback(fanDir.x, fanDir.z, horizontalStrength, fanDir.y);
                }
            }
        }
    } catch (error) {
        console.warn(`Error in executeFanLogic: ${error.message}`);
        stopFanLogic(block); // This error catches when a fan is unloaded and turns off the logic
    }
}

// Define the fan component
const fanComponent = {
  onTick(event) {
    const block = event.block;
    const pos = block.location;
    const dim = block.dimension;

    const directions = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 }
    ];

    const updatePowerLevel = () => {
      let maxPowerLevel = 0;
      for (const direction of directions) {
        const neighborPos = {
          x: pos.x + direction.x,
          y: pos.y + direction.y,
          z: pos.z + direction.z
        };

        try {
          const neighborBlock = dim.getBlock(neighborPos);
          const currentPowerLevel = neighborBlock.getRedstonePower();

          if (currentPowerLevel && currentPowerLevel > maxPowerLevel) {
            maxPowerLevel = currentPowerLevel;
          }
        } catch (error) {
          stopFanLogic(block);
        }
      }
      return maxPowerLevel;
    };

    const powerLevel = updatePowerLevel();
    const isPowered = powerLevel > 0;

    const newPermutation = block.permutation.withState("ubd:powered", isPowered ? 1 : 0);
    block.setPermutation(newPermutation);

    const blockKey = `${pos.x},${pos.y},${pos.z}`;
    if (isPowered && !activeFans.has(blockKey)) {
      startFanLogic(block, updatePowerLevel);
    } else if (!isPowered && activeFans.has(blockKey)) {
      stopFanLogic(block);
    }
  }
};

function getFanDirection(directionState) {
    const direction = { x: 0, y: 0, z: 0 };
    switch (directionState) {
        case "north":
            direction.z = 1;
            break;
        case "south":
            direction.z = -1;
            break;
        case "west":
            direction.x = 1;
            break;
        case "east":
            direction.x = -1;
            break;
        case "up":
            direction.y = -1;
            break;
        case "down":
            direction.y = 1;
            break;
    }
    return direction;
}

function spawnWindParticles(start, end, dimension, count) {
    const particleCount = count; 
    const waveAmplitude = Math.random(); 
    const waveFrequency = Math.random(0.5,1) * Math.PI; 

    const direction = {
        x: end.x - start.x,
        y: end.y - start.y,
        z: end.z - start.z
    };

    const perp1 = { x: -direction.z, y: 0, z: direction.x };
    const perp2 = {
        x: direction.y * perp1.z - direction.z * perp1.y,
        y: direction.z * perp1.x - direction.x * perp1.z,
        z: direction.x * perp1.y - direction.y * perp1.x
    };
    normalizeVector(perp1);
    normalizeVector(perp2);

    for (let i = 0; i <= particleCount; i++) {
        const t = i / particleCount;
        const waveOffset = Math.sin(t * waveFrequency) * waveAmplitude;

        const particlePos = {
            x: start.x + (direction.x + Math.random()) * t + (perp1.x + perp2.x) * waveOffset + 0.5,
            y: start.y + (direction.y + Math.random()) * t + (perp1.y + perp2.y) * waveOffset + 0.5,
            z: start.z + (direction.z + Math.random()) * t + (perp1.z + perp2.z) * waveOffset + 0.5
        };
        //placeholder partlicles
        dimension.spawnParticle("minecraft:wind_charged_ambient", particlePos);
    }
}

function normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
    if (magnitude !== 0) {
        vector.x /= magnitude;
        vector.y /= magnitude;
        vector.z /= magnitude;
    }
}
