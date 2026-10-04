import pytest
import os
import json
import subprocess
import docx
from python.redline_docx import apply_redline_edits

def test_redline_docx(tmp_path):
    docx_path = os.path.join(tmp_path, "sample_redline.docx")
    output_path = os.path.join(tmp_path, "redlined.docx")

    # Create sample docx with bold/italic and table cell
    doc = docx.Document()
    p = doc.add_paragraph("The total aggregate liability shall not exceed ")
    r_bold = p.add_run("AED 100,000")
    r_bold.bold = True
    p.add_run(" under any circumstances.")

    table = doc.add_table(rows=1, cols=1)
    table.cell(0, 0).text = "Payment term: 30 days net."
    doc.save(docx_path)

    edits = [
        {"find_text": "AED 100,000", "replace_text": "AED 1,000,000"},
        {"find_text": "30 days net", "replace_text": "60 days net"}
    ]

    res = apply_redline_edits(docx_path, edits, output_path)
    assert res.get("success") is True
    assert res.get("edits_applied") >= 2
    assert os.path.exists(output_path)

    # Test LibreOffice headless conversion on output
    cmd = f'soffice --headless --convert-to pdf --outdir "{tmp_path}" "{output_path}"'
    ret = subprocess.call(cmd, shell=True)
    assert ret == 0
    pdf_out = os.path.join(tmp_path, "redlined.pdf")
    assert os.path.exists(pdf_out)
