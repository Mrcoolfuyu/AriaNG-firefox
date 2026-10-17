#!/usr/bin/env python3
"""Build the AriaNG Firefox extension XPI from ariang-firefox/.

The XPI format is a plain zip whose root contains manifest.json - exactly what
Firefox expects for a directly installable (sideloaded) add-on package.
"""
import json
import os
import sys
import zipfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # workspace root
SRC = os.path.join(BASE, 'ariang-firefox')
OUT_DIR = os.path.join(BASE, 'build')
VERSION = '1.0.0'

SKIP_DIRS = {'.git', '__pycache__', 'node_modules'}
SKIP_FILES = {'.DS_Store', 'Thumbs.db'}


def main():
    manifest = os.path.join(SRC, 'manifest.json')
    if not os.path.isfile(manifest):
        print('manifest.json not found in ' + SRC)
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, 'ariang-%s.xpi' % VERSION)
    count = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(SRC):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if f in SKIP_FILES:
                    continue
                full = os.path.join(root, f)
                arc = os.path.relpath(full, SRC).replace(os.sep, '/')
                zf.write(full, arc)
                count += 1
    print('built %s (%d files, %d bytes)' % (out, count, os.path.getsize(out)))
    # sanity: manifest.json must be at zip root
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
        if 'manifest.json' not in names:
            print('ERROR: manifest.json missing at zip root')
            return 1
        for required in ('js/background.js', 'popup/popup.html', 'options/options.html',
                         'ui/ariang/index.html', '_locales/zh_CN/messages.json'):
            if required not in names:
                print('ERROR: %s missing' % required)
                return 1
        # Firefox requires a gecko id for sideloaded installs
        manifest = json.loads(zf.read('manifest.json').decode('utf-8'))
        gecko_id = (manifest.get('browser_specific_settings') or {}).get('gecko', {}).get('id')
        if not gecko_id:
            print('ERROR: browser_specific_settings.gecko.id missing from manifest')
            return 1
        if zf.testzip() is not None:
            print('ERROR: corrupt zip entry')
            return 1
    print('sanity checks passed (gecko id: %s)' % gecko_id)
    return 0


if __name__ == '__main__':
    sys.exit(main())
