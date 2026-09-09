#!/usr/bin/env python3
"""Read-only checks for the documented 13-file Tripo character delivery contract."""

import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
import shlex
import struct
import sys
import zipfile


def project_path(root, name):
    if not isinstance(name, str) or not name or "\\" in name:
        raise ValueError(f"Invalid project-relative path: {name!r}")
    value = PurePosixPath(name)
    if value.is_absolute() or ".." in value.parts or value.as_posix() != name:
        raise ValueError(f"Expected a canonical project-relative path: {name}")
    resolved = (root / name).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError(f"Path leaves project: {name}")
    return resolved


def expected_files(head_stem, body_stem, source, texture_label="4k"):
    names = [source]
    for stem in (head_stem, body_stem):
        names.extend([
            f"models/{stem}-hd.glb",
            f"models/{stem}-retopo-{texture_label}.glb",
            f"models/{stem}-retopo-{texture_label}-obj.zip",
            f"models/{stem}-native-diagnostic.json",
            f"models/review-{stem}/validation.json",
            f"models/review-{stem}-retopo/validation.json",
        ])
    return names


def sha256(file):
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_glb(file):
    size = file.stat().st_size
    with file.open("rb") as stream:
        header = stream.read(12)
        if len(header) != 12:
            raise ValueError("Truncated GLB header")
        magic, version, declared = struct.unpack("<4sII", header)
        if magic != b"glTF" or version != 2 or declared != size:
            raise ValueError("Invalid GLB magic/version/declared length")
        chunks = []
        while stream.tell() < size:
            header = stream.read(8)
            if len(header) != 8:
                raise ValueError("Truncated GLB chunk header")
            length, kind = struct.unpack("<I4s", header)
            if length % 4 or stream.tell() + length > size:
                raise ValueError("Invalid GLB chunk boundary")
            if not chunks:
                if kind != b"JSON":
                    raise ValueError("First GLB chunk must be JSON")
                document = json.loads(stream.read(length))
                if not isinstance(document, dict) or document.get("asset", {}).get("version") != "2.0":
                    raise ValueError("Missing glTF 2.0 asset metadata")
            else:
                stream.seek(length, 1)
            chunks.append(kind.decode("ascii"))
        if not chunks:
            raise ValueError("GLB contains no chunks")
    return {"version": version, "chunks": chunks}


def image_dimensions(data):
    """Read PNG/JPEG dimensions; visual review still needs a real image decoder."""
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 33 and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
    elif data.startswith(b"\xff\xd8"):
        offset, width, height = 2, 0, 0
        while offset < len(data):
            if data[offset] != 0xFF:
                raise ValueError("Malformed JPEG marker")
            while offset < len(data) and data[offset] == 0xFF:
                offset += 1
            if offset >= len(data):
                break
            marker = data[offset]
            offset += 1
            if marker in (0xD9, 0xDA):
                break
            if marker in (0x01, *range(0xD0, 0xD8)):
                continue
            if offset + 2 > len(data):
                break
            length = int.from_bytes(data[offset:offset + 2], "big")
            if length < 2 or offset + length > len(data):
                raise ValueError("Truncated JPEG segment")
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                if length < 8:
                    raise ValueError("Truncated JPEG frame")
                height, width = struct.unpack(">HH", data[offset + 3:offset + 7])
                break
            offset += length
    else:
        raise ValueError("Expected a PNG/JPEG texture header")
    if not width or not height:
        raise ValueError("Texture dimensions unavailable or zero")
    return {"width": width, "height": height}


def archive_reference(owner, reference, files):
    if "\\" in reference or PurePosixPath(reference).is_absolute():
        raise ValueError(f"Invalid archive reference: {reference}")
    target = posixpath.normpath(posixpath.join(posixpath.dirname(owner), reference))
    if target.startswith("../") or target not in files:
        raise ValueError(f"Missing archive resource: {owner} -> {reference}")
    return target


def inspect_obj_zip(file):
    with zipfile.ZipFile(file) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f"ZIP CRC failure: {bad}")
        infos = [entry for entry in archive.infolist() if not entry.is_dir()]
        files = {entry.filename for entry in infos}
        if len(files) != len(infos):
            raise ValueError("Duplicate ZIP member names")
        for entry in infos:
            name = PurePosixPath(entry.filename)
            if name.is_absolute() or ".." in name.parts or "\\" in entry.filename or entry.file_size == 0:
                raise ValueError(f"Unsafe or empty ZIP member: {entry.filename}")
        objects = sorted(name for name in files if name.lower().endswith(".obj"))
        if len(objects) != 1:
            raise ValueError("Expected one native Tripo OBJ per archive")
        obj = objects[0]
        materials, used_materials, face_sides = set(), set(), Counter()
        with archive.open(obj) as binary, io.TextIOWrapper(binary, encoding="utf-8-sig") as stream:
            for line in stream:
                fields = line.split("#", 1)[0].split()
                if not fields:
                    continue
                if fields[0] == "f":
                    if len(fields) < 4:
                        raise ValueError("OBJ has a face with fewer than three vertices")
                    face_sides[str(len(fields) - 1)] += 1
                elif fields[0] == "mtllib":
                    for ref in shlex.split(line.split(None, 1)[1], comments=True):
                        target = archive_reference(obj, ref, files)
                        if not target.lower().endswith(".mtl"):
                            raise ValueError("OBJ mtllib must reference an MTL file")
                        materials.add(target)
                elif fields[0] == "usemtl":
                    used_materials.add(" ".join(fields[1:]))
        if not face_sides or not materials or not used_materials:
            raise ValueError("OBJ must contain faces and use referenced materials")
        definitions, color_materials, textures = set(), set(), set()
        for mtl in sorted(materials):
            current = None
            for line in archive.read(mtl).decode("utf-8-sig").splitlines():
                fields = shlex.split(line, comments=True)
                if not fields:
                    continue
                key = fields[0].lower()
                if key == "newmtl":
                    current = " ".join(fields[1:])
                    definitions.add(current)
                elif key.startswith("map_") or key in ("bump", "norm", "disp", "decal"):
                    if len(fields) < 2:
                        raise ValueError("MTL map has no resource")
                    # Tripo names have no unquoted spaces; quoted paths also work.
                    target = archive_reference(mtl, fields[-1], files)
                    textures.add(target)
                    if key == "map_kd" and current:
                        color_materials.add(current)
        if not used_materials <= definitions or not used_materials <= color_materials:
            raise ValueError("OBJ uses an undefined material or one without a color texture")
        sizes = {name: image_dimensions(archive.read(name)) for name in sorted(textures)}
    return {"face_sides": dict(face_sides), "textures": sizes, "zip_crc": "passed"}


def verify_delivery(root, manifest_name, character, head_stem, body_stem, source,
                    texture_label="4k", peers=()):
    root = Path(root).resolve()
    errors, inspected = [], []
    result = {
        "character": character,
        "file_checks_passed": False,
        "visual_acceptance": "not_assessed",
        "errors": errors,
        "files": inspected,
    }
    try:
        if head_stem == body_stem or any(
            not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", stem)
            for stem in (head_stem, body_stem)
        ):
            raise ValueError("Head/body stems must be distinct lowercase hyphenated names")
        manifest_file = project_path(root, manifest_name)
        expected = expected_files(head_stem, body_stem, source, texture_label)
        for name in expected:
            project_path(root, name)
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or manifest.get("character") != character:
            raise ValueError("Manifest character does not match the explicit character")
        entries = manifest.get("files")
        if not isinstance(entries, list) or any(not isinstance(entry, dict) for entry in entries):
            raise ValueError("Manifest files must be a list of objects")
        names = [entry.get("path") for entry in entries]
        if any(not isinstance(name, str) for name in names):
            raise ValueError("Manifest file entries need string paths")
        if len(names) != 13 or len(set(names)) != 13 or set(names) != set(expected):
            raise ValueError(f"Expected exactly the 13 mapped files; missing={sorted(set(expected) - set(names))}; unexpected={sorted(set(names) - set(expected))}")
    except (OSError, ValueError, TypeError) as error:
        errors.append(str(error))
        return result

    archives, diagnostics = {}, {}
    for entry in entries:
        name = entry["path"]
        try:
            file = project_path(root, name)
            size = file.stat().st_size
            if not file.is_file() or size <= 0 or type(entry.get("bytes")) is not int or entry["bytes"] != size:
                raise ValueError("Missing/empty file or byte count mismatch")
            digest = sha256(file)
            if not isinstance(entry.get("sha256"), str) or entry["sha256"].lower() != digest:
                raise ValueError("SHA256 mismatch")
            details = {"path": name, "bytes": size, "sha256": digest}
            if name.endswith(".glb"):
                details["glb"] = inspect_glb(file)
            elif name.endswith(".zip"):
                details["native_obj"] = inspect_obj_zip(file)
                archives[name] = details["native_obj"]
            elif name.endswith(".json"):
                document = json.loads(file.read_text(encoding="utf-8"))
                if not isinstance(document, dict):
                    raise ValueError("Expected a JSON object")
                if name.endswith("-native-diagnostic.json"):
                    diagnostics[name] = document
            inspected.append(details)
        except (OSError, ValueError, TypeError, AttributeError, struct.error, zipfile.BadZipFile, RuntimeError, NotImplementedError) as error:
            errors.append(f"{name}: {error}")

    for stem in (head_stem, body_stem):
        archive = archives.get(f"models/{stem}-retopo-{texture_label}-obj.zip")
        diagnostic = diagnostics.get(f"models/{stem}-native-diagnostic.json")
        if archive is not None and diagnostic is not None and archive["face_sides"] != diagnostic.get("face_sides"):
            errors.append(f"{stem}: native diagnostic face_sides differs from actual OBJ")

    glb_paths = {project_path(root, name) for name in names if name.endswith(".glb")}
    if len(glb_paths) != 4:
        errors.append("Multiple delivery GLB paths resolve to the same file")
    peer_names = {file.relative_to(root).as_posix() for file in root.glob("deliveries/character_*/candidate-manifest.json")}
    peer_names.update(peers)
    for peer_name in sorted(peer_names):
        try:
            peer_file = project_path(root, peer_name)
            if peer_file == manifest_file:
                continue
            peer = json.loads(peer_file.read_text(encoding="utf-8"))
            if not isinstance(peer, dict) or not isinstance(peer.get("files"), list):
                raise ValueError("Peer manifest lacks a files list")
            for entry in peer["files"]:
                if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
                    raise ValueError("Malformed peer file entry")
                name = entry["path"]
                if name.endswith(".glb") and project_path(root, name) in glb_paths:
                    errors.append(f"Cross-character GLB path reused in {peer_name}: {name}")
        except (OSError, ValueError, TypeError) as error:
            errors.append(f"{peer_name}: {error}")
    result["file_checks_passed"] = not errors
    result["checked_file_count"] = len(inspected)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("project", "manifest", "character", "head-stem", "body-stem", "source"):
        parser.add_argument(f"--{name}", required=True)
    parser.add_argument("--texture-label", choices=("2k", "4k", "8k"), default="4k")
    parser.add_argument("--peer-manifest", action="append", default=[])
    args = parser.parse_args()
    result = verify_delivery(args.project, args.manifest, args.character, args.head_stem,
                             args.body_stem, args.source, args.texture_label, args.peer_manifest)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["file_checks_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
