// Emberline: boot and the one loop. A fixed 60 Hz simulation feeds a render at the
// display's rate; rounds, money, planting and bots all live in the simulation, so
// what the screenshots show is what the code does.
// ?shot=start|play|tactics|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createBots } from './bots.js';
import { createEconomy, ECONOMY } from './economy.js';
import { createObjective } from './objective.js';
import { createGrenades } from './grenade.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 34, 110);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const arsenal = createWeapon(camera);
const economy = createEconomy();
const objective = createObjective(world);
const grenades = createGrenades(scene, world);
const bots = createBots(scene, world, random);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const forward = new THREE.Vector3();

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
const O = objective.state;
const E = economy.state;

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let playerHealth = 100;
let playerAlive = true;
let playerKills = 0;
let intermission = 0;
let plantKeyHeld = false;
let scoped = false;

function shootables() {
  return world.shootables.concat(bots.hitMeshes);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const targetFov = scoped && arsenal.currentDef.zoom ? 30 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function feed(killer, killerTeam, victim, victimTeam, how) {
  hud.feed(killer, killerTeam, victim, victimTeam, how);
}

function checkElimination() {
  if (O.phase !== 'live') return;
  if (bots.aliveCount('warden') === 0) endRound('ember', 'Every Warden is down');
  else if (bots.aliveCount('ember') === 0 && !playerAlive) endRound('warden', 'Every Ember is down');
}

function endRound(winner, reason) {
  if (O.phase === 'over') return;
  objective.endRound(winner, reason);
  const won = winner === 'ember';
  E.money += won ? ECONOMY.winBonus : ECONOMY.lossBonus;
  hud.showBanner(won ? 'Ember takes the round' : 'Wardens take the round', reason, 3600);
  hud.setScores(O.wins.ember, O.wins.warden);
  hud.setObjective(null, 0);
  intermission = 4;
  if (document.pointerLockElement) document.exitPointerLock();
}

function startRound(round) {
  objective.startRound(round);
  grenades.clear();
  playerHealth = 100;
  playerAlive = true;
  // The player spawns apart from the bots: SPAWNS.ember[0] is bot 0's spot,
  // and sharing it put a teammate's torso across the camera at round start.
  body.position.set(-10, 0, 17);
  body.velocity.set(0, 0, 0);
  body.yaw = Math.PI;
  body.pitch = 0;
  bots.reset(round);
  arsenal.refill();
  hud.setScores(O.wins.ember, O.wins.warden);
  hud.setHealth(playerHealth, E.money, E.armor);
  hud.setAmmo(arsenal.mag, arsenal.reserve, arsenal.currentDef.name);
  hud.setTimer(O.timer, 'buy');
  hud.showBuy(E.money);
  syncCamera();
}

function nextRound() {
  if (O.matchOver) {
    hud.showOverlay('end', { ember: O.wins.ember, warden: O.wins.warden });
    return;
  }
  startRound(O.round + 1);
}

function restartMatch() {
  objective.resetMatch();
  economy.reset();
  playerKills = 0;
  startRound(1);
}

function damagePlayer(amount, fromBot) {
  if (!playerAlive || O.phase !== 'live') return;
  const taken = economy.absorb(amount);
  playerHealth -= taken;
  hud.setHealth(playerHealth, E.money, E.armor);
  if (playerHealth <= 0) {
    playerAlive = false;
    feed(fromBot.name, 'warden', 'You', 'ember', arsenal.currentDef.name);
    hud.showBanner('You are down', 'Your team fights on', 2600);
    if (document.pointerLockElement) document.exitPointerLock();
    checkElimination();
  }
}

function damageBotByPlayer(bot, amount, part) {
  const killed = bots.damage(bot, amount, part);
  if (killed) {
    playerKills += 1;
    E.money += ECONOMY.killBonus;
    feed('You', 'ember', bot.name, bot.team, part === 'head' ? 'headshot' : arsenal.currentDef.name);
    hud.setHealth(playerHealth, E.money, E.armor);
    checkElimination();
  }
  return killed;
}

function shoot(spread) {
  if (!arsenal.takeRound()) return false;
  const def = arsenal.currentDef;
  for (let p = 0; p < def.pellets; p += 1) {
    camera.getWorldDirection(direction);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, direction);
    const hit = raycaster.intersectObjects(shootables(), false)[0];
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const killed = damageBotByPlayer(bot, def.dmg * (part === 'head' ? def.head : 1), part);
      hud.hitMarker(killed, markerHoldMs);
    } else if (hit) {
      hud.hitMarker(false, markerHoldMs);
    }
  }
  arsenal.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(arsenal.mag, arsenal.reserve, def.name);
  return true;
}

function throwGrenade() {
  if (E.grenades <= 0) return;
  E.grenades -= 1;
  camera.getWorldDirection(direction);
  eyePos.copy(camera.position);
  grenades.throwFrom(eyePos, direction);
  hud.setHealth(playerHealth, E.money, E.armor);
}

function explodeAt(pos, radius, maxDamage) {
  // Player.
  if (playerAlive) {
    const d = pos.distanceTo(camera.position);
    if (d < radius) {
      damagePlayer(maxDamage * (1 - d / radius) * 0.6, { name: 'Shard grenade' });
      camera.getWorldDirection(forward);
      if (grenades.lookingAt(pos, camera.position, forward)) hud.flashScreen(0.85);
    }
  }
  // Bots: falloff damage, and a bot facing the burst is blinded.
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = pos.distanceTo(new THREE.Vector3(bot.pos.x, bot.pos.y + 1.2, bot.pos.z));
    if (d < radius) {
      const killed = bots.damage(bot, maxDamage * (1 - d / radius), 'torso');
      if (killed) feed('Shard grenade', 'ember', bot.name, bot.team, 'blast');
    }
    const toBlast = new THREE.Vector3().copy(pos).sub(new THREE.Vector3(bot.pos.x, bot.pos.y + 1.55, bot.pos.z)).normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (toBlast.dot(facing) > 0.4 && d < 26) bot.blindUntil = elapsed + 1.5;
  }
  checkElimination();
}

function tryPlantOrDefuse(dt) {
  const inSite = objective.siteOf(body.position);
  if (O.phase === 'live' && !O.planted && playerAlive && inSite && plantKeyHeld) {
    O.plantAt += dt;
    hud.setObjective(`Planting the charge — Site ${inSite}`, O.plantAt / 3);
    if (O.plantAt >= 3) {
      objective.plant(inSite);
      E.money += ECONOMY.plantBonus;
      hud.showBanner('Charge planted', `Site ${inSite} — 40 seconds to detonation`, 3000);
      hud.setObjective(null, 0);
    }
  } else if (O.phase === 'live' && O.planted && playerAlive && plantKeyHeld) {
    const c = objective.siteCenter(O.plantedSite);
    const d = Math.hypot(c.x - body.position.x, c.z - body.position.z);
    if (d < 2.5) {
      O.defuseAt += dt;
      hud.setObjective('Defusing the charge…', O.defuseAt / 5);
      if (O.defuseAt >= 5) endRound('warden', 'Charge defused');
    } else {
      O.defuseAt = 0;
      hud.setObjective(`Charge planted — Site ${O.plantedSite}`, 1 - O.chargeTimer / 40);
    }
  } else {
    O.plantAt = 0;
    if (O.phase === 'live' && O.planted) hud.setObjective(`Charge planted — Site ${O.plantedSite}`, 1 - O.chargeTimer / 40);
    else hud.setObjective(null, 0);
  }
}

function botContext() {
  return {
    time: elapsed,
    playerAlive,
    playerTeam: 'ember',
    playerPos: new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z),
    chargePlanted: O.planted,
    plantedSite: O.plantedSite ? objective.siteCenter(O.plantedSite) : null,
    chargeCarrierAlive: bots.carrier() ? bots.carrier().alive : false,
    damagePlayer,
    damageBot(bot, amount, part, fromBot) {
      const killed = bots.damage(bot, amount, part);
      if (killed) {
        feed(fromBot.name, fromBot.team, bot.name, bot.team, 'VK-9 rifle');
        checkElimination();
      }
    },
    plant(bot, sitePos) {
      const site = objective.siteOf(sitePos);
      if (site && objective.plant(site)) {
        hud.showBanner('Charge planted', `Site ${site} — 40 seconds to detonation`, 3000);
      }
    },
    defuse(bot) {
      endRound('warden', `${bot.name} defused the charge`);
    },
  };
}

function step(dt) {
  elapsed += dt;
  if (O.phase === 'buy') {
    O.timer -= dt;
    hud.setTimer(O.timer, 'buy');
    if (O.timer <= 0) {
      objective.beginLive();
      hud.hideBuy();
      hud.setTimer(O.timer, 'live');
      hud.showBanner(`Round ${O.round}`, 'Plant the charge or drop every Warden', 2200);
    }
  } else if (O.phase === 'live') {
    if (O.planted) {
      O.chargeTimer -= dt;
      hud.setTimer(O.chargeTimer, 'live');
      if (O.chargeTimer <= 0) endRound('ember', 'Charge detonated');
    } else {
      O.timer -= dt;
      hud.setTimer(O.timer, 'live');
      if (O.timer <= 0) endRound('warden', 'Time expired — Wardens hold the yard');
    }
  } else if (O.phase === 'over') {
    intermission -= dt;
    if (intermission <= 0) nextRound();
  }

  if (playerAlive) player.step(dt, input.state.keys);
  arsenal.step(dt);
  bots.step(dt, botContext());
  grenades.step(dt, { explode: explodeAt });
  tryPlantOrDefuse(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive && O.phase !== 'buy') player.look(look.x, look.y);
    if (playerAlive && input.state.firing && arsenal.ready() && O.phase === 'live') {
      shoot(shot ? 0 : arsenal.spread(player.groundSpeed()));
    }
    if (input.state.keys.has('KeyR')) arsenal.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  if (name === 'start') {
    startRound(1);
    body.position.set(0, 0, 14);
    body.yaw = Math.PI;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -10));
    hud.showBuy(E.money);
  } else if (name === 'play') {
    startRound(1);
    objective.beginLive();
    O.timer = 82;
    body.position.set(2, 0, 8);
    settle(20);
    const foe = bots.bots.find((b) => b.team === 'warden');
    foe.pos.set(-2, 0, -2);
    foe.group.position.copy(foe.pos);
    const mate = bots.bots.find((b) => b.team === 'ember' && b.index === 1);
    mate.pos.set(5, 0, 4);
    mate.group.position.copy(mate.pos);
    aimAt(new THREE.Vector3(foe.pos.x, 1.2, foe.pos.z));
    shoot(0);
    settle(10);
    aimAt(new THREE.Vector3(foe.pos.x, 1.2, foe.pos.z));
    hud.setTimer(O.timer, 'live');
  } else if (name === 'tactics') {
    startRound(1);
    objective.beginLive();
    objective.plant('A');
    O.chargeTimer = 31;
    body.position.set(-12, 0, -6);
    settle(20);
    const foe = bots.bots.find((b) => b.team === 'warden' && b.index === 1);
    foe.pos.set(-18, 0, -10);
    foe.group.position.copy(foe.pos);
    foe.yaw = Math.PI * 0.75;
    aimAt(new THREE.Vector3(-20, 1.4, -12));
    hud.setTimer(O.chargeTimer, 'live');
    hud.setObjective('Charge planted — Site A', 0.22);
    hud.showBanner('Charge planted', 'Site A — 31 seconds to detonation', 4000);
  } else {
    // end
    startRound(1);
    // The main.js wrapper (not objective.endRound directly): it sets the
    // 4 s intermission, so settle() below cannot roll into the next round
    // and reset the camera to spawn.
    endRound('ember', 'Charge detonated');
    body.position.set(0, 0, 14);
    settle(20);
    const foe = bots.bots.find((b) => b.team === 'warden');
    bots.damage(foe, 500, 'torso');
    foe.group.rotation.x = -1.45;
    aimAt(new THREE.Vector3(0, 1.2, -12));
    hud.setScores(1, 0);
    hud.setTimer(0, 'over');
    hud.showBanner('Ember takes the round', 'Charge detonated', 4000);
  }
  hud.setHealth(playerHealth, E.money, E.armor);
  hud.setAmmo(arsenal.mag, arsenal.reserve, arsenal.currentDef.name);
  // startRound re-opens the buy menu; only the start shot keeps it open.
  if (name !== 'start') hud.hideBuy();
  // The round-end banner is on a 3.6 s timer that the capture's virtual clock
  // would expire; re-show it with a long hold so the end shot keeps it.
  if (name === 'end') hud.showBanner('Ember takes the round', 'Charge detonated', 60000);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('mousedown', (event) => {
  if (event.button === 2 && playerAlive) {
    scoped = true;
    arsenal.setScoped(true);
  }
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 2) {
    scoped = false;
    arsenal.setScoped(false);
  }
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyB' && O.phase === 'buy' && !shot) {
    if (hud.buyOpen) { hud.hideBuy(); input.requestLock(); }
    else { hud.showBuy(E.money); if (document.pointerLockElement) document.exitPointerLock(); }
  }
  if (hud.buyOpen && O.phase === 'buy') {
    if (event.code === 'Digit1') economy.buyWeapon('vk9', arsenal);
    if (event.code === 'Digit2') economy.buyWeapon('heron', arsenal);
    if (event.code === 'Digit3') economy.buyWeapon('longbow', arsenal);
    if (event.code === 'Digit4') economy.buyWeapon('p9', arsenal);
    if (event.code === 'Digit5') economy.buyGrenade();
    if (event.code === 'Digit6') economy.buyArmor();
    hud.setAmmo(arsenal.mag, arsenal.reserve, arsenal.currentDef.name);
    hud.setHealth(playerHealth, E.money, E.armor);
    if (hud.buyOpen) hud.showBuy(E.money);
  }
  if (event.code === 'Digit1' && O.phase === 'live') arsenal.equip('vk9');
  if (event.code === 'Digit2' && O.phase === 'live') arsenal.equip('heron');
  if (event.code === 'Digit3' && O.phase === 'live') arsenal.equip('longbow');
  if (event.code === 'Digit4' && O.phase === 'live') arsenal.equip('p9');
  if (event.code === 'KeyG' && O.phase === 'live') throwGrenade();
  if (event.code === 'KeyE') plantKeyHeld = true;
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyE') plantKeyHeld = false;
});

hud.onPlay(() => {
  if (shot) return;
  if (O.matchOver) { restartMatch(); input.requestLock(); return; }
  if (!started) started = true;
  hud.hideOverlay();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (!O.matchOver && !hud.buyOpen) {
    hud.showOverlay(started ? 'paused' : 'start', { ember: O.wins.ember, warden: O.wins.warden });
  }
}

syncCamera();
startRound(1);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
