// Emberline, round two: the boot code and the single game loop. The simulation ticks
// at a fixed 60 Hz while rendering runs at the display's pace; rounds, money, the
// charge and the bots all live in the simulation, so a screenshot shows exactly
// what the code does. ?shot=start|play|tactics|end with &seed=N stages one frozen
// frame for a capture: it renders twice, then sets window.__shotReady.
import * as THREE from "three";
import { PALETTE } from "./palette.js";
import { createWorld } from "./world.js";
import { createInput } from "./input.js";
import { createPlayer } from "./player.js";
import { createWeapon } from "./weapon.js";
import { createBots } from "./bots.js";
import { createEconomy, ECONOMY } from "./economy.js";
import { createObjective } from "./objective.js";
import { createGrenades } from "./grenade.js";
import { createHud } from "./hud.js";

const STEP = 1 / 60;
const query = new URLSearchParams(window.location.search);
const shotName = query.get("shot");
const shotSeed = Number.parseInt(query.get("seed") ?? "1", 10) || 1;

function seededRng(initial) {
  let a = initial;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = seededRng(shotSeed);

const gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
gl.setSize(window.innerWidth, window.innerHeight);
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("game").appendChild(gl.domElement);

const stage = new THREE.Scene();
stage.background = new THREE.Color(PALETTE.canvas);
stage.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 34, 110);
const cam = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
stage.add(cam);

const map = createWorld(stage);
const guns = createWeapon(cam);
const wallet = createEconomy();
const goal = createObjective(map);
const shards = createGrenades(stage, map);
const squad = createBots(stage, map, rng);
const ui = createHud();
const hero = createPlayer(map.colliders);
const keys = createInput(gl.domElement, onLock);
const ray = new THREE.Raycaster();
ray.far = 90;
const dir = new THREE.Vector3();
const eye = new THREE.Vector3();
const ahead = new THREE.Vector3();

const self = hero.state;
const markerHold = shotName ? 4000 : 90;
const obj = goal.state;
const econ = wallet.state;

let clock = 0;
let held = false;
let begun = false;
let acc = 0;
let lastTick = performance.now();
let health = 100;
let alive = true;
let kills = 0;
let pause = 0;
let plantHeld = false;
let isScoped = false;

function targets() {
  return map.shootables.concat(squad.hitMeshes);
}

function placeCamera() {
  cam.position.set(self.position.x, self.position.y + self.eye, self.position.z);
  cam.rotation.set(self.pitch, self.yaw, 0, "YXZ");
  const wantFov = isScoped && guns.currentDef.zoom ? 30 : 74;
  if (Math.abs(cam.fov - wantFov) > 0.2) {
    cam.fov += (wantFov - cam.fov) * 0.25;
    cam.updateProjectionMatrix();
  }
}

function lookAt(point) {
  const dx = point.x - self.position.x;
  const dy = point.y - (self.position.y + self.eye);
  const dz = point.z - self.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  self.yaw = Math.atan2(-dx, -dz);
  self.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  placeCamera();
}

function logKill(killer, killerTeam, victim, victimTeam, how) {
  ui.feed(killer, killerTeam, victim, victimTeam, how);
}

function checkWipe() {
  if (obj.phase !== "live") return;
  if (squad.aliveCount("warden") === 0) finishRound("ember", "Every Warden is down");
  else if (squad.aliveCount("ember") === 0 && !alive) finishRound("warden", "Every Ember is down");
}

function finishRound(winner, reason) {
  if (obj.phase === "over") return;
  goal.endRound(winner, reason);
  const won = winner === "ember";
  econ.money += won ? ECONOMY.winBonus : ECONOMY.lossBonus;
  ui.showBanner(won ? "Ember takes the round" : "Wardens take the round", reason, 3600);
  ui.setScores(obj.wins.ember, obj.wins.warden);
  ui.setObjective(null, 0);
  pause = 4;
  if (document.pointerLockElement) document.exitPointerLock();
}

function beginRound(round) {
  goal.startRound(round);
  shards.clear();
  health = 100;
  alive = true;
  // The player starts away from the bots: the first Ember spawn belongs to bot 0,
  // and sharing it once put a teammate's torso across the camera at round start.
  self.position.set(-10, 0, 17);
  self.velocity.set(0, 0, 0);
  self.yaw = Math.PI;
  self.pitch = 0;
  squad.reset(round);
  guns.refill();
  ui.setScores(obj.wins.ember, obj.wins.warden);
  ui.setHealth(health, econ.money, econ.armor);
  ui.setAmmo(guns.mag, guns.reserve, guns.currentDef.name);
  ui.setTimer(obj.timer, "buy");
  ui.showBuy(econ.money);
  placeCamera();
}

function advanceRound() {
  if (obj.matchOver) {
    ui.showOverlay("end", { ember: obj.wins.ember, warden: obj.wins.warden });
    return;
  }
  beginRound(obj.round + 1);
}

function freshMatch() {
  goal.resetMatch();
  wallet.reset();
  kills = 0;
  beginRound(1);
}

function hurtPlayer(amount, fromBot) {
  if (!alive || obj.phase !== "live") return;
  const taken = wallet.absorb(amount);
  health -= taken;
  ui.setHealth(health, econ.money, econ.armor);
  if (health <= 0) {
    alive = false;
    logKill(fromBot.name, "warden", "You", "ember", guns.currentDef.name);
    ui.showBanner("You are down", "Your team fights on", 2600);
    if (document.pointerLockElement) document.exitPointerLock();
    checkWipe();
  }
}

function hurtBot(bot, amount, part) {
  const killed = squad.damage(bot, amount, part);
  if (killed) {
    kills += 1;
    econ.money += ECONOMY.killBonus;
    logKill("You", "ember", bot.name, bot.team, part === "head" ? "headshot" : guns.currentDef.name);
    ui.setHealth(health, econ.money, econ.armor);
    checkWipe();
  }
  return killed;
}

function fire(spread) {
  if (!guns.takeRound()) return false;
  const spec = guns.currentDef;
  for (let p = 0; p < spec.pellets; p += 1) {
    cam.getWorldDirection(dir);
    dir.x += (rng() * 2 - 1) * spread;
    dir.y += (rng() * 2 - 1) * spread;
    dir.z += (rng() * 2 - 1) * spread;
    dir.normalize();
    stage.updateMatrixWorld(true);
    ray.set(cam.position, dir);
    const hit = ray.intersectObjects(targets(), false)[0];
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const killed = hurtBot(bot, spec.dmg * (part === "head" ? spec.head : 1), part);
      ui.hitMarker(killed, markerHold);
    } else if (hit) {
      ui.hitMarker(false, markerHold);
    }
  }
  guns.pullTrigger();
  hero.recoil(0.009 + rng() * 0.004, (rng() * 2 - 1) * 0.004);
  ui.setAmmo(guns.mag, guns.reserve, spec.name);
  return true;
}

function tossShard() {
  if (econ.grenades <= 0) return;
  econ.grenades -= 1;
  cam.getWorldDirection(dir);
  eye.copy(cam.position);
  shards.throwFrom(eye, dir);
  ui.setHealth(health, econ.money, econ.armor);
}

function detonate(pos, radius, maxDamage) {
  // The player takes a share of the blast and flashes if it went off in view.
  if (alive) {
    const d = pos.distanceTo(cam.position);
    if (d < radius) {
      hurtPlayer(maxDamage * (1 - d / radius) * 0.6, { name: "Shard grenade" });
      cam.getWorldDirection(ahead);
      if (shards.lookingAt(pos, cam.position, ahead)) ui.flashScreen(0.85);
    }
  }
  // Bots take falloff damage, and one facing the burst is blinded for a moment.
  for (const bot of squad.bots) {
    if (!bot.alive) continue;
    const d = pos.distanceTo(new THREE.Vector3(bot.pos.x, bot.pos.y + 1.2, bot.pos.z));
    if (d < radius) {
      const killed = squad.damage(bot, maxDamage * (1 - d / radius), "torso");
      if (killed) logKill("Shard grenade", "ember", bot.name, bot.team, "blast");
    }
    const toBlast = new THREE.Vector3().copy(pos).sub(new THREE.Vector3(bot.pos.x, bot.pos.y + 1.55, bot.pos.z)).normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (toBlast.dot(facing) > 0.4 && d < 26) bot.blindUntil = clock + 1.5;
  }
  checkWipe();
}

function handleObjective(dt) {
  const inSite = goal.siteOf(self.position);
  if (obj.phase === "live" && !obj.planted && alive && inSite && plantHeld) {
    obj.plantAt += dt;
    ui.setObjective(`Planting the charge — Site ${inSite}`, obj.plantAt / 3);
    if (obj.plantAt >= 3) {
      goal.plant(inSite);
      econ.money += ECONOMY.plantBonus;
      ui.showBanner("Charge planted", `Site ${inSite} — 40 seconds to detonation`, 3000);
      ui.setObjective(null, 0);
    }
  } else if (obj.phase === "live" && obj.planted && alive && plantHeld) {
    const c = goal.siteCenter(obj.plantedSite);
    const d = Math.hypot(c.x - self.position.x, c.z - self.position.z);
    if (d < 2.5) {
      obj.defuseAt += dt;
      ui.setObjective("Defusing the charge…", obj.defuseAt / 5);
      if (obj.defuseAt >= 5) finishRound("warden", "Charge defused");
    } else {
      obj.defuseAt = 0;
      ui.setObjective(`Charge planted — Site ${obj.plantedSite}`, 1 - obj.chargeTimer / 40);
    }
  } else {
    obj.plantAt = 0;
    if (obj.phase === "live" && obj.planted) ui.setObjective(`Charge planted — Site ${obj.plantedSite}`, 1 - obj.chargeTimer / 40);
    else ui.setObjective(null, 0);
  }
}

function botWorld() {
  return {
    time: clock,
    playerAlive: alive,
    playerTeam: "ember",
    playerPos: new THREE.Vector3(self.position.x, self.position.y + self.eye, self.position.z),
    chargePlanted: obj.planted,
    plantedSite: obj.plantedSite ? goal.siteCenter(obj.plantedSite) : null,
    chargeCarrierAlive: squad.carrier() ? squad.carrier().alive : false,
    damagePlayer: hurtPlayer,
    damageBot(bot, amount, part, fromBot) {
      const killed = squad.damage(bot, amount, part);
      if (killed) {
        logKill(fromBot.name, fromBot.team, bot.name, bot.team, "VK-9 rifle");
        checkWipe();
      }
    },
    plant(bot, sitePos) {
      const site = goal.siteOf(sitePos);
      if (site && goal.plant(site)) {
        ui.showBanner("Charge planted", `Site ${site} — 40 seconds to detonation`, 3000);
      }
    },
    defuse(bot) {
      finishRound("warden", `${bot.name} defused the charge`);
    },
  };
}

function tick(dt) {
  clock += dt;
  if (obj.phase === "buy") {
    obj.timer -= dt;
    ui.setTimer(obj.timer, "buy");
    if (obj.timer <= 0) {
      goal.beginLive();
      ui.hideBuy();
      ui.setTimer(obj.timer, "live");
      ui.showBanner(`Round ${obj.round}`, "Plant the charge or drop every Warden", 2200);
    }
  } else if (obj.phase === "live") {
    if (obj.planted) {
      obj.chargeTimer -= dt;
      ui.setTimer(obj.chargeTimer, "live");
      if (obj.chargeTimer <= 0) finishRound("ember", "Charge detonated");
    } else {
      obj.timer -= dt;
      ui.setTimer(obj.timer, "live");
      if (obj.timer <= 0) finishRound("warden", "Time expired — Wardens hold the yard");
    }
  } else if (obj.phase === "over") {
    pause -= dt;
    if (pause <= 0) advanceRound();
  }

  if (alive) hero.step(dt, keys.state.keys);
  guns.step(dt);
  squad.step(dt, botWorld());
  shards.step(dt, { explode: detonate });
  handleObjective(dt);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  if (!held) {
    const look = keys.takeLook();
    if (alive && obj.phase !== "buy") hero.look(look.x, look.y);
    if (alive && keys.state.firing && guns.ready() && obj.phase === "live") {
      fire(shotName ? 0 : guns.spread(hero.groundSpeed()));
    }
    if (keys.state.keys.has("KeyR")) guns.reload();
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      tick(STEP);
      acc -= STEP;
      steps += 1;
    }
    if (acc > STEP * 5) acc = 0;
    placeCamera();
  }
  gl.render(stage, cam);
}

function fastForward(steps) {
  for (let index = 0; index < steps; index += 1) tick(STEP);
}

function stageShot(name) {
  ui.hideOverlay();
  ui.hideBuy();
  self.pitch = 0;
  if (name === "start") {
    beginRound(1);
    self.position.set(0, 0, 14);
    self.yaw = Math.PI;
    fastForward(20);
    lookAt(new THREE.Vector3(0, 1.5, -10));
    ui.showBuy(econ.money);
  } else if (name === "play") {
    beginRound(1);
    goal.beginLive();
    obj.timer = 82;
    self.position.set(2, 0, 8);
    fastForward(20);
    const foe = squad.bots.find((b) => b.team === "warden");
    foe.pos.set(-2, 0, -2);
    foe.group.position.copy(foe.pos);
    const mate = squad.bots.find((b) => b.team === "ember" && b.index === 1);
    mate.pos.set(5, 0, 4);
    mate.group.position.copy(mate.pos);
    lookAt(new THREE.Vector3(foe.pos.x, 1.2, foe.pos.z));
    fire(0);
    fastForward(10);
    lookAt(new THREE.Vector3(foe.pos.x, 1.2, foe.pos.z));
    ui.setTimer(obj.timer, "live");
  } else if (name === "tactics") {
    beginRound(1);
    goal.beginLive();
    goal.plant("A");
    obj.chargeTimer = 31;
    self.position.set(-12, 0, -6);
    fastForward(20);
    const foe = squad.bots.find((b) => b.team === "warden" && b.index === 1);
    foe.pos.set(-18, 0, -10);
    foe.group.position.copy(foe.pos);
    foe.yaw = Math.PI * 0.75;
    lookAt(new THREE.Vector3(-20, 1.4, -12));
    ui.setTimer(obj.chargeTimer, "live");
    ui.setObjective("Charge planted — Site A", 0.22);
    ui.showBanner("Charge planted", "Site A — 31 seconds to detonation", 4000);
  } else {
    // end
    beginRound(1);
    // The wrapper here (not goal.endRound on its own): it sets the 4 s pause,
    // so fastForward() below cannot roll into the next round and move the camera
    // back to spawn.
    finishRound("ember", "Charge detonated");
    self.position.set(0, 0, 14);
    fastForward(20);
    const foe = squad.bots.find((b) => b.team === "warden");
    squad.damage(foe, 500, "torso");
    foe.group.rotation.x = -1.45;
    lookAt(new THREE.Vector3(0, 1.2, -12));
    ui.setScores(1, 0);
    ui.setTimer(0, "over");
    ui.showBanner("Ember takes the round", "Charge detonated", 4000);
  }
  ui.setHealth(health, econ.money, econ.armor);
  ui.setAmmo(guns.mag, guns.reserve, guns.currentDef.name);
  // beginRound re-opens the buy menu; only the start shot keeps it open.
  if (name !== "start") ui.hideBuy();
  // The round-end banner runs on a 3.6 s timer that the capture's virtual clock
  // would let lapse; re-show it with a long hold so the end shot keeps it.
  if (name === "end") ui.showBanner("Ember takes the round", "Charge detonated", 60000);
  paintTwice();
}

function paintTwice() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    placeCamera();
    gl.render(stage, cam);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      held = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener("resize", () => {
  cam.aspect = window.innerWidth / window.innerHeight;
  cam.updateProjectionMatrix();
  gl.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("mousedown", (event) => {
  if (event.button === 2 && alive) {
    isScoped = true;
    guns.setScoped(true);
  }
});
window.addEventListener("mouseup", (event) => {
  if (event.button === 2) {
    isScoped = false;
    guns.setScoped(false);
  }
});
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyB" && obj.phase === "buy" && !shotName) {
    if (ui.buyOpen) { ui.hideBuy(); keys.requestLock(); }
    else { ui.showBuy(econ.money); if (document.pointerLockElement) document.exitPointerLock(); }
  }
  if (ui.buyOpen && obj.phase === "buy") {
    if (event.code === "Digit1") wallet.buyWeapon("vk9", guns);
    if (event.code === "Digit2") wallet.buyWeapon("heron", guns);
    if (event.code === "Digit3") wallet.buyWeapon("longbow", guns);
    if (event.code === "Digit4") wallet.buyWeapon("p9", guns);
    if (event.code === "Digit5") wallet.buyGrenade();
    if (event.code === "Digit6") wallet.buyArmor();
    ui.setAmmo(guns.mag, guns.reserve, guns.currentDef.name);
    ui.setHealth(health, econ.money, econ.armor);
    if (ui.buyOpen) ui.showBuy(econ.money);
  }
  if (event.code === "Digit1" && obj.phase === "live") guns.equip("vk9");
  if (event.code === "Digit2" && obj.phase === "live") guns.equip("heron");
  if (event.code === "Digit3" && obj.phase === "live") guns.equip("longbow");
  if (event.code === "Digit4" && obj.phase === "live") guns.equip("p9");
  if (event.code === "KeyG" && obj.phase === "live") tossShard();
  if (event.code === "KeyE") plantHeld = true;
});
window.addEventListener("keyup", (event) => {
  if (event.code === "KeyE") plantHeld = false;
});

ui.onPlay(() => {
  if (shotName) return;
  if (obj.matchOver) { freshMatch(); keys.requestLock(); return; }
  if (!begun) begun = true;
  ui.hideOverlay();
  keys.requestLock();
});

function onLock(locked) {
  if (shotName) return;
  if (locked) {
    begun = true;
    ui.hideOverlay();
    ui.hideBuy();
  } else if (!obj.matchOver && !ui.buyOpen) {
    ui.showOverlay(begun ? "paused" : "start", { ember: obj.wins.ember, warden: obj.wins.warden });
  }
}

placeCamera();
beginRound(1);
if (shotName) stageShot(shotName);
else requestAnimationFrame(loop);
