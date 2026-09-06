import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).parents[1] / "scripts" / "complaints" / "generate_complaints.py"
spec = importlib.util.spec_from_file_location("strict", MODULE)
strict = importlib.util.module_from_spec(spec)
spec.loader.exec_module(strict)


class StrictComplaintTests(unittest.TestCase):
    def test_exact_schema_and_cross_dataset_accounts(self):
        rows, meta, registry = strict.generate(25, 90, 42)
        self.assertEqual(strict.validate(rows, meta), [])
        self.assertEqual(tuple(rows[0]), strict.TOP)
        self.assertTrue(registry)
        self.assertTrue(
            any(
                t["method"] == "UPI" and "@cashnet.invalid" in t["from_account"]
                for r in rows
                for t in r["transaction_details"]["transactions"]
            )
        )


if __name__ == "__main__":
    unittest.main()
