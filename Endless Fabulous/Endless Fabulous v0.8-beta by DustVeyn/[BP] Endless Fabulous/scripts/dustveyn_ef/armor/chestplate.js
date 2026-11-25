import { EntityComponentTypes, EntityDamageCause, EquipmentSlot, GameMode, system, world } from '@minecraft/server'
import { database } from './database'

system.runInterval(() => {
    world.getAllPlayers().forEach(player => {
        const equippable = player.getComponent(EntityComponentTypes.Equippable)
        if (!equippable) return
        const chest = equippable.getEquipment(EquipmentSlot.Chest)
        if (player.getGameMode() != GameMode.Survival) {
            if (!player.hasTag("dustveyn_ef:gamemodefly")) {
                player.runCommand(`ability @s mayfly true`)
                player.addTag("dustveyn_ef:gamemodefly")
            }
            return
        }
        if (player.getGameMode() == GameMode.Survival) {
            if (!player.hasTag("dustveyn_ef:fly")) {
                if (player.hasTag("dustveyn_ef:gamemodefly")) {
                    player.runCommand(`ability @s mayfly false`)
                    player.removeTag("dustveyn_ef:gamemodefly")
                }
            }
        }
        if (chest?.typeId === "dustveyn_ef:infinity_chestplate") {
            if (!player.hasTag("dustveyn_ef:fly")) {
                world.gameRules.sendCommandFeedback = false
                player.runCommand(`ability @s mayfly true`)
                player.addTag("dustveyn_ef:fly")
                player.removeTag("dustveyn_ef:gamemodefly")
            }
            if (player.extinguishFire()) { database.addEffect(player, "fire_resistance", 5, 1, false) }
            const health = player.getComponent(EntityComponentTypes.Health)
            if (health.currentValue < health.defaultValue) database.addEffect(player, "regeneration", 3, 7, false)
        } else {
            if (player.hasTag("dustveyn_ef:fly")) {
                world.gameRules.sendCommandFeedback = true
                player.runCommand(`ability @s mayfly false`)
                player.removeTag("dustveyn_ef:fly")
            }
        }
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
    const chest = equippable.getEquipment(EquipmentSlot.Chest)
    if (!chest || chest.typeId !== "dustveyn_ef:infinity_chestplate") return
    if (source.cause == EntityDamageCause.entityExplosion) {
        event.cancel = true
    }
})