import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).parents[1] / "scripts" / "complaints" / "generate_bm_c.py"
spec = importlib.util.spec_from_file_location("bm", MODULE)
bm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bm)


class ComplaintTests(unittest.TestCase):
    def test_deterministic_schema_and_bank_links(self):
        a, b = bm.generate(30, 90, 42), bm.generate(30, 90, 42)
        self.assertEqual(a["complaints"], b["complaints"])
        self.assertEqual(bm.validate(a), [])
        self.assertTrue(a["atm_links"])


if __name__ == "__main__":
    unittest.main()
