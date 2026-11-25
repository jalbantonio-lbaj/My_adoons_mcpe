import { world, system, ItemStack, EnchantmentTypes } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const ENCHANTS = [
    { id: "sharpness",              label: "Sharpness",               max: 5,  icon: "textures/items/diamond_sword",      category: "Sword" },
    { id: "smite",                  label: "Smite",                   max: 5,  icon: "textures/items/diamond_sword",      category: "Sword" },
    { id: "bane_of_arthropods",     label: "Bane of Arthropods",      max: 5,  icon: "textures/items/diamond_sword",      category: "Sword" },
    { id: "knockback",              label: "Knockback",               max: 2,  icon: "textures/items/diamond_sword",      category: "Sword" },
    { id: "fire_aspect",            label: "Fire Aspect",             max: 2,  icon: "textures/items/diamond_sword",      category: "Sword" },
    { id: "looting",                label: "Looting",                 max: 3,  icon: "textures/items/diamond_sword",      category: "Sword" },
    { id: "efficiency",             label: "Efficiency",              max: 5,  icon: "textures/items/diamond_pickaxe",    category: "Tools" },
    { id: "silk_touch",             label: "Silk Touch",              max: 1,  icon: "textures/items/diamond_pickaxe",    category: "Tools" },
    { id: "fortune",                label: "Fortune",                 max: 3,  icon: "textures/items/diamond_pickaxe",    category: "Tools" },
    { id: "power",                  label: "Power",                   max: 5,  icon: "textures/items/bow_pulling_0",      category: "Bow" },
    { id: "punch",                  label: "Punch",                   max: 2,  icon: "textures/items/bow_pulling_0",      category: "Bow" },
    { id: "flame",                  label: "Flame",                   max: 1,  icon: "textures/items/bow_pulling_0",      category: "Bow" },
    { id: "infinity",               label: "Infinity",                max: 1,  icon: "textures/items/bow_pulling_0",      category: "Bow" },
    { id: "protection",             label: "Protection",              max: 4,  icon: "textures/items/diamond_chestplate", category: "Armor" },
    { id: "fire_protection",        label: "Fire Protection",         max: 4,  icon: "textures/items/diamond_chestplate", category: "Armor" },
    { id: "blast_protection",       label: "Blast Protection",        max: 4,  icon: "textures/items/diamond_chestplate", category: "Armor" },
    { id: "projectile_protection",  label: "Projectile Protection",   max: 4,  icon: "textures/items/diamond_chestplate", category: "Armor" },
    { id: "thorns",                 label: "Thorns",                  max: 3,  icon: "textures/items/diamond_chestplate", category: "Armor" },
    { id: "feather_falling",        label: "Feather Falling",         max: 4,  icon: "textures/items/diamond_boots",      category: "Armor" },
    { id: "depth_strider",          label: "Depth Strider",           max: 3,  icon: "textures/items/diamond_boots",      category: "Armor" },
    { id: "frost_walker",           label: "Frost Walker",            max: 2,  icon: "textures/items/diamond_boots",      category: "Armor" },
    { id: "respiration",            label: "Respiration",             max: 3,  icon: "textures/items/diamond_helmet",     category: "Armor" },
    { id: "aqua_affinity",          label: "Aqua Affinity",           max: 1,  icon: "textures/items/diamond_helmet",     category: "Armor" },
    { id: "mending",                label: "Mending",                 max: 1,  icon: "textures/items/book_enchanted",     category: "Universal" },
    { id: "unbreaking",             label: "Unbreaking",              max: 3,  icon: "textures/items/book_enchanted",     category: "Universal" },
    { id: "curse_of_vanishing",     label: "Curse of Vanishing",      max: 1,  icon: "textures/items/book_enchanted",     category: "Universal" },
    { id: "curse_of_binding",       label: "Curse of Binding",        max: 1,  icon: "textures/items/book_enchanted",     category: "Universal" },
    { id: "loyalty",                label: "Loyalty",                 max: 3,  icon: "textures/items/trident",            category: "Trident" },
    { id: "impaling",               label: "Impaling",                max: 5,  icon: "textures/items/trident",            category: "Trident" },
    { id: "riptide",                label: "Riptide",                 max: 3,  icon: "textures/items/trident",            category: "Trident" },
    { id: "channeling",             label: "Channeling",              max: 1,  icon: "textures/items/trident",            category: "Trident" },
    { id: "luck_of_the_sea",        label: "Luck of the Sea",         max: 3,  icon: "textures/items/fishing_rod_uncast", category: "Fishing" },
    { id: "lure",                   label: "Lure",                    max: 3,  icon: "textures/items/fishing_rod_uncast", category: "Fishing" },
    { id: "multishot",              label: "Multishot",               max: 1,  icon: "textures/items/crossbow_standby",   category: "Crossbow" },
    { id: "piercing",               label: "Piercing",                max: 4,  icon: "textures/items/crossbow_standby",   category: "Crossbow" },
    { id: "quick_charge",           label: "Quick Charge",            max: 3,  icon: "textures/items/crossbow_standby",   category: "Crossbow" },
    { id: "density",                label: "Density",                 max: 5,  icon: "textures/items/mace",               category: "Mace" },
    { id: "breach",                 label: "Breach",                  max: 4,  icon: "textures/items/mace",               category: "Mace" },
    { id: "wind_burst",             label: "Wind Burst",              max: 3,  icon: "textures/items/mace",               category: "Mace" },
];

const CATEGORIES = [...new Set(ENCHANTS.map(e => e.category))];

function toRoman(num) {
    const map = { 1:"I", 2:"II", 3:"III", 4:"IV", 5:"V" };
    return map[num] || String(num);
}

function giveEnchantedBook(player, enchantId, level) {
    try {
        const book = new ItemStack("minecraft:enchanted_book", 1);
        const enchComp = book.getComponent("enchantable");

        if (!enchComp) {
            player.sendMessage("§c[EnchantBook] §fCould not get enchantable component!");
            return;
        }

        const enchType = EnchantmentTypes.get(enchantId);
        if (!enchType) {
            player.sendMessage("§c[EnchantBook] §fUnknown enchantment: §e" + enchantId);
            return;
        }

        enchComp.addEnchantment({ type: enchType, level: level });

        const inv = player.getComponent("inventory");
        if (inv && inv.container) {
            inv.container.addItem(book);
            player.sendMessage("§6[EnchantBook] §fGiven: §e" + (ENCHANTS.find(e => e.id === enchantId)?.label ?? enchantId) + " " + toRoman(level) + " §fbook!");
        }
    } catch (err) {
        player.sendMessage("§c[EnchantBook] Error: " + err);
    }
}

function showLevelMenu(player, enchant, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§l" + enchant.label);
        gui.body("§7Category: §e" + enchant.category + "\n§7Max Level: §e" + toRoman(enchant.max) + "\n\n§7Select level:");

        for (let lvl = 1; lvl <= enchant.max; lvl++) {
            gui.button("Level " + toRoman(lvl) + (lvl === enchant.max ? " §7(MAX)" : ""), enchant.icon);
        }
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then(res => {
            if (res.canceled) return;
            if (res.selection === enchant.max) {
                system.run(() => showCategoryEnchants(player, enchant.category, backToMain));
                return;
            }
            system.run(() => {
                giveEnchantedBook(player, enchant.id, res.selection + 1);
                showLevelMenu(player, enchant, backToMain);
            });
        });
    });
}

function showCategoryEnchants(player, category, backToMain) {
    system.run(() => {
        const list = ENCHANTS.filter(e => e.category === category);
        const gui = new ActionFormData();
        gui.title("§l" + category);
        gui.body("§7Select an enchantment:");

        for (const enchant of list) {
            gui.button("§8" + enchant.label + "\n§7Max: §e" + toRoman(enchant.max), enchant.icon);
        }
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then(res => {
            if (res.canceled) return;
            if (res.selection === list.length) {
                system.run(() => showEnchantBookMenu(player, backToMain));
                return;
            }
            system.run(() => {
                const enchant = list[res.selection];
                if (enchant.max === 1) {
                    giveEnchantedBook(player, enchant.id, 1);
                    showCategoryEnchants(player, category, backToMain);
                } else {
                    showLevelMenu(player, enchant, backToMain);
                }
            });
        });
    });
}

export function showEnchantBookMenu(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lEnchantment Books");
        gui.body("§7Select a category:");

        const categoryIcons = {
            "Sword":     "textures/items/diamond_sword",
            "Tools":     "textures/items/diamond_pickaxe",
            "Bow":       "textures/items/bow_pulling_0",
            "Armor":     "textures/items/diamond_chestplate",
            "Universal": "textures/items/book_enchanted",
            "Trident":   "textures/items/trident",
            "Fishing":   "textures/items/fishing_rod_uncast",
            "Crossbow":  "textures/items/crossbow_standby",
            "Mace":      "textures/items/mace",
        };

        for (const cat of CATEGORIES) {
            const count = ENCHANTS.filter(e => e.category === cat).length;
            gui.button("§8" + cat + "\n§7" + count + " enchants", categoryIcons[cat] ?? "textures/items/book_enchanted");
        }
        gui.button("§8Back to Main", "textures/ui/undoArrow");

        gui.show(player).then(res => {
            if (res.canceled) return;
            if (res.selection === CATEGORIES.length) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => showCategoryEnchants(player, CATEGORIES[res.selection], backToMain));
        });
    });
}