import { EntityComponentTypes, system } from "@minecraft/server";

system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity: entity }) => {
    if (id === "dustveyn_ef:black_hole") {
        if (!entity) return
        const entities = entity.dimension.getEntities({ location: entity.location, maxDistance: 10 })
        for (const e of entities) {
            if (e.id === entity.id) continue;
            if (e.getComponent(EntityComponentTypes.TypeFamily)?.hasTypeFamily("inanimate")) continue
            const dx = e.location.x - entity.location.x
            const dy = e.location.y - entity.location.y
            const dz = e.location.z - entity.location.z
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
            const strength = 0.15
            e.applyImpulse({
                x: (dx / distance) * -strength,
                y: (dy / distance) * -strength,
                z: (dz / distance) * -strength
            })
        }
    }
})