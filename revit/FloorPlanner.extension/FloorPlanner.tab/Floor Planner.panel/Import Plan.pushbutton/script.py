# -*- coding: utf-8 -*-
"""pyRevit button: import a Floor Planner .fp-revit.json file into the open model."""
from __future__ import print_function, unicode_literals

import os

from pyrevit import forms, revit, script

import fp_build
import fp_core

EXT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
out = script.get_output()

path = forms.pick_file(file_ext='json', title='Floor Planner: pick the "Export for Revit" file')
if path:
    try:
        data = fp_core.load_exchange(path)
        fmap = fp_core.load_family_map(os.path.join(EXT, 'family-map.json'))
        rep = fp_build.Importer(revit.doc, data, fmap).run()
        out.print_md('## Floor Planner: {0}'.format(data.get('name') or os.path.basename(path)))
        out.print_code(rep.text())
    except Exception as ex:
        forms.alert('Import failed:\n{0}'.format(ex), title='Floor Planner')
