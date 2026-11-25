import { BlockComponentTypes, EntityComponentTypes, ItemStack, system, world } from "@minecraft/server";

const neutrons = {
    "dustveyn_ef:neutron_collector": {
        tick: 750,
        item: "dustveyn_ef:pile_of_neutron"
    },
    "dustveyn_ef:enhanced_neutron_collector": {
        tick: 375,
        item: "dustveyn_ef:pile_of_neutron"
    },
    "dustveyn_ef:supreme_neutron_collector": {
        tick: 75,
        item: "dustveyn_ef:neutronium_nugget"
    }
}

world.afterEvents.playerPlaceBlock.subscribe(({ block, dimension }) => {
    if (block && neutrons[block.typeId]) {
        let entity = dimension.spawnEntity("dustveyn_ef:neutron_collector_inv", block.bottomCenter())
        entity.nameTag = "dustveyn_ef:neutron_collector"
        system.run(() => {
            entity.setDynamicProperty("dustveyn_ef:arrowTick", 0)
        })
    }
})

system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity: entity }) => {
    if (id === "dustveyn_ef:neutron_collector") {
        const block = entity.dimension.getBlock(entity.location)
        const config = neutrons[block.typeId]
        if (!block || !config) return
        const inv = entity.getComponent(EntityComponentTypes.Inventory)
        const hopper = entity.dimension.getBlock({ x: entity.location.x, y: entity.location.y - 1, z: entity.location.z })
        const hopperInv = hopper.getComponent(BlockComponentTypes.Inventory)?.container
        let arrowTick = entity.getDynamicProperty("dustveyn_ef:arrowTick") ?? 0
        if (!inv) return
        const container = inv.container
        const item = container.getItem(0);
        if (hopper && hopper.typeId == "minecraft:hopper") {
            container.transferItem(0, hopperInv)
        }
        if (arrowTick >= 0) {
            container.setItem(1, new ItemStack("dustveyn_ef:neutron_collector_arrow_" + arrowTick))
        }
        if (arrowTick == 16) {
            entity.setDynamicProperty("dustveyn_ef:arrowTick", 0)
            container.addItem(new ItemStack(config.item))
        }
        if ((!item || item.typeId === config.item) && (!item || item.amount < 64)) {
            if (system.currentTick % config.tick == 0) {
                entity.setDynamicProperty("dustveyn_ef:arrowTick", arrowTick + 1)
            }
        }
    };
    if (id === "dustveyn_ef:breaking") {
        const inv = entity.getComponent(EntityComponentTypes.Inventory)
        if (!inv) return
        const container = inv.container
        if (container.getItem(0)) {
            entity.dimension.spawnItem(container.getItem(0), entity.location)
        }
        entity.remove()
    }
})