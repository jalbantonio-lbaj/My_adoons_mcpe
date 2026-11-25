import { world, system, EquipmentSlot } from "@minecraft/server"
import { RANGED_MESSAGES } from './constants'

function getRandomMessage(messages, victim, killer) {
    const randomIndex = Math.floor(Math.random() * messages.length);
    const randomPhrase = messages[randomIndex];
    return randomPhrase(victim, killer);
}

function randomGaussian() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const processedHeavenArrowIds = new Set();

function spawnArrowBarrage(projectile, dimension, hitLocation) {
    if (projectile?.typeId !== "avaritia:heaven_arrow" || processedHeavenArrowIds.has(projectile.id)) return;

    const projectileId = projectile.id;
    processedHeavenArrowIds.add(projectileId);
    system.runTimeout(() => processedHeavenArrowIds.delete(projectileId), 20);

    for (let index = 0; index < 35; index++) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = randomGaussian() * 0.75;
        const spawnLocation = {
            x: Math.sin(angle) * distance + hitLocation.x,
            y: hitLocation.y + 25,
            z: Math.cos(angle) * distance + hitLocation.z
        };

        const subArrow = dimension.spawnEntity("avaritia:heaven_sub_arrow", spawnLocation);
        const scatterAngle = Math.random() * 2 * Math.PI;
        const scatterDistance = Math.random() * 0.35;
        const projectileComponent = subArrow.getComponent("minecraft:projectile");
        projectileComponent?.shoot({
            x: Math.sin(scatterAngle) * scatterDistance,
            y: -(Math.random() * 1.85 + 0.15),
            z: Math.cos(scatterAngle) * scatterDistance
        });
    }
}

world.afterEvents.projectileHitBlock.subscribe((event) => {
    if (event.projectile?.typeId === "avaritia:heaven_sub_arrow") {
        const subArrowId = event.projectile.id;
        system.runTimeout(() => {
            try {
                world.getEntity(subArrowId)?.remove();
            } catch {}
        }, 20);
        return;
    }

    spawnArrowBarrage(event.projectile, event.dimension, event.location);
});

world.afterEvents.entityDie.subscribe((event) => {
    const deadEntity = event.deadEntity;
    const damageSource = event.damageSource;

    if (deadEntity.typeId !== "minecraft:player") return;
    const killer = damageSource.projectile || damageSource.damagingEntity;
    if (killer?.typeId === "avaritia:heaven_arrow" || killer?.typeId === "avaritia:heaven_sub_arrow") {
        const playerName = deadEntity.name;
        world.sendMessage(getRandomMessage(RANGED_MESSAGES, playerName, killer?.name || "§ksghbfgh"));
    }
});
