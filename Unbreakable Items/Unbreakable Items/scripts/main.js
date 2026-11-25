import { CommandPermissionLevel, CustomCommandOrigin, CustomCommandSource, CustomCommandStatus, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui"

const version = 21
const message = `§eThanks for installing §6Unbreakable Items V${version} by TrayePlays\n§eTry out the updated command: §d/unbreakable`

/** @type {item[]} */
let breakables = []
system.runInterval(() => {
    breakables = JSON.parse(world.getDynamicProperty("traye:breakableItems") ?? "[]") || [];
})

system.run(() => {
    if (world?.getDynamicProperty("traye:breakableItems") == undefined) world.setDynamicProperty("traye:breakableItems", "[]");
})

world.afterEvents.playerSpawn.subscribe(({ initialSpawn }) => {
    if (initialSpawn && world.getPlayers().length == 1) system.runTimeout(() => world.sendMessage(message), 60);
})

world.afterEvents.playerInventoryItemChange.subscribe(({ player, slot, itemStack }) => {
    if (itemStack) setBreakablity(player, slot, itemStack);
})

world.afterEvents.playerHotbarSelectedSlotChange.subscribe(({ player, newSlotSelected, itemStack }) => {
    if (itemStack) setBreakablity(player, newSlotSelected, itemStack);
})

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    /** @type {import("@minecraft/server").CustomCommand} */
    const customCommand = {
        name: "traye:unbreakable",
        description: "Opens configuration menu for the Unbreakable Items Addon",
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: false,
    }
    customCommandRegistry.registerCommand(customCommand, unbreakableCommand)
})

/** @param {Player} player  */
function setInvBreakablity(player) {
    const inv = player.getComponent("inventory");
    if (!inv) return;
    for (let i = 0; i < inv.inventorySize; i++) {
        const item = inv.container.getItem(i);
        if (!item) continue;
        setBreakablity(player, i, item);
    }
}

function setBreakablity(player, slot, itemStack) {
    const unbreakableOn = world.getDynamicProperty("traye:unbreakableOn") ?? true;
    const unbreakable = itemStack.clone();
    const dura = unbreakable?.getComponent("durability");
    if (dura?.isValid) {
        if (dura.unbreakable == unbreakableOn) return;
        dura.unbreakable = unbreakableOn;
        if (breakables?.map(b => b?.typeId)?.includes(itemStack?.typeId)) {
            if (dura.unbreakable) dura.unbreakable = false;
        }
        player.getComponent("inventory").container.setItem(slot, unbreakable);
    }
}

/** @param {CustomCommandOrigin} origin */
function unbreakableCommand(origin) {
    system.run(() => {
        if (origin.sourceType == CustomCommandSource.Entity && origin?.sourceEntity?.typeId == "minecraft:player") {
            const player = origin.sourceEntity;
            openUnbreakableForm(player);
            return {
                status: CustomCommandStatus.Success
            };
        }
        else {
            return {
                status: CustomCommandStatus.Failure
            };
        }
    })
}

async function openUnbreakableForm(player) {
    const form = new ActionFormData()
    const unbreakable = world.getDynamicProperty("traye:unbreakableOn") ?? true;
    form.title("Unbreakable Items");
    form.header("§6Unbreakable Items");
    form.label(`      §eBy TrayePlays §8§l| §r§aV${version} BETA`);
    form.button(`${unbreakable ? "Dea" : "A"}ctivate Unbreakable Items`, `textures/items/${unbreakable ? "gold" : "netherite"}_sword`);
    form.button("Deactivate for Item", "textures/items/diamond_sword");
    form.button("Report Issue", "textures/ui/Caution");
    const { selection, canceled } = await form.show(player);
    if (canceled) return;
    if (selection == 0) {
        world.setDynamicProperty("traye:unbreakableOn", !unbreakable);
        for (const player of world.getPlayers()) {
            setInvBreakablity(player);
        }
    }
    if (selection == 1) openBreakableItemsForm(player);
    if (selection == 2) player.sendMessage("Join the discord: §9dsc.gg/traye");

}

class item {
    /** @type {string} string of the item */
    typeId
}
async function openBreakableItemsForm(player) {
    const form = new ActionFormData()
    form.title("List of Breakables")
    form.button("Add Item", "textures/ui/color_plus")
    const raw = world.getDynamicProperty("traye:breakableItems")
    /** @type {item[]} */
    const data = JSON.parse(raw)
    for (const item of data) {
        form.button(item.typeId)
    }
    const { selection, canceled } = await form.show(player)
    if (canceled) return
    if (selection == 0) openAddItemForm(player)
    else {
        openRemoveItemForm(player, data[selection - 1].typeId)
    }
}

async function openRemoveItemForm(player, typeId) {
    const form = new ActionFormData();
    form.title("Remove Item?")
    form.button("Remove")
    form.button("Back")
    const raw = world.getDynamicProperty("traye:breakableItems")
    /** @type {item[]} */
    let data = JSON.parse(raw)
    const { selection, canceled } = await form.show(player)
    if (selection == 0) {
        data = data.filter(a => a.typeId != typeId)
        world.setDynamicProperty("traye:breakableItems", JSON.stringify(data))
        player.sendMessage(`§cRemoved §6${typeId}`)
        player.playSound("note.bell")
    }
}

function checkIfItem(typeId) {
    let error = true
    try {
        const item = new ItemStack(typeId)
        item.getComponent("durability").isValid
    } catch (e) {
        error = false;
    }
    return error
}


async function openAddItemForm(player) {
    const form = new ModalFormData()
    form.title("Add Item")
    form.textField("Item Id", "EX: minecraft:stone_sword")
    const raw = world.getDynamicProperty("traye:breakableItems")
    /** @type {item[]} */
    const data = JSON.parse(raw)
    form.submitButton("Add")
    const { formValues, canceled } = await form.show(player)
    if (canceled) return
    else {
        const typeId = formValues[0]
        if (checkIfItem(typeId) && data.find(a => a.typeId == typeId) == undefined && typeId.includes(":")) {
            const itemPushing = new item()
            itemPushing.typeId = typeId
            data.push(itemPushing)
            world.setDynamicProperty("traye:breakableItems", JSON.stringify(data))
            player.playSound("note.bell")
            player.sendMessage(`§aAdded §6${typeId} §asuccessfully!`)
        }
        else if (typeId.includes(":")) {
            player.playSound("note.bass")
            player.sendMessage(`§6${typeId} §chas to include a colon!`)
        }
        else if (data.find(a => a.typeId == typeId) != undefined) {
            player.playSound("note.bass")
            player.sendMessage(`§6${typeId} §cis already on the list!`)
        }
        else {
            player.playSound("note.bass")
            player.sendMessage(`§6${typeId} §cisn't a item or doesn't have durability`)
        }
    }
}
