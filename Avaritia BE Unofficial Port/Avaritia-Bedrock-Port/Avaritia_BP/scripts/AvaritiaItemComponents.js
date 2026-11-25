import { system, world, EquipmentSlot, EnchantmentTypes  } from '@minecraft/server'

system.beforeEvents.startup.subscribe((Event) => {
    Event.itemComponentRegistry.registerCustomComponent("avaritia:on_meatballs_eaten", {
        onConsume(useEvent) {
            const player = useEvent.source;
            if (!player) return;

            player.addEffect("minecraft:regeneration", 6000, { amplifier: 4 });
            player.addEffect("minecraft:absorption", 24000, { amplifier: 10 });
            player.addEffect("minecraft:fire_resistance", 24000, { amplifier: 1 });
            player.addEffect("minecraft:night_vision", 24000, { amplifier: 1})
        }
    });
    
    Event.itemComponentRegistry.registerCustomComponent("avaritia:on_stew_eaten", {
        onConsume(useEvent) {
            const player = useEvent.source;
            if (!player) return;
            
            player.addEffect("minecraft:regeneration", 6000, { amplifier: 4 });
            player.addEffect("minecraft:health_boost", 24000, { amplifier: 4 });
            player.addEffect("minecraft:strength", 12000, { amplifier: 3 });
            player.addEffect("minecraft:resistance", 24000, { amplifier: 2 });
        }
    });
    Event.itemComponentRegistry.registerCustomComponent("avaritia:infinity_bow_handler", {
        onUse(event) {
            const player = event.source;
            const equipment = player?.getComponent("minecraft:equippable");
            const mainHand = equipment?.getEquipmentSlot(EquipmentSlot.Mainhand);
            const itemStack = mainHand?.getItem();
            const enchantable = itemStack?.getComponent("minecraft:enchantable");
            const infinityType = EnchantmentTypes.get("infinity");
            if (!enchantable?.hasEnchantment(infinityType)) {
                enchantable?.addEnchantment({
                    type: infinityType,
                    level: 1
                });
                mainHand.setItem(itemStack);
            }
        }
    });
});