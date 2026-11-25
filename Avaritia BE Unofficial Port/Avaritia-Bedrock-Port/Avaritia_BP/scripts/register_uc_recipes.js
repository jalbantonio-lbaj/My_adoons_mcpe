import * as RegistryLib from './uc_regs.js'

RegistryLib.registerFuel({
  "avaritia:starfuel": 1000000000000000
});

RegistryLib.registerFuel({
  "avaritia:singularity_coal": 10000000000000
});

RegistryLib.registerInfuserRecipe({
  "avaritia:infinity_catalyst|utilitycraft:compressed_coal_block_4": {
    output: "avaritia:starfuel",
    required: 1,
    input_required: 8,
    amount: 1,
    cost: 900000000,
  }
});

RegistryLib.registerMachineUpgrade({
  "avaritia:infinity_upgrade": {
    type: "infinity",
    levels: {
      1: { speed: 150.0, energy_efficiency: 10.0, process_batch: 5 },
      2: { speed: 200.0, energy_efficiency: 20, process_batch: 10 },
      3: { speed: 250.0, energy_efficiency: 30.0, process_batch: 15 },
      4: { speed: 300.0, energy_efficiency: 40, process_batch: 30 },
      5: { speed: 350.0, energy_efficiency: 50, process_batch: 35 },
      6: { speed: 400.0, energy_efficiency: 60, process_batch: 40 },
      7: { speed: 450.0, energy_efficiency: 70, process_batch: 45 },
      8: { speed: 500.0, energy_efficiency: 80, process_batch: 50 },
      9: { speed: 550.0, energy_efficiency: 90, process_batch: 55 },
      10: { speed: 600.0, energy_efficiency: 100, process_batch: 60 },
      11: { speed: 650.0, energy_efficiency: 150, process_batch: 65 },
      12: { speed: 700.0, energy_efficiency: 200, process_batch: 70 },
      13: { speed: 750.0, energy_efficiency: 250, process_batch: 75 },
      14: { speed: 800.0, energy_efficiency: 300, process_batch: 80 },
      15: { speed: 850.0, energy_efficiency: 350, process_batch: 85 },
      16: { speed: 900.0, energy_efficiency: 400, process_batch: 90 },
      17: { speed: 950.0, energy_efficiency: 500, process_batch: 95 },
      18: { speed: 1000.0, energy_efficiency: 600, process_batch: 100 },
      19: { speed: 1050.0, energy_efficiency: 700, process_batch: 110 },
      20: { speed: 1100.0, energy_efficiency: 800, process_batch: 120 },
      21: { speed: 1150.0, energy_efficiency: 900, process_batch: 130 },
      22: { speed: 1200.0, energy_efficiency: 1000, process_batch: 150 },
      23: { speed: 1250.0, energy_efficiency: 1100, process_batch: 160 },
      24: { speed: 1300.0, energy_efficiency: 1200, process_batch: 170 },
      25: { speed: 1350.0, energy_efficiency: 1300, process_batch: 180 },
      26: { speed: 1400.0, energy_efficiency: 1400, process_batch: 190 },
      27: { speed: 1450.0, energy_efficiency: 1500, process_batch: 200 },
      28: { speed: 1500.0, energy_efficiency: 1600, process_batch: 210 },
      29: { speed: 1550.0, energy_efficiency: 1700, process_batch: 220 },
      30: { speed: 1600.0, energy_efficiency: 1800, process_batch: 230 },
      31: { speed: 1650.0, energy_efficiency: 1900, process_batch: 240 },
      32: { speed: 1700.0, energy_efficiency: 10000, process_batch: 500 },
    }
  }
});

RegistryLib.registerPressRecipe({
  "avaritia:neutronium_ingot": {
    output: "avaritia:neutronium_gear",
    required: 4,
    amount: 1,
    cost: 1000000000
  }
})