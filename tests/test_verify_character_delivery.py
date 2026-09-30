import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile
import zlib


SPEC = importlib.util.spec_from_file_location(
    "verify_character_delivery",
    Path(__file__).resolve().parents[1] / "scripts/verify_character_delivery.py",
)
verifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verifier)


def glb():
    document = json.dumps({"asset": {"version": "2.0"}}).encode()
    document += b" " * (-len(document) % 4)
    return struct.pack("<4sIII4s", b"glTF", 2, 20 + len(document), len(document), b"JSON") + document


def png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00"))
            + chunk(b"IEND", b""))


def obj_zip(missing_texture=False, missing_material=False):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("mesh.obj", "mtllib mesh.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nusemtl skin\nf 1 2 3 4\n")
        if not missing_material:
            archive.writestr("mesh.mtl", "newmtl skin\nmap_Kd color.png\nmap_Bump -bm 1 color.png\n")
        if not missing_texture:
            archive.writestr("color.png", png())
    return output.getvalue()


class DeliveryChecks(unittest.TestCase):
    def create_symlink(self, link, target):
        try:
            link.symlink_to(target)
        except OSError as error:
            if getattr(error, 'winerror', None) == 1314:
                self.skipTest('Windows has not granted permission to create symlinks')
            raise

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.manifest_name = "deliveries/character_001/candidate-manifest.json"
        self.source = "assets/example/references/sources.json"
        self.head, self.body = "example-head-v1", "example-body-apose-v1"
        self.names = verifier.expected_files(self.head, self.body, self.source)
        for name in self.names:
            content = b'{}'
            if name.endswith(".glb"):
                content = glb()
            elif name.endswith(".zip"):
                content = obj_zip()
            elif name.endswith("-native-diagnostic.json"):
                content = b'{"face_sides": {"4": 1}}'
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(content)
        self.manifest = {
            "character": "Example",
            "visual_review": {"head_HD_seen": False},
            "files": [],
        }
        self.rehash()

    def save(self):
        file = self.root / self.manifest_name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(json.dumps(self.manifest))

    def rehash(self):
        self.manifest["files"] = [
            {"path": name, "bytes": (self.root / name).stat().st_size,
             "sha256": hashlib.sha256((self.root / name).read_bytes()).hexdigest()}
            for name in self.names
        ]
        self.save()

    def verify(self):
        return verifier.verify_delivery(self.root, self.manifest_name, "Example",
                                        self.head, self.body, self.source)

    def assertRejected(self, phrase):
        result = self.verify()
        self.assertFalse(result["file_checks_passed"], result)
        self.assertIn(phrase, "\n".join(result["errors"]))

    def test_valid_files_are_read_only_and_not_visual_acceptance(self):
        before = {str(f): f.read_bytes() for f in self.root.rglob("*") if f.is_file()}
        result = self.verify()
        self.assertTrue(result["file_checks_passed"], result["errors"])
        self.assertEqual(result["checked_file_count"], 13)
        self.assertEqual(result["visual_acceptance"], "not_assessed")
        after = {str(f): f.read_bytes() for f in self.root.rglob("*") if f.is_file()}
        self.assertEqual(before, after)

    def test_wrong_character(self):
        self.manifest["character"] = "Previous character"
        self.save()
        self.assertRejected("Manifest character")

    def test_previous_character_file_mapping(self):
        self.manifest["files"][1]["path"] = "models/previous-head-v1-hd.glb"
        self.save()
        self.assertRejected("13 mapped files")

    def test_duplicate_entry_does_not_satisfy_file_count(self):
        self.manifest["files"][-1] = self.manifest["files"][0]
        self.save()
        self.assertRejected("13 mapped files")

    def test_missing_file(self):
        (self.root / self.names[1]).unlink()
        self.assertRejected(self.names[1])

    def test_same_length_content_change_fails_hash(self):
        (self.root / self.source).write_bytes(b'[]')
        self.assertRejected("SHA256 mismatch")

    def test_truncated_glb_even_after_manifest_rehash(self):
        file = self.root / self.names[1]
        file.write_bytes(file.read_bytes()[:-4])
        self.rehash()
        self.assertRejected("declared length")

    def test_invalid_chunk_length_with_valid_header_and_hash(self):
        file = self.root / self.names[1]
        content = bytearray(file.read_bytes())
        struct.pack_into("<I", content, 12, 100000)
        file.write_bytes(content)
        self.rehash()
        self.assertRejected("chunk boundary")

    def test_missing_texture_even_after_rehash(self):
        (self.root / self.names[3]).write_bytes(obj_zip(missing_texture=True))
        self.rehash()
        self.assertRejected("Missing archive resource")

    def test_missing_material_even_after_rehash(self):
        (self.root / self.names[3]).write_bytes(obj_zip(missing_material=True))
        self.rehash()
        self.assertRejected("Missing archive resource")

    def test_zip_crc_failure_even_after_rehash(self):
        content = obj_zip()
        content = content.replace(b"v 0 0 0", b"v 9 0 0", 1)
        (self.root / self.names[3]).write_bytes(content)
        self.rehash()
        self.assertRejected("CRC")

    def test_stale_native_face_diagnostic(self):
        (self.root / self.names[4]).write_text('{"face_sides": {"3": 2}}')
        self.rehash()
        self.assertRejected("differs from actual OBJ")

    def test_cross_character_glb_path(self):
        peer = self.root / "deliveries/character_002/candidate-manifest.json"
        peer.parent.mkdir(parents=True)
        peer.write_text(json.dumps({"character": "Other", "files": [self.manifest["files"][1]]}))
        self.assertRejected("Cross-character GLB path reused")

    def test_head_and_body_cannot_alias_the_same_file(self):
        target = self.root / self.names[1]
        body = self.root / self.names[7]
        body.unlink()
        self.create_symlink(body, target)
        self.assertRejected("resolve to the same file")

    def test_symlink_cannot_leave_project(self):
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "source.json"
            target.write_bytes(b'{}')
            file = self.root / self.source
            file.unlink()
            self.create_symlink(file, target)
            self.assertRejected("Path leaves project")

    def test_texture_dimensions_are_observed_from_header(self):
        self.assertEqual(verifier.image_dimensions(png()), {"width": 1, "height": 1})
        jpeg = b'\xff\xd8\xff\xc0' + struct.pack('>HBHHB', 8, 8, 1024, 4096, 1)
        self.assertEqual(verifier.image_dimensions(jpeg), {"width": 4096, "height": 1024})
        with self.assertRaises(ValueError):
            verifier.image_dimensions(b"not an image")


if __name__ == "__main__":
    unittest.main()
