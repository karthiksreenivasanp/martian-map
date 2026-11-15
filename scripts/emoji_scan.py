#!/usr/bin/env python3
"""
Martian Map - Strict Emoji and Pictograph Scanner
Scans source files for any emoji or pictographic Unicode characters.
Returns exit code 0 if 0 emojis found, exit code 1 if any emoji found.
Zero emojis.
"""

import os
import sys
import re

# Comprehensive Unicode regex for emojis and pictographs
EMOJI_PATTERN = re.compile(
    r'[\U0001F600-\U0001F64F]'  # Emoticons
    r'|[\U0001F300-\U0001F5FF]'  # Misc Symbols and Pictographs
    r'|[\U0001F680-\U0001F6FF]'  # Transport and Map
    r'|[\U0001F700-\U0001F77F]'  # Alchemical Symbols
    r'|[\U0001F780-\U0001F7FF]'  # Geometric Shapes Extended
    r'|[\U0001F800-\U0001F8FF]'  # Supplemental Arrows-C
    r'|[\U0001F900-\U0001F9FF]'  # Supplemental Symbols and Pictographs
    r'|[\U0001FA00-\U0001FA6F]'  # Chess Symbols
    r'|[\U0001FA70-\U0001FAFF]'  # Symbols and Pictographs Extended-A
    r'|[\U00002702-\U000027B0]'  # Dingbats
    r'|[\U000024C2-\U0001F251]'  # Enclosed characters
    r'|[\U0001F1E6-\U0001F1FF]'  # Flags
)

FILES_TO_SCAN = [
    "package.json",
    "vite.config.js",
    "index.html",
    "src/icons.js",
    "src/places.json",
    "src/state.js",
    "src/nav.js",
    "src/terrain.js",
    "src/globe.js",
    "src/minimap.js",
    "src/ui.js",
    "src/main.js",
    "src/style.css",
    "scripts/preprocess_dem.py",
    "scripts/verify_system.js"
]

def scan_file(filepath):
    if not os.path.exists(filepath):
        print(f"[SKIP] File not found: {filepath}")
        return 0

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    matches = list(EMOJI_PATTERN.finditer(content))
    if matches:
        print(f"[FAIL] Found {len(matches)} emoji/pictograph match(es) in {filepath}:")
        for m in matches:
            char = m.group()
            codepoint = f"U+{ord(char):04X}"
            line_no = content[:m.start()].count("\n") + 1
            print(f"  Line {line_no}: character {codepoint}")
        return len(matches)
    else:
        print(f"[PASS] 0 emojis found in {filepath}")
        return 0

def main():
    total_violations = 0
    print("=== STARTING STRICT EMOJI SCAN ===")
    for f in FILES_TO_SCAN:
        total_violations += scan_file(f)

    print("==================================")
    if total_violations == 0:
        print(f"RESULT: ALL {len(FILES_TO_SCAN)} FILES CLEAN (0 EMOJIS FOUND)")
        sys.exit(0)
    else:
        print(f"RESULT: FAILED ({total_violations} TOTAL EMOJIS DETECTED)")
        sys.exit(1)

if __name__ == "__main__":
    main()
