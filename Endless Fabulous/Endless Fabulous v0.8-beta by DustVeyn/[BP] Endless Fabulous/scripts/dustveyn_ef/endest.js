import { EntityComponentTypes, EquipmentSlot, GameMode, world } from "@minecraft/server";

const dimensions = [ "minecraft:overworld", "minecraft:nether", "minecraft:the_end" ]

world.afterEvents.itemUse.subscribe((ev) => {
    const {
        source: target,
        itemStack: item
    } = ev
    let equipped = target.getComponent(EntityComponentTypes.Equippable)
    if (!equipped || !item) return;
    let speed = 3
    if (item.typeId !== "dustveyn_ef:endest_pearl") return;
    for (const dimension of dimensions) {
        let entity = world.getDimension(dimension).spawnEntity('dustveyn_ef:endest_pearl', {
            x: target.location.x + 1.75 * (target.getViewDirection().x),
            y: target.location.y + 1.75 * (target.getAABB().center.y - target.location.y) + 1.75 * (target.getViewDirection().y),
            z: target.location.z + 1.75 * (target.getViewDirection().z)
        })
        entity.getComponent(EntityComponentTypes.Projectile).shoot({
            x: speed * (target.getViewDirection().x * 1.1),
            y: speed * (target.getViewDirection().y * 1.1),
            z: speed * (target.getViewDirection().z * 1.1)
        })
        if (target.getGameMode() == GameMode.Creative) return;
        if (item.amount > 1) {
            item.amount--
            equipped.setEquipment(EquipmentSlot.Mainhand, item)
        } else {
            equipped.setEquipment(EquipmentSlot.Mainhand, undefined)
        }
    }
})

world.afterEvents.projectileHitBlock.subscribe((event) => {
    if (event.getBlockHit().block) {
        if (!event.projectile || event.projectile.typeId !== "dustveyn_ef:endest_pearl") return
        event.dimension.spawnEntity("dustveyn_ef:black_hole", { x: event.projectile.location.x, y: event.projectile.location.y + 0.8, z: event.projectile.location.z })
        event.projectile.remove()
    }
})