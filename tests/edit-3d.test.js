/* Interactive 3D editing of walls and openings (issue #29).
   Guards:
   (a) Opening groups in build3D carry userData { opId, elev } and no isLeaf.
   (b) opDragHit builds vertical plane from wall normal (-uy, 0, ux), falls back to horizontal, returns t from a.
   (c) Pointerdown checks userData.opId, sets d3.op = true, stops propagation before OrbitControls.
   (d) Pointermove clamps d with Math.min(fo.o.w / 2 and schedules build3D.
   (e) Pointerup commits drag, toggles door/double/slide open when not alt, otherwise selects.
   (f) Click handler resets downPt first, selects plain walls when altKey or neither grouped nor hinged.
   (g) refreshSel3D highlights furnId, wallId groups (not meshes), and opId children with BoxHelper.
   Plus geometric execution of opDragHit against synthetic walls and rays. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');

const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  return src.slice(start, src.indexOf('\n}', start) + 2);
};

test('(a) in build3D every opening gets its own THREE.Group with userData { opId: o.id, elev } and no isLeaf', () => {
  const b3d = fnSrc('build3D');
  assert.strictEqual(src.includes('isLeaf'), false, 'expected no isLeaf in app.js');
  assert.ok(b3d.includes('og.userData = { opId: o.id, elev }'), 'expected og.userData = { opId: o.id, elev } in build3D');
});

test('(b) opDragHit builds vertical plane from wall normal (-uy, 0, ux), falls back to horizontal plane, returns t along wall from a', () => {
  const hitSrc = fnSrc('opDragHit');
  assert.ok(hitSrc.includes('new THREE.Vector3(-uy, 0, ux)'), 'opDragHit must build vertical plane from normal (-uy, 0, ux)');
  assert.ok(hitSrc.includes('new THREE.Plane(new THREE.Vector3(0, 1, 0), -elev)'), 'opDragHit must fall back to horizontal plane');
  assert.ok(hitSrc.includes('{ t: (p.x - w.a.x) * ux + (p.z - w.a.y) * uy }'), 'opDragHit must return { t: ... } along wall from a');
});

test('(c) in init3D pointerdown handler checks userData.opId, starts drag with op: true, stops propagation before OrbitControls', () => {
  const init = fnSrc('init3D');
  const opIdx = init.indexOf('cur.userData.opId');
  const orbitIdx = init.indexOf('new THREE.OrbitControls');
  assert.ok(opIdx > 0, 'userData.opId check not found in init3D');
  assert.ok(orbitIdx > 0, 'OrbitControls construction not found in init3D');
  assert.ok(opIdx < orbitIdx, 'pointerdown handler checking opId must appear before OrbitControls is constructed');

  const pdBlock = init.slice(init.indexOf("r.domElement.addEventListener('pointerdown'"), orbitIdx);
  assert.match(pdBlock, /cur\.userData\.opId/, 'pointerdown must check userData.opId');
  assert.match(pdBlock, /d3\s*=\s*\{[^}]*op:\s*true/, 'pointerdown must start drag state with op: true');
  assert.ok(pdBlock.includes('e.stopImmediatePropagation()'), 'pointerdown must call e.stopImmediatePropagation()');
});

test('(d) window pointermove handler for d3.op clamps d with Math.min(fo.o.w / 2 and calls schedBuild3D()', () => {
  const init = fnSrc('init3D');
  const pmStart = init.indexOf("window.addEventListener('pointermove'");
  const pmEnd = init.indexOf("window.addEventListener('pointerup'", pmStart);
  assert.ok(pmStart > 0 && pmEnd > pmStart, 'pointermove handler not found');
  const pmBlock = init.slice(pmStart, pmEnd);

  assert.ok(pmBlock.includes('if (d3.op) {'), 'must handle d3.op in pointermove');
  assert.ok(pmBlock.includes('Math.min(fo.o.w / 2'), 'must clamp d with Math.min(fo.o.w / 2');
  assert.ok(pmBlock.includes('schedBuild3D()'), 'must call schedBuild3D()');
});

test('(e) pointerup handler for d3.op commits after a drag, toggles open for door/double/slide only when not alt, otherwise just selects', () => {
  const init = fnSrc('init3D');
  const puStart = init.indexOf("window.addEventListener('pointerup'");
  const puEnd = init.indexOf('new THREE.OrbitControls', puStart);
  assert.ok(puStart > 0 && puEnd > puStart, 'pointerup handler not found');
  const puBlock = init.slice(puStart, puEnd);

  assert.ok(puBlock.includes('if (d3.op) {'), 'must handle d3.op in pointerup');
  assert.match(puBlock, /if\s*\(moved\)\s*\{\s*commit\(\);\s*refresh\(\);\s*build3D\(true\);/, 'must commit, refresh and rebuild 3D after a drag');
  assert.match(puBlock, /if\s*\(!alt\s*&&\s*isDoorOp\(o\)\)\s*toggleDoor3D\(o\)/, 'must toggle open only when not alt');
  assert.match(puBlock, /else\s*\{\s*refresh\(\);\s*refreshSel3D\(\);\s*\}/, 'otherwise must select (refresh and refreshSel3D)');
  // the toggle itself is shared with walk mode (#46)
  assert.match(src, /const isDoorOp = o => o\.type === 'door' \|\| o\.type === 'double' \|\| o\.type === 'slide'/, 'isDoorOp must cover door / double / slide');
  assert.match(fnSrc('toggleDoor3D'), /o\.open = o\.open \? 0 : 90;\s*commit\(\);\s*refresh\(\);\s*build3D\(true\);/, 'toggleDoor3D must flip open, commit and rebuild');
});

test('(f) click handler resets downPt before checking distance and selects plain walls with sel = [fd.o.id] when e.altKey or neither grouped nor hinged', () => {
  const init = fnSrc('init3D');
  const orbitIdx = init.indexOf('new THREE.OrbitControls');
  const clickBlock = init.slice(orbitIdx);

  assert.ok(clickBlock.includes('const dp = downPt; downPt = null;'), 'must reset downPt before checking distance');
  assert.ok(clickBlock.includes('sel = [fd.o.id]'), 'must select plain wall with sel = [fd.o.id]');
  assert.match(clickBlock, /e\.altKey\s*\|\|\s*\(!fd\.o\.grp\s*&&\s*!\(Array\.isArray\(fd\.o\.angles\)\s*&&\s*fd\.o\.angles\.length\s*>=\s*2\)\)/, 'must select wall if altKey or wall is not grouped and not hinged');
});

test('(g) refreshSel3D highlights furnId, wallId groups (not meshes) and opId children with BoxHelper', () => {
  const rSel = fnSrc('refreshSel3D');
  assert.match(rSel, /ids\.has\(u\.furnId\)\s*\|\|\s*\(ids\.has\(u\.wallId\)\s*&&\s*!c\.isMesh\)/, 'must highlight furnId or wallId group (not mesh)');
  assert.match(rSel, /for\s*\(const og of c\.children\)\s*if\s*\(og\.userData\s*&&\s*ids\.has\(og\.userData\.opId\)\)\s*h3\.push\(new THREE\.BoxHelper\(og,\s*col\)\)/, 'must highlight opId children with BoxHelper');
});

test('geometric opDragHit calculation: returns distance t along wall from a', () => {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
  }

  class Plane {
    constructor(normal = new Vector3(1, 0, 0), constant = 0) {
      this.normal = normal;
      this.constant = constant;
    }
    setFromNormalAndCoplanarPoint(normal, point) {
      this.normal = normal;
      this.constant = -point.dot(normal);
      return this;
    }
  }

  class Ray {
    constructor(origin, direction) {
      this.origin = origin;
      this.direction = direction;
    }
    intersectPlane(plane, target) {
      const denom = plane.normal.dot(this.direction);
      if (Math.abs(denom) < 1e-6) return null;
      const t = -(this.origin.dot(plane.normal) + plane.constant) / denom;
      if (t < 0) return null;
      target.x = this.origin.x + this.direction.x * t;
      target.y = this.origin.y + this.direction.y * t;
      target.z = this.origin.z + this.direction.z * t;
      return target;
    }
  }

  const fakeThree = { Vector3, Plane };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wLen = w => dist(w.a, w.b);

  const opDragHit = new Function('THREE', 'wLen', `
    ${fnSrc('opDragHit')}
    return opDragHit;
  `)(fakeThree, wLen);

  const ray = new Ray(new Vector3(150, 100, 500), new Vector3(0, 0, -1));

  // for wall a=(0,0) b=(400,0) and a ray from (150, 100, 500) pointing straight at -z, t is 150
  const hit1 = opDragHit(ray, { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } }, 0);
  assert.ok(hit1, 'hit1 should not be null');
  assert.strictEqual(Math.round(hit1.t), 150);

  // for wall a=(400,0) b=(0,0) the same ray gives t=250
  const hit2 = opDragHit(ray, { a: { x: 400, y: 0 }, b: { x: 0, y: 0 } }, 0);
  assert.ok(hit2, 'hit2 should not be null');
  assert.strictEqual(Math.round(hit2.t), 250);
});
