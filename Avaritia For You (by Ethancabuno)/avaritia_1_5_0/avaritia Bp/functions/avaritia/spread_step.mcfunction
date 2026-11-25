# Runs AS the spreader entity, AT its position (inside the block being spread).
# Every touching air block gets a copy of this block + a new spreader. Then this spreader removes itself.
# No air left around = nothing is created = the wave stops by itself.
execute if block ~1 ~ ~ air run summon avaritia:spreader ~1 ~ ~
execute if block ~1 ~ ~ air run clone ~ ~ ~ ~ ~ ~ ~1 ~ ~
execute if block ~-1 ~ ~ air run summon avaritia:spreader ~-1 ~ ~
execute if block ~-1 ~ ~ air run clone ~ ~ ~ ~ ~ ~ ~-1 ~ ~
execute if block ~ ~1 ~ air run summon avaritia:spreader ~ ~1 ~
execute if block ~ ~1 ~ air run clone ~ ~ ~ ~ ~ ~ ~ ~1 ~
execute if block ~ ~-1 ~ air run summon avaritia:spreader ~ ~-1 ~
execute if block ~ ~-1 ~ air run clone ~ ~ ~ ~ ~ ~ ~ ~-1 ~
execute if block ~ ~ ~1 air run summon avaritia:spreader ~ ~ ~1
execute if block ~ ~ ~1 air run clone ~ ~ ~ ~ ~ ~ ~ ~ ~1
execute if block ~ ~ ~-1 air run summon avaritia:spreader ~ ~ ~-1
execute if block ~ ~ ~-1 air run clone ~ ~ ~ ~ ~ ~ ~ ~ ~-1
kill @s
