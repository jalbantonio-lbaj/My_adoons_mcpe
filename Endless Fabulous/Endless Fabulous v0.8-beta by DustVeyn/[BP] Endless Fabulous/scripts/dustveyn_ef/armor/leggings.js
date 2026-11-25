import { EntityComponentTypes, EquipmentSlot, system, world } from '@minecraft/server'
import { database } from './database'

system.runInterval(() => {
    world.getAllPlayers().forEach(player => {
        const equippable = player.getComponent(EntityComponentTypes.Equippable)
        if (!equippable) return
        const legs = equippable.getEquipment(EquipmentSlot.Legs)
        if (!legs || legs.typeId !== "dustveyn_ef:infinity_leggings") return
        const movement = player.getComponent(EntityComponentTypes.Movement)
        if (player.isSprinting) movement.setCurrentValue(0.4)
        else movement.setCurrentValue(movement.defaultValue)
        if (player.getEffect("slowness")) player.removeEffect("slowness")
        if (player.isFalling) database.addEffect(player, "slow_falling", 2, 2, false)
    })
}, 1)