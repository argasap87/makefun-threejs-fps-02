// The map: "Foundry Yard", an original industrial yard. Two charge sites, three
// lanes, cover to crouch behind and sightlines worth holding. Every box is a
// collider for movement and a surface a bullet stops on. Plain geometry only:
// no models, no textures.
import * as THREE from "three";
import { PALETTE } from "./palette.js";

// Waypoint routes (x, z). Attackers walk them from the south spawn to a site;
// defenders walk the reverse legs to a hold position.
export const ROUTES = {
  aLong: [[0, 17], [-14, 12], [-24, 4], [-24, -6], [-20, -12]],
  bLong: [[0, 17], [14, 12], [24, 4], [24, -6], [20, -12]],
  mid: [[0, 17], [0, 10], [0, 0], [0, -8], [0, -14]],
  toA: [[0, -14], [-10, -14], [-20, -12]],
  toB: [[0, -14], [10, -14], [20, -12]],
};

export const HOLDS = {
  A: [[-20, -10], [-16, -14], [-23, -8], [-18, -15]],
  B: [[20, -10], [16, -14], [23, -8], [18, -15]],
  mid: [[-4, -10], [4, -10], [0, -6]],
};

export const SPAWNS = {
  ember: [[-6, 17], [-2, 17], [2, 17], [6, 17], [0, 15]],
  warden: [[-6, -17], [-2, -17], [2, -17], [6, -17], [0, -15]],
};

// Axis-separated box slide used by the player and the bots alike: move one axis
// at a time and stop at the first collider, so a wall never swallows a body.
export function slideMove(colliders, pos, vel, dt, radius, height) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }
  const nx = pos.x + vel.x * dt;
  if (!overlaps(nx, pos.y, pos.z, 0.04)) pos.x = nx; else vel.x = 0;
  const nz = pos.z + vel.z * dt;
  if (!overlaps(pos.x, pos.y, nz, 0.04)) pos.z = nz; else vel.z = 0;
  pos.y += vel.y * dt;
  const hit = overlaps(pos.x, pos.y, pos.z, 0);
  if (hit && vel.y <= 0) { pos.y = hit.max.y; vel.y = 0; return true; }
  if (hit) { pos.y = hit.min.y - height; vel.y = 0; }
  if (pos.y < 0) { pos.y = 0; vel.y = 0; return true; }
  return pos.y === 0;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === "accent" || name === "ink" ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function block(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mats[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: 56 x 40 m, walls 5 m high, open sky so one directional light reaches all.
  block(56.4, 0.4, 40.4, 0, -0.2, 0, "canvas");
  block(0.4, 5, 40.4, -28.2, 2.5, 0, "surface");
  block(0.4, 5, 40.4, 28.2, 2.5, 0, "surface");
  block(56.4, 5, 0.4, 0, 2.5, -20.2, "surface");
  block(56.4, 5, 0.4, 0, 2.5, 20.2, "surface");

  // Site A, "Furnace" (north-west): a furnace block, a chimney stack and pipe crates.
  block(6, 3.4, 1.2, -24, 1.7, -16, "surface");
  block(1.4, 6.5, 1.4, -25.5, 3.25, -13, "hairline");
  block(3.2, 1.1, 1.2, -17, 0.55, -16.5, "hairline");
  block(1.2, 1.1, 3.2, -15, 0.55, -11, "hairline");
  // Site B, "Depot" (north-east): stacked containers and a low wall.
  block(5, 2.6, 2.4, 24.5, 1.3, -15, "surface");
  block(5, 2.6, 2.4, 24.5, 3.9, -15, "hairline");
  block(2.4, 1.1, 1.2, 17, 0.55, -16.5, "hairline");
  block(1.2, 1.1, 2.4, 15, 0.55, -11, "hairline");
  // Mid: a pillar pair and a low wall split the lane, with gaps to shoot through.
  block(1.4, 3.6, 1.4, -3, 1.8, 0, "hairline");
  block(1.4, 3.6, 1.4, 3, 1.8, 0, "hairline");
  block(4, 1.1, 1.2, 0, 0.55, -8, "hairline");
  block(4, 1.1, 1.2, 0, 0.55, 8, "hairline");
  // A-long and B-long cover: crates to crouch behind on the way to each site.
  block(1.6, 1.1, 1.6, -24, 0.55, 6, "hairline");
  block(1.6, 1.1, 1.6, -24, 0.55, -2, "hairline");
  block(1.6, 1.1, 1.6, 24, 0.55, 6, "hairline");
  block(1.6, 1.1, 1.6, 24, 0.55, -2, "hairline");
  block(2.4, 0.9, 1.2, -12, 0.45, 12, "hairline");
  block(2.4, 0.9, 1.2, 12, 0.45, 12, "hairline");
  block(2.4, 0.9, 1.2, -12, 0.45, -6, "hairline");
  block(2.4, 0.9, 1.2, 12, 0.45, -6, "hairline");
  // Spawn cover, south and north.
  block(2.4, 0.9, 1.2, -8, 0.45, 14, "hairline");
  block(2.4, 0.9, 1.2, 8, 0.45, 14, "hairline");
  block(2.4, 0.9, 1.2, -8, 0.45, -14, "hairline");
  block(2.4, 0.9, 1.2, 8, 0.45, -14, "hairline");

  // Site pads: flat markers the objective reads (not colliders).
  const siteA = new THREE.Box3(new THREE.Vector3(-24, 0, -16), new THREE.Vector3(-16, 3, -8));
  const siteB = new THREE.Box3(new THREE.Vector3(16, 0, -16), new THREE.Vector3(24, 3, -8));

  // Light: a warm key from the south-east, a cool fill from the north, sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.45);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.5);
  key.position.set(18, 22, 16);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -32;
  key.shadow.camera.right = 32;
  key.shadow.camera.top = 28;
  key.shadow.camera.bottom = -28;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.55);
  fill.position.set(-14, 12, -18);
  scene.add(fill);

  return { colliders, shootables, group, siteA, siteB };
}
