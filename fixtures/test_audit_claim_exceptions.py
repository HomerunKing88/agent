import json
import tempfile
import unittest
from pathlib import Path

from audit import audit, load_rules


REPO = Path(__file__).resolve().parents[1]
FIXTURES = REPO / "fixtures"


class ClaimExceptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules(REPO / "house-rules.yaml")

    def test_unverified_claim_is_visible_as_warning(self):
        manifest = json.loads((FIXTURES / "00_manifest.json").read_text(encoding="utf-8"))
        claim = manifest["claims"][0]
        claim["transform"] = {"type": "unverified", "note": "원천으로 검증할 수 없는 값"}
        claim["source"]["file_hash"] = "sha256:DEADBEEF"
        claim["source"]["ref"] = "ZZ999"

        with tempfile.TemporaryDirectory() as temp:
            manifest_path = Path(temp) / "manifest.json"
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
            )
            result = audit(
                FIXTURES / "00_golden.pptx",
                self.rules,
                manifest_path,
                FIXTURES,
            )

        unverified = [
            warning for warning in result["warnings"]
            if warning["rule"] == "calc.unverified_claim"
        ]
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(len(unverified), 1)
        self.assertIn("1,000", unverified[0]["evidence"])
        self.assertIn("원천으로 검증할 수 없는 값", unverified[0]["evidence"])


if __name__ == "__main__":
    unittest.main()
