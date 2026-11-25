import { world, system, ItemStack, EnchantmentTypes, EquipmentSlot } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const STATE_KEY = "deathBackpackOn";
const STORE_KEY = "deathBackpackItems";
const ARMOR_SLOTS = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];

const snapshots = new Map();

function isEnabled(player) {
    try { return player.getDynamicProperty(STATE_KEY) === true; } catch (_) { return false; }
}

function setEnabled(player, on) {
    try { player.setDynamicProperty(STATE_KEY, on); } catch (_) {}
}

function getStored(player) {
    try {
        const raw = player.getDynamicProperty(STORE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
}

function setStored(player, items) {
    try {
        if (!items || items.length === 0) player.setDynamicProperty(STORE_KEY, undefined);
        else player.setDynamicProperty(STORE_KEY, JSON.stringify(items));
    } catch (_) {}
}

function serializeItem(item) {
    const data = { t: item.typeId, a: item.amount };
    try { if (item.nameTag) data.n = item.nameTag; } catch (_) {}
    try {
        const lore = item.getLore();
        if (lore && lore.length > 0) data.l = lore;
    } catch (_) {}
    try {
        const dur = item.getComponent("durability");
        if (dur && dur.damage > 0) data.d = dur.damage;
    } catch (_) {}
    try {
        const ench = item.getComponent("enchantable");
        if (ench) {
            const list = ench.getEnchantments().map(e => ({ i: e.type.id, v: e.level }));
            if (list.length > 0) data.e = list;
        }
    } catch (_) {}
    return data;
}

function deserializeItem(data) {
    try {
        const item = new ItemStack(data.t, data.a);
        if (data.n) item.nameTag = data.n;
        if (data.l) item.setLore(data.l);
        if (data.d) {
            const dur = item.getComponent("durability");
            if (dur) dur.damage = Math.min(data.d, dur.maxDurability);
        }
        if (data.e) {
            const ench = item.getComponent("enchantable");
            if (ench) {
                for (const e of data.e) {
                    const type = EnchantmentTypes.get(e.i);
                    if (type && ench.canAddEnchantment({ type, level: e.v })) ench.addEnchantment({ type, level: e.v });
                }
            }
        }
        return item;
    } catch (_) { return null; }
}

function takeSnapshot(player) {
    try {
        const items = [];
        const container = player.getComponent("inventory")?.container;
        if (container) {
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item) items.push(serializeItem(item));
            }
        }
        const equip = player.getComponent("equippable");
        if (equip) {
            for (const slot of ARMOR_SLOTS) {
                const item = equip.getEquipment(slot);
                if (item) items.push(serializeItem(item));
            }
        }
        snapshots.set(player.id, items);
    } catch (_) {}
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        if (isEnabled(player)) takeSnapshot(player);
    }
}, 20);

world.afterEvents.entityDie.subscribe((ev) => {
    const player = ev.deadEntity;
    if (!player || player.typeId !== "minecraft:player") return;
    if (!isEnabled(player)) return;

    const items = snapshots.get(player.id);
    if (!items || items.length === 0) return;

    const dimension = player.dimension;
    const loc = player.location;

    const existing = getStored(player);
    setStored(player, existing.concat(items));
    snapshots.delete(player.id);

    system.runTimeout(() => {
        try {
            const dropped = dimension.getEntities({ location: loc, maxDistance: 5, type: "minecraft:item" });
            for (const entity of dropped) {
                try { entity.remove(); } catch (_) {}
            }
        } catch (_) {}
    }, 2);

    player.sendMessage("§6[Backpack] §fYour items were saved! Open §eDeath Backpack §fto claim them.");
}, { entityTypes: ["minecraft:player"] });

function claimAll(player) {
    const stored = getStored(player);
    if (stored.length === 0) {
        player.sendMessage("§c[Backpack] Nothing to claim.");
        return;
    }

    const container = player.getComponent("inventory")?.container;
    if (!container) return;

    let given = 0;
    let dropped = 0;
    const failed = [];

    for (const data of stored) {
        const item = deserializeItem(data);
        if (!item) continue;
        if (container.emptySlotsCount > 0) {
            container.addItem(item);
            given++;
        } else {
            try {
                player.dimension.spawnItem(item, player.location);
                dropped++;
            } catch (_) { failed.push(data); }
        }
    }

    setStored(player, failed);
    player.sendMessage("§a[Backpack] §fClaimed §e" + given + " §fstacks" + (dropped > 0 ? " §7(" + dropped + " dropped at your feet - inventory was full)" : "") + ".");
}

export function showDeathBackpack(player, backToMain) {
    system.run(() => {
        const on = isEnabled(player);
        const stored = getStored(player);

        const gui = new ActionFormData();
        gui.title("§lDeath Backpack");
        gui.body(
            "§7Status: " + (on ? "§aENABLED" : "§cDISABLED") + "\n" +
            "§7Stored stacks: §e" + stored.length + "\n\n" +
            "§7When enabled, your items are saved on death instead of dropping.\n" +
            "§8Enchantments and durability are kept."
        );
        gui.button(on ? "§8Disable Backpack" : "§8Enable Backpack", on ? "textures/ui/cancel" : "textures/ui/check");
        gui.button("§8Claim Items\n§7" + stored.length + " stacks waiting", "textures/ui/icon_recipe_construction");
        gui.button("§8Discard Stored Items", "textures/ui/trash");
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 3) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => {
                if (res.selection === 0) {
                    setEnabled(player, !on);
                    if (!on) takeSnapshot(player);
                    player.sendMessage(on ? "§c[Backpack] Disabled. Items will drop normally." : "§a[Backpack] Enabled! Your items are now protected on death.");
                    showDeathBackpack(player, backToMain);
                    return;
                }
                if (res.selection === 1) {
                    claimAll(player);
                    showDeathBackpack(player, backToMain);
                    return;
                }
                if (res.selection === 2) {
                    setStored(player, []);
                    player.sendMessage("§c[Backpack] Stored items discarded.");
                    showDeathBackpack(player, backToMain);
                }
            });
        });
    });
}
