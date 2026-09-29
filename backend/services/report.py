"""
PDF evaluation report (reportlab). Every figure comes from stored evaluation results —
nothing is recomputed or estimated here.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ACCENT = colors.HexColor("#0ea5e9")
ACCENT_DARK = colors.HexColor("#006591")
INK = colors.HexColor("#1b1c1e")
MUTED = colors.HexColor("#5b6470")
RULE = colors.HexColor("#d5d9de")
MISS = (0.87, 0.53, 0.07)  # warm tone for misclassifications

_styles = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=_styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK, alignment=0, spaceAfter=2)
H2 = ParagraphStyle("h2", parent=_styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=INK, spaceBefore=10, spaceAfter=6)
H3 = ParagraphStyle("h3", parent=_styles["Heading3"], fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=INK, spaceBefore=8, spaceAfter=4)
BODY = ParagraphStyle("body", parent=_styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12.5, textColor=INK)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=7.5, leading=10, textColor=MUTED)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8, leading=10)
CELL_R = ParagraphStyle("cellr", parent=CELL, alignment=TA_RIGHT)


def _pct(v) -> str:
    return "—" if v is None else f"{v * 100:.1f}%"


def _f3(v) -> str:
    return "—" if v is None else f"{v:.3f}"


def _int(v) -> str:
    return "—" if v is None else f"{int(v):,}"


def _params(run: dict) -> str:
    items = [f"{k}={'scale' if k == 'gamma' and not v else v}" for k, v in run["hyperparameters"].items() if not (k == "balanced" and not v)]
    return ", ".join(items) or "defaults"


def _table(data, widths, header=True, align_right_from=1, extra=None):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (align_right_from, 0), (-1, -1), "RIGHT"),
    ]
    if header:
        style += [("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.5), ("TEXTCOLOR", (0, 0), (-1, 0), MUTED), ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK)]
    t.setStyle(TableStyle(style + (extra or [])))
    return t


def _bar_chart(title: str, labels: list[str], values: list[float]) -> Drawing:
    """Single-hue horizontal bars on a 0–100% axis with direct value labels."""
    height = 28 + 22 * len(labels)
    d = Drawing(170 * mm, height)
    d.add(String(0, height - 10, title, fontName="Helvetica-Bold", fontSize=9, fillColor=INK))
    c = HorizontalBarChart()
    c.x, c.y, c.width, c.height = 45 * mm, 14, 105 * mm, height - 34
    c.data = [[v * 100 for v in values]]
    c.categoryAxis.categoryNames = labels
    c.categoryAxis.labels.fontName, c.categoryAxis.labels.fontSize, c.categoryAxis.labels.boxAnchor = "Helvetica", 8, "e"
    c.categoryAxis.reverseDirection = 1
    c.categoryAxis.strokeColor = RULE
    c.valueAxis.valueMin, c.valueAxis.valueMax, c.valueAxis.valueStep = 0, 100, 25
    c.valueAxis.labels.fontName, c.valueAxis.labels.fontSize = "Helvetica", 7
    c.valueAxis.labelTextFormat = "%d%%"
    c.valueAxis.strokeColor = RULE
    c.valueAxis.visibleGrid, c.valueAxis.gridStrokeColor, c.valueAxis.gridStrokeWidth = 1, RULE, 0.3
    c.bars[0].fillColor, c.bars[0].strokeColor = ACCENT, None
    c.barWidth = 9
    c.barLabelFormat = "%.1f%%"
    c.barLabels.fontName, c.barLabels.fontSize, c.barLabels.boxAnchor, c.barLabels.dx = "Helvetica", 7.5, "w", 3
    d.add(c)
    return d


def _blend(rgb: tuple, share: float, lo: float = 0.12, hi: float = 0.85):
    a = lo + (hi - lo) * max(0.0, min(1.0, share))
    return colors.Color(1 - a + a * rgb[0], 1 - a + a * rgb[1], 1 - a + a * rgb[2])


def _confusion(m: dict) -> Table:
    labels = m["confusion_matrix"]["labels"]
    matrix = m["confusion_matrix"]["matrix"]
    short = [lbl[:7] for lbl in labels]
    data = [["true \\ predicted"] + short] + [[labels[i]] + [str(v) for v in row] for i, row in enumerate(matrix)]
    n = len(labels)
    cell = min(15 * mm, (170 * mm - 30 * mm) / n)
    extra = [("FONT", (1, 1), (-1, -1), "Helvetica", 7), ("ALIGN", (1, 0), (-1, -1), "CENTER"), ("GRID", (1, 1), (-1, -1), 0.4, colors.white)]
    blue = (0x0E / 255, 0xA5 / 255, 0xE9 / 255)
    for i, row in enumerate(matrix):
        total = sum(row) or 1
        for j, v in enumerate(row):
            if v:
                extra.append(("BACKGROUND", (j + 1, i + 1), (j + 1, i + 1), _blend(blue if i == j else MISS, v / total * (1 if i == j else 2.5))))
    return _table(data, [30 * mm] + [cell] * n, extra=extra)


def _model_section(run: dict) -> list:
    m = run["metrics"]
    t = m.get("tuning") or {}
    out = [Paragraph(f"{run['model_name']} — {run['feature_label']}", H2)]
    config = [
        ["Run", f"#{run['id']} · {run['name']}"],
        ["Parameters", _params(run) + (f" (tuned: {t.get('folds', 3)}-fold CV on {_int(t.get('n_docs'))} training documents, best CV macro F1 {_f3(t.get('best_cv_score'))})" if run["tune"] and t else "")],
        ["Preprocessing", ", ".join(k.replace("_", " ") for k, v in run["preprocessing"].items() if v) or "none"],
        ["Training / test documents", f"{_int(m['n_train'])} / {_int(m['n_test'])}" + (f" (training oversampled to {_int(m.get('n_train_fit'))})" if run["train_balance"] == "oversample" else "")],
        ["Vocabulary", _int(m["n_features"])],
        ["Accuracy", f"{_pct(m['accuracy'])}   ·   macro precision {_f3(m['precision_macro'])}, recall {_f3(m['recall_macro'])}, F1 {_f3(m['f1_macro'])}"],
    ]
    out.append(_table([[Paragraph(k, CELL), Paragraph(v, CELL)] for k, v in config], [42 * mm, 128 * mm], header=False, align_right_from=99))
    out.append(Paragraph("Per-category results (test split)", H3))
    rows = [["Category", "Precision", "Recall", "F1", "Support"]]
    rows += [[c["label"], _f3(c["precision"]), _f3(c["recall"]), _f3(c["f1"]), _int(c["support"])] for c in sorted(m["per_class"], key=lambda c: -c["f1"])]
    rows += [["Macro average", _f3(m["precision_macro"]), _f3(m["recall_macro"]), _f3(m["f1_macro"]), _int(m["n_test"])]]
    rows += [["Weighted average", _f3(m["precision_weighted"]), _f3(m["recall_weighted"]), _f3(m["f1_weighted"]), _int(m["n_test"])]]
    n = len(rows)
    out.append(_table(rows, [50 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm], extra=[("FONT", (0, n - 2), (-1, n - 1), "Helvetica-Bold", 8), ("LINEABOVE", (0, n - 2), (-1, n - 2), 0.8, INK)]))
    out.append(KeepTogether([Paragraph("Confusion matrix (rows: true category, columns: predicted)", H3), _confusion(m)]))
    return out


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 10 * mm, "TextIQ · evaluation report · all metrics measured on the held-out test split of unique documents")
    canvas.drawRightString(190 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf(runs: list[dict], dataset: dict | None) -> bytes:
    """`runs`: completed runs to report (the four usable models, or one run). `dataset`: their dataset."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title="TextIQ evaluation report", author="TextIQ")
    story: list = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    story += [Paragraph("TextIQ — Model Evaluation Report", H1), Paragraph(f"Generated {now}" + (f" · dataset: {dataset['name']}" if dataset else ""), SMALL), Spacer(1, 8)]

    first = runs[0]["metrics"]
    if dataset:
        v = dataset.get("validation") or {}
        story.append(Paragraph("Dataset", H2))
        facts = [
            ["Rows in file", _int(dataset["n_rows"])],
            ["Unique, unambiguous documents", _int(v.get("unique_rows"))],
            ["Duplicate rows removed before splitting", _int(first.get("n_duplicates_removed"))],
            ["Rows with conflicting categories removed", _int(first.get("n_conflicting_removed"))],
            ["Categories", _int(dataset.get("n_classes"))],
            ["Text column / label column", f"{dataset.get('text_column')} / {dataset.get('label_column')}"],
            ["Train / test split", f"{_int(first['n_train'])} / {_int(first['n_test'])} unique documents (stratified, {round(runs[0]['test_size'] * 100)}% test, seed {runs[0]['random_state']})"],
        ]
        story.append(_table([[Paragraph(k, CELL), Paragraph(val, CELL)] for k, val in facts], [70 * mm, 100 * mm], header=False, align_right_from=99))
        split = first.get("split_counts")
        if split:
            story.append(Paragraph("Documents per category", H3))
            dist = {c["label"]: c for c in dataset.get("class_distribution") or []}
            rows = [["Category", "Rows in file", "Unique", "Train", "Test"]]
            rows += [[k, _int(dist.get(k, {}).get("count")), _int(dist.get(k, {}).get("unique")), _int(c["train"]), _int(c["test"])] for k, c in split.items()]
            story.append(_table(rows, [50 * mm, 30 * mm, 30 * mm, 30 * mm, 30 * mm]))

    story.append(Paragraph("Model comparison" if len(runs) > 1 else "Result", H2))
    rows = [["Model", "Features", "Accuracy", "Precision", "Recall", "F1", "CV F1"]]
    for r in runs:
        m = r["metrics"]
        cv = (m.get("tuning") or {}).get("best_cv_score", m.get("cv_f1_macro_mean"))
        rows.append([Paragraph(r["model_name"] + (" (default)" if r.get("is_active") else ""), CELL), Paragraph(r["feature_label"], CELL), _pct(m["accuracy"]), _f3(m["precision_macro"]), _f3(m["recall_macro"]), _f3(m["f1_macro"]), _f3(cv)])
    story.append(_table(rows, [42 * mm, 42 * mm, 18 * mm, 18 * mm, 16 * mm, 16 * mm, 18 * mm], align_right_from=2))
    story.append(Paragraph("Precision, recall and F1 are macro averages (every category weighted equally). CV F1 is the cross-validation score on the training split used for tuning; all other values are measured once on the unseen test split.", SMALL))
    if len(runs) > 1:
        names = [r["model_name"] for r in runs]
        story += [Spacer(1, 8), _bar_chart("Accuracy", names, [r["metrics"]["accuracy"] for r in runs]), _bar_chart("Macro F1", names, [r["metrics"]["f1_macro"] for r in runs])]

    for r in runs:
        story.append(PageBreak())
        story += _model_section(r)

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()
