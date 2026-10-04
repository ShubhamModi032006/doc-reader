import sys
import json
import pymupdf as fitz  # PyMuPDF

# Suppress MuPDF warnings on stdout
fitz.TOOLS.mupdf_display_errors(False)

def extract_pdf(file_path):
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        return {"error": f"Failed to open PDF: {str(e)}"}

    if doc.is_encrypted:
        return {"error": "PDF is password-protected or encrypted"}

    total_pages = len(doc)
    if total_pages == 0:
        return {"error": "PDF contains no pages"}

    pages_data = []
    total_chars = 0
    full_text_parts = []

    for page_num in range(total_pages):
        page = doc[page_num]
        raw_text = page.get_text("text") or ""
        words_list = page.get_text("words") or []

        words_data = []
        current_offset = 0
        constructed_text = ""

        for idx, item in enumerate(words_list):
            x0, y0, x1, y1, w_text, block_no, line_no, word_no = item[:8]

            if idx > 0:
                constructed_text += " "
                current_offset += 1

            char_start = current_offset
            constructed_text += w_text
            current_offset += len(w_text)
            char_end = current_offset

            words_data.append({
                "word": w_text,
                "bbox": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
                "charStart": char_start,
                "charEnd": char_end,
                "line": line_no
            })

        page_text = constructed_text if constructed_text.strip() else raw_text
        total_chars += len(page_text.strip())
        full_text_parts.append(page_text)

        pages_data.append({
            "page_number": page_num + 1,
            "text": page_text,
            "words": words_data
        })

    doc.close()

    avg_chars = total_chars / total_pages if total_pages > 0 else 0
    is_scanned = avg_chars < 25

    return {
        "page_count": total_pages,
        "total_chars": total_chars,
        "avg_chars_per_page": avg_chars,
        "is_scanned": is_scanned,
        "full_text": "\n\n".join(full_text_parts),
        "pages": pages_data
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    result = extract_pdf(pdf_path)
    print(json.dumps(result, ensure_ascii=False))
