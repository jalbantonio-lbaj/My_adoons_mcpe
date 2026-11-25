import { EntityComponentTypes, EquipmentSlot, world } from "@minecraft/server";

world.beforeEvents.entityHurt.subscribe((event) => {
    if (!event.hurtEntity || event.hurtEntity.typeId !== "minecraft:player") return
    const equippable = event.hurtEntity.getComponent(EntityComponentTypes.Equippable)
    if (!equippable) return
    const head = equippable.getEquipment(EquipmentSlot.Head)
    const chest = equippable.getEquipment(EquipmentSlot.Chest)
    const legs = equippable.getEquipment(EquipmentSlot.Legs)
    const feet = equippable.getEquipment(EquipmentSlot.Feet)
    if (!head || head.typeId !== "dustveyn_ef:infinity_helmet") return
    if (!chest || chest.typeId !== "dustveyn_ef:infinity_chestplate") return
    if (!legs || legs.typeId !== "dustveyn_ef:infinity_leggings") return
    if (!feet || feet.typeId !== "dustveyn_ef:infinity_boots") return
    event.cancel = true
})