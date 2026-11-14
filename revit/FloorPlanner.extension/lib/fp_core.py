# -*- coding: utf-8 -*-
"""Floor Planner -> Revit: pure helpers (no Revit API).

Kept free of Revit imports so they run (and are tested) with plain CPython.
Must stay IronPython 2.7 compatible: no f-strings, no nonlocal, no type hints.
"""
from __future__ import division, print_function, unicode_literals

import io
import json
import math
import os

FORMAT = 'floorplanner-revit'
VERSION = 1
CM_PER_FT = 30.48
# Revit's short-curve tolerance is about 1/256 ft; stay well above it
MIN_SEG_FT = 0.01

# exchange item category -> Revit BuiltInCategory name (DirectShape fallback is OST_GenericModel)
CATEGORY = {
    'furniture': 'OST_Furniture',
    'plumbing': 'OST_PlumbingFixtures',
    'planting': 'OST_Planting',
    'column': 'OST_Columns',
    'appliance': 'OST_SpecialityEquipment',
    'casework': 'OST_Casework',
    'entourage': 'OST_Entourage',
    'stairs': 'OST_Stairs',
    'ramp': 'OST_Ramps',
    'roof': 'OST_Roofs',
}

DEFAULT_MAP = {
    'wallType': '',
    'curtainWallType': '',
    'railingType': '',
    'floorType': '',
    'doors': {'swingToFacing': False, 'hingeToHand': False},
    'openings': {},
    'furniture': {},
    'familyFolders': [],
    'roomSeparationLines': True,
    'planViews': True,
}


def cm(ft):
    return ft * CM_PER_FT


def load_exchange(path):
    """Read and check a .fp-revit.json file. Raises ValueError with a readable message."""
    with io.open(path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
    return check_exchange(data)


def check_exchange(data):
    if not isinstance(data, dict) or data.get('format') != FORMAT:
        raise ValueError('Not a Floor Planner Revit file (use "Export for Revit" in the app).')
    if int(data.get('v', 0)) > VERSION:
        raise ValueError('This file was made by a newer Floor Planner (v{0}); update the add-in.'.format(data.get('v')))
    if data.get('units') != 'ft':
        raise ValueError('Unexpected units: {0}'.format(data.get('units')))
    for key in ('levels', 'walls', 'openings', 'floors', 'rooms', 'items'):
        if not isinstance(data.get(key, []), list):
            raise ValueError('"{0}" must be a list'.format(key))
        data.setdefault(key, [])
    if not data['levels']:
        raise ValueError('The file has no levels.')
    return data


def _merge(base, extra):
    out = dict(base)
    for k, v in (extra or {}).items():
        if k.startswith('_'):
            continue
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_family_map(path):
    """family-map.json merged over the defaults; a missing file gives the defaults."""
    if not path or not os.path.exists(path):
        return _merge(DEFAULT_MAP, {})
    with io.open(path, 'r', encoding='utf-8') as fh:
        return _merge(DEFAULT_MAP, json.load(fh))


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def candidates(fmap, section, key):
    """Family candidates for an exchange key: [{'family': .., 'type': ..}, ...]."""
    out = []
    for c in as_list((fmap.get(section) or {}).get(key)):
        if isinstance(c, dict) and c.get('family'):
            out.append({'family': c['family'], 'type': c.get('type') or ''})
        elif isinstance(c, (str, type(u''))) and c:
            out.append({'family': c, 'type': ''})
    return out


def pick_symbol(cands, symbols):
    """symbols: list of (family_name, type_name, obj). Exact (case-insensitive) family match first,
    then a family name that contains the candidate. A candidate type narrows the match when given."""
    def norm(s):
        return (s or '').strip().lower()
    for exact in (True, False):
        for c in cands:
            fam, typ = norm(c['family']), norm(c.get('type'))
            hits = [s for s in symbols if (norm(s[0]) == fam if exact else fam in norm(s[0]))]
            if typ:
                typed = [s for s in hits if norm(s[1]) == typ]
                if typed:
                    return typed[0][2]
            if hits:
                return hits[0][2]
    return None


def size_name(prefix, w_ft, h_ft):
    return '{0} {1:.0f} x {2:.0f} cm'.format(prefix, round(cm(w_ft)), round(cm(h_ft)))


def wall_type_name(t_ft, color=None):
    name = 'FP Wall {0:g} cm'.format(round(cm(t_ft), 1))
    return name + (' ' + color.lower() if color else '')


def floor_type_name(t_ft):
    return 'FP Floor {0:g} cm'.format(round(cm(t_ft), 1))


def hex_rgb(color, fallback=(176, 137, 104)):
    c = (color or '').lstrip('#')
    if len(c) == 3:
        c = ''.join(ch * 2 for ch in c)
    try:
        return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    except (ValueError, IndexError):
        return fallback


def clean_loop(pts, tol=MIN_SEG_FT):
    """Drop repeated / too-close points and the closing duplicate; None when fewer than 3 remain."""
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > tol:
            out.append((float(p[0]), float(p[1])))
    while len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= tol:
        out.pop()
    # collinear points make Revit sketches complain
    i = 0
    while len(out) > 3 and i < len(out):
        a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
        if abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-6:
            out.pop(i)
        else:
            i += 1
    return out if len(out) >= 3 else None


def clean_face(pts, tol=1e-4):
    out = []
    for p in pts:
        if not out or sum((p[k] - out[-1][k]) ** 2 for k in range(3)) > tol * tol:
            out.append(tuple(float(v) for v in p))
    if len(out) > 1 and sum((out[0][k] - out[-1][k]) ** 2 for k in range(3)) <= tol * tol:
        out.pop()
    return out if len(out) >= 3 else None


def needs_flip(actual, desired):
    """True when the instance vector points away from the wanted one (2D dot product < 0)."""
    if not actual or not desired:
        return False
    return actual[0] * desired[0] + actual[1] * desired[1] < 0


def door_targets(op, fmap):
    """Wanted FacingOrientation / HandOrientation for a door, from the exported swing / hinge vectors."""
    d = fmap.get('doors') or {}
    sw, hg = op.get('swing'), op.get('hinge')
    face = None if not sw else (sw if d.get('swingToFacing') else [-sw[0], -sw[1]])
    hand = None if not hg else (hg if d.get('hingeToHand') else [-hg[0], -hg[1]])
    return face, hand


def group_faces(item):
    """Item faces grouped by solid index: [(material_index, [face_pts, ...]), ...] in solid order."""
    groups, order = {}, []
    for f in item.get('faces') or []:
        s = f.get('s', 0)
        if s not in groups:
            groups[s] = (f.get('m', 0), [])
            order.append(s)
        pts = clean_face(f.get('p') or [])
        if pts:
            groups[s][1].append((f.get('m', 0), pts))
    return [groups[s] for s in order if groups[s][1]]


class Report(object):
    """Counts and messages collected during an import, printed at the end."""

    def __init__(self):
        self.counts = {}
        self.notes = []

    def add(self, key, n=1):
        self.counts[key] = self.counts.get(key, 0) + n

    def note(self, msg):
        if msg not in self.notes:
            self.notes.append(msg)

    def text(self):
        order = ['levels', 'levels reused', 'walls', 'curtain walls', 'railings', 'doors', 'windows',
                 'wall openings', 'floors', 'rooms', 'furniture (families)', 'furniture (DirectShape)', 'skipped']
        keys = [k for k in order if k in self.counts] + sorted(k for k in self.counts if k not in order)
        lines = ['{0}: {1}'.format(k, self.counts[k]) for k in keys]
        if self.notes:
            lines.append('')
            lines.extend('- ' + n for n in self.notes)
        return '\n'.join(lines)
