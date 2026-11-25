import { world, system } from "@minecraft/server";

const LIGHT_BLOCKS = new Set([
    "mikeyz:neon_blue_light",
    "mikeyz:neon_red_light",
    "mikeyz:neon_lime_light",
    "mikeyz:neon_yellow_light",
    "mikeyz:neon_white_light",
    "mikeyz:neon_purple_light",
    "mikeyz:neon_cyan_light",
    "mikeyz:neon_magenta_light",
    "mikeyz:neon_orange_light"
]);

const activeLights = new Map();

const SCAN_RADIUS = 12;
const SCAN_Y_RADIUS = 4;

// Balanced mobile settings
const ACTIVE_INTERVAL = 3;
const MAX_ACTIVE_CHECKS = 48;
const SCAN_INTERVAL = 5;
const MAX_SCAN_BLOCKS = 180;

const SIDES = [
    b => b.above(),
    b => b.below(),
    b => b.north(),
    b => b.south(),
    b => b.east(),
    b => b.west()
];

let activeIterator = activeLights.entries();
let scanQueue = [];
let playerIndex = 0;

function getKey(dimension, location) {
    return `${dimension.id}:${location.x},${location.y},${location.z}`;
}

function getPower(block) {
    try {
        return block?.getRedstonePower?.() ?? 0;
    } catch {
        return 0;
    }
}

function getBlock(dimension, location) {
    try {
        return dimension.getBlock(location);
    } catch {
        return undefined;
    }
}

function isLightBlock(block) {
    try {
        return !!block && LIGHT_BLOCKS.has(block.typeId);
    } catch {
        return false;
    }
}

function getNeighbor(block, side) {
    try {
        return side(block);
    } catch {
        return undefined;
    }
}

function hasPower(block) {
    if (getPower(block) > 0) return true;

    for (const side of SIDES) {
        if (getPower(getNeighbor(block, side)) > 0) {
            return true;
        }
    }

    return false;
}

function trackLight(block) {
    const location = block.location;
    const key = getKey(block.dimension, location);

    if (activeLights.has(key)) return;

    activeLights.set(key, {
        dimension: block.dimension,
        location: {
            x: location.x,
            y: location.y,
            z: location.z
        }
    });
}

function untrackLight(block) {
    activeLights.delete(getKey(block.dimension, block.location));
}

function evaluateBlockPower(block) {
    try {
        if (!isLightBlock(block)) return;

        trackLight(block);

        const permutation = block.permutation;
        const nextState = hasPower(block) ? 1 : 0;

        if (permutation.getState("mikeyz:light") !== nextState) {
            block.setPermutation(permutation.withState("mikeyz:light", nextState));
        }
    } catch {}
}

function checkSomeActiveLights() {
    if (activeLights.size === 0) return;

    let checked = 0;

    while (checked < MAX_ACTIVE_CHECKS) {
        let next = activeIterator.next();

        if (next.done) {
            activeIterator = activeLights.entries();
            next = activeIterator.next();

            if (next.done) return;
        }

        const [key, data] = next.value;
        const block = getBlock(data.dimension, data.location);

        if (!isLightBlock(block)) {
            activeLights.delete(key);
        } else {
            evaluateBlockPower(block);
        }

        checked++;
    }
}

function checkNearbyLights(block) {
    for (const side of SIDES) {
        const nearby = getNeighbor(block, side);

        if (isLightBlock(nearby)) {
            evaluateBlockPower(nearby);
        }
    }
}

function buildScanQueue() {
    const players = world.getAllPlayers();
    if (players.length === 0) return;

    if (playerIndex >= players.length) {
        playerIndex = 0;
    }

    const player = players[playerIndex++];
    const dimension = player.dimension;
    const baseX = Math.floor(player.location.x);
    const baseY = Math.floor(player.location.y);
    const baseZ = Math.floor(player.location.z);

    scanQueue = [];

    for (let y = -SCAN_Y_RADIUS; y <= SCAN_Y_RADIUS; y++) {
        for (let x = -SCAN_RADIUS; x <= SCAN_RADIUS; x++) {
            for (let z = -SCAN_RADIUS; z <= SCAN_RADIUS; z++) {
                scanQueue.push({
                    dimension,
                    location: {
                        x: baseX + x,
                        y: baseY + y,
                        z: baseZ + z
                    }
                });
            }
        }
    }
}

function processScanQueue() {
    let checked = 0;

    while (scanQueue.length > 0 && checked < MAX_SCAN_BLOCKS) {
        const data = scanQueue.pop();
        const block = getBlock(data.dimension, data.location);

        if (isLightBlock(block)) {
            evaluateBlockPower(block);
        }

        checked++;
    }
}

world.afterEvents.playerPlaceBlock.subscribe((event) => {
    const block = event.block;

    if (isLightBlock(block)) {
        evaluateBlockPower(block);
    }

    checkNearbyLights(block);
});

world.afterEvents.playerBreakBlock.subscribe((event) => {
    const block = event.block;

    if (block) {
        untrackLight(block);
        checkNearbyLights(block);
    }
});

system.runInterval(checkSomeActiveLights, ACTIVE_INTERVAL);

system.runInterval(() => {
    if (scanQueue.length === 0) {
        buildScanQueue();
    }

    processScanQueue();
}, SCAN_INTERVAL);

// Keep the custom Neon/Pure stairs visually and physically connected like vanilla stairs.
const STAIR_SHAPE_STATE = "mikeyz:stair_shape";
const CARDINAL_DIRECTION_STATE = "minecraft:cardinal_direction";
const STAIR_OFFSETS = {
    north: { x: 0, y: 0, z: -1 },
    south: { x: 0, y: 0, z: 1 },
    east: { x: 1, y: 0, z: 0 },
    west: { x: -1, y: 0, z: 0 }
};
const STAIR_LEFT = { north: "west", south: "east", east: "north", west: "south" };
const STAIR_RIGHT = { north: "east", south: "west", east: "south", west: "north" };

function isCyberpunkStair(block) {
    try {
        return !!block && block.typeId.startsWith("mikeyz:") && block.typeId.endsWith("_stairs");
    } catch {
        return false;
    }
}

function stairDirection(block) {
    try {
        return block.permutation.getState(CARDINAL_DIRECTION_STATE);
    } catch {
        return undefined;
    }
}

function sameStairHalf(a, b) {
    try {
        return isCyberpunkStair(b)
            && a.permutation.getState("minecraft:vertical_half") === b.permutation.getState("minecraft:vertical_half");
    } catch {
        return false;
    }
}

function stairNeighbor(block, direction) {
    const offset = STAIR_OFFSETS[direction];
    return getBlock(block.dimension, {
        x: block.location.x + offset.x,
        y: block.location.y + offset.y,
        z: block.location.z + offset.z
    });
}

function stairShape(block) {
    const facing = stairDirection(block);
    if (!facing || !STAIR_OFFSETS[facing]) return "straight";

    const front = stairNeighbor(block, facing);
    if (sameStairHalf(block, front)) {
        const neighborFacing = stairDirection(front);
        if (neighborFacing === STAIR_LEFT[facing]) return "outer_left";
        if (neighborFacing === STAIR_RIGHT[facing]) return "outer_right";
    }

    const backDirection = STAIR_RIGHT[STAIR_RIGHT[facing]];
    const back = stairNeighbor(block, backDirection);
    if (sameStairHalf(block, back)) {
        const neighborFacing = stairDirection(back);
        if (neighborFacing === STAIR_LEFT[facing]) return "inner_left";
        if (neighborFacing === STAIR_RIGHT[facing]) return "inner_right";
    }

    return "straight";
}

function updateStair(block) {
    if (!isCyberpunkStair(block)) return;
    try {
        const permutation = block.permutation;
        const nextShape = stairShape(block);
        if (permutation.getState(STAIR_SHAPE_STATE) !== nextShape) {
            block.setPermutation(permutation.withState(STAIR_SHAPE_STATE, nextShape));
        }
    } catch {}
}

function updateNearbyStairs(dimension, location) {
    updateStair(getBlock(dimension, location));
    for (const offset of Object.values(STAIR_OFFSETS)) {
        updateStair(getBlock(dimension, {
            x: location.x + offset.x,
            y: location.y + offset.y,
            z: location.z + offset.z
        }));
    }
}

world.afterEvents.playerPlaceBlock.subscribe((event) => {
    system.run(() => updateNearbyStairs(event.dimension, event.block.location));
});

world.afterEvents.playerBreakBlock.subscribe((event) => {
    system.run(() => updateNearbyStairs(event.dimension, event.block.location));
});


const SIX_DIRECTIONS = ["south", "west", "north", "east", "up", "down"];
const CARDINAL_DIRECTIONS = ["south", "west", "north", "east"];

function rotateSneakInteractedBlock(block) {
    if (!block?.typeId?.startsWith("mikeyz:")) return false;
    try {
        const permutation = block.permutation;
        let stateName;
        let directions;
        try {
            permutation.getState("minecraft:facing_direction");
            stateName = "minecraft:facing_direction";
            directions = SIX_DIRECTIONS;
        } catch {
            permutation.getState("minecraft:cardinal_direction");
            stateName = "minecraft:cardinal_direction";
            directions = CARDINAL_DIRECTIONS;
        }
        const current = permutation.getState(stateName);
        const index = directions.indexOf(current);
        if (index < 0) return false;
        const next = directions[(index + 1) % directions.length];
        block.setPermutation(permutation.withState(stateName, next));
        return true;
    } catch {
        return false;
    }
}

// Sneak + empty-hand right-click rotates without opening the workbench or using an item.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    if (!event.isFirstEvent || !event.player.isSneaking || event.itemStack) return;
    if (!event.block?.typeId?.startsWith("mikeyz:")) return;
    event.cancel = true;
    system.run(() => rotateSneakInteractedBlock(event.block));
});
