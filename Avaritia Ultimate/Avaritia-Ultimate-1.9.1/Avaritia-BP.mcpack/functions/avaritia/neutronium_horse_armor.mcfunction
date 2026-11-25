# Neutronium Horse Armor stat simulation
# Horses have no native armor/enchantment stat system in Bedrock, so the armor's
# stats are simulated here each tick for any horse currently wearing it.
#
# We target horses directly via hasitem on the armor slot instead of the
# "avaritia_neutronium_horse_armor" tag: the tag was meant to be added/removed
# by the avaritia:neutronium_bonus component group's minecraft:tags component
# (see entities/horse.json), but that component is being dropped by the engine's
# schema validation, so it never actually applies - hasitem checks the item
# directly and doesn't depend on that component group at all.
#
# Knockback Resistance +100% and Feather Falling IV (fall damage immunity) are
# still handled by that component group and are unaffected by this - the group
# still gets added/removed correctly, only its minecraft:tags entry is ignored.

# Protection X -> heavy, constantly refreshed damage resistance
effect @e[type=horse,hasitem={item=avaritia:neutronium_horse_armor,location=slot.armor}] resistance 3 4 true

# Frost Walker X -> freezes a generous radius of water around and beneath the horse
execute as @e[type=horse,hasitem={item=avaritia:neutronium_horse_armor,location=slot.armor}] at @s run fill ~-4 ~-1 ~-4 ~4 ~-1 ~4 frosted_ice replace water
