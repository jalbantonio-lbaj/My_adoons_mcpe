import { EntityComponentTypes, EquipmentSlot, ItemStack, world } from "@minecraft/server"

const transform = {
    "dustveyn_ef:reality_shatterer": "dustveyn_ef:reality_shatterer_hammer",
    "dustveyn_ef:reality_shatterer_hammer": "dustveyn_ef:reality_shatterer"
}

world.afterEvents.itemUse.subscribe(({ itemStack: item, source: player }) => {
    const equipped = player.getComponent(EntityComponentTypes.Equippable)
    if (!item || !equipped) return
    if (transform[item.typeId]) {
        equipped.setEquipment(EquipmentSlot.Mainhand, new ItemStack(transform[item.typeId]))
    }
})