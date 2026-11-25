import { GameMode, ItemComponentTypes, ItemStack, world } from "@minecraft/server";

world.afterEvents.playerStartBreakingBlock.subscribe(({ block, heldItemStack: item, blockPermutation: breaking }) => {
    const { x, y, z } = block.location
    if (breaking.type.id == "minecraft:bedrock" && item.typeId == "dustveyn_ef:reality_shatterer") {
        block.dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`)
        block.dimension.spawnItem(new ItemStack("minecraft:bedrock"), block.center())
    }
})

const fortunes = [
    {
        ids: [
            "minecraft:iron_ore",
            "minecraft:deepslate_iron_ore"
        ],
        output: "minecraft:raw_iron"
    },
    {
        ids: [
            "minecraft:gold_ore",
            "minecraft:deepslate_gold_ore"
        ],
        output: "minecraft:raw_gold"
    },
    {
        ids: [
            "minecraft:copper_ore",
            "minecraft:deepslate_copper_ore"
        ],
        output: "minecraft:raw_copper"
    },
    {
        ids: [
            "minecraft:diamond_ore",
            "minecraft:deepslate_diamond_ore"
        ],
        output: "minecraft:diamond"
    },
    {
        ids: [
            "minecraft:redstone_ore",
            "minecraft:deepslate_redstone_ore"
        ],
        output: "minecraft:redstone"
    },
    {
        ids: [
            "minecraft:emerald_ore",
            "minecraft:deepslate_emerald_ore"
        ],
        output: "minecraft:emerald"
    },
    {
        ids: [
            "minecraft:coal_ore",
            "minecraft:deepslate_coal_ore"
        ],
        output: "minecraft:coal"
    },
    {
        ids: [
            "minecraft:lapis_ore",
            "minecraft:deepslate_lapis_ore"
        ],
        output: "minecraft:lapis_lazuli"
    },
    {
        ids: [
            "minecraft:quartz_ore"
        ],
        output: "minecraft:quartz"
    },
    {
        ids: [
            "minecraft:nether_gold_ore"
        ],
        output: "minecraft:gold_nugget"
    }
]

world.afterEvents.playerBreakBlock.subscribe(({ brokenBlockPermutation: breaking, block, itemStackAfterBreak: item, dimension, player }) => {
    if (!item || item.typeId !== "dustveyn_ef:reality_shatterer") return
    let enchanted = item.getComponent(ItemComponentTypes.Enchantable)
    if (!enchanted.hasEnchantment("silk_touch") && player.getGameMode() == GameMode.Survival) {
        for (const f of fortunes) {
            for (const id of f.ids) {
                if (breaking.type.id == id) {
                    if (Math.random() < 0.3) {
                        dimension.spawnItem(new ItemStack(f.output, Math.floor(Math.random() * 10) + 1), block.center())
                    }
                }
            }
        }
    }
})

const invalidBlocks = [
    "minecraft:air",
    "minecraft:water",
    "minecraft:lava",
    "minecraft:flowing_water",
    "minecraft:flowing_lava",
    "minecraft:portal",
    "minecraft:end_portal",
    "minecraft:end_portal_frame",
    "minecraft:vault",
    "minecraft:mob_spawner",
    "minecraft:trial_spawner"
]

world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation: breaking, itemStackAfterBreak: item, dimension }) => {
    if (!breaking) return
    if (!item || item.typeId !== "dustveyn_ef:reality_shatterer_hammer") return
    const itemArray = {}
    for (let x = -3; x <= 3; x++) {
        for (let y = -3; y <= 3; y++) {
            for (let z = -3; z <= 3; z++) {
                const loc = {
                    x: block.location.x + x,
                    y: block.location.y + y,
                    z: block.location.z + z
                }
                const b = block.dimension.getBlock(loc)
                if (!b || b.isAir) continue;
                const typeId = b.typeId;
                if (!typeId || invalidBlocks.includes(typeId)) continue;
                b.setType("minecraft:air");
                itemArray[typeId] = (itemArray[typeId] ?? 0) + 1;
            }
        }
    }
    if (Object.keys(itemArray).length > 0) {
        const dropStack = new ItemStack("dustveyn_ef:matter_cluster");
        dropStack.setLore(Object.entries(itemArray).map(([id, count]) => `${id} = ${count}`));
        dimension.spawnItem(dropStack, block.center())
    }
})