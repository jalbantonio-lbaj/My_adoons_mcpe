import { world, system, ItemStack, MolangVariableMap, GameMode, Player } from "@minecraft/server"
import { UNDESTRUCTABLE_BLOCKS } from './constants.js'

const MAX_LIFETIME = 186;
const COLLAPSE = 0.95;
const SUCK_RANGE = 20.0;
const PARTICLE_SPEED = 5;
const PARTICLE_COUNT = 10;
const DAMAGE_PER_TICK = 3.0;
const BLOCK_DESTROY_INTERVAL = 10;
const EXPLOSION_POWER = 6.0;
const MAX_SCALE = 10.0;
const VISUAL_SCALE_MULTIPLIER = 0.3;

const SUCTION_POWER_FACTOR = 0.1;

const EXCLUDED_FAMILIES = [
    "dorios:machine",
    "dorios:container",
    "avaritia:machine",
    "avaritia:holder",
    "ram_pg:portal"
];

function ease(t) {
    const inVal = t - 1;
    return Math.sqrt(Math.max(0, 1 - inVal * inVal));
}

function getVoidScale(age) {
    const life = age / MAX_LIFETIME;
    let curve;
    if (life < COLLAPSE) {
        curve = 0.005 + ease(1 - ((COLLAPSE - life) / COLLAPSE)) * 0.995;
    } else {
        curve = ease(1 - ((life - COLLAPSE) / (1 - COLLAPSE)));
    }
    return MAX_SCALE * curve;
}

function shouldSuck(entity) {
    if (entity.typeId === "avaritia:gaping_void") { return false }
    if (entity.typeId === "minecraft:player") {
        const currentGM = entity.getGameMode(); 
        
        if (currentGM === "Creative" || currentGM === "Spectator") {
            return false;
        }
    }    const familyComponent = entity.getComponent("minecraft:type_family");
    
    for (const fam of EXCLUDED_FAMILIES) {
        if (familyComponent && familyComponent.hasTypeFamily(fam)) { return false }
    }
    return true;
}

function applySuction(dimension, voidEntity, age) {
    const scale = getVoidScale(age);
    const radius = scale * 0.5;
    const center = voidEntity.location;
    const power = SUCTION_POWER_FACTOR * radius;

    const entities = dimension.getEntities({
        location: center,
        maxDistance: SUCK_RANGE
    });

    for (const entity of entities) {
        if (shouldSuck(entity)) {
            
            const dx = center.x - entity.location.x;
            const dy = center.y - entity.location.y;
            const dz = center.z - entity.location.z;
            const lenSq = dx * dx + dy * dy + dz * dz;
            const len = Math.sqrt(lenSq);

            if (len <= SUCK_RANGE && len > 0) {
                const lenn = len / SUCK_RANGE;
                const strength = (1 - lenn) * (1 - lenn);

                const dirX = dx / len;
                const dirY = dy / len;
                const dirZ = dz / len;

                const impulseX = dirX * strength * power;
                const impulseY = dirY * strength * power;
                const impulseZ = dirZ * strength * power;
                try {
                    const impulse = { x: impulseX, y: impulseY, z: impulseZ };
                    entity.applyImpulse(impulse);
                } catch (_) {}
            }
        }
    }
}

function damageEntities(dimension, voidEntity, age) {
    const scale = getVoidScale(age);
    const radius = scale * 0.5;
    const nomRange = radius * 0.95;
    const center = voidEntity.location;

    const entities = dimension.getEntities({
        location: center,
        maxDistance: nomRange
    });

    for (const entity of entities) {
        if (entity.id === voidEntity.id) continue;
        if (!shouldSuck(entity)) continue;

        const dx = center.x - entity.location.x;
        const dy = center.y - entity.location.y;
        const dz = center.z - entity.location.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (len <= nomRange) {
            try {
                entity.applyDamage(DAMAGE_PER_TICK, { cause: "void" });
            } catch (err) {}
        }
    }
}

function destroyBlocks(dimension, voidEntity, age) {
    if (age % BLOCK_DESTROY_INTERVAL !== 0) return;

    const scale = getVoidScale(age);
    const radius = scale * 0.5;
    const nomRange = radius * 0.95;
    const blockRange = Math.round(nomRange);
    const center = voidEntity.location;
    const bx = Math.floor(center.x);
    const by = Math.floor(center.y);
    const bz = Math.floor(center.z);

    for (let y = -blockRange; y <= blockRange; y++) {
        for (let z = -blockRange; z <= blockRange; z++) {
            for (let x = -blockRange; x <= blockRange; x++) {
                const lx = bx + x;
                const ly = by + y;
                const lz = bz + z;

                if (ly < -64 || ly > 319) continue;

                const dist = Math.sqrt(x * x + y * y + z * z);
                if (dist <= nomRange) {
                    const block = dimension.getBlock({ x: lx, y: ly, z: lz });
                    if (block && block.typeId !== "minecraft:air") {
                        const resist = getBlockExplosionResistance(block.typeId);
                        if (resist <= 10.0) {
                            try {
                                dimension.setBlockType({ x: lx, y: ly, z: lz }, "minecraft:air");
                            } catch (err) {}
                        }
                    }
                }
            }
        }
    }
}

function getBlockExplosionResistance(blockId) {
    const highResist = [
        "minecraft:bedrock", "minecraft:barrier", "minecraft:end_portal",
        "minecraft:end_portal_frame", "minecraft:command_block", "minecraft:structure_block",
        "minecraft:reinforced_deepslate", "minecraft:obsidian", "minecraft:crying_obsidian",
        "minecraft:respawn_anchor", "minecraft:enchanting_table", "minecraft:anvil",
        "minecraft:chipped_anvil", "minecraft:damaged_anvil",
        "minecraft:end_gateway", "minecraft:end_portal", "minecraft:structure_void",
        "minecraft:jigsaw", "minecraft:moving_block", "minecraft:light",
        "minecraft:trial_spawner", "minecraft:vault", "avaritia:infinity_block", "avaritia:neutronium_block",
        "avaritia:crystal_matrix_block", "avaritia:dire_crafting_table", "avaritia:neutron_collector", "avaritia:neutronium_compressor"
    ];
    const isUndestructable = UNDESTRUCTABLE_BLOCKS.some(pattern => {
        if (pattern instanceof RegExp) {
            return pattern.test(blockId);
        }
        return pattern === blockId;
    });
    if (highResist.includes(blockId)) return 1200;
    if (blockId.includes("obsidian")) return 1200;
    if (blockId.includes("netherite")) return 1200;
    if (blockId.includes("ancient_debris")) return 1200;
    if (blockId.includes("command_")) return 1200;
    if (isUndestructable) return 1200;
    return 1;
}

function spawnParticles(dimension, voidEntity, age) {
    const scale = getVoidScale(age);
    const size = scale * 0.5 - 0.2;
    const center = voidEntity.location;

    if (size <= 0) return; 
    if (age >= 5) return; 

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const u = Math.random();
        const v = Math.random();
        
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        
        const dirX = Math.sin(phi) * Math.cos(theta);
        const dirY = Math.sin(phi) * Math.sin(theta);
        const dirZ = Math.cos(phi);
        
        const particleLocation = {
            x: center.x + dirX * SUCK_RANGE,
            y: center.y + dirY * SUCK_RANGE,
            z: center.z + dirZ * SUCK_RANGE
        };
        
        const velocity = {
            x: -dirX * PARTICLE_SPEED,
            y: -dirY * PARTICLE_SPEED,
            z: -dirZ * PARTICLE_SPEED
        };
        
        const vars = new MolangVariableMap();
        vars.setVector3("variable.direction", velocity);
        
        try {
            dimension.spawnParticle("minecraft:portal_reverse_particle", particleLocation, vars);
        } catch (_) {}
    }
}

function onTick({ entity }) {
    try {
        const dimension = entity.dimension;
        let age = entity.getDynamicProperty("avaritia:age") || 0;
        
        if (age === 0) {
            try {
                entity.dimension.playSound("avaritia.gaping_void", entity.location, { volume: 8, pitch: 1 });
            } catch (err) {}
        }
        
        if (age >= MAX_LIFETIME) {
            try {
                entity.dimension.createExplosion(entity.location, EXPLOSION_POWER, { breaksBlocks: true, causesFire: false });
            } catch (err) {}
            entity.remove();
            return;
        }
        
        age++;
        entity.setDynamicProperty("avaritia:age", age);
        
        const scale = getVoidScale(age);
        try {
            entity.setProperty("avaritia:scale", scale * VISUAL_SCALE_MULTIPLIER);
        } catch (err) {}
        
        spawnParticles(entity.dimension, entity, age);
        applySuction(entity.dimension, entity, age);
        damageEntities(entity.dimension, entity, age);
        destroyBlocks(entity.dimension, entity, age);
        
    } catch (_) {}
}

function getActiveDimensions() {
    const activeDimensions = new Map();
    
    for (const player of world.getAllPlayers()) {
        const dim = player.dimension;
        if (!activeDimensions.has(dim.id)) {
            activeDimensions.set(dim.id, dim);
        }
    }
    return Array.from(activeDimensions.values());
}

system.runInterval(() => {
    const dimensions = getActiveDimensions();
    
    for (const dimension of dimensions) {
        try {
            const entities = dimension.getEntities({ type: "avaritia:gaping_void" });
            for (const entity of entities) {
                onTick({ entity });
            }
        } catch (err) {}
    }
}, 1);