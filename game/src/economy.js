// Money: earned every round, spent in the buy menu between rounds. The numbers
// are Counter-Strike-shaped on purpose — a win pays for a rifle, a loss still
// pays for a shotgun — but every price and reward is this game's own.
import { WEAPONS } from "./weapon.js";

export const ECONOMY = {
  startMoney: 800,
  winBonus: 3250,
  lossBonus: 1900,
  killBonus: 300,
  plantBonus: 300,
  grenadePrice: 300,
  armorPrice: 650,
};

export function createEconomy() {
  const purse = { money: ECONOMY.startMoney, grenades: 0, armor: 0 };

  return {
    state: purse,
    reset() {
      purse.money = ECONOMY.startMoney;
      purse.grenades = 0;
      purse.armor = 0;
    },
    canAfford(price) {
      return purse.money >= price;
    },
    // Buy a weapon: returns "bought", "owned" or "poor".
    buyWeapon(id, arsenal) {
      const spec = WEAPONS[id];
      if (!spec) return "poor";
      if (arsenal.owned.has(id)) { arsenal.equip(id); return "owned"; }
      if (purse.money < spec.price) return "poor";
      purse.money -= spec.price;
      arsenal.buy(id);
      return "bought";
    },
    buyGrenade() {
      if (purse.grenades >= 2) return "full";
      if (purse.money < ECONOMY.grenadePrice) return "poor";
      purse.money -= ECONOMY.grenadePrice;
      purse.grenades += 1;
      return "bought";
    },
    buyArmor() {
      if (purse.armor >= 100) return "full";
      if (purse.money < ECONOMY.armorPrice) return "poor";
      purse.money -= ECONOMY.armorPrice;
      purse.armor = 100;
      return "bought";
    },
    // Incoming damage: armour absorbs half until it runs out.
    absorb(damage) {
      if (purse.armor <= 0) return damage;
      const absorbed = Math.min(purse.armor, damage * 0.5);
      purse.armor -= absorbed;
      return damage - absorbed;
    },
  };
}
