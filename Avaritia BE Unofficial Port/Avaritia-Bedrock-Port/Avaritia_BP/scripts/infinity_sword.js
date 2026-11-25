import { world, EquipmentSlot } from "@minecraft/server";
import { MELEE_MESSAGES} from './constants';

function getRandomMessage(messages, victim, killer) {
    const randomIndex = Math.floor(Math.random() * messages.length);
    const randomPhrase = messages[randomIndex];
    return randomPhrase(victim, killer);
}

world.afterEvents.entityHitEntity.subscribe((eventData) => {
    const victim = eventData.hitEntity;
    const attacker = eventData.damagingEntity;

    if (!attacker?.getComponent("minecraft:equippable")) return;

    const equippableComponent = attacker.getComponent("minecraft:equippable");
    const equippable = victim.getComponent("minecraft:equippable");
    const mainHandItem = equippableComponent.getEquipment(EquipmentSlot.Mainhand);
    if (mainHandItem?.typeId === "avaritia:sword_of_the_cosmos") {
        
        const familyComponent = victim.getComponent("minecraft:type_family");
        if (familyComponent?.hasTypeFamily("inanimate")) return;
        
        const boots = equippable?.getEquipment(EquipmentSlot.Feet);
        const leggings = equippable?.getEquipment(EquipmentSlot.Legs);
        const breastplate = equippable?.getEquipment(EquipmentSlot.Chest);
        const helmet = equippable?.getEquipment(EquipmentSlot.Head);

        if (boots?.typeId === "avaritia:infinity_boots" && leggings?.typeId === "avaritia:infinity_pants" && (breastplate?.typeId === "avaritia:infinity_breastplate" || breastplate?.typeId === "avaritia:infinity_breastplate_winged") && helmet?.typeId === "avaritia:infinity_helmet") return;
        
        const healthComponent = victim.getComponent("minecraft:health");
        
        try {
            healthComponent?.setCurrentValue(0);
        } catch (error) {
            const exactvictim = world.getEntity(victim.id);
            try {
                exactvictim.kill();
            } catch (error) {
                exactvictim.remove();
            }
        }
        if (victim.typeId === "minecraft:player") {
            world.sendMessage(getRandomMessage(MELEE_MESSAGES, victim.name, attacker.name));
        }
    }
});
