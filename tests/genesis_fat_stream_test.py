#!/usr/bin/env python3
"""Host integration tests with real FAT32 driver on dedicated temp images."""
import os
import subprocess
import tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='slopix-stream-') as d:
    small=Path(d)/'small.img'
    huge=Path(d)/'huge.img'
    subprocess.run(['python3',str(root/'tools/create_disk.py'),str(small)],check=True)
    subprocess.run([str(root/'build/genesis-fat-stream-test'),str(small),'small'],check=True,env={**os.environ,'ASAN_OPTIONS':'detect_leaks=0'},timeout=90)
    subprocess.run(['python3',str(root/'tools/create_fat32_boundary_fixture.py'),str(huge)],check=True)
    subprocess.run([str(root/'build/genesis-fat-stream-test'),str(huge),'boundary'],check=True,env={**os.environ,'ASAN_OPTIONS':'detect_leaks=0'},timeout=90)
