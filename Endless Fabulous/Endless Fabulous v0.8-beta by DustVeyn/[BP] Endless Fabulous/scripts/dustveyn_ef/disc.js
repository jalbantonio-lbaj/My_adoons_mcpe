import { EntityComponentTypes, EquipmentSlot, ItemStack, system, world } from "@minecraft/server";

world.beforeEvents.playerInteractWithBlock.subscribe(({ block, itemStack: item, player, isFirstEvent}) => {
    let equipped = player.getComponent(EntityComponentTypes.Equippable)
    if (!equipped) return
    if (!isFirstEvent) return
    if (!block || block.typeId !== "minecraft:stone") return
    if (item.typeId.includes("minecraft:music_disc")) {
        system.run(() => {
            equipped.setEquipment(EquipmentSlot.Mainhand, new ItemStack("dustveyn_ef:disc_fragment", Math.random() * 8 + 1))
        })
    }
})