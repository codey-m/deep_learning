# -*- coding: utf-8 -*-
"""CIFAR-10-C access for the abstention capstone path, sized for a Colab session.

The full benchmark is 1.1 GB. This reads a published subset of four (corruption,
severity) blocks, about 56 MB in total, encoded as lossless WebP sprite sheets. Pixels
are identical to the original archive, and :func:`verify` checks that against a digest
of the decoded array rather than asking anyone to take it on faith.

Layout worth knowing: each block holds 10,000 32x32 images, one per position of the
CIFAR-10 **test** split in its original order, packed into a 100x100 grid. Labels are
therefore just the test targets, which :func:`labels` reconstructs from torchvision
rather than downloading. :func:`verify_alignment` checks that reconstruction against a
real classifier instead of trusting it.

Training comes from the CIFAR-10 train split and evaluation from the test split, so the
two are genuinely disjoint.

CIFAR-10-C is by Hendrycks and Dietterich (ICLR 2019), released under CC BY 4.0.
"""
from __future__ import annotations

import functools
import hashlib
import io
import os
import pathlib
import urllib.request

import numpy as np
import torch
from PIL import Image
from torchvision import datasets

BASE_URL = ("https://raw.githubusercontent.com/codey-m/deep_learning/main/"
            "final_project/capstone_data")
ROOT = pathlib.Path(os.environ.get("CAPSTONE_DATA", "capstone_data"))
CIFAR_ROOT = "data"

BLOCK = 10_000
GRID, TILE = 100, 32

# (file digest, decoded-array digest) for every published block. Embedded rather than
# fetched so a corrupted or truncated download is caught without a second request.
DIGESTS = {
    "contrast_s2": ("16112bb3817e018c12ac493908b158c1e6bd090c7d472da496c10588038cb73f",
                    "2c25278fda254b31daf348fb3f290a8c24cab3ef806768e8cf25b3dc188468e3"),
    "contrast_s4": ("182e0d95bb80cfc50a5f1f27b8f28302f9323f2ececa10cfcabf2a7674736205",
                    "d875badf40f41fb8759e0426771370532fdfa14425f7c4959276a151db305d04"),
    "defocus_blur_s3": (
        "ba6448f6066d206c19fdc2a2ea958dc51f9a401134a75e9e5b7a677184d2c16f",
        "91a070f82e653bc5e466a0566b56977b3e3f7f8c7e666e4ceb83a1c0cf4a5309"),
    "fog_s3": ("00acd3570d5646fd6cd6d0b0e568402fb2417a65e4e11b536e4886585e6eb704",
               "5e8eaca8be90f938548750e0c4c9c15cc4dcd4711770e39d158248d8e3c8fdaf"),
}


def block_name(name: str, severity: int) -> str:
    return f"{name}_s{severity}"


def available() -> tuple:
    """The (corruption, severity) pairs this cache publishes."""
    pairs = []
    for key in DIGESTS:
        corruption, _, severity = key.rpartition("_s")
        pairs.append((corruption, int(severity)))
    return tuple(sorted(pairs))


def ensure(name: str, severity: int) -> pathlib.Path:
    """Download the block if it is not already here. Returns its local path."""
    key = block_name(name, severity)
    if key not in DIGESTS:
        raise ValueError(f"{key!r} is not published; available: {available()}")
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / f"{key}.webp"
    if not path.exists():
        urllib.request.urlretrieve(f"{BASE_URL}/{key}.webp", path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != DIGESTS[key][0]:
        path.unlink(missing_ok=True)
        raise RuntimeError(
            f"{key}: downloaded file digest {digest[:12]} does not match the expected "
            f"{DIGESTS[key][0][:12]}; the file has been removed, run the cell again")
    return path


@functools.lru_cache(maxsize=None)
def _block(name: str, severity: int) -> np.ndarray:
    """Decode one sprite sheet back into (10000, 32, 32, 3) uint8."""
    sheet = np.asarray(Image.open(ensure(name, severity)).convert("RGB"))
    return (sheet.reshape(GRID, TILE, GRID, TILE, 3)
            .transpose(0, 2, 1, 3, 4)
            .reshape(GRID * GRID, TILE, TILE, 3))


def verify(name: str, severity: int) -> bool:
    """Does the decoded block match the original archive, byte for byte?"""
    key = block_name(name, severity)
    return hashlib.sha256(_block(name, severity).tobytes()).hexdigest() == \
        DIGESTS[key][1]


@functools.lru_cache(maxsize=1)
def _test_targets() -> torch.Tensor:
    test = datasets.CIFAR10(CIFAR_ROOT, train=False, download=True)
    return torch.as_tensor(test.targets)


def labels(indices) -> torch.Tensor:
    """Labels for positions in a block, i.e. CIFAR-10 test targets."""
    return _test_targets()[list(indices)]


def images(name: str, severity: int, indices) -> torch.Tensor:
    """Corrupted images as float NCHW in [0, 1], aligned with the test-split order."""
    picked = np.asarray(_block(name, severity)[list(indices)], dtype=np.float32) / 255.0
    return torch.from_numpy(picked).permute(0, 3, 1, 2).contiguous()


def clean_images(indices) -> torch.Tensor:
    """The uncorrupted test images for the same positions, the severity-0 baseline."""
    test = datasets.CIFAR10(CIFAR_ROOT, train=False, download=True)
    picked = np.asarray(test.data[list(indices)], dtype=np.float32) / 255.0
    return torch.from_numpy(picked).permute(0, 3, 1, 2).contiguous()


def verify_alignment(classify, sample: int = 2000, tolerance: float = 0.25) -> dict:
    """Check the reconstructed labels rather than assuming them.

    ``classify`` maps a batch of images to predicted labels. If the label reconstruction
    were misaligned, accuracy on a mild corruption would collapse toward chance, so this
    compares it against clean accuracy on the same positions and against a deliberately
    shuffled control.
    """
    name, severity = min(available(), key=lambda pair: pair[1])
    positions = list(range(sample))
    truth = labels(positions)
    clean_accuracy = (classify(clean_images(positions)) == truth).float().mean().item()
    mild = classify(images(name, severity, positions))
    mild_accuracy = (mild == truth).float().mean().item()
    shuffled = truth[torch.randperm(len(truth),
                                    generator=torch.Generator().manual_seed(0))]
    control_accuracy = (mild == shuffled).float().mean().item()
    aligned = (clean_accuracy - mild_accuracy) < tolerance and mild_accuracy > 0.4
    return {
        "corruption": f"{name} severity {severity}",
        "clean_accuracy": clean_accuracy,
        "corrupted_accuracy": mild_accuracy,
        "shuffled_control": control_accuracy,
        "aligned": bool(aligned),
    }


def self_check() -> dict:
    """Every published block decodes to exactly the archive it came from."""
    return {block_name(*pair): verify(*pair) for pair in available()}
