import unittest

from openpyxl import Workbook
from pptx import Presentation

from audit import check_source_label


class SourceLabelTests(unittest.TestCase):
    def presentation(self, labels):
        presentation = Presentation()
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        shape = slide.shapes.add_table(len(labels), 2, 0, 0, 3000000, 1000000)
        shape.name = "table/perf"
        for row, label in enumerate(labels):
            shape.table.cell(row, 0).text = label
            shape.table.cell(row, 1).text = str(row)
        return presentation

    def workbook(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "실적"
        sheet["B18"] = "퉁퉁이별티 유자"
        return workbook

    def claim(self, *, placement_type="cell", label_ref="B18"):
        placement = {"slide": 1, "type": placement_type}
        if placement_type == "cell":
            placement.update({"table": "table/perf", "row": 1, "col": 1, "text": "43"})
        else:
            placement.update({"name": "CLAIM", "text": "43"})
        source = {"file": "source.xlsx", "sheet": "실적", "ref": "C18"}
        if label_ref is not None:
            source["label_ref"] = label_ref
        return {"source": source, "placements": [placement]}

    def test_shortened_deck_label_passes(self):
        issues = check_source_label(
            self.presentation(["제품", "유자"]), self.claim(), self.workbook(), set()
        )
        self.assertEqual(issues, [])

    def test_different_row_label_fails(self):
        issues = check_source_label(
            self.presentation(["제품", "호박팥"]), self.claim(), self.workbook(), set()
        )
        self.assertEqual([issue.rule for issue in issues], ["claim.source_label_mismatch"])

    def test_shape_placement_and_missing_label_ref_skip(self):
        presentation = self.presentation(["제품", "다른 값"])
        workbook = self.workbook()
        self.assertEqual(check_source_label(
            presentation, self.claim(placement_type="shape"), workbook, set()
        ), [])
        self.assertEqual(check_source_label(
            presentation, self.claim(label_ref=None), workbook, set()
        ), [])

    def test_same_source_row_is_checked_once(self):
        presentation = self.presentation(["제품", "호박팥"])
        workbook = self.workbook()
        checked = set()
        first = check_source_label(presentation, self.claim(), workbook, checked)
        second = check_source_label(presentation, self.claim(), workbook, checked)
        self.assertEqual(len(first), 1)
        self.assertEqual(second, [])


if __name__ == "__main__":
    unittest.main()
