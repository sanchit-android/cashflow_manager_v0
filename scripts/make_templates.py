"""Builds the downloadable household budget templates in static/templates/:
- indian-household-budget-template.xlsx (3-sheet workbook: Monthly Transactions, Household Summary, Annual Sinking Funds)
- monthly-budget-template.csv (clean CSV ready for Excel, Google Sheets, or 1-click import into PlannedOut)

Run: python scripts/make_templates.py
"""
import csv
from pathlib import Path
from xml.sax.saxutils import escape
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "static" / "templates"

TRANSACTIONS = [
    # Date, Description, Category, Debit (Spent), Credit (Received), Bucket / Notes
    ("Date", "Description", "Category", "Debit", "Credit", "Bucket"),
    ("2026-10-01", "Monthly Salary (In-Hand)", "Other", "", 100000, "Regular income"),
    ("2026-10-03", "Flat Rent / Home Loan EMI", "Rent", 24000, "", "Monthly fixed"),
    ("2026-10-05", "Society Maintenance", "Household", 3000, "", "Monthly fixed"),
    ("2026-10-05", "Cook & Househelp Salary", "Household", 5500, "", "Monthly fixed"),
    ("2026-10-07", "Parents Health & Monthly Support", "Family", 6000, "", "Monthly fixed"),
    ("2026-10-08", "Child School Tuition & Bus Fee", "Education", 6500, "", "Monthly fixed"),
    ("2026-10-10", "Nifty 50 & Flexicap Mutual Fund SIP", "Other", 15000, "", "Investment"),
    ("2026-10-10", "PPF / Emergency Liquid Fund Transfer", "Other", 5000, "", "Investment"),
    ("2026-10-11", "BigBasket Monthly Groceries & Staples", "Grocery", 6200, "", "Day to day"),
    ("2026-10-12", "Electricity & Cooking Gas Bill", "Utilities", 2800, "", "Day to day"),
    ("2026-10-14", "Fiber Broadband & Family Mobile Plans", "Utilities", 1700, "", "Monthly fixed"),
    ("2026-10-15", "IndianOil Petrol & Metro Recharge", "Vehicle", 3500, "", "Day to day"),
    ("2026-10-17", "Fresh Vegetables, Milk & Fruits", "Grocery", 3800, "", "Day to day"),
    ("2026-10-19", "Swiggy / Weekend Family Dinner", "Food", 2400, "", "Day to day"),
    ("2026-10-21", "Apollo Pharmacy & Routine Medical", "Health", 1500, "", "Day to day"),
    ("2026-10-24", "Amazon Household & Personal Essentials", "Shopping", 2100, "", "Day to day"),
    ("2026-10-25", "Annual Health Insurance Premium (Monthly Share)", "Insurance", 3000, "", "Annual sinking fund"),
]

SUMMARY_ROWS = [
    ("PlannedOut — Indian Household Monthly Budget Template (in ₹ Rupees)", None, None, None),
    ("Import this workbook directly at https://plannedout.in/app for automatic charts, yearly tables & runway projections.", None, None, None),
    (None, None, None, None),
    ("Bucket", "What it covers", "Monthly Budget (₹)", "Yearly Total (₹)"),
    ("1. Regular In-Hand Income", "Salary after EPF & tax, plus rent or interest", 100000, ("=C5*12", 1200000)),
    ("2. Fixed Monthly Commitments", "Rent/EMI, maintenance, househelp, tuition, broadband, parents", 46700, ("=C6*12", 560400)),
    ("3. Day-to-Day Living", "Groceries, milk, electricity, gas, fuel, dining out, pharmacy", 20300, ("=C7*12", 243600)),
    ("4. Annual Bills Sinking Fund (÷ 12)", "Health & term insurance, April school fee, Diwali, travel", 10000, ("=C8*12", 120000)),
    ("5. Investments (SIP / PPF / RD)", "Mutual fund SIPs, PPF, Sukanya Samriddhi, emergency fund", 20000, ("=C9*12", 240000)),
    ("6. Net Monthly Cash Surplus", "Unallocated buffer left in bank account", ("=C5-C6-C7-C8-C9", 3000), ("=D5-D6-D7-D8-D9", 36000)),
]

SINKING_ROWS = [
    ("Annual Expenses & Sinking Fund Planner (Yearly Bill ÷ 12)", None, None, None),
    (None, None, None, None),
    ("Annual Expense Category", "Usual Due Month", "Yearly Bill (₹)", "Monthly Set-Aside (₹)"),
    ("Family Floater Health Insurance", "June", 36000, ("=C4/12", 3000)),
    ("Term Life Insurance Premium", "August", 18000, ("=C5/12", 1500)),
    ("Annual School Admission, Books & Uniforms", "April", 24000, ("=C6/12", 2000)),
    ("Diwali Gifts, Staff Bonus & Festive Shopping", "October / November", 18000, ("=C7/12", 1500)),
    ("Annual Family Travel / Native Visit", "May / December", 12000, ("=C8/12", 1000)),
    ("Car / Two-Wheeler Insurance & Servicing", "September", 12000, ("=C9/12", 1000)),
    ("Total Annual Sinking Funds", "All 12 Months", ("=SUM(C4:C9)", 120000), ("=SUM(D4:D9)", 10000)),
]


def _col_letter(n):
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _sheet_xml(rows, widths=None):
    lines = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">']
    if widths:
        lines.append("<cols>")
        for i, w in enumerate(widths, 1):
            lines.append(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>')
        lines.append("</cols>")
    lines.append("<sheetData>")
    for r_idx, row in enumerate(rows, 1):
        cells = []
        for c_idx, val in enumerate(row, 1):
            if val is None or val == "":
                continue
            ref = f"{_col_letter(c_idx)}{r_idx}"
            if isinstance(val, tuple):
                formula, cached = val
                f_clean = escape(formula.lstrip("="))
                cells.append(f'<c r="{ref}"><f>{f_clean}</f><v>{cached}</v></c>')
            elif isinstance(val, (int, float)):
                cells.append(f'<c r="{ref}"><v>{val}</v></c>')
            else:
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(val))}</t></is></c>')
        if cells:
            lines.append(f'<row r="{r_idx}">{"".join(cells)}</row>')
    lines.append("</sheetData></worksheet>")
    return "".join(lines)


def build_xlsx(path: Path):
    sheets = [
        ("Monthly Transactions", _sheet_xml(TRANSACTIONS, [14, 38, 16, 14, 14, 22])),
        ("Household Budget Summary", _sheet_xml(SUMMARY_ROWS, [34, 48, 20, 20])),
        ("Annual Sinking Funds", _sheet_xml(SINKING_ROWS, [38, 20, 18, 22])),
    ]
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + "".join(
            f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        + "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    wb_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<sheets>"
        + "".join(
            f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>'
            for i, (name, _) in enumerate(sheets, 1)
        )
        + "</sheets></workbook>"
    )
    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(
            f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        + "</Relationships>"
    )
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", root_rels)
        zf.writestr("xl/workbook.xml", wb_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        for i, (_, xml) in enumerate(sheets, 1):
            zf.writestr(f"xl/worksheets/sheet{i}.xml", xml)


def build_csv(path: Path):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        for row in TRANSACTIONS:
            w.writerow(row[:5])


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    xlsx_path = OUT_DIR / "indian-household-budget-template.xlsx"
    csv_path = OUT_DIR / "monthly-budget-template.csv"
    build_xlsx(xlsx_path)
    build_csv(csv_path)
    print(f"Wrote {xlsx_path} ({xlsx_path.stat().st_size} bytes)")
    print(f"Wrote {csv_path} ({csv_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

