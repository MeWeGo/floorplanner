/* Stair / ramp start level (issue #137).
   Runs the real furnElev(), stairFitH() and stairReachesUp() cut out of app.js:
   a stair may start above (+) or below (−) its floor, "Match storey height"
   still reaches the floor above, and the panel shows the field for stairs. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const line = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const { furnElev, stairFitH, stairReachesUp, setFloors } = new Function(`
  let P = { floors: [] };
  const floorH = f => f.wallH || 270, floorPitch = i => floorH(P.floors[i]) + 20;
  ${line('FURN_ELEV_MAX')}
  ${fnSrcOf(src, 'stairFitH')}
  ${fnSrcOf(src, 'stairReachesUp')}
  return { furnElev, stairFitH, stairReachesUp, setFloors: fl => { P.floors = fl; } };
`)();

test('start level is signed and clamped to ±500; absent = 0', () => {
  assert.strictEqual(furnElev({ k: 'stairs' }), 0);
  assert.strictEqual(furnElev({ k: 'stairs', elev: 60 }), 60);
  assert.strictEqual(furnElev({ k: 'stairs', elev: -150 }), -150);
  assert.strictEqual(furnElev({ k: 'stairs', elev: 9999 }), 500);
  assert.strictEqual(furnElev({ k: 'stairs', elev: -9999 }), -500);
});

test('Match storey height subtracts the start level so the stair still ends at the floor above', () => {
  assert.strictEqual(stairFitH({ k: 'stairs' }, 290), 290);
  assert.strictEqual(stairFitH({ k: 'stairs', elev: 60 }, 290), 230);
  assert.strictEqual(stairFitH({ k: 'stairs', elev: -150 }, 290), 440);
  assert.strictEqual(stairFitH({ k: 'stairs', elev: 400 }, 290), 35, 'never collapses below a usable rise');
});

test('a raised stair that is fitted reaches the floor above (stairwell link)', () => {
  const f = { furn: [] }; setFloors([f, {}]);
  const o = { k: 'stairs', elev: 60, h: 290 };
  o.h = stairFitH(o, 290);
  assert.ok(stairReachesUp(o, f));
  assert.ok(!stairReachesUp({ k: 'stairs', elev: 60, h: 100 }, f));
});

test('panel shows the start level for stairs / ramps; continuing upward starts at 0', () => {
  assert.match(src, /'Başlangıç kotu \(cm\)', 'Start level \(cm\)'/);
  assert.doesNotMatch(src, /if \(o\.k !== 'stairs' && o\.k !== 'ramp'\) h \+= fld\(L\('Yerden yükseklik/, 'stair elev field hidden again');
  assert.match(src, /a === 'stairfit'[^\n]*stairFitH\(o, curFloorPitch\(\)\)/);
  assert.match(src, /a === 'stairup'[\s\S]{0,400}delete c\.elev;/);
});
