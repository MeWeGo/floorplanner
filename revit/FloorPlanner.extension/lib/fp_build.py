# -*- coding: utf-8 -*-
"""Floor Planner -> Revit: builds native Revit elements from a .fp-revit.json exchange file.

Runs inside Revit (pyRevit, RevitPythonShell or Dynamo Python). IronPython 2.7 and CPython 3 compatible.
Every element is created in its own try block: one bad wall never stops the import, it is counted
under "skipped" with the reason in the report.
"""
from __future__ import division, print_function, unicode_literals

import math
import os

import clr  # noqa: F401  (needed before the .NET imports under IronPython)
from System.Collections.Generic import List

from Autodesk.Revit.DB import (
    BuiltInCategory, BuiltInParameter, Color, CompoundStructure, CurveArray, CurveLoop, DirectShape,
    ElementId, ElementTransformUtils, FailureProcessingResult, FailureSeverity, FamilySymbol,
    FilteredElementCollector, Floor, FloorType, IFailuresPreprocessor, Level, Line, Material,
    MaterialFunctionAssignment, Plane, SketchPlane, TessellatedFace, TessellatedShapeBuilder,
    TessellatedShapeBuilderFallback, TessellatedShapeBuilderTarget, Transaction, TransactionGroup, UV,
    ViewFamily, ViewFamilyType, ViewPlan, Wall, WallKind, WallType, XYZ,
)
from Autodesk.Revit.DB.Structure import StructuralType

import fp_core

try:
    from Autodesk.Revit.DB.Architecture import Railing, RailingType
except Exception:  # very old Revit
    Railing = RailingType = None


def _name(e):
    """Element name that also works for FamilySymbol under IronPython (where .Name can throw)."""
    try:
        return e.Name
    except Exception:
        p = e.get_Parameter(BuiltInParameter.SYMBOL_NAME_PARAM) or e.get_Parameter(BuiltInParameter.ALL_MODEL_TYPE_NAME)
        return p.AsString() if p else ''


def _set(e, bip, value):
    p = e.get_Parameter(bip)
    if p is not None and not p.IsReadOnly:
        p.Set(value)
        return True
    return False


def _set_named(e, names, value):
    for n in names:
        p = e.LookupParameter(n)
        if p is not None and not p.IsReadOnly:
            p.Set(value)
            return True
    return False


class _SwallowWarnings(IFailuresPreprocessor):
    """Deletes warnings (joined walls, overlapping room lines...) so the import does not stop on a dialog."""
    __namespace__ = 'FloorPlannerImport'

    def PreprocessFailures(self, fa):
        for f in fa.GetFailureMessages():
            if f.GetSeverity() == FailureSeverity.Warning:
                fa.DeleteWarning(f)
        return FailureProcessingResult.Continue


class Importer(object):
    def __init__(self, doc, data, fmap, report=None):
        self.doc = doc
        self.data = fp_core.check_exchange(data)
        self.fmap = fmap
        self.rep = report or fp_core.Report()
        self.levels = {}   # exchange level id -> Level
        self.elev = {}     # exchange level id -> elevation (ft)
        self.views = {}    # exchange level id -> ViewPlan
        self.walls = {}    # exchange wall id -> Wall
        self._wtypes = {}
        self._ftypes = {}
        self._mats = {}
        self._symbols = {}

    # ---------- helpers ----------
    def _tx(self, name, fn):
        t = Transaction(self.doc, 'Floor Planner: ' + name)
        t.Start()
        try:
            opts = t.GetFailureHandlingOptions()
            opts.SetFailuresPreprocessor(_SwallowWarnings())
            t.SetFailureHandlingOptions(opts)
        except Exception:
            pass
        try:
            fn()
            t.Commit()
        except Exception as ex:
            t.RollBack()
            self.rep.note('{0} step failed and was rolled back: {1}'.format(name, ex))

    def _skip(self, what, ex):
        self.rep.add('skipped')
        self.rep.note('{0}: {1}'.format(what, ex))

    def _xyz(self, p, z=0.0):
        return XYZ(float(p[0]), float(p[1]), float(z))

    def _loop(self, pts, z):
        pts = fp_core.clean_loop(pts)
        if not pts:
            return None
        loop = CurveLoop()
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            loop.Append(Line.CreateBound(XYZ(p[0], p[1], z), XYZ(q[0], q[1], z)))
        return loop

    def _material(self, color, glass=False):
        key = (color or '').lower() + ('|glass' if glass else '')
        if key in self._mats:
            return self._mats[key]
        name = 'FP ' + ('Glass ' if glass else '') + (color or 'default').lower()
        found = [m for m in FilteredElementCollector(self.doc).OfClass(Material) if m.Name == name]
        if found:
            mid = found[0].Id
        else:
            mid = Material.Create(self.doc, name)
            m = self.doc.GetElement(mid)
            r, g, b = fp_core.hex_rgb(color)
            m.Color = Color(r, g, b)
            if glass:
                m.Transparency = 60
        self._mats[key] = mid
        return mid

    def _types(self, cls):
        return list(FilteredElementCollector(self.doc).OfClass(cls))

    def _by_name(self, elems, name):
        if not name:
            return None
        low = name.lower()
        for e in elems:
            if _name(e).lower() == low:
                return e
        return None

    # ---------- levels & views ----------
    def build_levels(self):
        existing = self._types(Level)
        names = set(l.Name for l in existing)
        vft = None
        if self.fmap.get('planViews'):
            vft = next((v for v in self._types(ViewFamilyType) if v.ViewFamily == ViewFamily.FloorPlan), None)
        for lv in self.data['levels']:
            z = float(lv['elev'])
            same = [l for l in existing if abs(l.Elevation - z) < 0.003]
            if same:
                self.levels[lv['id']] = same[0]
                self.rep.add('levels reused')
            else:
                level = Level.Create(self.doc, z)
                name, n = lv.get('name') or lv['id'], 2
                base = name
                while name in names:
                    name = '{0} ({1})'.format(base, n)
                    n += 1
                try:
                    level.Name = name
                    names.add(name)
                except Exception:
                    pass
                self.levels[lv['id']] = level
                self.rep.add('levels')
                if vft is not None:
                    try:
                        v = ViewPlan.Create(self.doc, vft.Id, level.Id)
                        self.views[lv['id']] = v
                    except Exception as ex:
                        self.rep.note('No plan view for {0}: {1}'.format(name, ex))
            self.elev[lv['id']] = self.levels[lv['id']].Elevation
        # plan views for reused levels (needed for room separation lines)
        for v in self._types(ViewPlan):
            try:
                if v.IsTemplate or v.GenLevel is None:
                    continue
                for k, level in self.levels.items():
                    if k not in self.views and v.GenLevel.Id == level.Id:
                        self.views[k] = v
            except Exception:
                pass

    # ---------- walls ----------
    def _basic_wall_type(self, t, color):
        key = (round(t, 4), color or '')
        if key in self._wtypes:
            return self._wtypes[key]
        name = fp_core.wall_type_name(t, color)
        types = self._types(WallType)
        wt = self._by_name(types, name)
        if wt is None:
            base = self._by_name(types, self.fmap.get('wallType')) or next(x for x in types if x.Kind == WallKind.Basic)
            wt = base.Duplicate(name)
            mat = self._material(color) if color else ElementId.InvalidElementId
            cs = CompoundStructure.CreateSingleLayerCompoundStructure(MaterialFunctionAssignment.Structure, t, mat)
            wt.SetCompoundStructure(cs)
        self._wtypes[key] = wt
        return wt

    def build_walls(self):
        types = self._types(WallType)
        curtain = self._by_name(types, self.fmap.get('curtainWallType')) or next((x for x in types if x.Kind == WallKind.Curtain), None)
        rail_t = None
        if RailingType is not None:
            rts = self._types(RailingType)
            rail_t = self._by_name(rts, self.fmap.get('railingType')) or (rts[0] if rts else None)
        sloped = 0
        for w in self.data['walls']:
            level = self.levels.get(w['level'])
            try:
                z = self.elev[w['level']]
                a, b = self._xyz(w['a'], z), self._xyz(w['b'], z)
                if a.DistanceTo(b) < fp_core.MIN_SEG_FT:
                    raise ValueError('too short')
                kind = w.get('kind') or 'solid'
                if kind in ('railing', 'fence') and Railing is not None and rail_t is not None:
                    loop = CurveLoop()
                    loop.Append(Line.CreateBound(a, b))
                    r = Railing.Create(self.doc, loop, rail_t.Id, level.Id)
                    _set(r, BuiltInParameter.STAIRS_RAILING_BASE_OFFSET, float(w.get('base') or 0))
                    self.rep.add('railings')
                    continue
                if kind == 'curtain' and curtain is not None:
                    wt = curtain
                else:
                    wt = self._basic_wall_type(float(w['t']), w.get('color'))
                wall = Wall.Create(self.doc, Line.CreateBound(a, b), wt.Id, level.Id, float(w['h']), float(w.get('base') or 0), False, False)
                self.walls[w['id']] = wall
                self.rep.add('curtain walls' if kind == 'curtain' and curtain is not None else 'walls')
                if w.get('sloped'):
                    sloped += 1
            except Exception as ex:
                self._skip('Wall ' + w.get('id', '?'), ex)
        if sloped:
            self.rep.note('{0} wall(s) with a sloped top were built flat at their highest point (attach their tops in Revit).'.format(sloped))

    # ---------- doors & windows ----------
    def _symbols_of(self, bic):
        if bic not in self._symbols:
            syms = FilteredElementCollector(self.doc).OfClass(FamilySymbol).OfCategory(bic)
            self._symbols[bic] = [(s.Family.Name, _name(s), s) for s in syms]
        return self._symbols[bic]

    def _sized(self, sym, op, window):
        """A type of the same family with the opening's width and height (duplicated once per size)."""
        w, h = float(op['w']), float(op['h'])
        name = fp_core.size_name('FP', w, h)
        fam = sym.Family.Name
        for f, n, s in self._symbols_of(BuiltInCategory.OST_Windows if window else BuiltInCategory.OST_Doors):
            if f == fam and n == name:
                return s
        new = sym.Duplicate(name)
        wb, hb = (BuiltInParameter.WINDOW_WIDTH, BuiltInParameter.WINDOW_HEIGHT) if window else (BuiltInParameter.DOOR_WIDTH, BuiltInParameter.DOOR_HEIGHT)
        if not (_set(new, wb, w) or _set(new, BuiltInParameter.FAMILY_WIDTH_PARAM, w) or _set_named(new, ['Width', 'Genişlik'], w)):
            self.rep.note('Type "{0}" of {1}: width could not be set.'.format(name, fam))
        if not (_set(new, hb, h) or _set(new, BuiltInParameter.FAMILY_HEIGHT_PARAM, h) or _set_named(new, ['Height', 'Yükseklik'], h)):
            self.rep.note('Type "{0}" of {1}: height could not be set.'.format(name, fam))
        self._symbols_of(BuiltInCategory.OST_Windows if window else BuiltInCategory.OST_Doors).append((fam, name, new))
        return new

    def build_openings(self):
        for op in self.data['openings']:
            wall, kind = self.walls.get(op.get('wall')), op.get('kind') or 'door'
            if wall is None:
                self._skip('Opening ' + op.get('id', '?'), 'its wall was not created')
                continue
            try:
                level = self.levels[op['level']]
                base = wall.get_Parameter(BuiltInParameter.WALL_BASE_OFFSET).AsDouble()
                z = self.elev[op['level']] + base + float(op.get('sill') or 0)
                window = kind == 'window'
                cands = fp_core.candidates(self.fmap, 'openings', kind)
                bic = BuiltInCategory.OST_Windows if window else BuiltInCategory.OST_Doors
                sym = fp_core.pick_symbol(cands, self._symbols_of(bic)) if kind != 'arch' else None
                if sym is None and kind != 'arch':
                    syms = self._symbols_of(bic)
                    sym = syms[0][2] if syms else None
                    if sym is not None:
                        self.rep.note('No family mapped for "{0}" openings; used {1}.'.format(kind, syms[0][0]))
                if sym is None:
                    self._wall_opening(wall, op, z)
                    continue
                sym = self._sized(sym, op, window)
                if not sym.IsActive:
                    sym.Activate()
                    self.doc.Regenerate()
                inst = self.doc.Create.NewFamilyInstance(self._xyz(op['at'], z), sym, wall, level, StructuralType.NonStructural)
                _set(inst, BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM, base + float(op.get('sill') or 0))
                if not window:
                    self.doc.Regenerate()
                    face, hand = fp_core.door_targets(op, self.fmap)
                    fo, ho = inst.FacingOrientation, inst.HandOrientation
                    if face and inst.CanFlipFacing and fp_core.needs_flip((fo.X, fo.Y), face):
                        inst.flipFacing()
                    if hand and inst.CanFlipHand and fp_core.needs_flip((ho.X, ho.Y), hand):
                        inst.flipHand()
                self.rep.add('windows' if window else 'doors')
            except Exception as ex:
                self._skip('Opening ' + op.get('id', '?'), ex)

    def _wall_opening(self, wall, op, z):
        c, half = op['at'], float(op['w']) / 2
        crv = wall.Location.Curve
        d = (crv.GetEndPoint(1) - crv.GetEndPoint(0)).Normalize()
        p1 = XYZ(c[0] - d.X * half, c[1] - d.Y * half, z)
        p2 = XYZ(c[0] + d.X * half, c[1] + d.Y * half, z + float(op['h']))
        self.doc.Create.NewOpening(wall, p1, p2)
        self.rep.add('wall openings')

    # ---------- floors ----------
    def _floor_type(self, t):
        key = round(t, 4)
        if key in self._ftypes:
            return self._ftypes[key]
        types = [x for x in self._types(FloorType) if not getattr(x, 'IsFoundationSlab', False)]
        name = fp_core.floor_type_name(t)
        ft = self._by_name(types, name)
        if ft is None:
            base = self._by_name(types, self.fmap.get('floorType')) or types[0]
            try:
                ft = base.Duplicate(name)
                ft.SetCompoundStructure(CompoundStructure.CreateSingleLayerCompoundStructure(MaterialFunctionAssignment.Structure, t, ElementId.InvalidElementId))
            except Exception as ex:
                self.rep.note('Floor type {0}: {1}; used {2}.'.format(name, ex, _name(base)))
                ft = base
        self._ftypes[key] = ft
        return ft

    def build_floors(self):
        for fl in self.data['floors']:
            try:
                level, z = self.levels[fl['level']], self.elev[fl['level']]
                loops = [lp for lp in (self._loop(p, z) for p in fl.get('loops') or []) if lp is not None]
                if not loops:
                    raise ValueError('empty outline')
                ft = self._floor_type(float(fl.get('t') or 0.656))
                try:  # Revit 2022+
                    il = List[CurveLoop]()
                    for lp in loops:
                        il.Add(lp)
                    floor = Floor.Create(self.doc, il, ft.Id, level.Id)
                except AttributeError:  # older Revit: outer outline only
                    arr = CurveArray()
                    for c in loops[0]:
                        arr.Append(c)
                    floor = self.doc.Create.NewFloor(arr, ft, level, False)
                    if len(loops) > 1:
                        self.rep.note('Floor openings need Revit 2022 or newer; {0} hole(s) skipped.'.format(len(loops) - 1))
                _set(floor, BuiltInParameter.FLOOR_HEIGHTABOVELEVEL_PARAM, float(fl.get('top') or 0))
                self.rep.add('floors')
            except Exception as ex:
                self._skip('Floor ' + fl.get('id', '?'), ex)

    # ---------- rooms ----------
    def build_rooms(self):
        self.doc.Regenerate()
        for r in self.data['rooms']:
            try:
                level = self.levels[r['level']]
                room = self.doc.Create.NewRoom(level, UV(float(r['pt'][0]), float(r['pt'][1])))
                if r.get('name'):
                    room.Name = r['name']
                if r.get('finish') and r['finish'] != 'none':
                    _set(room, BuiltInParameter.ROOM_FINISH_FLOOR, r['finish'])
                self.doc.Regenerate()
                if room.Area <= 0 and self.fmap.get('roomSeparationLines') and r['level'] in self.views:
                    self._separation(r, level)
                    self.doc.Regenerate()
                self.rep.add('rooms')
            except Exception as ex:
                self._skip('Room ' + (r.get('name') or r.get('id', '?')), ex)

    def _separation(self, r, level):
        z = self.elev[r['level']]
        pts = fp_core.clean_loop(r.get('loop') or [])
        if not pts:
            return
        arr = CurveArray()
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            arr.Append(Line.CreateBound(XYZ(p[0], p[1], z), XYZ(q[0], q[1], z)))
        sp = SketchPlane.Create(self.doc, Plane.CreateByNormalAndOrigin(XYZ.BasisZ, XYZ(0, 0, z)))
        self.doc.Create.NewRoomBoundaryLines(sp, arr, self.views[r['level']])
        self.rep.note('Room "{0}" was not closed by walls; room separation lines were added.'.format(r.get('name') or r['id']))

    # ---------- furniture ----------
    def _load_family(self, fam_name):
        for folder in fp_core.as_list(self.fmap.get('familyFolders')):
            for root, _dirs, files in os.walk(folder):
                for f in files:
                    if f.lower() == fam_name.lower() + '.rfa':
                        try:
                            if self.doc.LoadFamily(os.path.join(root, f)):
                                self._symbols = {}
                                return True
                        except Exception as ex:
                            self.rep.note('Could not load {0}: {1}'.format(f, ex))
        return False

    def _furniture_symbol(self, it):
        cands = fp_core.candidates(self.fmap, 'furniture', it.get('type'))
        if not cands:
            return None
        bic = getattr(BuiltInCategory, fp_core.CATEGORY.get(it.get('cat'), 'OST_Furniture'))
        pools = [bic, BuiltInCategory.OST_Furniture, BuiltInCategory.OST_GenericModel]
        for attempt in (0, 1):
            for b in pools:
                sym = fp_core.pick_symbol(cands, self._symbols_of(b))
                if sym is not None:
                    return sym
            if attempt == 0 and not any(self._load_family(c['family']) for c in cands):
                break
        return None

    def _place_family(self, it, sym):
        level, z = self.levels[it['level']], self.elev[it['level']]
        if not sym.IsActive:
            sym.Activate()
            self.doc.Regenerate()
        p = self._xyz(it['at'], z)
        inst = self.doc.Create.NewFamilyInstance(p, sym, level, StructuralType.NonStructural)
        elev = float(it.get('elev') or 0)
        if elev:
            _set(inst, BuiltInParameter.INSTANCE_FREE_HOST_OFFSET_PARAM, elev) or _set(inst, BuiltInParameter.INSTANCE_ELEVATION_PARAM, elev)
        rot = math.radians(float(it.get('rot') or 0))
        if abs(rot) > 1e-9:
            ElementTransformUtils.RotateElement(self.doc, inst.Id, Line.CreateBound(p, p + XYZ.BasisZ), rot)
        return inst

    def _direct_shape(self, it):
        cat = ElementId(getattr(BuiltInCategory, fp_core.CATEGORY.get(it.get('cat'), 'OST_Furniture')))
        if not DirectShape.IsValidCategoryId(cat, self.doc):
            cat = ElementId(BuiltInCategory.OST_GenericModel)
        mats = [self._material(m.get('c'), bool(m.get('glass'))) for m in it.get('mats') or [{}]]
        b = TessellatedShapeBuilder()
        closed = it.get('cat') != 'roof'
        for _m, faces in fp_core.group_faces(it):
            b.OpenConnectedFaceSet(closed)
            for mi, pts in faces:
                loop = List[XYZ]()
                for q in pts:
                    loop.Add(XYZ(q[0], q[1], q[2]))
                b.AddFace(TessellatedFace(loop, mats[mi] if mi < len(mats) else ElementId.InvalidElementId))
            b.CloseConnectedFaceSet()
        b.Target = TessellatedShapeBuilderTarget.AnyGeometry
        b.Fallback = TessellatedShapeBuilderFallback.Mesh
        b.Build()
        ds = DirectShape.CreateElement(self.doc, cat)
        ds.ApplicationId = 'floorplanner'
        ds.ApplicationDataId = it.get('id') or ''
        ds.SetShape(b.GetBuildResult().GetGeometricalObjects())
        try:
            ds.Name = it.get('name') or it.get('type') or 'Item'
        except Exception:
            pass
        return ds

    def build_items(self):
        for it in self.data['items']:
            try:
                el, sym = None, None
                if not it.get('tilted'):
                    sym = self._furniture_symbol(it)
                if sym is not None:
                    try:
                        el = self._place_family(it, sym)
                        self.rep.add('furniture (families)')
                    except Exception as ex:
                        self.rep.note('{0}: family {1} could not be placed ({2}); built as DirectShape.'.format(it.get('name'), sym.Family.Name, ex))
                if el is None:
                    el = self._direct_shape(it)
                    self.rep.add('furniture (DirectShape)')
                _set(el, BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS, 'Floor Planner: {0} ({1})'.format(it.get('name') or '', it.get('type') or ''))
            except Exception as ex:
                self._skip('Item ' + (it.get('name') or it.get('id', '?')), ex)

    # ---------- run ----------
    def run(self):
        g = TransactionGroup(self.doc, 'Import Floor Planner plan')
        g.Start()
        self._tx('levels', self.build_levels)
        if not self.levels:
            g.RollBack()
            raise RuntimeError('No levels could be created.')
        self._tx('walls', self.build_walls)
        self._tx('doors and windows', self.build_openings)
        self._tx('floors', self.build_floors)
        self._tx('rooms', self.build_rooms)
        self._tx('furniture', self.build_items)
        g.Assimilate()
        return self.rep
