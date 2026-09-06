#!/usr/bin/env python3
"""Validate the strict complaint.json output and its required sidecar metadata."""

from generate_complaints import main

if __name__ == "__main__":
    import sys

    sys.argv.append("--validate")
    main()
