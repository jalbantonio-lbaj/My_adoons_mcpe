import { EntityComponentTypes, EquipmentSlot, GameMode, Player, system, world } from "@minecraft/server";

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: attacker, hitEntity: target }) => {
    if (!(attacker instanceof Player)) return;
    const item = attacker.getComponent(EntityComponentTypes.Equippable)?.getEquipment(EquipmentSlot.Mainhand);
    if (!item || item.typeId !== "dustveyn_ef:sword_of_the_death") return;
    if (target.getComponent(EntityComponentTypes.TypeFamily).hasTypeFamily("inanimate")) return
    if (target instanceof Player) {
        const gameMode = target.getGameMode();
        if (gameMode === GameMode.Creative || gameMode === GameMode.Adventure) {
            target.setGameMode(GameMode.Survival);
            target.kill();
            system.runTimeout(() => {
                target.setGameMode(gameMode);
            }, 2);
            return;
        }
        target.kill();
        return;
    }
    target.kill();
});

world.afterEvents.itemUse.subscribe(({ source: p, itemStack: i }) => {
    if (!i || i.typeId !== "dustveyn_ef:sword_of_the_death") return
    let entities = p.dimension.getEntities({ location: p.location, maxDistance: 15 })
    for (const entity of entities) {
        if (entity.id === p.id) continue;
        if (entity.getComponent(EntityComponentTypes.TypeFamily)?.hasTypeFamily("inanimate")) continue;
        if (entity instanceof Player) {
            const gameMode = entity.getGameMode();
            if (gameMode === GameMode.Creative || gameMode === GameMode.Adventure) {
                entity.setGameMode(GameMode.Survival)
                entity.kill()
                system.runTimeout(() => {
                    entity.setGameMode(gameMode)
                }, 2)
                return
            }
            entity.kill()
            return
        }
        entity.kill()
    }
})