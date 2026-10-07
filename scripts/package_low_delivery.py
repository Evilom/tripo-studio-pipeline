#!/usr/bin/env python3
"""Build a small, checked model handoff from an explicit local delivery plan.

No browser, network, regeneration, resampling, or high-model directory scan.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
import zipfile

try:
    from .verify_glb_motion import inspect_motion
    from .verify_character_delivery import image_dimensions
except ImportError:
    from verify_glb_motion import inspect_motion
    from verify_character_delivery import image_dimensions


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_path(root, value, directory=False):
    if not isinstance(value, str) or not value or any(ord(c) < 32 for c in value):
        raise ValueError('Source path must be a nonempty relative path')
    relative = PurePosixPath(value.replace('\\', '/'))
    if relative.is_absolute() or '..' in relative.parts or ':' in value:
        raise ValueError('Source path must stay inside the asset root')
    path = root.joinpath(*relative.parts)
    if any(p.is_symlink() for p in [path, *path.parents] if p != root):
        raise ValueError('Symlink sources are not supported')
    path = path.resolve()
    if not path.is_relative_to(root) or not (path.is_dir() if directory else path.is_file()):
        raise ValueError('Missing source or source outside the asset root')
    return path


def build(root, plan, output):
    root, output = Path(root).resolve(), Path(output).absolute()
    if output.suffix.lower() != '.zip':
        raise ValueError('Output must use a .zip filename')
    if not isinstance(plan, dict) or type(plan.get('schema')) is not int or plan['schema'] != 1:
        raise ValueError('Delivery plan requires schema:1')
    if set(plan) - {'schema', 'name', 'lowGlb', 'editSource', 'reference', 'previews', 'limits'}:
        raise ValueError('Unknown delivery plan fields')
    name = plan.get('name', 'Model handoff')
    if not isinstance(name, str) or not name.strip() or len(name) > 100 or any(ord(c) < 32 for c in name):
        raise ValueError('Invalid delivery name')
    limits = {'maxTriangles':20000, 'maxTextureSize':2048, 'maxArchiveBytes':20000000}
    overrides = plan.get('limits', {})
    if not isinstance(overrides, dict) or set(overrides) - limits.keys():
        raise ValueError('Unknown delivery limits')
    limits.update(overrides)
    if any(type(value) is not int or value <= 0 for value in limits.values()):
        raise ValueError('Limits must be positive integers')
    if output.exists() or output.is_symlink():
        raise FileExistsError('Output already exists; preserve it and use a new version')
    model = source_path(root, plan.get('lowGlb'))
    if model.suffix.lower() != '.glb':
        raise ValueError('Primary low model must be GLB')
    if output.resolve() == model:
        raise ValueError('Output cannot replace an input')
    model_report = inspect_motion(model)
    if model_report['triangles'] > limits['maxTriangles']:
        raise ValueError('Low model exceeds the triangle limit')
    if any(max(t['width'], t['height']) > limits['maxTextureSize'] for t in model_report['embeddedTextures']):
        raise ValueError('Low model exceeds the texture-size limit')
    payload, names = [], set()

    def add(filename, data):
        normalized = PurePosixPath(filename)
        if normalized.is_absolute() or '..' in normalized.parts or ':' in filename or any(ord(c) < 32 for c in filename):
            raise ValueError('Unsafe package member')
        if filename.casefold() in names:
            raise ValueError('Duplicate package member')
        if len(data) > limits['maxArchiveBytes']:
            raise ValueError('Source exceeds the archive byte limit')
        names.add(filename.casefold())
        payload.append((filename, data))

    model_data = model.read_bytes()
    if digest(model_data) != model_report['sha256']:
        raise ValueError('Primary model changed during validation')
    add('model/' + model.name, model_data)
    edit = plan.get('editSource')
    edit_report = None
    if edit is not None:
        if not isinstance(edit, dict) or set(edit) != {'fbx', 'textureDirectory'}:
            raise ValueError('editSource requires fbx and textureDirectory')
        fbx = source_path(root, edit['fbx'])
        texture_dir = source_path(root, edit['textureDirectory'], directory=True)
        if fbx.suffix.lower() != '.fbx' or texture_dir.parent != fbx.parent or texture_dir.name != fbx.stem + '.fbm':
            raise ValueError('Keep the native FBX and matching sibling .fbm directory')
        data = fbx.read_bytes()
        if not data.startswith(b'Kaydara FBX Binary  \x00\x1a\x00'):
            raise ValueError('Expected native binary FBX')
        add('edit-source/' + fbx.name, data)
        textures = []
        for candidate in sorted(texture_dir.rglob('*')):
            if candidate.is_symlink():
                raise ValueError('Symlink material source')
            if not candidate.is_file():
                continue
            path = source_path(root, candidate.relative_to(root).as_posix())
            if path.suffix.lower() not in ('.png', '.jpg', '.jpeg'):
                raise ValueError('Unexpected non-image material file')
            data = path.read_bytes()
            size = image_dimensions(data)
            if max(size.values()) > limits['maxTextureSize']:
                raise ValueError('FBX material exceeds the texture-size limit')
            member = 'edit-source/' + path.relative_to(fbx.parent).as_posix()
            add(member, data)
            textures.append({'path':member, **size})
        if not textures:
            raise ValueError('FBX material directory is empty')
        edit_report = {'file':'edit-source/' + fbx.name, 'textures':textures, 'binaryHeader':'passed', 'dccImport':'not_assessed'}
    if plan.get('reference') is not None:
        path = source_path(root, plan['reference'])
        data = path.read_bytes()
        image_dimensions(data)
        add('reference/' + path.name, data)
    previews = plan.get('previews', [])
    if not isinstance(previews, list) or len(previews) > 6:
        raise ValueError('previews must contain at most six image paths')
    for value in previews:
        path = source_path(root, value)
        data = path.read_bytes()
        image_dimensions(data)
        add('previews/' + path.name, data)
    report = {'schema':1, 'profile':'low-delivery', 'primaryModel':'model/' + model.name,
              'model':model_report, 'editSource':edit_report, 'limits':limits,
              'sourceGeometryUnchanged':True, 'gameAcceptance':'not_assessed'}
    add('MODEL-REPORT.json', json.dumps(report, ensure_ascii=False, indent=2).encode('utf-8'))
    readme = ('# ' + name + '\n\nPrimary model: model/' + model.name +
              '\n\nGLB materials are embedded. Keep the FBX with its matching .fbm directory when present. '
              'No original high directory or duplicate native ZIPs are collected.\n\n'
              'File checks do not establish art, rig deformation, motion quality, or game acceptance. '
              'See MODEL-REPORT.json and MANIFEST.json; verify SHA256SUMS.txt after transfer.\n')
    add('README.md', readme.encode('utf-8'))
    entries = [{'path':n, 'bytes':len(d), 'sha256':digest(d)} for n, d in payload]
    add('MANIFEST.json', json.dumps({'schema':1, 'profile':'low-delivery', 'name':name, 'files':entries},
                                  ensure_ascii=False, indent=2).encode('utf-8'))
    add('SHA256SUMS.txt', ('\n'.join(digest(d) + '  ' + n for n, d in payload) + '\n').encode('utf-8'))
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(prefix='.tripo-package-', suffix='.partial', dir=output.parent)
    os.close(descriptor)
    temp = Path(temp_name)
    try:
        with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for filename, data in payload:
                archive.writestr(filename, data)
        if temp.stat().st_size > limits['maxArchiveBytes']:
            raise ValueError('Archive exceeds the byte limit')
        with zipfile.ZipFile(temp) as archive:
            if archive.testzip():
                raise ValueError('Package ZIP CRC failure')
            for filename, data in payload:
                if digest(archive.read(filename)) != digest(data):
                    raise ValueError('Package hash mismatch')
        # Same-directory hard link publishes a complete file without replacing an existing target.
        os.link(temp, output)
    finally:
        temp.unlink(missing_ok=True)
    raw = output.read_bytes()
    return {'output':str(output), 'bytes':len(raw), 'sha256':digest(raw), 'members':len(payload),
            'zipCRC':'passed', 'manifestHashes':'passed', 'triangles':model_report['triangles'],
            'sourceGeometryUnchanged':True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--root', type=Path, help='Asset root; defaults to the plan directory')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        plan = json.loads(args.plan.read_text(encoding='utf-8-sig'))
        result = build(args.root or args.plan.resolve().parent, plan, args.output)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({'fileChecksPassed':False, 'error':str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
