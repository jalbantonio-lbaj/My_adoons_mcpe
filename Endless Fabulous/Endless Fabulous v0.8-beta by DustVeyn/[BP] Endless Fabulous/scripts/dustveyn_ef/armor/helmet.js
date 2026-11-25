import { EntityComponentTypes, EntityDamageCause, EquipmentSlot, system, TicksPerSecond, world } from '@minecraft/server'
import { database } from './database'

system.runInterval(() => {
    world.getAllPlayers().forEach(player => {
        const equippable = player.getComponent(EntityComponentTypes.Equippable)
        if (!equippable) return
        const head = equippable.getEquipment(EquipmentSlot.Head)
        if (!head || head.typeId !== "dustveyn_ef:infinity_helmet") return
        database.addEffect(player, "night_vision", 11, 1, false)
        if (player.isInWater) { database.addEffect(player, "water_breathing", 5, 5, false) }
        if (player.getEffect("blindness")) player.removeEffect("blindness")
        if (player.getEffect("darkness")) player.removeEffect("darkness")
    })
}, 1)

system.runInterval(() => {
    world.getAllPlayers().forEach(player => {
        const equippable = player.getComponent(EntityComponentTypes.Equippable)
        if (!equippable) return
        const head = equippable.getEquipment(EquipmentSlot.Head)
        if (!head || head.typeId !== "dustveyn_ef:infinity_helmet") return
        const target = player.getEntitiesFromViewDirection({ maxDistance: 8 })[0]?.entity
        if (target && (player?.getHeadLocation(), target?.location)) {
            target.applyDamage(3, {
                cause: EntityDamageCause.entityAttack,
                damagingEntity: player
            })
        }
    })
}, TicksPerSecond * 3)