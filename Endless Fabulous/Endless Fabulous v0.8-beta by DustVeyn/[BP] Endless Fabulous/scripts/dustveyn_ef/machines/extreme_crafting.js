import { EntityComponentTypes, ItemStack, system, world } from '@minecraft/server'
import { recipes } from './recipes.js'


world.afterEvents.playerPlaceBlock.subscribe(({ block, dimension }) => {
    if (!block || block.getItemStack().typeId !== "dustveyn_ef:extreme_crafting_table") return
    let entity = dimension.spawnEntity("dustveyn_ef:extreme_crafting_inv", block.bottomCenter())
    entity.nameTag = "dustveyn_ef:extreme_crafting_table"
})

system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity: target }) => {
    if (id !== "dustveyn_ef:breaking_extreme") return
    const inv = target.getComponent(EntityComponentTypes.Inventory)
    if (!inv) return
    const container = inv.container
    for (let i = 0; i < 81; i++) {
        const item = container.getItem(i)
        item && target.dimension.spawnItem(item, target.location)
    }
    target.remove()
})

const lastCraftMap = new WeakMap();

const layout = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => r * 9 + c)
);

function matchesRecipe(grid, recipe) {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const wantChar = recipe.pattern[r][c] || " ";
            const haveType = grid[r][c];
            if (wantChar === " ") {
                if (haveType !== null && haveType !== undefined) return false;
            } else {
                if (haveType !== recipe.keys[wantChar] && (!Array.isArray(recipe.keys[wantChar]) || !recipe.keys[wantChar].includes(haveType))) return false;
            }
        }
    }
    return true;
}

system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity: entity }) => {
    if (id !== "dustveyn_ef:extreme_crafting") return;
    const inv = entity.getComponent(EntityComponentTypes.Inventory)?.container;
    if (!inv) return;
    const outputItem = inv.getItem(81);
    const fullSlots = [];
    const grid = layout.map(row =>
        row.map(idx => {
            const item = inv.getItem(idx);
            if (item) fullSlots.push(idx);
            return item?.typeId ?? null;
        })
    );
    let matched = null;
    for (const recipe of recipes) {
        if (matchesRecipe(grid, recipe)) {
            matched = recipe;
            break;
        }
    }
    const last = lastCraftMap.get(entity);
    if (!outputItem && last?.recipe) {
        for (const idx of last.slots) {
            let item = inv.getItem(idx);
            if (item?.amount === 1) {
                inv.setItem(idx, undefined);
            } else if (item) {
                item.amount--;
                inv.setItem(idx, item);
            }
        }
        lastCraftMap.delete(entity);
        return;
    }
    if (!matched && outputItem && last?.recipe?.result?.item === outputItem.typeId) {
        inv.setItem(81, new ItemStack("minecraft:air"));
        lastCraftMap.delete(entity);
        return;
    }
    if (!matched) {
        return;
    }
    if (outputItem && outputItem.typeId !== matched.result.item) {
        return;
    }
    if (outputItem?.typeId === matched.result.item && matchesRecipe(grid, matched)) {
        return;
    }
    inv.setItem(81, new ItemStack(matched.result.item, matched.result.amount));
    lastCraftMap.set(entity, { recipe: matched, slots: fullSlots });
});
