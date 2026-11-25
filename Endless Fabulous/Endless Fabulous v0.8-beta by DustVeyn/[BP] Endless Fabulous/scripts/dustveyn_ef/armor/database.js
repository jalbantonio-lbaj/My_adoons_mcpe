import { TicksPerSecond } from "@minecraft/server";

class database {
    static addEffect(target, effect, timer, amplifier, particles) {
        target.addEffect(effect, TicksPerSecond * timer, {
            amplifier: amplifier,
            showParticles: particles
        })
    }
}

export { database }