import copy
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile

from scripts.package_low_delivery import build
from test_verify_glb_motion import fixture, encode
from test_verify_character_delivery import png


class LowDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root/'low').mkdir()
        doc, binary = fixture()
        doc.pop('animations')
        self.model = self.root/'low/model.glb'
        self.model.write_bytes(encode(doc, binary))
        (self.root/'high').mkdir()
        (self.root/'high/do-not-ship.glb').write_bytes(b'unrelated high asset')
        (self.root/'reference.png').write_bytes(png())
        self.plan = {'schema':1, 'name':'Fixture', 'lowGlb':'low/model.glb', 'reference':'reference.png'}
        self.output = self.root/'handoff.zip'

    def test_explicit_low_only_package_preserves_bytes_and_valid_hashes(self):
        result = build(self.root, self.plan, self.output)
        self.assertEqual(result['triangles'], 1)
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(archive.read('model/model.glb'), self.model.read_bytes())
            self.assertFalse(any(n.startswith('high/') for n in archive.namelist()))
            manifest = json.loads(archive.read('MANIFEST.json'))
            for entry in manifest['files']:
                self.assertEqual(hashlib.sha256(archive.read(entry['path'])).hexdigest(), entry['sha256'])
        self.assertEqual(result['zipCRC'], 'passed')

    def test_triangle_and_archive_limits_reject_before_publication(self):
        plan = copy.deepcopy(self.plan)
        doc, binary = fixture()
        doc.pop('animations')
        doc['meshes'][0]['primitives'] *= 2
        self.model.write_bytes(encode(doc, binary))
        plan['limits'] = {'maxTriangles':1}
        with self.assertRaisesRegex(ValueError, 'triangle limit'):
            build(self.root, plan, self.output)
        plan['limits'] = {'maxArchiveBytes':10}
        with self.assertRaisesRegex(ValueError, 'byte limit'):
            build(self.root, plan, self.output)
        self.assertFalse(self.output.exists())

    def test_path_escape_existing_output_and_duplicate_preview_names_are_rejected(self):
        for path in ('../model.glb', '/model.glb', 'C:/model.glb'):
            with self.assertRaises(ValueError):
                build(self.root, {**self.plan, 'lowGlb':path}, self.output)
        self.plan['previews'] = ['reference.png', 'reference.png']
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            build(self.root, self.plan, self.output)
        self.output.write_bytes(b'keep')
        with self.assertRaises(FileExistsError):
            build(self.root, self.plan, self.output)
        self.assertEqual(self.output.read_bytes(), b'keep')

    def test_fbx_requires_matching_material_directory_and_keeps_all_images(self):
        fbx = self.root/'low/model.fbx'
        fbx.write_bytes(b'Kaydara FBX Binary  \x00\x1a\x00fixture')
        (self.root/'low/model.fbm').mkdir()
        texture = self.root/'low/model.fbm/normal.png'
        texture.write_bytes(png())
        self.plan['editSource'] = {'fbx':'low/model.fbx', 'textureDirectory':'low/model.fbm'}
        build(self.root, self.plan, self.output)
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(archive.read('edit-source/model.fbm/normal.png'), texture.read_bytes())
            self.assertIn('edit-source/model.fbx', archive.namelist())
        self.output.unlink()
        oversized = bytearray(png())
        struct.pack_into('>II', oversized, 16, 4096, 4096)
        texture.write_bytes(oversized)
        with self.assertRaisesRegex(ValueError, 'texture-size limit'):
            build(self.root, self.plan, self.output)
        texture.unlink()
        with self.assertRaisesRegex(ValueError, 'empty'):
            build(self.root, self.plan, self.output)


if __name__ == '__main__':
    unittest.main()
