// Bots: five a side, with names, routes, holds and a simple brain. A bot walks its
// route, holds its ground, and when it sees an enemy it strafes and fires in bursts.
// Attackers push a lane to a site; one carries the charge and plants when the site
// is clear. Defenders hold sites and retake to defuse. All original characters.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { ROUTES, HOLDS, SPAWNS, slideMove } from './world.js';

const NAMES = {
  ember: ['Ash', 'Bramble', 'Cinder', 'Dusk', 'Flint'],
  warden: ['Gale', 'Heron', 'Ivy', 'Juniper', 'Kestrel'],
};
const HEALTH = 100;
const SPEED = 3.4;
const EYE = 1.55;

export function createBots(scene, world, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const hitMeshes = [];
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();

  function makeMesh(team) {
    const teamColor = team === 'ember' ? PALETTE.ember : PALETTE.warden;
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.05 });
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
    const group = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.75, 0.28), darkMat);
    legs.position.y = 0.375;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), bodyMat);
    torso.position.y = 1.12;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), headMat);
    head.position.y = 1.66;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.55), darkMat);
    gun.position.set(0.2, 1.15, -0.3);
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    flash.position.set(0.2, 1.15, -0.65);
    group.add(legs, torso, head, gun, flash);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return { group, torso, head, flash };
  }

  function makeBot(team, index) {
    const parts = makeMesh(team);
    scene.add(parts.group);
    const bot = {
      name: NAMES[team][index],
      team,
      index,
      parts,
      group: parts.group,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0,
      health: HEALTH,
      alive: true,
      route: [],
      routeIndex: 0,
      hold: null,
      holdYaw: 0,
      state: 'route',
      target: null,
      scanAt: 0,
      burstLeft: 0,
      burstAt: 0,
      fall: 0,
      deadAt: 0,
      plantAt: 0,
      defuseAt: 0,
      blindUntil: 0,
      isCarrier: team === 'ember' && index === 0,
    };
    parts.torso.userData.bot = bot;
    parts.head.userData.bot = bot;
    hitMeshes.push(parts.torso, parts.head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 5; i += 1) { makeBot('ember', i); makeBot('warden', i); }

  function assignRoutes(round) {
    const pick = (routes, i) => routes[i % routes.length];
    const emberRoutes = [ROUTES.aLong, ROUTES.bLong, ROUTES.mid, ROUTES.aLong, ROUTES.bLong];
    const wardenHolds = [HOLDS.A, HOLDS.B, HOLDS.mid, HOLDS.A, HOLDS.B];
    for (const bot of bots) {
      if (bot.team === 'ember') {
        bot.route = pick(emberRoutes, bot.index).map(([x, z]) => new THREE.Vector3(x, 0, z));
        bot.hold = null;
      } else {
        const hold = wardenHolds[bot.index][(round + bot.index) % wardenHolds[bot.index].length];
        bot.route = [new THREE.Vector3(hold[0], 0, hold[1])];
        bot.hold = new THREE.Vector3(hold[0], 0, hold[1]);
        bot.holdYaw = bot.index % 2 === 0 ? 0 : Math.PI;
      }
      bot.routeIndex = 0;
      bot.state = 'route';
      bot.target = null;
    }
  }

  function reset(round) {
    for (const bot of bots) {
      const [x, z] = SPAWNS[bot.team][bot.index];
      bot.pos.set(x, 0, z);
      bot.vel.set(0, 0, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.fall = 0;
      bot.yaw = bot.team === 'ember' ? Math.PI : 0;
      bot.group.visible = true;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.pos);
      bot.parts.flash.material.opacity = 0;
      bot.blindUntil = 0;
      bot.plantAt = 0;
      bot.defuseAt = 0;
    }
    assignRoutes(round);
  }

  function eyeOf(bot) {
    return tmpTo.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
  }

  // Line of sight: nothing solid between the bot's eye and the target's chest.
  function sees(bot, targetPos, range) {
    tmpDir.copy(targetPos).sub(eyeOf(bot));
    const dist = tmpDir.length();
    if (dist > range) return false;
    tmpDir.normalize();
    raycaster.set(eyeOf(bot), tmpDir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function faceToward(bot, x, z, dt) {
    const want = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  }

  function moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.pos.x;
    const dz = z - bot.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return true;
    bot.vel.set((dx / len) * speed, 0, (dz / len) * speed);
    faceToward(bot, x, z, dt);
    slideMove(world.colliders, bot.pos, bot.vel, dt, 0.34, 1.72);
    return false;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.deadAt = 0;
    return true;
  }

  function step(dt, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.deadAt += dt;
        if (bot.deadAt > 3) bot.group.visible = false;
        continue;
      }
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = bot.yaw;
      bot.parts.flash.material.opacity = Math.max(0, bot.parts.flash.material.opacity - dt * 12);
      const blinded = ctx.time < bot.blindUntil;

      // Scan for a target every quarter second, or keep the one we have.
      if (ctx.time >= bot.scanAt) {
        bot.scanAt = ctx.time + 0.25;
        bot.target = null;
        if (!blinded) {
          let best = null;
          let bestDist = 42;
          const foes = [];
          if (ctx.playerAlive && ctx.playerTeam !== bot.team) foes.push({ pos: ctx.playerPos, dist: 0, isPlayer: true });
          for (const other of bots) {
            if (other.alive && other.team !== bot.team) foes.push({ pos: new THREE.Vector3(other.pos.x, other.pos.y + 1.2, other.pos.z), dist: 0, bot: other });
          }
          for (const foe of foes) {
            const d = eyeOf(bot).distanceTo(foe.pos);
            if (d < bestDist && sees(bot, foe.pos, 42)) { best = foe; bestDist = d; }
          }
          bot.target = best;
          if (best) { bot.state = 'engage'; bot.burstLeft = 3 + Math.floor(random() * 3); bot.burstAt = ctx.time + 0.2 + random() * 0.3; }
          else if (bot.state === 'engage') bot.state = bot.hold ? 'hold' : 'route';
        }
      }

      if (bot.target && !blinded) {
        const tp = bot.target.pos;
        faceToward(bot, tp.x, tp.z, dt);
        // Strafe slowly while engaging, so a duel is a duel.
        const strafe = Math.sin(ctx.time * 1.3 + bot.index * 2.1) * 1.1;
        const fx = -Math.sin(bot.yaw);
        const fz = -Math.cos(bot.yaw);
        bot.vel.set(-fz * strafe, 0, fx * strafe);
        slideMove(world.colliders, bot.pos, bot.vel, dt, 0.34, 1.72);
        if (ctx.time >= bot.burstAt && bot.burstLeft > 0) {
          bot.burstAt = ctx.time + 0.13;
          bot.burstLeft -= 1;
          bot.parts.flash.material.opacity = 0.9;
          const dist = eyeOf(bot).distanceTo(tp);
          const chance = Math.max(0.08, Math.min(0.42, 0.42 - dist * 0.008));
          if (random() < chance) {
            const head = random() < 0.15;
            const dmg = head ? 48 : 24;
            if (bot.target.isPlayer) ctx.damagePlayer(dmg, bot);
            else ctx.damageBot(bot.target.bot, dmg, head ? 'head' : 'torso', bot);
          }
          if (bot.burstLeft === 0) bot.burstAt = ctx.time + 0.7 + random() * 0.6;
        }
        continue;
      }

      // No target: work the objective.
      if (ctx.chargePlanted && bot.team === 'warden') {
        // Retake: walk to the planted site and defuse when clear.
        const site = ctx.plantedSite;
        const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
        const enemiesNear = bots.some((o) => o.alive && o.team !== bot.team && Math.hypot(o.pos.x - bot.pos.x, o.pos.z - bot.pos.z) < 12)
          || (ctx.playerAlive && ctx.playerTeam !== bot.team && Math.hypot(ctx.playerPos.x - bot.pos.x, ctx.playerPos.z - bot.pos.z) < 12);
        if (d > 1.5) { bot.state = 'route'; moveToward(bot, site.x, site.z, dt, SPEED); bot.defuseAt = 0; }
        else if (!enemiesNear) {
          bot.state = 'defuse';
          bot.defuseAt += dt;
          if (bot.defuseAt >= 5) ctx.defuse(bot);
        } else bot.defuseAt = 0;
        continue;
      }

      if (bot.isCarrier && bot.team === 'ember' && !ctx.chargePlanted && ctx.chargeCarrierAlive !== false) {
        const site = bot.route.length ? bot.route[bot.route.length - 1] : null;
        if (site && Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z) < 2) {
          const enemiesNear = bots.some((o) => o.alive && o.team !== bot.team && Math.hypot(o.pos.x - site.x, o.pos.z - site.z) < 10)
            || (ctx.playerAlive && ctx.playerTeam !== bot.team && Math.hypot(ctx.playerPos.x - site.x, ctx.playerPos.z - site.z) < 10);
          if (!enemiesNear) {
            bot.state = 'plant';
            bot.plantAt += dt;
            if (bot.plantAt >= 3) ctx.plant(bot, site);
            continue;
          }
          // Interrupted mid-plant: the plant restarts from zero, it does not
          // resume where it left off once the site is clear again.
          bot.plantAt = 0;
          bot.state = 'route';
        }
      }

      if (bot.state === 'hold' || (bot.hold && bot.routeIndex >= bot.route.length)) {
        bot.state = 'hold';
        bot.yaw += Math.sin(ctx.time * 0.5 + bot.index) * dt * 0.4;
        continue;
      }

      const wp = bot.route[bot.routeIndex];
      if (wp) {
        if (moveToward(bot, wp.x, wp.z, dt, SPEED)) bot.routeIndex += 1;
      } else if (bot.hold) {
        bot.state = 'hold';
      }
    }
  }

  return {
    bots,
    hitMeshes,
    step,
    reset,
    damage,
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    carrier() {
      return bots.find((b) => b.isCarrier);
    },
  };
}
