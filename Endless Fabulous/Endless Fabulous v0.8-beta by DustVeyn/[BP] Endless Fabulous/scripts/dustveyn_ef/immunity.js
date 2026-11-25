import { EntityComponentTypes, EquipmentSlot, ItemLockMode, Player, system, world } from "@minecraft/server";

const dimensions = ["overworld", "nether", "the_end"]
const infItems = [
    "dustveyn_ef:sword_of_the_death",
    "dustveyn_ef:infinity_helmet",
    "dustveyn_ef:infinity_chestplate",
    "dustveyn_ef:infinity_leggings",
    "dustveyn_ef:infinity_boots",
    "dustveyn_ef:infinity_catalyst",
    "dustveyn_ef:infinity_ingot",
    "dustveyn_ef:reality_shatterer",
    "dustveyn_ef:reality_shatterer_hammer"
]

system.runInterval(function On() {
    system.run(function OnTick() {
        for (const dimension of dimensions) {
            const dim = world.getDimension(dimension)
            Array.from(dim.getEntities()).forEach(entity => {
                if (entity.typeId == "minecraft:item") {
                    entity.triggerEvent("minecraft:components")
                    var item = entity.getComponent(EntityComponentTypes.Item).itemStack
                    if (infItems.includes(item.typeId)) {
                        entity.addTag("fire_immunity");
                        if (entity.location.y <= entity.dimension.heightRange.min && entity.getDynamicProperty("dustveyn_ef:player_droploc")) {
                            entity.teleport(entity.getDynamicProperty("dustveyn_ef:player_droploc"))
                        }
                    }
                }
            })
        }
    })
}, 1);

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    if (!entity || entity.typeId !== "minecraft:item") return
    var item = entity?.getComponent(EntityComponentTypes.Item)?.itemStack
    if (item) {
        if (infItems.includes(item.typeId)) {
            const players = entity.dimension.getEntities({ type: "minecraft:player", maxDistance: 1.3, location: entity.location })
            for (const player of players) {
                entity.setDynamicProperty("dustveyn_ef:player_droploc", player.location)
            }
        }
    }
})

world.beforeEvents.explosion.subscribe((event) => {
    const explosion = event.source
    const dimension = explosion.dimension
    const entities = dimension.getEntities({ type: "minecraft:item", maxDistance: 8, location: explosion.location })
    for (const entity of entities) {
        var item = entity?.getComponent(EntityComponentTypes.Item)?.itemStack
        if (item) {
            if (infItems.includes(item.typeId)) {
                event.cancel = true
            }
        }
    }
})

const slots = [
    EquipmentSlot.Mainhand,
    EquipmentSlot.Offhand,
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet
]

system.runInterval(() => {
    world.getAllPlayers().forEach(player => {
        const inv = player.getComponent(EntityComponentTypes.Inventory)
        if (!inv) return
        const container = inv.container
        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i)
            if (!item) continue
            if (infItems.includes(item.typeId)) {
                item.keepOnDeath = true
                container.setItem(i, item)
            }
            for (const slot of slots) {
                const equipped = player.getComponent(EntityComponentTypes.Equippable)
                if (!equipped) return
                const equipItem = equipped.getEquipment(slot)
                if (equipItem && infItems.includes(equipItem.typeId)) {
                    equipItem.keepOnDeath = true
                    equipped.setEquipment(slot, equipItem)
                }
            }
        }
    });
}, 5)