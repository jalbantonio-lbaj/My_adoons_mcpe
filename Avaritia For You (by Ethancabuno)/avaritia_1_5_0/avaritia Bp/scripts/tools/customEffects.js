// Custom Effects UI (Angel136381) - copied into Avaritia. Shows ALL effects (vanilla + custom) on the HUD
// via the title "effects:" + ui/hud_screen.json, so custom effects share the same list / same corner as vanilla ones and do not overlap them.
// Test command: /c:custom_effect <player> <effect> [seconds] [level] ;  /c:custom_effect @s clear
// Note: do NOT enable together with the original "CUSTOM EFFECTS UI" pack (conflicting commands and conflicting ui/hud_screen.json).
import { CommandPermissionLevel, CustomCommandParamType, Player, system, world } from "@minecraft/server";

const EFFECTS_TITLE_FLAG = "effects:";
const VANILLA_EFFECT_LINE_FLAG = "_v_e";
const CUSTOM_EFFECT_LINE_FLAG = "_c_e";
const DEFAULT_DURATION_TICKS = 60 * 20;
const HUD_REFRESH_TICKS = 20;
const VANILLA_INFINITE_DURATION_TICKS = 20000000;
const CLEAR_EFFECT_ID = "clear";
const EFFECT_COMMAND_ENUM = "c:effect";
const PLAYER_EFFECTS_PROPERTY = "c:custom_effects";

let commandRegistered = false;

const VANILLA_EFFECTS = {
    speed: { texture: "textures/ui/speed_effect", name: "potion.moveSpeed" },
    slowness: { texture: "textures/ui/slowness_effect", name: "potion.moveSlowdown" },
    haste: { texture: "textures/ui/haste_effect", name: "potion.digSpeed" },
    mining_fatigue: { texture: "textures/ui/mining_fatigue_effect", name: "potion.digSlowDown" },
    strength: { texture: "textures/ui/strength_effect", name: "potion.damageBoost" },
    instant_health: { texture: "textures/avaritia/ui/effect_instant_health", name: "potion.heal" },
    instant_damage: { texture: "textures/avaritia/ui/effect_instant_damage", name: "potion.harm" },
    jump_boost: { texture: "textures/ui/jump_boost_effect", name: "potion.jump" },
    nausea: { texture: "textures/ui/nausea_effect", name: "potion.confusion" },
    regeneration: { texture: "textures/ui/regeneration_effect", name: "potion.regeneration" },
    resistance: { texture: "textures/ui/resistance_effect", name: "potion.resistance" },
    fire_resistance: { texture: "textures/ui/fire_resistance_effect", name: "potion.fireResistance" },
    water_breathing: { texture: "textures/ui/water_breathing_effect", name: "potion.waterBreathing" },
    invisibility: { texture: "textures/ui/invisibility_effect", name: "potion.invisibility" },
    blindness: { texture: "textures/ui/blindness_effect", name: "potion.blindness" },
    night_vision: { texture: "textures/ui/night_vision_effect", name: "potion.nightVision" },
    hunger: { texture: "textures/ui/hunger_effect", name: "potion.hunger" },
    weakness: { texture: "textures/ui/weakness_effect", name: "potion.weakness" },
    poison: { texture: "textures/ui/poison_effect", name: "potion.poison" },
    wither: { texture: "textures/ui/wither_effect", name: "potion.wither" },
    health_boost: { texture: "textures/ui/health_boost_effect", name: "potion.healthBoost" },
    absorption: { texture: "textures/ui/absorption_effect", name: "potion.absorption" },
    saturation: { texture: "textures/avaritia/ui/effect_saturation", name: "potion.saturation" },
    levitation: { texture: "textures/ui/levitation_effect", name: "potion.levitation" },
    slow_falling: { texture: "textures/ui/slow_falling_effect", name: "potion.slowFalling" },
    conduit_power: { texture: "textures/ui/conduit_power_effect", name: "potion.conduitPower" },
    bad_omen: { texture: "textures/ui/bad_omen_effect", name: "effect.badOmen" },
    darkness: { texture: "textures/ui/darkness_effect", name: "effect.darkness" },
    village_hero: { texture: "textures/ui/village_hero_effect", name: "effect.villageHero" },
    raid_omen: { texture: "textures/ui/raid_omen_effect", name: "effect.raid_omen" },
    trial_omen: { texture: "textures/ui/trial_omen_effect", name: "effect.trial_omen" },
    infested: { texture: "textures/ui/infested_effect", name: "effect.infested" },
    oozing: { texture: "textures/ui/oozing_effect", name: "effect.oozing" },
    weaving: { texture: "textures/ui/weaving_effect", name: "effect.weaving" },
    wind_charged: { texture: "textures/ui/wind_charged_effect", name: "effect.wind_charged" },
    breath_of_the_nautilus: { texture: "textures/ui/breath_of_the_nautilus_effect", name: "effect.customNautilus" }
};

/** The "UI" length of one character = its UTF-8 BYTE count (the HUD truncates strings by byte): "§" = 2, "∞" = 3, ASCII = 1. */
function getUiCharLength(char) {
    const cp = char.codePointAt(0);
    if (cp < 0x80) return 1;
    if (cp < 0x800) return 2;
    if (cp < 0x10000) return 3;
    return 4;
}

function getUiTextLength(text) {
    let length = 0;
    for (const char of String(text)) {
        length += getUiCharLength(char);
    }
    return length;
}

function fixedUiText(text, amount) {
    text = String(text);
    let result = "";

    for (const char of text) {
        if (getUiTextLength(result) + getUiCharLength(char) > amount) break;
        result += char;
    }

    return result + ",".repeat(amount - getUiTextLength(result));
}

function formatTime(ticks) {
    if (ticks === -1 || ticks >= VANILLA_INFINITE_DURATION_TICKS) return "∞";

    const totalSeconds = Math.max(0, Math.floor(ticks / 20));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function formatEffectName(id) {
    return id.replace("minecraft:", "").replaceAll("_", " ").replace(/^\w/, char => char.toUpperCase());
}

function getVanillaEffectData(id) {
    id = normalizeEffectId(id);
    return VANILLA_EFFECTS[id] ?? { texture: "textures/avaritia/ui/effect_unknown", name: formatEffectName(id) };
}

function getEffectDisplayName(id, manager) {
    id = normalizeEffectId(id);
    return manager.definitions.get(id)?.name ?? getVanillaEffectData(id).name;
}

function getPlayerKey(player) {
    return player.id ?? player.name;
}

function normalizeEffectId(id) {
    return String(id).replace("minecraft:", "");
}

function normalizeDurationTicks(durationTicks = DEFAULT_DURATION_TICKS) {
    const duration = Number(durationTicks);
    if (duration === -1) return -1;
    return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : DEFAULT_DURATION_TICKS;
}

function normalizeCommandDurationTicks(duration = 60) {
    const seconds = Number(duration);
    if (seconds === -1) return -1;
    return normalizeDurationTicks(seconds * 20);
}

function normalizeShowParticles(showParticles = false) {
    return showParticles === true || String(showParticles).toLowerCase() === "true";
}

function normalizeAmplifier(amplifier = 0) {
    const value = Number(amplifier);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function formatAmplifier(amplifier = 0) {
    amplifier = normalizeAmplifier(amplifier);
    if (amplifier >= 10) return "X+";
    return ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][amplifier];
}

function normalizeTargets(targets) {
    if (!targets) return [];
    return Array.isArray(targets) ? targets : [targets];
}

function rawText(value) {
    return { text: String(value) };
}

function rawTranslate(key, values = []) {
    const component = { translate: key };
    if (values.length > 0) component.with = { rawtext: values };
    return component;
}

function getCommandSender(origin) {
    return origin?.sourceEntity ?? origin?.initiator ?? origin?.entity;
}

function sendCommandMessage(origin, key, values = []) {
    const message = { rawtext: [rawTranslate(key, values)] };
    const sender = getCommandSender(origin);

    if (sender?.sendMessage) {
        sender.sendMessage(message);
    }
}

function sendNoEffectsActive(origin, player) {
    sendCommandMessage(origin, "commands.effect.failure.notActive.all", [
        rawText(player.name)
    ]);
}

function sendEffectNotMob(origin, name) {
    sendCommandMessage(origin, "commands.effect.failure.notAMob", [
        rawText(name)
    ]);
}

function sendEffectNotFound(origin, id) {
    sendCommandMessage(origin, "commands.effect.notFound", [
        rawText(id)
    ]);
}

function sendEffectSuccess(origin, effectName, amplifier, player, durationTicks) {
    if (durationTicks === -1) {
        sendCommandMessage(origin, "commands.effect.success.infinite", [
            rawTranslate(effectName),
            rawText(amplifier),
            rawText(player.name)
        ]);
        return;
    }

    sendCommandMessage(origin, "commands.effect.success", [
        rawTranslate(effectName),
        rawText(amplifier),
        rawText(player.name),
        rawText(Math.floor(durationTicks / 20))
    ]);
}

function sendAllEffectsRemoved(origin, player) {
    sendCommandMessage(origin, "commands.effect.success.removed.all", [
        rawText(player.name)
    ]);
}

function buildEffectLine(flag, texture, name, amplifier, durationText) {
    return (
        flag +
        fixedUiText(texture, 50) +
        fixedUiText(name, 30) +
        fixedUiText(formatAmplifier(amplifier), 4) +
        fixedUiText("§7" + durationText, 11)
    );
}

function getEffectCommandEnumValues(manager) {
    return [
        ...new Set([
            CLEAR_EFFECT_ID,
            ...Object.keys(VANILLA_EFFECTS),
            ...manager.getDefinitions().map(effect => effect.id)
        ])
    ];
}

function toVanillaDurationTicks(durationTicks) {
    return durationTicks === -1 ? VANILLA_INFINITE_DURATION_TICKS : durationTicks;
}

class CustomEffectManager {
    constructor() {
        this.definitions = new Map();
        this.activeByPlayer = new Map();
        this.loadedPlayers = new Set();
        this.hadVisibleEffects = new Map();
        this.isRunning = false;
        this.hudRefreshTick = 0;
    }

    register(effect) {
        if (!effect?.id) throw new Error("Custom effect needs an id.");

        const id = normalizeEffectId(effect.id);
        if (id === CLEAR_EFFECT_ID) {
            world.sendMessage(`§c'${CLEAR_EFFECT_ID}' is reserved for clearing custom effects and cannot be registered as a custom effect.`);
            return this;
        }

        this.definitions.set(id, {
            id,
            name: effect.name ?? formatEffectName(id),
            texture: effect.texture || "textures/avaritia/ui/effect_unknown",
            defaultDurationTicks: normalizeDurationTicks(effect.defaultDurationTicks),
            onAdd: effect.onAdd,
            onTick: effect.onTick,
            onRemove: effect.onRemove
        });

        return this;
    }

    has(id) {
        return this.definitions.has(normalizeEffectId(id));
    }

    add(player, id, durationTicks = DEFAULT_DURATION_TICKS, options = {}) {
        id = normalizeEffectId(id);
        if (id === CLEAR_EFFECT_ID) {
            world.sendMessage(`§c'${CLEAR_EFFECT_ID}' is reserved. Use /c:custom_effect <player> ${CLEAR_EFFECT_ID} to remove custom effects.`);
            return undefined;
        }

        const definition = this.definitions.get(id);
        if (!definition) throw new Error(`Custom effect '${id}' is not registered.`);

        const key = getPlayerKey(player);
        const playerEffects = this.activeByPlayer.get(key) ?? new Map();
        const previousEffect = playerEffects.get(id);
        const activeEffect = {
            id,
            definition,
            amplifier: normalizeAmplifier(options.amplifier),
            showParticles: normalizeShowParticles(options.showParticles),
            durationTicks: normalizeDurationTicks(durationTicks),
            data: options.data,
            isUpdate: Boolean(previousEffect),
            previousEffect
        };

        playerEffects.set(id, activeEffect);
        this.activeByPlayer.set(key, playerEffects);
        this.savePlayerEffects(player);
        system.run(() => {
            previousEffect?.definition.onRemove?.(player, previousEffect);
            definition.onAdd?.(player, activeEffect);
        });
        return activeEffect;
    }

    remove(player, id) {
        id = normalizeEffectId(id);
        const playerEffects = this.activeByPlayer.get(getPlayerKey(player));
        const activeEffect = playerEffects?.get(id);
        if (!activeEffect) return false;

        playerEffects.delete(id);
        this.savePlayerEffects(player);
        system.run(() => activeEffect.definition.onRemove?.(player, activeEffect));
        return true;
    }

    getActive(player) {
        return [...(this.activeByPlayer.get(getPlayerKey(player))?.values() ?? [])];
    }

    getDefinitions() {
        return [...this.definitions.values()];
    }

    clear(player) {
        for (const effect of this.getActive(player)) {
            this.remove(player, effect.id);
        }
        this.activeByPlayer.delete(getPlayerKey(player));
        this.savePlayerEffects(player);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        system.runInterval(() => this.updateAllPlayers(), 1);
    }

    sendHudTitle(player, title) {
        try {
            player.onScreenDisplay.setTitle(title, {
                stayDuration: 0,
                fadeOutDuration: 0,
                fadeInDuration: 0
            });
        } catch { }
    }

    updateAllPlayers() {
        const renderHud = ++this.hudRefreshTick >= HUD_REFRESH_TICKS;
        if (renderHud) this.hudRefreshTick = 0;

        for (const player of world.getAllPlayers()) {
            this.loadPlayerEffects(player);
            this.tickCustomEffects(player);
            if (renderHud) {
                this.savePlayerEffects(player);
                this.renderHud(player);
            }
        }
    }

    tickCustomEffects(player) {
        for (const effect of this.getActive(player)) {
            effect.definition.onTick?.(player, effect);

            if (effect.durationTicks !== -1) {
                effect.durationTicks--;
                if (effect.durationTicks <= 0) this.remove(player, effect.id);
            }
        }
    }

    renderHud(player) {
        const vanillaLines = player.getEffects().map(effect => {
            const id = normalizeEffectId(effect.typeId);
            const data = getVanillaEffectData(id);
            return buildEffectLine(VANILLA_EFFECT_LINE_FLAG, data.texture, data.name, effect.amplifier, formatTime(effect.duration));
        });

        const customLines = this.getActive(player).map(effect => {
            return buildEffectLine(CUSTOM_EFFECT_LINE_FLAG, effect.definition.texture, effect.definition.name, effect.amplifier, formatTime(effect.durationTicks));
        });

        const key = getPlayerKey(player);
        const hasVisibleEffects = vanillaLines.length > 0 || customLines.length > 0;

        if (!hasVisibleEffects) {
            if (this.hadVisibleEffects.get(key)) {
                this.sendHudTitle(player, EFFECTS_TITLE_FLAG);
            }
            this.hadVisibleEffects.set(key, false);
            return;
        }

        this.hadVisibleEffects.set(key, true);
        this.sendHudTitle(player, EFFECTS_TITLE_FLAG + vanillaLines.join("") + customLines.join(""));
    }

    serializeEffect(effect) {
        return {
            id: effect.id,
            amplifier: effect.amplifier,
            showParticles: effect.showParticles,
            durationTicks: effect.durationTicks,
            data: effect.data
        };
    }

    savePlayerEffects(player) {
        const effects = this.getActive(player)
            .filter(effect => effect.durationTicks === -1 || effect.durationTicks > 0)
            .map(effect => this.serializeEffect(effect));

        try {
            player.setDynamicProperty(PLAYER_EFFECTS_PROPERTY, effects.length ? JSON.stringify(effects) : undefined);
        } catch { }
    }

    loadPlayerEffects(player) {
        const key = getPlayerKey(player);
        if (this.loadedPlayers.has(key)) return;
        this.loadedPlayers.add(key);

        let rawEffects;
        try {
            rawEffects = player.getDynamicProperty(PLAYER_EFFECTS_PROPERTY);
        } catch {
            return;
        }

        if (typeof rawEffects !== "string" || rawEffects.length === 0) return;

        let savedEffects;
        try {
            savedEffects = JSON.parse(rawEffects);
        } catch {
            player.setDynamicProperty(PLAYER_EFFECTS_PROPERTY, undefined);
            return;
        }

        const playerEffects = new Map();
        for (const savedEffect of savedEffects) {
            const id = normalizeEffectId(savedEffect.id);
            const definition = this.definitions.get(id);
            if (!definition) continue;

            playerEffects.set(id, {
                id,
                definition,
                amplifier: normalizeAmplifier(savedEffect.amplifier),
                showParticles: normalizeShowParticles(savedEffect.showParticles),
                durationTicks: normalizeDurationTicks(savedEffect.durationTicks),
                data: savedEffect.data,
                isUpdate: false,
                previousEffect: undefined
            });
        }

        if (playerEffects.size > 0) {
            this.activeByPlayer.set(key, playerEffects);
        } else {
            player.setDynamicProperty(PLAYER_EFFECTS_PROPERTY, undefined);
        }
    }
}

export const customEffects = new CustomEffectManager();
export let hasPlayerCustomEffectApi = false;

setupCustomEffects();

export function attachCustomEffectApi(manager = customEffects) {
    if (Player.prototype.addCustomEffect) return true;

    try {
        Object.defineProperty(Player.prototype, "addCustomEffect", {
            value(id, durationTicks = DEFAULT_DURATION_TICKS, options = {}) {
                return manager.add(this, id, durationTicks, options);
            }
        });
        Object.defineProperty(Player.prototype, "removeCustomEffect", {
            value(id) {
                return manager.remove(this, id);
            }
        });
        return true;
    } catch {
        return false;
    }
}

export function registerEffectCommand(manager = customEffects) {
    if (commandRegistered) return;
    commandRegistered = true;

    system.beforeEvents.startup.subscribe(event => {
        event.customCommandRegistry.registerEnum(EFFECT_COMMAND_ENUM, getEffectCommandEnumValues(manager));
        event.customCommandRegistry.registerCommand(
            {
                name: "c:custom_effect",
                description: "Adds a vanilla/custom effect, or clears custom effects.",
                permissionLevel: CommandPermissionLevel.Any,
                mandatoryParameters: [
                    { name: "player", type: CustomCommandParamType.PlayerSelector },
                    { name: EFFECT_COMMAND_ENUM, type: CustomCommandParamType.Enum }
                ],
                optionalParameters: [
                    { name: "duration", type: CustomCommandParamType.Integer },
                    { name: "amplifier", type: CustomCommandParamType.Integer },
                    { name: "showParticles", type: CustomCommandParamType.Boolean }
                ]
            },
            (_origin, targets, effectId, duration = 30, amplifier = 0, showParticles = false) => {
                const players = normalizeTargets(targets);
                if (effectId === CLEAR_EFFECT_ID) {
                    for (const player of players) {
                        if (!(player instanceof Player)) {
                            sendEffectNotMob(_origin, player?.name ?? player);
                            continue;
                        }

                        const customEffects = manager.getActive(player);
                        manager.clear(player);
                        const vanillaEffects = player.getEffects().map(effect => effect.typeId);
                        if (customEffects.length === 0 && vanillaEffects.length === 0) {
                            sendNoEffectsActive(_origin, player);
                            continue;
                        }

                        if (vanillaEffects.length === 0) {
                            sendAllEffectsRemoved(_origin, player);
                            continue;
                        }

                        system.run(() => {
                            vanillaEffects.forEach(effect => player.removeEffect(effect));
                            sendAllEffectsRemoved(_origin, player);
                        });
                    }
                    return;
                }

                const normalizedEffectId = normalizeEffectId(effectId);
                const isCustomEffect = manager.has(normalizedEffectId);
                const isVanillaEffect = Object.prototype.hasOwnProperty.call(VANILLA_EFFECTS, normalizedEffectId);
                if (!isCustomEffect && !isVanillaEffect) {
                    sendEffectNotFound(_origin, effectId);
                    return;
                }

                const durationTicks = normalizeCommandDurationTicks(duration);
                const options = {
                    amplifier: normalizeAmplifier(amplifier),
                    showParticles: normalizeShowParticles(showParticles)
                };
                const effectName = getEffectDisplayName(normalizedEffectId, manager);

                for (const player of players) {
                    if (!(player instanceof Player)) {
                        sendEffectNotMob(_origin, player?.name ?? player);
                        continue;
                    }

                    if (isCustomEffect) {
                        manager.add(player, normalizedEffectId, durationTicks, options);
                        sendEffectSuccess(_origin, effectName, options.amplifier, player, durationTicks);
                    } else {
                        system.run(() => {
                            try {
                                player.addEffect(normalizedEffectId, toVanillaDurationTicks(durationTicks), options);
                                sendEffectSuccess(_origin, effectName, options.amplifier, player, durationTicks);
                            } catch {
                                sendEffectNotFound(_origin, effectId);
                            }
                        });
                    }
                }
            }
        );
    });
}

export function setupCustomEffects(manager = customEffects) {
    hasPlayerCustomEffectApi = attachCustomEffectApi(manager);
    registerEffectCommand(manager);
    world.afterEvents.entityDie.subscribe(event => {
        if (event.deadEntity instanceof Player) manager.clear(event.deadEntity);
    });
    manager.start();
}
