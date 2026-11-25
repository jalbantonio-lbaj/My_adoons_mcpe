import { EntityComponentTypes, EquipmentSlot, ItemStack, world } from '@minecraft/server'

const skeletons = [ "minecraft:skeleton", "minecraft:wither_skeleton", "minecraft:bogged", "minecraft:parched", "minecraft:stray" ]

world.afterEvents.entityDie.subscribe(({ deadEntity: entity, damageSource: source }) => {
    const player = source.damagingEntity
    if (!player || player.typeId !== "minecraft:player") return
    const equipped = player.getComponent(EntityComponentTypes.Equippable)
    if (!equipped) return
    const item = equipped.getEquipment(EquipmentSlot.Mainhand)
    if (!item || item.typeId !== "dustveyn_ef:skullfire_sword") return
    if (entity && skeletons.includes(entity.typeId)) {
        entity.dimension.spawnItem(new ItemStack("minecraft:wither_skeleton_skull", 1), entity.location)
    }
})

world.afterEvents.entityHitEntity.subscribe(({ hitEntity: entity, damagingEntity: dmgEntity }) => {
    if (!entity) return
    const equippable = dmgEntity.getComponent(EntityComponentTypes.Equippable)
    if (!equippable) return
    const item = equippable.getEquipment(EquipmentSlot.Mainhand)
    if (!item || item.typeId !== "dustveyn_ef:skullfire_sword") return
    entity.setOnFire(3, true)
})