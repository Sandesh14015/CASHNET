import sys
import traceback
from pathlib import Path

import nbformat

p = Path(sys.argv[1])
nb = nbformat.read(p, as_version=4)
ns = {"__name__": "__main__", "__file__": str(p)}
for i, cell in enumerate(nb.cells):
    if cell.cell_type != "code" or not cell.source.strip():
        continue
    try:
        exec(cell.source, ns)
    except Exception:
        print(f"!!! ERROR in {p.name} cell {i}")
        traceback.print_exc()
        sys.exit(1)
print(f"OK {p.name}")
