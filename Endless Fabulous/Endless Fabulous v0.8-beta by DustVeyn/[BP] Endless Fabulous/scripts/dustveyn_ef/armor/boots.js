import { EntityComponentTypes, EntityDamageCause, EquipmentSlot, system, world } from '@minecraft/server'
import { database } from './database'

system.runInterval(() => {
    world.getAllPlayers().forEach(player => {
        const equippable = player.getComponent(EntityComponentTypes.Equippable)
        if (!equippable) return
        const feet = equippable.getEquipment(EquipmentSlot.Feet)
        if (!feet || feet.typeId !== "dustveyn_ef:infinity_boots") return
        database.addEffect(player, "jump_boost", 3, 5, false)
    })
}, 1)

world.beforeEvents.entityHurt.subscribe((event) => {
    const {
        damageSource: source,
        hurtEntity: entity
    } = event
    if (!entity || entity.typeId !== "minecraft:player") return
    const equippable = entity.getComponent(EntityComponentTypes.Equippable)
    if (!equippable) return
    const feet = equippable.getEquipment(EquipmentSlot.Feet)
    if (!feet || feet.typeId !== "dustveyn_ef:infinity_boots") return
    if (source.cause == EntityDamageCause.fall) {
        event.cancel = true
    }
})