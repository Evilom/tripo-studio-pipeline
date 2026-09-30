import copy
import json
from pathlib import Path
import struct
import tempfile
import unittest

from scripts.verify_glb_motion import inspect_motion


def fixture(times=(0.0, 2.5)):
    binary = bytearray()
    views, accessors = [], []

    def add(data, component, kind, count):
        binary.extend(b'\x00' * (-len(binary) % 4))
        views.append({'buffer':0, 'byteOffset':len(binary), 'byteLength':len(data)})
        binary.extend(data)
        accessors.append({'bufferView':len(views) - 1, 'componentType':component, 'type':kind, 'count':count})
        return len(accessors) - 1

    pos = add(struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0), 5126, 'VEC3', 3)
    indices = add(struct.pack('<3H', 0, 1, 2), 5123, 'SCALAR', 3)
    joints = add(bytes(12), 5121, 'VEC4', 3)
    weights = add(struct.pack('<12f', *(1, 0, 0, 0) * 3), 5126, 'VEC4', 3)
    timeline = add(struct.pack('<2f', *times), 5126, 'SCALAR', 2)
    rotations = add(struct.pack('<8f', 0, 0, 0, 1, 0, 0, 0.6, 0.8), 5126, 'VEC4', 2)
    document = {'asset':{'version':'2.0'}, 'buffers':[{'byteLength':len(binary)}], 'bufferViews':views, 'accessors':accessors,
                'meshes':[{'primitives':[{'attributes':{'POSITION':pos, 'JOINTS_0':joints, 'WEIGHTS_0':weights}, 'indices':indices}]}],
                'nodes':[{'mesh':0, 'skin':0, 'children':[1]}, {}], 'skins':[{'joints':[1]}],
                'animations':[{'name':'Walk', 'samplers':[{'input':timeline, 'output':rotations}], 'channels':[{'sampler':0, 'target':{'node':1, 'path':'rotation'}}]}]}
    return document, binary


def encode(document, binary):
    metadata = json.dumps(document).encode()
    metadata += b' ' * (-len(metadata) % 4)
    binary += bytes(-len(binary) % 4)
    chunks = struct.pack('<I4s', len(metadata), b'JSON') + metadata + struct.pack('<I4s', len(binary), b'BIN\x00') + binary
    return struct.pack('<4sII', b'glTF', 2, 12 + len(chunks)) + chunks


class MotionDeliveryTests(unittest.TestCase):
    def inspect(self, document, binary, required=True):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'motion.glb'
            path.write_bytes(encode(document, binary))
            return inspect_motion(path, required)

    def test_reports_actual_skinned_motion_and_duration(self):
        result = self.inspect(*fixture())
        self.assertEqual(result['attachedSkins'], 1)
        self.assertEqual(result['joints'], 1)
        self.assertEqual(result['animations'][0]['durationSeconds'], 2.5)
        self.assertEqual(result['animations'][0]['varyingBindingChannels'], 1)
        self.assertEqual(result['visualAcceptance'], 'not_assessed')

    def test_static_or_empty_animation_cannot_pass_motion_delivery(self):
        doc, binary = fixture()
        doc['animations'] = []
        with self.assertRaisesRegex(ValueError, 'missing'):
            self.inspect(doc, binary)
        self.assertEqual(self.inspect(doc, binary, False)['animations'], [])
        doc['animations'] = [{'channels':[], 'samplers':[]}]
        with self.assertRaisesRegex(ValueError, 'no channels'):
            self.inspect(doc, binary)

    def test_invalid_weights_targets_timeline_and_buffer_bounds_fail(self):
        doc, binary = fixture()
        changes = [lambda d: d['meshes'][0]['primitives'][0]['attributes'].pop('WEIGHTS_0'),
                   lambda d: d['animations'][0]['channels'][0]['target'].update(node=99),
                   lambda d: d['bufferViews'][0].update(byteLength=len(binary) + 99),
                   lambda d: d['accessors'][5].update(count=1)]
        for change in changes:
            invalid = copy.deepcopy(doc)
            change(invalid)
            with self.assertRaises(ValueError):
                self.inspect(invalid, binary)
        with self.assertRaisesRegex(ValueError, 'increasing'):
            self.inspect(*fixture((0, 0)))

    def test_external_texture_dependency_is_not_self_contained(self):
        doc, binary = fixture()
        doc['images'] = [{'uri':'missing-texture.png'}]
        with self.assertRaisesRegex(ValueError, 'External texture'):
            self.inspect(doc, binary)

    def test_static_curves_and_unbound_animation_cannot_satisfy_motion_delivery(self):
        doc, binary = fixture()
        rotations = doc['bufferViews'][doc['accessors'][5]['bufferView']]['byteOffset']
        binary[rotations:rotations + 32] = struct.pack('<8f', 0, 0, 0, 1, 0, 0, 0, 1)
        with self.assertRaisesRegex(ValueError, 'does not change'):
            self.inspect(doc, binary)
        doc, binary = fixture()
        doc['nodes'].append({})
        doc['animations'][0]['channels'][0]['target']['node'] = 2
        with self.assertRaisesRegex(ValueError, 'does not change'):
            self.inspect(doc, binary)

    def test_unrelated_moving_node_cannot_mask_static_bound_channels(self):
        doc, binary = fixture()
        doc['nodes'].append({})
        doc['animations'][0]['channels'][0]['target']['node'] = 2
        binary.extend(bytes(-len(binary) % 4))
        offset = len(binary)
        binary.extend(struct.pack('<8f', 0, 0, 0, 1, 0, 0, 0, 1))
        doc['buffers'][0]['byteLength'] = len(binary)
        doc['bufferViews'].append({'buffer':0, 'byteOffset':offset, 'byteLength':32})
        doc['accessors'].append({'bufferView':len(doc['bufferViews']) - 1, 'componentType':5126, 'type':'VEC4', 'count':2})
        doc['animations'][0]['samplers'].append({'input':4, 'output':len(doc['accessors']) - 1})
        doc['animations'][0]['channels'].append({'sampler':1, 'target':{'node':1, 'path':'rotation'}})
        with self.assertRaisesRegex(ValueError, 'does not change'):
            self.inspect(doc, binary)


if __name__ == '__main__':
    unittest.main()
