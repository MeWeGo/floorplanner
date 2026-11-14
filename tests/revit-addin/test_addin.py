# -*- coding: utf-8 -*-
"""Unit tests for the pyRevit add-in (fp_core and fp_build with mocked Revit API)."""
import json
import math
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LIB_DIR = os.path.join(REPO_ROOT, 'revit', 'FloorPlanner.extension', 'lib')
FAMILY_MAP_PATH = os.path.join(REPO_ROOT, 'revit', 'FloorPlanner.extension', 'family-map.json')
FIXTURE_PATH = os.path.join(REPO_ROOT, 'tests', 'fixtures', 'revit-sample.fp-revit.json')

if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

import fp_core  # noqa: E402


def _install_revit_mocks():
    """Install minimal fake clr / System / Autodesk.Revit modules into sys.modules."""
    class _IFailuresPreprocessor(object):
        pass

    class _XYZ(object):
        def __init__(self, x=0.0, y=0.0, z=0.0):
            self.X = float(x)
            self.Y = float(y)
            self.Z = float(z)

        def DistanceTo(self, other):
            return math.sqrt(
                (self.X - other.X) ** 2
                + (self.Y - other.Y) ** 2
                + (self.Z - other.Z) ** 2
            )

        def __add__(self, other):
            return _XYZ(self.X + other.X, self.Y + other.Y, self.Z + other.Z)

        def __sub__(self, other):
            return _XYZ(self.X - other.X, self.Y - other.Y, self.Z - other.Z)

        def Normalize(self):
            n = math.sqrt(self.X ** 2 + self.Y ** 2 + self.Z ** 2)
            return _XYZ(self.X / n, self.Y / n, self.Z / n) if n else _XYZ(0, 0, 0)

    _XYZ.BasisZ = _XYZ(0.0, 0.0, 1.0)

    class _DotNetList(list):
        def Add(self, item):
            self.append(item)

    class _ListMeta(type):
        def __getitem__(cls, _item_type):
            return _DotNetList

    class _List(object, metaclass=_ListMeta):
        def __new__(cls):
            return _DotNetList()

    clr_mod = MagicMock()
    sys_mod = MagicMock()
    sys_coll_mod = MagicMock()
    sys_coll_mod.List = _List

    autodesk_mod = MagicMock()
    revit_mod = MagicMock()
    db_mod = MagicMock()
    struct_mod = MagicMock()
    arch_mod = MagicMock()

    db_mod.IFailuresPreprocessor = _IFailuresPreprocessor
    db_mod.XYZ = _XYZ
    db_mod.WallKind.Basic = 'Basic'
    db_mod.WallKind.Curtain = 'Curtain'
    db_mod.ViewFamily.FloorPlan = 'FloorPlan'
    db_mod.BuiltInCategory.OST_Doors = 'OST_Doors'
    db_mod.BuiltInCategory.OST_Windows = 'OST_Windows'
    db_mod.BuiltInCategory.OST_Furniture = 'OST_Furniture'
    db_mod.BuiltInCategory.OST_PlumbingFixtures = 'OST_PlumbingFixtures'
    db_mod.BuiltInCategory.OST_GenericModel = 'OST_GenericModel'
    db_mod.BuiltInParameter.WALL_BASE_OFFSET = 'WALL_BASE_OFFSET'

    for name, mod in [
        ('clr', clr_mod),
        ('System', sys_mod),
        ('System.Collections', MagicMock()),
        ('System.Collections.Generic', sys_coll_mod),
        ('Autodesk', autodesk_mod),
        ('Autodesk.Revit', revit_mod),
        ('Autodesk.Revit.DB', db_mod),
        ('Autodesk.Revit.DB.Structure', struct_mod),
        ('Autodesk.Revit.DB.Architecture', arch_mod),
    ]:
        sys.modules[name] = mod

    return db_mod


_DB = _install_revit_mocks()
import fp_build  # noqa: E402


class TestFpCore(unittest.TestCase):
    def _valid_exchange(self):
        return {
            'format': fp_core.FORMAT,
            'v': fp_core.VERSION,
            'units': 'ft',
            'levels': [{'id': 'L0', 'name': 'Ground', 'elev': 0}],
        }

    def test_check_exchange_rejects_wrong_format(self):
        data = self._valid_exchange()
        data['format'] = 'something-else'
        with self.assertRaises(ValueError):
            fp_core.check_exchange(data)
        with self.assertRaises(ValueError):
            fp_core.check_exchange(['not-a-dict'])

    def test_check_exchange_rejects_newer_version(self):
        data = self._valid_exchange()
        data['v'] = fp_core.VERSION + 1
        with self.assertRaises(ValueError):
            fp_core.check_exchange(data)

    def test_check_exchange_rejects_missing_levels(self):
        data = self._valid_exchange()
        data['levels'] = []
        with self.assertRaises(ValueError):
            fp_core.check_exchange(data)

        data_no_key = self._valid_exchange()
        del data_no_key['levels']
        with self.assertRaises(ValueError):
            fp_core.check_exchange(data_no_key)

    def test_load_family_map_merges_and_ignores_underscores(self):
        override = {
            '_comment': 'ignored',
            'wallType': 'My Wall',
            'doors': {
                '_note': 'ignored nested',
                'swingToFacing': True,
            },
            'openings': {
                'door': ['CustomDoor'],
            },
        }
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as fh:
            json.dump(override, fh)
            tmp_path = fh.name
        try:
            fmap = fp_core.load_family_map(tmp_path)
        finally:
            os.remove(tmp_path)

        self.assertNotIn('_comment', fmap)
        self.assertNotIn('_note', fmap['doors'])
        self.assertEqual(fmap['wallType'], 'My Wall')
        self.assertEqual(fmap['floorType'], fp_core.DEFAULT_MAP['floorType'])
        self.assertTrue(fmap['doors']['swingToFacing'])
        self.assertFalse(fmap['doors']['hingeToHand'])
        self.assertEqual(fmap['openings']['door'], ['CustomDoor'])

    def test_candidates_accepts_strings_and_dicts(self):
        fmap = {
            'openings': {
                'door': [
                    'Single-Flush',
                    {'family': 'Double-Flush', 'type': '180cm'},
                    {'family': 'NoType'},
                    '',
                ]
            }
        }
        self.assertEqual(
            fp_core.candidates(fmap, 'openings', 'door'),
            [
                {'family': 'Single-Flush', 'type': ''},
                {'family': 'Double-Flush', 'type': '180cm'},
                {'family': 'NoType', 'type': ''},
            ],
        )

    def test_pick_symbol_exact_beats_contains_type_narrowing_and_none(self):
        m_sf = object()
        exact_sf = object()
        typed_sf = object()

        # Contains match appears earlier in symbols list, exact match should still win
        symbols = [
            ('M_Single-Flush', '80cm', m_sf),
            ('Single-Flush', '80cm', exact_sf),
            ('Single-Flush', '90cm', typed_sf),
        ]
        self.assertIs(fp_core.pick_symbol([{'family': 'Single-Flush', 'type': ''}], symbols), exact_sf)
        self.assertIs(fp_core.pick_symbol([{'family': 'Single-Flush', 'type': '90cm'}], symbols), typed_sf)
        self.assertIsNone(fp_core.pick_symbol([{'family': 'NonExistent', 'type': ''}], symbols))

    def test_clean_loop(self):
        # Drops consecutive duplicate, closing duplicate, and collinear midpoint
        pts = [
            (0.0, 0.0),
            (0.0, 0.0),
            (5.0, 0.0),   # collinear between (0, 0) and (10, 0)
            (10.0, 0.0),
            (10.0, 10.0),
            (0.0, 10.0),
            (0.0, 0.0),   # closing point
        ]
        self.assertEqual(
            fp_core.clean_loop(pts),
            [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)],
        )
        # Fewer than 3 unique points -> None
        self.assertIsNone(fp_core.clean_loop([(0, 0), (1, 0), (1, 0)]))

    def test_needs_flip(self):
        self.assertTrue(fp_core.needs_flip((1, 0), (-1, 0)))
        self.assertFalse(fp_core.needs_flip((1, 0), (1, 0)))
        self.assertFalse(fp_core.needs_flip((1, 0), (0, 1)))
        self.assertFalse(fp_core.needs_flip(None, (1, 0)))

    def test_door_targets(self):
        op = {'swing': [0, 1], 'hinge': [1, 0]}
        fmap_false = {'doors': {'swingToFacing': False, 'hingeToHand': False}}
        self.assertEqual(fp_core.door_targets(op, fmap_false), ([0, -1], [-1, 0]))

        fmap_true = {'doors': {'swingToFacing': True, 'hingeToHand': True}}
        self.assertEqual(fp_core.door_targets(op, fmap_true), ([0, 1], [1, 0]))

    def test_group_faces(self):
        item = {
            'faces': [
                {'s': 1, 'm': 2, 'p': [[0, 0, 0], [1, 0, 0], [1, 1, 0]]},
                {'s': 0, 'm': 0, 'p': [[0, 0, 0], [2, 0, 0], [2, 2, 0]]},
                {'s': 1, 'm': 3, 'p': [[0, 0, 1], [1, 0, 1], [1, 1, 1]]},
            ]
        }
        grouped = fp_core.group_faces(item)
        self.assertEqual(len(grouped), 2)
        self.assertEqual(grouped[0][0], 2)
        self.assertEqual(len(grouped[0][1]), 2)
        self.assertEqual(grouped[1][0], 0)
        self.assertEqual(len(grouped[1][1]), 1)

    def test_wall_type_name_and_size_name(self):
        # 20 cm in feet = 20 / 30.48
        t_ft = 20.0 / fp_core.CM_PER_FT
        self.assertEqual(fp_core.wall_type_name(t_ft), 'FP Wall 20 cm')
        self.assertEqual(fp_core.wall_type_name(t_ft, '#AABBCC'), 'FP Wall 20 cm #aabbcc')

        w_ft = 90.0 / fp_core.CM_PER_FT
        h_ft = 210.0 / fp_core.CM_PER_FT
        self.assertEqual(fp_core.size_name('FP', w_ft, h_ft), 'FP 90 x 210 cm')

    def test_report_text_ordering(self):
        rep = fp_core.Report()
        rep.add('skipped', 1)
        rep.add('custom_extra', 5)
        rep.add('walls', 4)
        rep.add('levels', 1)
        rep.note('First note')
        rep.note('First note')  # duplicate ignored
        self.assertEqual(
            rep.text(),
            'levels: 1\nwalls: 4\nskipped: 1\ncustom_extra: 5\n\n- First note',
        )


class TestFpBuild(unittest.TestCase):
    def test_import_revit_sample_fixture(self):
        with open(FIXTURE_PATH, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        fmap = fp_core.load_family_map(FAMILY_MAP_PATH)

        # Reset DB mocks so call counts are isolated to this test
        for mock_obj in (
            _DB.Level, _DB.Wall, _DB.Floor, _DB.DirectShape,
            _DB.Line, _DB.UV, _DB.FilteredElementCollector,
        ):
            mock_obj.reset_mock()

        _DB.Line.CreateBound.side_effect = lambda p, q: MagicMock(a=p, b=q)
        _DB.UV.side_effect = lambda u, v: (u, v)

        # Level.Create returns a level mock with the requested Elevation
        def _create_level(_doc, z):
            lv = MagicMock()
            lv.Elevation = float(z)
            return lv
        _DB.Level.Create.side_effect = _create_level

        # Wall.Create returns a wall mock with numeric base offset 0.0
        def _create_wall(*_args, **_kwargs):
            w = MagicMock()
            p = MagicMock()
            p.AsDouble.return_value = 0.0
            w.get_Parameter.return_value = p
            return w
        _DB.Wall.Create.side_effect = _create_wall

        # WallType / FloorType / FamilySymbol mocks
        basic_wt = MagicMock()
        basic_wt.Name = 'Basic Wall'
        basic_wt.Kind = _DB.WallKind.Basic

        floor_type = MagicMock()
        floor_type.Name = 'Generic Floor'
        floor_type.IsFoundationSlab = False

        door_sym = MagicMock()
        door_sym.Name = 'Standard'
        door_sym.Family.Name = 'Single-Flush'
        door_sym.IsActive = True

        win_sym = MagicMock()
        win_sym.Name = 'Standard'
        win_sym.Family.Name = 'Fixed'
        win_sym.IsActive = True

        def _make_collector(_doc):
            state = {'cls': None, 'cat': None}
            col = MagicMock()

            def _of_class(cls):
                state['cls'] = cls
                return col

            def _of_category(cat):
                state['cat'] = cat
                return col

            def _items():
                cls, cat = state['cls'], state['cat']
                if cls is _DB.WallType:
                    return [basic_wt]
                if cls is _DB.FloorType:
                    return [floor_type]
                if cls is _DB.FamilySymbol:
                    if cat == _DB.BuiltInCategory.OST_Doors:
                        return [door_sym]
                    if cat == _DB.BuiltInCategory.OST_Windows:
                        return [win_sym]
                    return []
                return []

            col.OfClass.side_effect = _of_class
            col.OfCategory.side_effect = _of_category
            col.__iter__.side_effect = lambda: iter(_items())
            return col

        _DB.FilteredElementCollector.side_effect = _make_collector

        doc = MagicMock()
        made = []

        def _new_family_inst(*_args, **_kwargs):
            inst = MagicMock()
            made.append(inst)
            inst.FacingOrientation = _DB.XYZ(0, 1, 0)
            inst.HandOrientation = _DB.XYZ(1, 0, 0)
            return inst
        doc.Create.NewFamilyInstance.side_effect = _new_family_inst

        def _new_room(*_args, **_kwargs):
            rm = MagicMock()
            rm.Area = 100.0
            return rm
        doc.Create.NewRoom.side_effect = _new_room

        rep = fp_build.Importer(doc, data, fmap).run()

        # Levels
        self.assertEqual(_DB.Level.Create.call_count, len(data['levels']))

        # Walls: count + coordinates, height, base offset
        self.assertEqual(_DB.Wall.Create.call_count, len(data['walls']))
        for call, w in zip(_DB.Wall.Create.call_args_list, data['walls']):
            _doc, line, _wt_id, _lv_id, h, base, _struc, _flip = call[0]
            self.assertAlmostEqual(line.a.X, w['a'][0], places=5)
            self.assertAlmostEqual(line.a.Y, w['a'][1], places=5)
            self.assertAlmostEqual(line.b.X, w['b'][0], places=5)
            self.assertAlmostEqual(line.b.Y, w['b'][1], places=5)
            self.assertAlmostEqual(h, w['h'], places=5)
            self.assertAlmostEqual(base, w.get('base', 0), places=5)

        # Doors & windows
        self.assertEqual(doc.Create.NewFamilyInstance.call_count, len(data['openings']))

        # Floors
        self.assertEqual(_DB.Floor.Create.call_count, len(data['floors']))

        # Rooms: count + exported pt
        self.assertEqual(doc.Create.NewRoom.call_count, len(data['rooms']))
        for call, r in zip(doc.Create.NewRoom.call_args_list, data['rooms']):
            _lv, uv = call[0]
            self.assertAlmostEqual(uv[0], r['pt'][0], places=5)
            self.assertAlmostEqual(uv[1], r['pt'][1], places=5)

        # Furniture items (all DirectShape since no furniture families exist)
        self.assertEqual(_DB.DirectShape.CreateElement.call_count, len(data['items']))

        # Report counts and no skipped elements
        self.assertEqual(rep.counts.get('levels'), 1)
        self.assertEqual(rep.counts.get('walls'), 7)
        self.assertEqual(rep.counts.get('doors'), 4)
        self.assertEqual(rep.counts.get('windows'), 5)
        self.assertEqual(rep.counts.get('floors'), 1)
        self.assertEqual(rep.counts.get('rooms'), 4)
        self.assertEqual(rep.counts.get('furniture (DirectShape)'), 5)
        self.assertNotIn('skipped', rep.counts)
        self.assertNotIn('skipped', rep.text())
        self.assertFalse([n for n in rep.notes if 'rolled back' in n], rep.notes)

        # Doors are flipped so their swing / hinge follow the plan (new instances face +Y, hand +X here)
        self.assertEqual(len(made), len(data['openings']))
        doors = 0
        for op, inst in zip(data['openings'], made):
            if op['kind'] == 'window':
                self.assertFalse(inst.flipFacing.called)
                continue
            doors += 1
            face, hand = fp_core.door_targets(op, fmap)
            self.assertEqual(inst.flipFacing.called, fp_core.needs_flip((0, 1), face), op['id'])
            self.assertEqual(inst.flipHand.called, fp_core.needs_flip((1, 0), hand), op['id'])
        self.assertEqual(doors, 4)

if __name__ == '__main__':
    unittest.main()
