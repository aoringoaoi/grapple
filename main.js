import * as THREE from 'three';
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat?min';

await RAPIER.init();

const canvas = document.querySelector('#app');
const statsEl = document.querySelector('#stats');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8ff);
scene.fog = new THREE.Fog(0x87b8ff, 40, 260);

scene.add(new THREE.HemisphereLight(0xddeeff, 0x334455, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(35, 65, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
scene.add(sun);

const world = new RAPIER.World({ x: 0, y: -24, z: 0 });

const FLOOR_HALF = 180;
const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
world.createCollider(RAPIER.ColliderDesc.cuboid(FLOOR_HALF, 1, FLOOR_HALF), groundBody);

const groundMesh = new THREE.Mesh(
  new THREE.BoxGeometry(FLOOR_HALF * 2, 2, FLOOR_HALF * 2),
  new THREE.MeshStandardMaterial({ color: 0x364152, roughness: 0.92, metalness: 0.06 })
);
groundMesh.position.set(0, -1, 0);
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const buildingMaterial = new THREE.MeshStandardMaterial({
  color: 0x8693a6,
  roughness: 0.78,
  metalness: 0.12
});

const buildingBoxes = [];
const buildingCount = 120;
const cityRadius = 140;

for (let i = 0; i < buildingCount; i++) {
  const width = 4 + Math.random() * 7;
  const depth = 4 + Math.random() * 7;
  const height = 10 + Math.random() * 40;

  const angle = Math.random() * Math.PI * 2;
  const radius = 8 + Math.random() * cityRadius;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  if (Math.hypot(x, z) < 18) continue;

  const y = height / 2;

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2), body);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), buildingMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  buildingBoxes.push(mesh);
}

const playerRadius = 0.5;
const playerHalfHeight = 1.0;
const playerBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 5, 0)
    .setLinearDamping(0.28)
    .setAngularDamping(1.6)
    .lockRotations()
);
world.createCollider(
  RAPIER.ColliderDesc.capsule(playerHalfHeight, playerRadius)
    .setFriction(0.1)
    .setRestitution(0)
    .setMass(1.0),
  playerBody
);

const playerMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(playerRadius, playerHalfHeight * 2, 8, 14),
  new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45 })
);
playerMesh.castShadow = true;
scene.add(playerMesh);

const raycaster = new THREE.Raycaster();
const mouseNdc = new THREE.Vector2();

const ropeLineGeometry = new THREE.BufferGeometry();
ropeLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
const ropeLine = new THREE.Line(
  ropeLineGeometry,
  new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.9 })
);
ropeLine.visible = false;
scene.add(ropeLine);

const keys = new Set();
let jumpQueued = false;
let grappleHeld = false;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 7, 14);

const controlConfig = {
  groundAccel: 48,
  airAccel: 10,
  maxMoveSpeed: 18,
  jumpSpeed: 11,
  groundProbe: playerHalfHeight + playerRadius + 0.15,
  ropeSpring: 95,
  ropeDamper: 14,
  ropeMin: 3,
  ropeMax: 90,
  reelSpeed: 1.4,
  fixedDt: 1 / 60,
  maxSubSteps: 4
};

const grapple = {
  active: false,
  anchor: new THREE.Vector3(),
  ropeLength: 0
};

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    jumpQueued = true;
    event.preventDefault();
    return;
  }
  keys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

window.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  grappleHeld = true;
  attemptGrapple(event.clientX, event.clientY);
});

window.addEventListener('mouseup', (event) => {
  if (event.button !== 0) return;
  grappleHeld = false;
  releaseGrapple();
});

window.addEventListener('mouseleave', () => {
  grappleHeld = false;
  releaseGrapple();
});

window.addEventListener(
  'wheel',
  (event) => {
    if (!grapple.active) return;
    const delta = Math.sign(event.deltaY);
    grapple.ropeLength += delta * controlConfig.reelSpeed;
    grapple.ropeLength = THREE.MathUtils.clamp(grapple.ropeLength, controlConfig.ropeMin, controlConfig.ropeMax);
  },
  { passive: true }
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function getMoveInput() {
  const input = new THREE.Vector3();
  if (keys.has('KeyW')) input.z -= 1;
  if (keys.has('KeyS')) input.z += 1;
  if (keys.has('KeyA')) input.x -= 1;
  if (keys.has('KeyD')) input.x += 1;

  if (input.lengthSq() === 0) return input;

  input.normalize();

  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  camForward.y = 0;
  if (camForward.lengthSq() < 1e-6) camForward.set(0, 0, -1);
  camForward.normalize();

  const camRight = new THREE.Vector3().crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

  const move = new THREE.Vector3();
  move.addScaledVector(camForward, input.z);
  move.addScaledVector(camRight, input.x);
  if (move.lengthSq() > 0) move.normalize();
  return move;
}

function isGrounded() {
  const pos = playerBody.translation();
  const ray = new RAPIER.Ray({ x: pos.x, y: pos.y, z: pos.z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, controlConfig.groundProbe, true);
  return hit !== null;
}

function applyMovement(dt) {
  const grounded = isGrounded();
  const accel = grounded ? controlConfig.groundAccel : controlConfig.airAccel;
  const desired = getMoveInput().multiplyScalar(controlConfig.maxMoveSpeed);

  const vel = playerBody.linvel();
  const horizontal = new THREE.Vector2(vel.x, vel.z);
  const desired2 = new THREE.Vector2(desired.x, desired.z);
  const delta = desired2.sub(horizontal);

  if (delta.lengthSq() > 0) {
    const maxChange = accel * dt;
    if (delta.length() > maxChange) delta.setLength(maxChange);
    playerBody.applyImpulse({ x: delta.x, y: 0, z: delta.y }, true);
  }

  if (jumpQueued && grounded) {
    const lv = playerBody.linvel();
    playerBody.setLinvel({ x: lv.x, y: controlConfig.jumpSpeed, z: lv.z }, true);
  }

  jumpQueued = false;
}

function attemptGrapple(clientX, clientY) {
  mouseNdc.x = (clientX / window.innerWidth) * 2 - 1;
  mouseNdc.y = -(clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouseNdc, camera);
  const intersects = raycaster.intersectObjects(buildingBoxes, false);

  if (!intersects.length) {
    releaseGrapple();
    return;
  }

  const hit = intersects[0].point;
  grapple.anchor.copy(hit);

  const p = playerBody.translation();
  const playerPos = new THREE.Vector3(p.x, p.y, p.z);
  grapple.ropeLength = THREE.MathUtils.clamp(
    playerPos.distanceTo(grapple.anchor),
    controlConfig.ropeMin + 0.5,
    controlConfig.ropeMax
  );
  grapple.active = true;
  ropeLine.visible = true;
}

function releaseGrapple() {
  grapple.active = false;
  ropeLine.visible = false;
}

function applyGrappleForce() {
  if (!grapple.active || !grappleHeld) return;

  const p = playerBody.translation();
  const v = playerBody.linvel();

  const playerPos = new THREE.Vector3(p.x, p.y, p.z);
  const toPlayer = new THREE.Vector3().subVectors(playerPos, grapple.anchor);
  const distance = toPlayer.length();

  if (distance < 1e-4) return;

  const dir = toPlayer.divideScalar(distance);
  const stretch = distance - grapple.ropeLength;

  if (stretch <= 0) return;

  const velocityAlongRope = new THREE.Vector3(v.x, v.y, v.z).dot(dir);
  const forceMag = controlConfig.ropeSpring * stretch + controlConfig.ropeDamper * velocityAlongRope;
  const force = dir.multiplyScalar(-Math.max(0, forceMag));
  playerBody.addForce({ x: force.x, y: force.y, z: force.z }, true);
}

function updateVisuals() {
  const t = playerBody.translation();
  playerMesh.position.set(t.x, t.y, t.z);

  if (grapple.active) {
    const positions = ropeLine.geometry.attributes.position.array;
    positions[0] = grapple.anchor.x;
    positions[1] = grapple.anchor.y;
    positions[2] = grapple.anchor.z;
    positions[3] = t.x;
    positions[4] = t.y;
    positions[5] = t.z;
    ropeLine.geometry.attributes.position.needsUpdate = true;
  }
}

const tempVec = new THREE.Vector3();
function updateCamera(dt) {
  const p = playerBody.translation();
  const lv = playerBody.linvel();
  const speed = Math.hypot(lv.x, lv.y, lv.z);

  const moveDir = tempVec.set(lv.x, 0, lv.z);
  if (moveDir.lengthSq() < 0.05) {
    camera.getWorldDirection(moveDir);
    moveDir.y = 0;
  }
  moveDir.normalize();

  const followDistance = THREE.MathUtils.lerp(7.5, 12, Math.min(speed / 30, 1));
  const desiredPos = new THREE.Vector3(p.x, p.y + 3.2, p.z)
    .addScaledVector(moveDir, -followDistance)
    .add(new THREE.Vector3(0, 1.6, 0));

  camera.position.lerp(desiredPos, 1 - Math.exp(-dt * 6));
  camera.lookAt(p.x, p.y + 1.3, p.z);

  statsEl.textContent = `Speed: ${speed.toFixed(1)} m/s | Rope: ${grapple.active ? `${grapple.ropeLength.toFixed(1)} m` : '--'}`;
}

let accumulator = 0;
let previous = performance.now() / 1000;

function tick() {
  const now = performance.now() / 1000;
  let frameDt = now - previous;
  previous = now;
  frameDt = Math.min(frameDt, 0.1);

  accumulator += frameDt;
  let steps = 0;

  while (accumulator >= controlConfig.fixedDt && steps < controlConfig.maxSubSteps) {
    applyMovement(controlConfig.fixedDt);
    applyGrappleForce();
    world.step();
    accumulator -= controlConfig.fixedDt;
    steps += 1;
  }

  updateVisuals();
  updateCamera(frameDt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
