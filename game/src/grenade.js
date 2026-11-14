// The Shard grenade: a thrown charge on a short fuse. It arcs, bounces once off the
// map, then bursts — damage falls off with distance, and anyone looking at the burst
// is blinded. One module, one job.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 12;
const FUSE = 1.6;
const BLAST_RADIUS = 6;
const MAX_DAMAGE = 90;

export function createGrenades(scene, world) {
  const active = [];
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4 });
  const blastGeo = new THREE.SphereGeometry(1, 16, 12);
  const blastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.7, depthWrite: false });
  const blasts = [];
  const tmp = new THREE.Vector3();

  function pointBlocked(p) {
    for (const c of world.colliders) {
      if (p.x > c.min.x && p.x < c.max.x && p.y > c.min.y && p.y < c.max.y && p.z > c.min.z && p.z < c.max.z) return c;
    }
    return null;
  }

  return {
    active,
    throwFrom(origin, direction) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin);
      scene.add(mesh);
      active.push({ mesh, vel: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)), fuse: FUSE, bounced: false });
    },
    step(dt, ctx) {
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const g = active[i];
        g.fuse -= dt;
        g.vel.y -= GRAVITY * dt;
        g.mesh.position.addScaledVector(g.vel, dt);
        const p = g.mesh.position;
        if (p.y <= 0.09) { p.y = 0.09; g.vel.y = Math.abs(g.vel.y) * 0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
        const hit = pointBlocked(p);
        if (hit && !g.bounced) {
          g.bounced = true;
          g.vel.multiplyScalar(-0.35);
          p.addScaledVector(g.vel, dt);
        }
        if (g.fuse <= 0) {
          active.splice(i, 1);
          scene.remove(g.mesh);
          const blast = new THREE.Mesh(blastGeo, blastMat.clone());
          blast.position.copy(p);
          blast.scale.setScalar(0.5);
          scene.add(blast);
          blasts.push({ mesh: blast, life: 0.35 });
          ctx.explode(p.clone(), BLAST_RADIUS, MAX_DAMAGE);
        }
      }
      for (let i = blasts.length - 1; i >= 0; i -= 1) {
        const b = blasts[i];
        b.life -= dt;
        b.mesh.scale.setScalar(Math.max(0.1, 0.5 + (0.35 - b.life) * 14));
        b.mesh.material.opacity = Math.max(0, b.life / 0.35) * 0.7;
        if (b.life <= 0) { scene.remove(b.mesh); blasts.splice(i, 1); }
      }
    },
    clear() {
      for (const g of active) scene.remove(g.mesh);
      active.length = 0;
      for (const b of blasts) scene.remove(b.mesh);
      blasts.length = 0;
    },
    // Was the burst in the viewer's face? Used for the flash effect.
    lookingAt(pos, eye, forward) {
      tmp.copy(pos).sub(eye).normalize();
      return tmp.dot(forward) > 0.5 && eye.distanceTo(pos) < 26;
    },
  };
}
