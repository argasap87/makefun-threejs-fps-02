// The arsenal: four hitscan weapons, each with its own numbers and view model.
// It owns the numbers; main.js owns the ray and the damage. Spread punishes firing
// on the move and rewards stopping to aim; the DMR zooms on right click.
import * as THREE from "three";
import { PALETTE } from "./palette.js";

export const WEAPONS = {
  p9: { id: "p9", name: "P9 sidearm", price: 0, mag: 12, reserve: -1, gap: 0.18, reload: 1.2, dmg: 26, head: 2, pellets: 1, spreadStill: 0.004, spreadMove: 0.03, auto: false, kick: 0.02 },
  vk9: { id: "vk9", name: "VK-9 rifle", price: 2500, mag: 30, reserve: 120, gap: 0.096, reload: 1.9, dmg: 34, head: 2, pellets: 1, spreadStill: 0.0022, spreadMove: 0.028, auto: true, kick: 0.055 },
  heron: { id: "heron", name: "Heron-12 shotgun", price: 1800, mag: 6, reserve: 24, gap: 0.85, reload: 2.6, dmg: 13, head: 2, pellets: 6, spreadStill: 0.03, spreadMove: 0.045, auto: false, kick: 0.11 },
  longbow: { id: "longbow", name: "Longbow DMR", price: 3200, mag: 10, reserve: 30, gap: 0.5, reload: 2.2, dmg: 80, head: 2, pellets: 1, spreadStill: 0.0008, spreadMove: 0.02, auto: false, kick: 0.09, zoom: true },
};

const FLASH_TIME = 0.06;
const MOVE_REF = 5.2;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const shell = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.6, metalness: 0.3 });

  function buildViewModel(spec) {
    const model = new THREE.Group();
    if (spec.id === "p9") {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.24), shell);
      const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), grip);
      gripMesh.position.set(0, -0.07, 0.08);
      model.add(slide, gripMesh);
    } else if (spec.id === "heron") {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.55), shell);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.2), grip);
      pump.position.set(0, -0.02, -0.28);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.2), dark);
      stock.position.set(0, -0.02, 0.3);
      model.add(tube, pump, stock);
    } else if (spec.id === "longbow") {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.62), dark);
      barrel.position.set(0, 0.02, -0.42);
      const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.18), grip);
      scope.position.set(0, 0.08, -0.05);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26), shell);
      stock.position.set(0, -0.02, 0.28);
      model.add(barrel, scope, stock);
    } else {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), shell);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
      barrel.position.set(0, 0.025, -0.38);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
      stock.position.set(0, -0.02, 0.3);
      model.add(receiver, barrel, stock);
    }
    model.position.set(0.24, -0.2, -0.42);
    return model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // One ammo pool per weapon, kept when the weapon is holstered.
  const stock = {};
  for (const spec of Object.values(WEAPONS)) stock[spec.id] = { mag: spec.mag, reserve: spec.reserve };
  const owned = new Set(["p9"]);
  let model = buildViewModel(WEAPONS.p9);
  camera.add(model);

  const state = { current: "p9", cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, scoped: false };

  function spec() { return WEAPONS[state.current]; }
  function pool() { return stock[state.current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (spec().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = spec().mag - pool().mag;
        const take = pool().reserve < 0 ? need : Math.min(need, pool().reserve);
        pool().mag += take;
        if (pool().reserve >= 0) pool().reserve -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPONS,
    owned,
    get mag() { return pool().mag; },
    get reserve() { return pool().reserve; },
    get currentDef() { return spec(); },
    step,
    ready() {
      return pool().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = spec().gap;
      state.flash = FLASH_TIME;
      state.kick = spec().kick;
    },
    takeRound() {
      if (pool().mag <= 0) return false;
      pool().mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || pool().mag === spec().mag) return;
      if (pool().reserve === 0) return;
      state.reloadLeft = spec().reload;
    },
    spread(speed) {
      const base = spec().spreadStill + Math.min(1, speed / MOVE_REF) * spec().spreadMove;
      return state.scoped ? base * 0.4 : base;
    },
    equip(id) {
      if (!owned.has(id) || id === state.current) return false;
      camera.remove(model);
      model = buildViewModel(WEAPONS[id]);
      camera.add(model);
      state.current = id;
      state.reloadLeft = 0;
      state.cooldown = 0.25;
      state.scoped = false;
      return true;
    },
    buy(id) {
      if (owned.has(id)) return this.equip(id);
      owned.add(id);
      return this.equip(id);
    },
    refill() {
      for (const d of Object.values(WEAPONS)) stock[d.id] = { mag: d.mag, reserve: d.reserve };
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    setScoped(on) {
      state.scoped = on && !!spec().zoom;
    },
  };
}
