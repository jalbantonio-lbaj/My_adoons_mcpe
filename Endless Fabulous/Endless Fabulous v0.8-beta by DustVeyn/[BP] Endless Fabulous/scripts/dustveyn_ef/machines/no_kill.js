import { world } from '@minecraft/server'

const no_kill = [ "dustveyn_ef:extreme_crafting_inv", "dustveyn_ef:neutron_collector_inv", "dustveyn_ef:neutronium_compressor_inv" ]

world.beforeEvents.entityHurt.subscribe((event) => {
    const { hurtEntity: entity } = event
    if (!entity) return
    if (no_kill.includes(entity.typeId)) {
        event.cancel = true
    }
})