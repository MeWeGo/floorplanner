/* Live room walkers: the walk position sent in presence and the 3D figure pose (the CollabRoom side is in collab.test.js,
   the figures themselves in the browser smoke check "live room walkers"). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const appSrc = read('app.js');

function makeWalkHelpersEnv() {
  const fn1 = fnSrcOf(appSrc, 'collabWalkPayload');
  const fn2 = fnSrcOf(appSrc, 'collabAvatarPose');
  return new Function(`${fn1}\n${fn2}\nreturn { collabWalkPayload, collabAvatarPose };`)();
}

test('collabWalkPayload rounds coordinates, maps floorId, defaults z, and rejects invalid inputs', () => {
  const { collabWalkPayload } = makeWalkHelpersEnv();
  const floors = [{ id: 'f0' }, { id: 'f1' }];

  assert.deepStrictEqual(
    collabWalkPayload({ fi: 1, x: 123.456, y: -45.64, z: 78.94, yaw: 1.23456 }, floors),
    { floorId: 'f1', x: 123.5, y: -45.6, z: 78.9, yaw: 1.235 },
  );

  // z defaults to 0 when missing or NaN
  assert.deepStrictEqual(
    collabWalkPayload({ fi: 0, x: 10.04, y: 20.06, yaw: -0.5554 }, floors),
    { floorId: 'f0', x: 10, y: 20.1, z: 0, yaw: -0.555 },
  );
  assert.strictEqual(collabWalkPayload({ fi: 0, x: 1, y: 2, z: NaN, yaw: 0 }, floors).z, 0);

  // missing floor or non-finite x/y/yaw -> null
  assert.strictEqual(collabWalkPayload(null, floors), null);
  assert.strictEqual(collabWalkPayload({ fi: 0, x: 1, y: 2, yaw: 0 }, null), null);
  assert.strictEqual(collabWalkPayload({ fi: 5, x: 1, y: 2, yaw: 0 }, floors), null);
  assert.strictEqual(collabWalkPayload({ fi: -1, x: 1, y: 2, yaw: 0 }, floors), null);
  assert.strictEqual(collabWalkPayload({ fi: 0, x: NaN, y: 2, yaw: 0 }, floors), null);
  assert.strictEqual(collabWalkPayload({ fi: 0, x: 1, y: Infinity, yaw: 0 }, floors), null);
  assert.strictEqual(collabWalkPayload({ fi: 0, x: 1, y: 2, yaw: undefined }, floors), null);
});

test('collabAvatarPose computes scene pose from floor elevation and rejects hidden/unknown/invalid', () => {
  const { collabAvatarPose } = makeWalkHelpersEnv();
  const floors = [{ id: 'f0', vis: true }, { id: 'f1', vis: false }, { id: 'f2', vis: true }];
  const elevOf = i => i * 300;
  const shown = f => f.vis;

  assert.deepStrictEqual(
    collabAvatarPose({ floorId: 'f2', x: 150, y: 275, z: 45, yaw: 1.5 }, floors, elevOf, shown),
    { i: 2, x: 150, y: 645, z: 275, rotY: -1.5 },
  );
  assert.deepStrictEqual(
    collabAvatarPose({ floorId: 'f0', x: 10, y: 20, yaw: -0.75 }, floors, elevOf, shown),
    { i: 0, x: 10, y: 0, z: 20, rotY: 0.75 },
  );

  // hidden floor, unknown floor, or bad numbers -> null
  assert.strictEqual(collabAvatarPose({ floorId: 'f1', x: 10, y: 20, yaw: 0 }, floors, elevOf, shown), null);
  assert.strictEqual(collabAvatarPose({ floorId: 'nope', x: 10, y: 20, yaw: 0 }, floors, elevOf, shown), null);
  assert.strictEqual(collabAvatarPose(null, floors, elevOf, shown), null);
  assert.strictEqual(collabAvatarPose('bad', floors, elevOf, shown), null);
  assert.strictEqual(collabAvatarPose({ floorId: 'f0', x: NaN, y: 20, yaw: 0 }, floors, elevOf, shown), null);
  assert.strictEqual(collabAvatarPose({ floorId: 'f0', x: 10, y: 20, yaw: Infinity }, floors, elevOf, shown), null);
});

test('render studio hides walker figures for the passes and restores them; the 3D loop sends and glides', () => {
  const hq = fnSrcOf(appSrc, 'render3DHQ');
  assert.match(hq, /T3\.avatars[\s\S]*?visible = false[\s\S]*?finally[\s\S]*?avHid\) g\.visible = true/);
  const loop = fnSrcOf(appSrc, 'loop3D');
  assert.match(loop, /collabAvatarsTick\(dt\)/);
  assert.match(loop, /T3\.walk\)[^\n]*collabWalkTick\(\)/);
});
