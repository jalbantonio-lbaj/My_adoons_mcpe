import { BlockComponentTypes, EntityComponentTypes, ItemLockMode, ItemStack, Player, system, world } from "@minecraft/server";
import { crystalRec } from "./recipes";

function getFrame(current, max, numberFrame) {
    let frame = Math.floor((current / max) * numberFrame);
    if (frame >= numberFrame) frame = numberFrame - 1;
    if (frame < 0) frame = 0;
    return frame;
}

world.afterEvents.playerPlaceBlock.subscribe(({ block, dimension }) => {
    if (!block || block.getItemStack().typeId !== "dustveyn_ef:neutronium_compressor") return
    let entity = dimension.spawnEntity("dustveyn_ef:neutronium_compressor_inv", block.bottomCenter())
    entity.nameTag = "dustveyn_ef:neutronium_compressor"
    system.run(() => {
        entity.setDynamicProperty("dustveyn_ef:arrowTick", 0)
        entity.setDynamicProperty("dustveyn_ef:arrowMax", 0)
        entity.setDynamicProperty("dustveyn_ef:tag_nc", undefined)
    })
})

system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity: entity }) => {
    if (id == "dustveyn_ef:neutronium_compressor") {
        const tick = entity.getDynamicProperty("dustveyn_ef:arrowTick") ?? 0
        const max = entity.getDynamicProperty("dustveyn_ef:arrowMax") ?? 0
        const tag = entity.getDynamicProperty("dustveyn_ef:tag_nc")
        const block = entity.dimension.getBlock(entity.location)
        let inv = entity.getComponent(EntityComponentTypes.Inventory)
        if (!inv) return
        const container = inv.container
        const input = container.getItem(0)
        const output = container.getItem(2)
        if (block.below().typeId == "minecraft:hopper") {
            const belowinv = block.below().getComponent(BlockComponentTypes.Inventory)
            if (!belowinv) return
            const belowcontainer = belowinv.container
            if (belowcontainer) container.transferItem(2, belowcontainer)
        }
        if (block.above().typeId == "minecraft:hopper" && block.above().permutation.getState("facing_direction") == 0 && !block.above().getRedstonePower()) {
            const aboveInv = block.above().getComponent(BlockComponentTypes.Inventory)?.container;
            if (aboveInv && (!input || input && input.amount < 64)) {
                for (let i = 0; i < aboveInv.size; i++) {
                    const item = aboveInv.getItem(i);
                    if (item) {
                        container.setItem(0, !input ? Object.assign(item.clone(), { amount: 1 }) : input.typeId === item.typeId ? ((input.amount++), input) : input);
                        aboveInv.setItem(i, item.amount > 1 ? (item.amount--, item) : undefined);
                        return;
                    }
                }
            }
        }
        if (max >= 0) {
            let arrow = getFrame(tick, max, 22);
            let newitem = new ItemStack('minecraft:paper')
            newitem.nameTag = `${arrow + 1}`
            container.setItem(1, newitem)
        }
        for (const recipe of crystalRec) {
            if (tag == undefined) {
                if (input && input.typeId == recipe.item && (!output || output && output.typeId == recipe.output && output.amount < 64)) {
                    entity.setDynamicProperty("dustveyn_ef:tag_nc", "ef_nc:" + input.typeId)
                    entity.setDynamicProperty("dustveyn_ef:arrowMax", recipe.max)
                }
            };
            if (tag == recipe.tag) {
                if (input && input.typeId == recipe.item) {
                    if (input.amount > 1) {
                        input.amount--
                        container.setItem(0, input)
                    } else { container.setItem(0, undefined) }
                    entity.setDynamicProperty("dustveyn_ef:arrowTick", tick + 1)
                };
                if (tick == max) {
                    container.setItem(2, !output ? new ItemStack(recipe.output) : output.amount < 64 ? ((output.amount++), output) : output);
                    entity.removeTag(recipe.tag)
                    entity.setDynamicProperty("dustveyn_ef:arrowTick", 0)
                    entity.setDynamicProperty("dustveyn_ef:arrowMax", 0)
                    entity.setDynamicProperty("dustveyn_ef:tag_nc", undefined)
                }
            }
        }
        let newdisplay = new ItemStack("minecraft:paper")
        newdisplay.nameTag = `§r${tick}/${max}`
        container.setItem(3, newdisplay)
    };
    if (id === "dustveyn_ef:compressorbreaking") {
        const inv = entity.getComponent(EntityComponentTypes.Inventory)
        const tick = entity.getDynamicProperty("dustveyn_ef:arrowTick") ?? 0
        const tag = entity.getDynamicProperty("dustveyn_ef:tag_nc")
        if (!inv) return
        const container = inv.container
        const slots = [0, 2]
        for (const slot of slots) {
            if (container.getItem(slot)) {
                entity.dimension.spawnItem(container.getItem(slot), entity.location)
            }
        }
        for (const r of crystalRec) {
            if (tag == r.tag) {
                spawnLargeAmountOfItems(entity, r.item, tick, entity.location)
            }
        }
        entity.remove()
    }
})

function spawnLargeAmountOfItems(target, itemIdentifier, totalAmount, location) {
    const maxStackSize = 64;
    let remainingAmount = totalAmount;
    while (remainingAmount > 0) {
        const amountToSpawn = Math.min(remainingAmount, maxStackSize);
        const itemStack = new ItemStack(itemIdentifier, amountToSpawn);
        target.dimension.spawnItem(itemStack, location);
        remainingAmount -= amountToSpawn;
    }
}