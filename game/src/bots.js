// Bots: five per side, each with a name, a route, a hold and a small brain. A bot
// walks its route, holds its ground, and when it spots an enemy it strafes and
// fires in short bursts. Attackers push a lane toward a site; one of them carries
// the charge and plants it once the site is clear. Defenders hold the sites and
// walk back to defuse. Every character here is original.
import * as THREE from "three";
import { PALETTE } from "./palette.js";
import { ROUTES, HOLDS, SPAWNS, slideMove } from "./world.js";

const CALLSIGNS = {
  ember: ["Ash", "Bramble", "Cinder", "Dusk", "Flint"],
  warden: ["Gale", "Heron", "Ivy", "Juniper", "Kestrel"],
};
const BOT_HEALTH = 100;
const BOT_SPEED = 3.4;
const EYE_HEIGHT = 1.55;

export function createBots(scene, world, rng) {
  const ray = new THREE.Raycaster();
  ray.far = 60;
  const units = [];
  const hitMeshes = [];
  const scratch = new THREE.Vector3();
  const scratchTo = new THREE.Vector3();

  function buildBody(team) {
    const sideColor = team === "ember" ? PALETTE.ember : PALETTE.warden;
    const suitMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(sideColor), roughness: 0.6, metalness: 0.05 });
    const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
    const kitMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
    const group = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.75, 0.28), kitMat);
    legs.position.y = 0.375;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), suitMat);
    torso.position.y = 1.12;
    torso.userData.part = "torso";
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), skinMat);
    head.position.y = 1.66;
    head.userData.part = "head";
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.55), kitMat);
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

  function spawnBot(team, index) {
    const parts = buildBody(team);
    scene.add(parts.group);
    const unit = {
      name: CALLSIGNS[team][index],
      team,
      index,
      parts,
      group: parts.group,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0,
      health: BOT_HEALTH,
      alive: true,
      route: [],
      routeIndex: 0,
      hold: null,
      holdYaw: 0,
      state: "route",
      target: null,
      scanAt: 0,
      burstLeft: 0,
      burstAt: 0,
      fall: 0,
      deadAt: 0,
      plantAt: 0,
      defuseAt: 0,
      blindUntil: 0,
      isCarrier: team === "ember" && index === 0,
    };
    parts.torso.userData.bot = unit;
    parts.head.userData.bot = unit;
    hitMeshes.push(parts.torso, parts.head);
    units.push(unit);
    return unit;
  }

  for (let i = 0; i < 5; i += 1) { spawnBot("ember", i); spawnBot("warden", i); }

  function giveRoutes(round) {
    const pick = (routes, i) => routes[i % routes.length];
    const emberRoutes = [ROUTES.aLong, ROUTES.bLong, ROUTES.mid, ROUTES.aLong, ROUTES.bLong];
    const wardenHolds = [HOLDS.A, HOLDS.B, HOLDS.mid, HOLDS.A, HOLDS.B];
    for (const unit of units) {
      if (unit.team === "ember") {
        unit.route = pick(emberRoutes, unit.index).map(([x, z]) => new THREE.Vector3(x, 0, z));
        unit.hold = null;
      } else {
        const hold = wardenHolds[unit.index][(round + unit.index) % wardenHolds[unit.index].length];
        unit.route = [new THREE.Vector3(hold[0], 0, hold[1])];
        unit.hold = new THREE.Vector3(hold[0], 0, hold[1]);
        unit.holdYaw = unit.index % 2 === 0 ? 0 : Math.PI;
      }
      unit.routeIndex = 0;
      unit.state = "route";
      unit.target = null;
    }
  }

  function resetAll(round) {
    for (const unit of units) {
      const [x, z] = SPAWNS[unit.team][unit.index];
      unit.pos.set(x, 0, z);
      unit.vel.set(0, 0, 0);
      unit.health = BOT_HEALTH;
      unit.alive = true;
      unit.fall = 0;
      unit.yaw = unit.team === "ember" ? Math.PI : 0;
      unit.group.visible = true;
      unit.group.rotation.set(0, unit.yaw, 0);
      unit.group.position.copy(unit.pos);
      unit.parts.flash.material.opacity = 0;
      unit.blindUntil = 0;
      unit.plantAt = 0;
      unit.defuseAt = 0;
    }
    giveRoutes(round);
  }

  function eyePos(unit) {
    return scratchTo.set(unit.pos.x, unit.pos.y + EYE_HEIGHT, unit.pos.z);
  }

  // Line of sight: nothing solid between the bot's eye and the target's chest.
  function canSee(unit, targetPos, range) {
    scratch.copy(targetPos).sub(eyePos(unit));
    const dist = scratch.length();
    if (dist > range) return false;
    scratch.normalize();
    ray.set(eyePos(unit), scratch);
    ray.far = dist;
    const hit = ray.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function turnTo(unit, x, z, dt) {
    const want = Math.atan2(-(x - unit.pos.x), -(z - unit.pos.z));
    let diff = want - unit.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    unit.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  }

  function walkTo(unit, x, z, dt, speed) {
    const dx = x - unit.pos.x;
    const dz = z - unit.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return true;
    unit.vel.set((dx / len) * speed, 0, (dz / len) * speed);
    turnTo(unit, x, z, dt);
    slideMove(world.colliders, unit.pos, unit.vel, dt, 0.34, 1.72);
    return false;
  }

  function damage(unit, amount, part) {
    if (!unit.alive) return false;
    unit.health -= amount;
    if (unit.health > 0) return false;
    unit.alive = false;
    unit.fall = 0;
    unit.deadAt = 0;
    return true;
  }

  function tick(dt, ctx) {
    for (const unit of units) {
      if (!unit.alive) {
        unit.fall = Math.min(1, unit.fall + dt / 0.4);
        unit.group.rotation.x = -unit.fall * 1.45;
        unit.deadAt += dt;
        if (unit.deadAt > 3) unit.group.visible = false;
        continue;
      }
      unit.group.position.copy(unit.pos);
      unit.group.rotation.y = unit.yaw;
      unit.parts.flash.material.opacity = Math.max(0, unit.parts.flash.material.opacity - dt * 12);
      const blinded = ctx.time < unit.blindUntil;

      // Look for a target every quarter second, or keep the one already held.
      if (ctx.time >= unit.scanAt) {
        unit.scanAt = ctx.time + 0.25;
        unit.target = null;
        if (!blinded) {
          let nearest = null;
          let nearestDist = 42;
          const enemies = [];
          if (ctx.playerAlive && ctx.playerTeam !== unit.team) enemies.push({ pos: ctx.playerPos, dist: 0, isPlayer: true });
          for (const other of units) {
            if (other.alive && other.team !== unit.team) enemies.push({ pos: new THREE.Vector3(other.pos.x, other.pos.y + 1.2, other.pos.z), dist: 0, bot: other });
          }
          for (const foe of enemies) {
            const d = eyePos(unit).distanceTo(foe.pos);
            if (d < nearestDist && canSee(unit, foe.pos, 42)) { nearest = foe; nearestDist = d; }
          }
          unit.target = nearest;
          if (nearest) { unit.state = "engage"; unit.burstLeft = 3 + Math.floor(rng() * 3); unit.burstAt = ctx.time + 0.2 + rng() * 0.3; }
          else if (unit.state === "engage") unit.state = unit.hold ? "hold" : "route";
        }
      }

      if (unit.target && !blinded) {
        const tp = unit.target.pos;
        turnTo(unit, tp.x, tp.z, dt);
        // Strafe slowly while engaging, so a duel is a duel.
        const sidestep = Math.sin(ctx.time * 1.3 + unit.index * 2.1) * 1.1;
        const fx = -Math.sin(unit.yaw);
        const fz = -Math.cos(unit.yaw);
        unit.vel.set(-fz * sidestep, 0, fx * sidestep);
        slideMove(world.colliders, unit.pos, unit.vel, dt, 0.34, 1.72);
        if (ctx.time >= unit.burstAt && unit.burstLeft > 0) {
          unit.burstAt = ctx.time + 0.13;
          unit.burstLeft -= 1;
          unit.parts.flash.material.opacity = 0.9;
          const dist = eyePos(unit).distanceTo(tp);
          const hitChance = Math.max(0.08, Math.min(0.42, 0.42 - dist * 0.008));
          if (rng() < hitChance) {
            const head = rng() < 0.15;
            const power = head ? 48 : 24;
            if (unit.target.isPlayer) ctx.damagePlayer(power, unit);
            else ctx.damageBot(unit.target.bot, power, head ? "head" : "torso", unit);
          }
          if (unit.burstLeft === 0) unit.burstAt = ctx.time + 0.7 + rng() * 0.6;
        }
        continue;
      }

      // No target: work the objective.
      if (ctx.chargePlanted && unit.team === "warden") {
        // Retake: walk to the planted site and defuse when clear.
        const site = ctx.plantedSite;
        const d = Math.hypot(site.x - unit.pos.x, site.z - unit.pos.z);
        const threatNear = units.some((o) => o.alive && o.team !== unit.team && Math.hypot(o.pos.x - unit.pos.x, o.pos.z - unit.pos.z) < 12)
          || (ctx.playerAlive && ctx.playerTeam !== unit.team && Math.hypot(ctx.playerPos.x - unit.pos.x, ctx.playerPos.z - unit.pos.z) < 12);
        if (d > 1.5) { unit.state = "route"; walkTo(unit, site.x, site.z, dt, BOT_SPEED); unit.defuseAt = 0; }
        else if (!threatNear) {
          unit.state = "defuse";
          unit.defuseAt += dt;
          if (unit.defuseAt >= 5) ctx.defuse(unit);
        } else unit.defuseAt = 0;
        continue;
      }

      if (unit.isCarrier && unit.team === "ember" && !ctx.chargePlanted && ctx.chargeCarrierAlive !== false) {
        const site = unit.route.length ? unit.route[unit.route.length - 1] : null;
        if (site && Math.hypot(site.x - unit.pos.x, site.z - unit.pos.z) < 2) {
          const threatNear = units.some((o) => o.alive && o.team !== unit.team && Math.hypot(o.pos.x - site.x, o.pos.z - site.z) < 10)
            || (ctx.playerAlive && ctx.playerTeam !== unit.team && Math.hypot(ctx.playerPos.x - site.x, ctx.playerPos.z - site.z) < 10);
          if (!threatNear) {
            unit.state = "plant";
            unit.plantAt += dt;
            if (unit.plantAt >= 3) ctx.plant(unit, site);
            continue;
          }
          // Interrupted mid-plant: the plant restarts from zero, it does not
          // resume where it left off once the site is clear again.
          unit.plantAt = 0;
          unit.state = "route";
        }
      }

      if (unit.state === "hold" || (unit.hold && unit.routeIndex >= unit.route.length)) {
        unit.state = "hold";
        unit.yaw += Math.sin(ctx.time * 0.5 + unit.index) * dt * 0.4;
        continue;
      }

      const wp = unit.route[unit.routeIndex];
      if (wp) {
        if (walkTo(unit, wp.x, wp.z, dt, BOT_SPEED)) unit.routeIndex += 1;
      } else if (unit.hold) {
        unit.state = "hold";
      }
    }
  }

  return {
    bots: units,
    hitMeshes,
    step: tick,
    reset: resetAll,
    damage,
    aliveCount(team) {
      return units.filter((b) => b.alive && b.team === team).length;
    },
    carrier() {
      return units.find((b) => b.isCarrier);
    },
  };
}
