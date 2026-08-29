import unittest

from render_check import inspect_presentation


class Collection:
    def __init__(self, items):
        self.items = items
        self.Count = len(items)

    def Item(self, index):
        return self.items[index - 1]


class CallableCollection(Collection):
    def __call__(self, *args):
        return self


class Font:
    Name = "맑은 고딕"


class TextRange:
    Text = "한 줄이 자동으로 줄바꿈되는 문장"
    BoundLeft = 0
    BoundTop = 590
    BoundWidth = 40
    BoundHeight = 20
    Font = Font()

    def Runs(self, *args):
        if args:
            return self
        return CallableCollection([self])

    def Lines(self, *args):
        return CallableCollection([object(), object()])


class Frame:
    HasText = -1
    TextRange = TextRange()


class Shape:
    Type = 1
    HasTextFrame = -1
    HasTable = 0
    TextFrame2 = Frame()
    Name = "fixture/overflow"
    Left = 0
    Top = 590
    Width = 40
    Height = 10


class Slide:
    Shapes = Collection([Shape()])


class Presentation:
    Slides = Collection([Slide()])


class RenderCheckTest(unittest.TestCase):
    def test_overflow_page_bottom_and_wrap_are_reported(self):
        rules = {
            "fonts": {"heading": "HY헤드라인M"},
            "units": {"pt_per_inch": 72},
            "qa": {"canvas_overflow_tolerance_in": 0.01, "text_max_ymax_pt": 593},
        }
        issues, skips = inspect_presentation(Presentation(), rules, missing_heading=False)
        self.assertEqual(skips, [])
        self.assertEqual(
            {issue.rule for issue in issues},
            {"render.text_overflow", "render.page_text_ymax", "render.unexpected_wrap"},
        )


if __name__ == "__main__":
    unittest.main()
