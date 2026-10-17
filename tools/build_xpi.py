#!/usr/bin/env python3
"""Build the AriaNG Firefox extension XPI.

The XPI format is a plain zip whose root contains manifest.json - exactly what
Firefox expects for a directly installable (sideloaded) add-on package.

Works in both layouts:
  <workspace>/tools/build_xpi.py  -> packages <workspace>/ariang-firefox/
  <repo>/tools/build_xpi.py      -> packages <repo>/ itself
The output XPI always lands in <package-root>/../build/ariang-<version>.xpi,
i.e. the build/ directory next to the packaged source tree.
"""
import json
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))

SKIP_DIRS = {'.git', '__pycache__', 'node_modules'}
SKIP_FILES = {'.DS_Store', 'Thumbs.db'}


def find_source():
    """Locate the extension source tree (the dir holding manifest.json)."""
    parent = os.path.dirname(HERE)
    for cand in (os.path.join(parent, 'ariang-firefox'), parent):
        if os.path.isfile(os.path.join(cand, 'manifest.json')):
            return cand
    return None


def main():
    src = find_source()
    if not src:
        print('manifest.json not found next to ' + HERE)
        return 1
    with open(os.path.join(src, 'manifest.json'), encoding='utf-8') as f:
        version = json.load(f)['version']
    out_dir = os.path.join(os.path.dirname(src), 'build')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'ariang-%s.xpi' % version)
    count = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if f in SKIP_FILES:
                    continue
                full = os.path.join(root, f)
                arc = os.path.relpath(full, src).replace(os.sep, '/')
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
