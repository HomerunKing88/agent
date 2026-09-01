import unittest

import yaml

from audit import minimum_font_size


class MinimumFontSizeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open("house-rules.yaml", encoding="utf-8") as handle:
            cls.rules = yaml.safe_load(handle)["styles"]["corporate-strategy-ppt"]

    def test_named_roles_use_house_rule_mapping(self):
        cases = {
            "icon_badge/glyph": "icon_badge_glyph_pt",
            "stack100/seg_label#2": "chart_value_label_pt",
            "waterfall/tick_label": "chart_axis_label_pt",
            "waterfall/value": "waterfall_value_pt",
        }
        for shape_name, size_key in cases.items():
            with self.subTest(shape_name=shape_name):
                self.assertEqual(
                    minimum_font_size(shape_name, self.rules),
                    float(self.rules["sizes"][size_key]),
                )

    def test_claim_fallback_and_unknown_structure_error(self):
        self.assertEqual(
            minimum_font_size("CLAIM_REVENUE", self.rules),
            float(self.rules["sizes"][self.rules["role_min_pt"]["_claim_shape"]]),
        )
        with self.assertRaises(ValueError):
            minimum_font_size("future_helper/text", self.rules)

    def test_table_cells_keep_table_minimum(self):
        self.assertEqual(
            minimum_font_size("table/perf", self.rules, is_table=True),
            float(self.rules["sizes"]["table_body_min_pt"]),
        )


if __name__ == "__main__":
    unittest.main()
