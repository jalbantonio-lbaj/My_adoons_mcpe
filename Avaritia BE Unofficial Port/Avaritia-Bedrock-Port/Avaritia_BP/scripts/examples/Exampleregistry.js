import { system } from '@minecraft/server'


function registerExtremeRecipe(pattern, key, result) {
  const recipe = {
    pattern: pattern,
    key: key,
    result: result
  };

  const registration = JSON.stringify(recipe);

  system.sendScriptEvent("avaritia:register_xtreme_recipe", registration)
}

function registerCompressorRecipe(input, output, amt, name) { //iput and output are self-explanatory, amt is the amount of input items needed for the output, name is the name displayed in the compressor (e.g. 356/400 input items, "input items" is the name)
  const recipe = JSON.stringify({
    input: input,
    output: output,
    amt: amt,
    name: name
  });

  system.sendScriptEvent("avaritia:register_compressor_recipe", recipe)
}

system.runTimeout(() => {
  registerCompressorRecipe("minecraft:apple", "minecraft:diamond", 1, "Custom Blocks")
}, 20);

system.runTimeout(() => {
  registerExtremeRecipe(
    [
      "AAAAAAAAA", //pattern, like a normal patter but 9x9
      "         ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         ",
      "         "
    ],
    {
      A: "minecraft:diamond" //recipe items, can be any item in the game
    },
    {
      item: "avaritia:infinity_block", count: 1 //itemcount, can be 1, 2, 3, 4, etc.
    }
  )
}, 20);