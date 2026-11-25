import { world, system, ItemStack } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import { recipes, recipescrystal } from "./recipes";

world.afterEvents.itemUse.subscribe(({ itemStack: item, source: target }) => {
    if (!item || item.typeId !== "dustveyn_ef:recipe_book") return
    const form = new CustomForm(target, { translate: "dustveyn_ef.recipe_book.name" })
        .button({ translate: "dustveyn_ef.neutronium_compressor.name" }, () => {
            form.close()
            system.run(() => openNeutronium(target))
        })
        .button({ translate: "dustveyn_ef.extreme_crafting_table.name" }, () => {
            form.close()
            system.run(() => openRecipe(target))
        })
    form.show().catch(e => console.error(e))
})

function openRecipe(target) {
    const form = new CustomForm(target, { translate: "dustveyn_ef.extreme_crafting_table.name" })
    recipes.forEach((recipe, index) => {
        form.label({ translate: recipe.name })
        form.spacer()
        form.image(recipe.image, '91ef2720-e4ef-4d88-b265-ea2f2b6a8912', { width: 1 })
        if (index < recipes.length - 1) {
            form.divider()
        }
    })
    form.show()
}

function openNeutronium(target) {
    const form = new CustomForm(target, { translate: "dustveyn_ef.neutronium_compressor.name" })
    form.spacer()
    recipescrystal.forEach((recipe, index) => {
        form.label({ translate: `%${recipe.name}` + ": " + " " + recipe.amount })
        if (index < recipescrystal.length - 1) {
            form.divider()
        }
    })
    form.show()
}

// world.afterEvents.playerSpawn.subscribe(({ initialSpawn: init, player }) => {
//     if (player.getDynamicProperty("dustveyn_ef:guide_book") == false) {
//         player.dimension.spawnItem(new ItemStack("dustveyn_ef:recipe_book"), player.location)
//         player.setDynamicProperty("dustveyn_ef:guide_book", true)
//     }
// })