#!/usr/bin/env python3
"""Read-only checks for self-contained, uncompressed Tripo GLB motion exports.

This is a delivery diagnostic, not a complete glTF validator or visual rig review.
Unsupported external/sparse/extension-compressed content fails explicitly.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

try:
    from .verify_character_delivery import inspect_glb, image_dimensions
except ImportError:
    from verify_character_delivery import inspect_glb, image_dimensions


def inspect_motion(path, require_animation=False):
    path = Path(path)
    inspect_glb(path)
    raw = path.read_bytes()
    offset, document, binary = 12, None, b''
    kinds = []
    while offset < len(raw):
        length, kind = struct.unpack_from('<I4s', raw, offset)
        data = raw[offset + 8:offset + 8 + length]
        kinds.append(kind)
        if kind == b'JSON':
            if document is not None:
                raise ValueError('Duplicate JSON chunk')
            document = json.loads(data)
        elif kind == b'BIN\x00':
            if binary:
                raise ValueError('Duplicate BIN chunk')
            binary = data
        offset += length + 8
    if kinds not in ([b'JSON'], [b'JSON', b'BIN\x00']):
        raise ValueError('Unsupported GLB chunk layout')
    buffers = document.get('buffers', [])
    if len(buffers) != 1 or buffers[0].get('uri') or not 0 <= len(binary) - buffers[0]['byteLength'] <= 3:
        raise ValueError('Expected one embedded buffer; external buffers unsupported')
    views = document.get('bufferViews', [])
    for view in views:
        if view.get('buffer') != 0 or view.get('byteOffset', 0) < 0 or view.get('byteLength', 0) < 0:
            raise ValueError('Invalid embedded buffer view')
        if view.get('byteOffset', 0) + view['byteLength'] > buffers[0]['byteLength']:
            raise ValueError('Buffer view exceeds embedded buffer')

    def item(items, index, kind):
        if type(index) is not int or not 0 <= index < len(items):
            raise ValueError(f'Invalid {kind} reference')
        return items[index]

    accessors = document.get('accessors', [])
    components = {5120:('b', 1), 5121:('B', 1), 5122:('h', 2), 5123:('H', 2), 5125:('I', 4), 5126:('f', 4)}
    widths = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}

    def accessor(index):
        a = item(accessors, index, 'accessor')
        if a.get('sparse') or a.get('type') not in widths or a.get('componentType') not in components:
            raise ValueError('Unsupported sparse accessor/type/component')
        view = item(views, a.get('bufferView'), 'bufferView')
        code, size = components[a['componentType']]
        width = widths[a['type']]
        stride = view.get('byteStride', size * width)
        start = a.get('byteOffset', 0)
        count = a.get('count')
        if type(count) is not int or count < 1 or start < 0 or stride < size * width:
            raise ValueError('Invalid accessor count/stride/offset')
        if start + (count - 1) * stride + size * width > view['byteLength']:
            raise ValueError('Accessor exceeds its buffer view')
        absolute = view.get('byteOffset', 0) + start
        return a, [struct.unpack_from('<' + code * width, binary, absolute + i * stride) for i in range(count)]

    nodes = document.get('nodes', [])
    meshes = document.get('meshes', [])
    triangles, vertices = 0, 0
    for mesh in meshes:
        for p in mesh.get('primitives', []):
            if set(p.get('extensions', {})) - {'FB_ngon_encoding'}:
                raise ValueError('Compressed/extension primitives require an external validator')
            a = item(accessors, p.get('attributes', {}).get('POSITION'), 'POSITION accessor')
            vertices += a['count']
            n = item(accessors, p['indices'], 'indices accessor')['count'] if 'indices' in p else a['count']
            if p.get('mode', 4) != 4 or n % 3:
                raise ValueError('Expected triangulated triangle primitives')
            triangles += n // 3
    if not triangles:
        raise ValueError('No triangle geometry')
    skins = document.get('skins', [])
    attached_skins = set()
    binding_nodes = set()
    for node_index, node in enumerate(nodes):
        for child in node.get('children', []):
            item(nodes, child, 'child node')
        if 'skin' not in node:
            continue
        skin = item(skins, node['skin'], 'skin')
        attached_skins.add(node['skin'])
        binding_nodes.add(node_index)
        if not skin.get('joints'):
            raise ValueError('Skin has no joints')
        for joint in skin['joints']:
            item(nodes, joint, 'joint')
            binding_nodes.add(joint)
        mesh = item(meshes, node.get('mesh'), 'skinned mesh')
        if 'inverseBindMatrices' in skin:
            bind, _ = accessor(skin['inverseBindMatrices'])
            if bind['type'] != 'MAT4' or bind['count'] != len(skin['joints']):
                raise ValueError('Inverse bind matrices do not match joints')
        for p in mesh.get('primitives', []):
            attrs = p.get('attributes', {})
            joints, joint_data = accessor(attrs.get('JOINTS_0'))
            weights, weight_data = accessor(attrs.get('WEIGHTS_0'))
            if joints['type'] != 'VEC4' or weights['type'] != 'VEC4' or joints['count'] != weights['count'] or joints['count'] != item(accessors, attrs['POSITION'], 'POSITION accessor')['count']:
                raise ValueError('Skin attributes do not match geometry')
            for js, ws in zip(joint_data, weight_data):
                if any(j < 0 or j >= len(skin['joints']) for j in js) or any(not math.isfinite(w) or w < 0 for w in ws) or sum(ws) <= 0:
                    raise ValueError('Invalid skin joint indices or weights')
    animations = []
    for animation in document.get('animations', []):
        channels = animation.get('channels', [])
        samplers = animation.get('samplers', [])
        if not channels:
            raise ValueError('Animation contains no channels')
        duration = 0.0
        targets = set()
        varying_channels = 0
        varying_binding_channels = 0
        for channel in channels:
            target = channel.get('target', {})
            item(nodes, target.get('node'), 'animation target node')
            if target.get('path') not in ('translation', 'rotation', 'scale'):
                raise ValueError('Unsupported animation path (morph weights require other validation)')
            sampler = item(samplers, channel.get('sampler'), 'animation sampler')
            times, values = accessor(sampler.get('input'))
            output, output_data = accessor(sampler.get('output'))
            ts = [v[0] for v in values]
            if times['type'] != 'SCALAR' or times['componentType'] != 5126 or any(not math.isfinite(t) or t < 0 for t in ts) or any(a >= b for a, b in zip(ts, ts[1:])):
                raise ValueError('Animation timeline must contain finite increasing float times')
            interpolation = sampler.get('interpolation', 'LINEAR')
            if interpolation not in ('LINEAR', 'STEP', 'CUBICSPLINE'):
                raise ValueError('Unsupported interpolation')
            multiplier = 3 if interpolation == 'CUBICSPLINE' else 1
            expected_type = 'VEC4' if target['path'] == 'rotation' else 'VEC3'
            if output['count'] != len(ts) * multiplier or output['type'] != expected_type or output['componentType'] != 5126 or any(not math.isfinite(v) for row in output_data for v in row):
                raise ValueError('Animation outputs do not match timeline/path')
            duration = max(duration, ts[-1] - ts[0])
            targets.add(target['node'])
            key_values = output_data[1::3] if interpolation == 'CUBICSPLINE' else output_data
            if any(any(abs(v - first) > 1e-6 for v, first in zip(row, key_values[0])) for row in key_values[1:]):
                varying_channels += 1
                if target['node'] in binding_nodes:
                    varying_binding_channels += 1
        if duration <= 0:
            raise ValueError('Animation has zero duration')
        if require_animation and not varying_binding_channels:
            raise ValueError('Animation does not change the attached skin or its joints')
        animations.append({'name':animation.get('name', ''), 'durationSeconds':duration, 'channels':len(channels), 'targetNodes':len(targets), 'bindingTargets':len(targets.intersection(binding_nodes)), 'varyingChannels':varying_channels, 'varyingBindingChannels':varying_binding_channels})
    if require_animation and (not animations or not attached_skins):
        raise ValueError('Required animated skinned mesh missing')
    textures = []
    images = document.get('images', [])
    for image in images:
        if image.get('uri'):
            raise ValueError('External texture dependency: export is not self-contained')
        view = item(views, image.get('bufferView'), 'image bufferView')
        start = view.get('byteOffset', 0)
        textures.append(image_dimensions(binary[start:start + view['byteLength']]))
    for texture in document.get('textures', []):
        item(images, texture.get('source'), 'texture image')
    materials = document.get('materials', [])
    def texture_references(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key.endswith('Texture') and isinstance(child, dict):
                    item(document.get('textures', []), child.get('index'), 'material texture')
                texture_references(child)
        elif isinstance(value, list):
            for child in value:
                texture_references(child)
    texture_references(materials)
    for mesh in meshes:
        for primitive in mesh.get('primitives', []):
            if 'material' in primitive:
                item(materials, primitive['material'], 'primitive material')
    return {'fileChecksPassed':True, 'bytes':len(raw), 'sha256':hashlib.sha256(raw).hexdigest(), 'triangles':triangles, 'vertices':vertices, 'materials':len(document.get('materials', [])), 'embeddedTextures':textures, 'skins':len(skins), 'attachedSkins':len(attached_skins), 'joints':sum(len(s['joints']) for s in skins), 'animations':animations, 'visualAcceptance':'not_assessed', 'scope':'self-contained uncompressed GLB delivery diagnostic; not full glTF conformance'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--require-animation', action='store_true')
    args = parser.parse_args()
    try:
        result = inspect_motion(args.file, args.require_animation)
    except (OSError, ValueError, KeyError, TypeError, struct.error) as error:
        print(json.dumps({'fileChecksPassed':False, 'error':str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
