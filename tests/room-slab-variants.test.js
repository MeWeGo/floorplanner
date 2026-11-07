/* Tests for room slab thickness (#63) and room layout variants (#66).
   Evaluates real functions extracted from app.js and verifies source wiring,
   3D interaction, and MCP tool validation. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');

const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  return src.slice(start, src.indexOf('\n}', start) + 2);
};

const constLine = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const {
  ROOM_SLAB_T,
  roomSlabT,
  snapPose,
  affects3D,
} = new Function(`
  ${constLine('ROOM_SLAB_T')}
  ${constLine('PTS_KINDS')}
  ${fnSrc('snapPose')}
  ${fnSrc('affects3D')}
  return { ROOM_SLAB_T, roomSlabT, snapPose, affects3D };
`)();

test('(1) roomSlabT defaults and bounds clamping', () => {
  assert.strictEqual(ROOM_SLAB_T, 20, 'ROOM_SLAB_T constant must be 20');

  // undefined / null / absent -> 20
  assert.strictEqual(roomSlabT(undefined), 20);
  assert.strictEqual(roomSlabT(null), 20);
  assert.strictEqual(roomSlabT({}), 20);
  assert.strictEqual(roomSlabT({ slabT: undefined }), 20);
  assert.strictEqual(roomSlabT({ slabT: null }), 20);

  // 0 -> 0 (allowed = flat surface)
  assert.strictEqual(roomSlabT({ slabT: 0 }), 0);
  assert.strictEqual(roomSlabT({ slabT: '0' }), 0);

  // 35 -> 35
  assert.strictEqual(roomSlabT({ slabT: 35 }), 35);
  assert.strictEqual(roomSlabT({ slabT: '35' }), 35);

  // 500 -> 200 (capped at 200)
  assert.strictEqual(roomSlabT({ slabT: 500 }), 200);
  assert.strictEqual(roomSlabT({ slabT: 201 }), 200);

  // negative -> 20
  assert.strictEqual(roomSlabT({ slabT: -1 }), 20);
  assert.strictEqual(roomSlabT({ slabT: -10 }), 20);
  assert.strictEqual(roomSlabT({ slabT: '-50' }), 20);
});

test('(2) snapPose for room includes floor, color, glass, slabT and deep-copies pts', () => {
  const room = {
    id: 'r_master',
    pts: [{ x: 10, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 80 }, { x: 10, y: 80 }],
    floor: 'wood',
    color: '#3b82f6',
    glass: 'clear',
    slabT: 35,
  };

  const pose = snapPose('room', room);

  assert.deepStrictEqual(pose, {
    pts: [{ x: 10, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 80 }, { x: 10, y: 80 }],
    floor: 'wood',
    color: '#3b82f6',
    glass: 'clear',
    slabT: 35,
  });

  // Mutating the returned pose does not alter original room pts
  pose.pts[0].x = 999;
  pose.pts[0].y = 888;
  pose.pts.push({ x: 50, y: 50 });
  assert.strictEqual(room.pts[0].x, 10, 'original room corner x must not change');
  assert.strictEqual(room.pts[0].y, 20, 'original room corner y must not change');
  assert.strictEqual(room.pts.length, 4, 'original room corner count must not change');

  // Fallbacks for missing optional properties
  const bareRoom = { pts: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] };
  const barePose = snapPose('room', bareRoom);
  assert.strictEqual(barePose.floor, 'none');
  assert.strictEqual(barePose.glass, null);
  assert.strictEqual(barePose.slabT, 20);
});

test('(3) snapPose for slab and void returns only pts', () => {
  const slab = {
    id: 's1',
    pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }],
    floor: 'concrete',
    color: '#64748b',
    glass: 'frosted',
    t: 25,
    off: 10,
    slabT: 40,
  };
  const slabPose = snapPose('slab', slab);
  assert.deepStrictEqual(slabPose, {
    pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }],
  });
  assert.strictEqual(slabPose.floor, undefined);
  assert.strictEqual(slabPose.color, undefined);
  assert.strictEqual(slabPose.glass, undefined);
  assert.strictEqual(slabPose.slabT, undefined);

  const voidObj = {
    id: 'v1',
    pts: [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }],
    name: 'Stair Void',
    type: 'stair',
  };
  const voidPose = snapPose('void', voidObj);
  assert.deepStrictEqual(voidPose, {
    pts: [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }],
  });
  assert.strictEqual(voidPose.type, undefined);
  assert.strictEqual(voidPose.name, undefined);
});

test('(4) applyVarPoses room branch and property panel wiring in app.js', () => {
  // applyVarPoses room branch restores floor, color, glass, slabT when present
  assert.match(
    src,
    /applyVarPoses[\s\S]*?fd\.kind\s*===\s*['"]room['"][\s\S]*?if\s*\(\s*p\.floor\s*!=\s*null\s*\)\s*o\.floor\s*=\s*p\.floor/,
    'applyVarPoses must guard o.floor assignment with != null'
  );
  assert.match(
    src,
    /applyVarPoses[\s\S]*?fd\.kind\s*===\s*['"]room['"][\s\S]*?if\s*\(\s*p\.color\s*!=\s*null\s*\)\s*o\.color\s*=\s*p\.color/,
    'applyVarPoses must guard o.color assignment with != null'
  );
  assert.match(
    src,
    /applyVarPoses[\s\S]*?fd\.kind\s*===\s*['"]room['"][\s\S]*?p\.glass\s*!==\s*undefined/,
    'applyVarPoses must check p.glass !== undefined'
  );
  assert.match(
    src,
    /applyVarPoses[\s\S]*?fd\.kind\s*===\s*['"]room['"][\s\S]*?if\s*\(\s*p\.slabT\s*!=\s*null\s*\)\s*o\.slabT\s*=\s*p\.slabT/,
    'applyVarPoses must guard o.slabT assignment with != null'
  );

  // Room panel field data-p slabT
  assert.match(
    src,
    /['"]room['"]\s*,\s*['"]slabT['"]/,
    'room panel must declare slabT field for room'
  );

  // applyProp clamps room slabT 0..200
  assert.match(
    src,
    /k\s*===\s*['"]room['"]\s*&&\s*p\s*===\s*['"]slabT['"][\s\S]*?clamp\([^)]*0,\s*200\)/,
    'applyProp must clamp room slabT to 0..200'
  );
});

test('(5) canHitPoly references grpHasVars and 3D pointerup loop cycles room/group vars', () => {
  // roomSvg canHitPoly checks grpHasVars
  assert.match(
    src,
    /canHitPoly\s*=\s*[^;\n]*grpHasVars/,
    'canHitPoly must reference grpHasVars for room/group variant clickability'
  );

  // 3D pointerup raycaster traversal checks userData?.roomId
  assert.match(
    src,
    /userData\??\.roomId/,
    '3D pointerup traversal must check for roomId on userData'
  );

  // 3D pointerup cycles cycleRoomVars and cycleGroupVars on room click
  assert.match(
    src,
    /userData\??\.roomId[\s\S]*?cycleRoomVars\s*\(\s*fd\.o\s*\)/,
    '3D pointerup handler must call cycleRoomVars for room hits'
  );
  assert.match(
    src,
    /userData\??\.roomId[\s\S]*?cycleGroupVars/,
    '3D pointerup handler must call cycleGroupVars for grouped room hits'
  );
});

test('(6) build3D sets userData.roomId and uses roomSlabT with ExtrudeGeometry', () => {
  const b3dStart = src.indexOf('function build3D(');
  assert.ok(b3dStart >= 0, 'build3D() is gone from app.js');
  const b3dEnd = src.indexOf('\nfunction ', b3dStart + 1);
  const b3d = src.slice(b3dStart, b3dEnd > 0 ? b3dEnd : undefined);

  assert.match(
    b3d,
    /userData\.roomId\s*=\s*r\.id/,
    'build3D must assign userData.roomId on room meshes'
  );
  assert.match(
    b3d,
    /roomSlabT\s*\(\s*r\s*\)/,
    'build3D must evaluate roomSlabT(r)'
  );
  assert.match(
    b3d,
    /ExtrudeGeometry\s*\(\s*shp\s*,\s*\{[^}]*depth:\s*st/,
    'build3D must create ExtrudeGeometry with depth: st for non-glass room slab'
  );
});

test('(7) affects3D evaluates true for room slabT and finishes', () => {
  assert.strictEqual(affects3D('room', 'slabT'), true, 'affects3D(room, slabT) must be true');
  assert.strictEqual(affects3D('room', 'floor'), true, 'affects3D(room, floor) must be true');
  assert.strictEqual(affects3D('room', 'color'), true, 'affects3D(room, color) must be true');
  assert.strictEqual(affects3D('room', 'glass'), true, 'affects3D(room, glass) must be true');
  assert.strictEqual(affects3D('room', 'name'), false, 'affects3D(room, name) must be false');
});

test('(8) mcp/server.js add_room declares slabThickness and validates 0..200 range', () => {
  // add_room tool declares slabThickness
  assert.match(
    mcpSrc,
    /tool\(\s*['"]add_room['"][\s\S]*?slabThickness[\s\S]*?0\.\.200/,
    'mcp/server.js add_room tool must describe slabThickness 0..200'
  );

  // range validation rejects < 0 or > 200
  assert.match(
    mcpSrc,
    /slabThickness[\s\S]*?(?:<\s*0\s*\|\|\s*\w+\s*>\s*200|>\s*200\s*\|\|\s*\w+\s*<\s*0)[\s\S]*?throw/,
    'mcp/server.js must validate slabThickness between 0 and 200 and throw if out of range'
  );
});
