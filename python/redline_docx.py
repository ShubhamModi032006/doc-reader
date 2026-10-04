import sys
import json
import zipfile
import io
import datetime
from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NSMAP = {"w": W_NS}

def qn(tag):
    return f"{{{W_NS}}}{tag}"

def apply_redline_edits(docx_path, edits, output_path):
    # Read docx zip
    with zipfile.ZipFile(docx_path, 'r') as zin:
        file_map = {name: zin.read(name) for name in zin.namelist()}

    doc_xml_bytes = file_map.get("word/document.xml")
    if not doc_xml_bytes:
        return {"error": "Invalid docx file: missing word/document.xml"}

    tree = etree.fromstring(doc_xml_bytes)
    
    current_id = 100
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    author = "Contract Analyser"

    paragraphs = tree.xpath("//w:p", namespaces=NSMAP)
    edits_applied = 0

    for edit in edits:
        find_text = edit.get("find_text", "").strip()
        replace_text = edit.get("replace_text", "").strip()
        if not find_text:
          continue

        for p in paragraphs:
            # Reconstruct paragraph text from w:t elements
            t_nodes = p.xpath(".//w:t", namespaces=NSMAP)
            full_p_text = "".join([t.text or "" for t in t_nodes])

            if find_text in full_p_text:
                # Target found in this paragraph!
                # Simple and robust run replacement preserving rPr
                r_nodes = p.xpath(".//w:r", namespaces=NSMAP)
                if not r_nodes:
                    continue

                # Copy rPr from first run
                first_r = r_nodes[0]
                rPr = first_r.find(qn("rPr"))
                rPr_xml = etree.tostring(rPr) if rPr is not None else None

                # Build <w:del> element
                del_elem = etree.Element(qn("del"), {
                    qn("id"): str(current_id),
                    qn("author"): author,
                    qn("date"): now_iso
                })
                current_id += 1
                
                del_r = etree.SubElement(del_elem, qn("r"))
                if rPr_xml:
                    del_r.append(etree.fromstring(rPr_xml))
                del_t = etree.SubElement(del_r, qn("delText"), {
                    "{http://www.w3.org/XML/1998/namespace}space": "preserve"
                })
                del_t.text = find_text

                # Build <w:ins> element
                ins_elem = etree.Element(qn("ins"), {
                    qn("id"): str(current_id),
                    qn("author"): author,
                    qn("date"): now_iso
                })
                current_id += 1

                ins_r = etree.SubElement(ins_elem, qn("r"))
                if rPr_xml:
                    ins_r.append(etree.fromstring(rPr_xml))
                ins_t = etree.SubElement(ins_r, qn("t"), {
                    "{http://www.w3.org/XML/1998/namespace}space": "preserve"
                })
                ins_t.text = replace_text

                # Replace content in paragraph
                # Remove old runs that matched find_text
                for t_node in t_nodes:
                    if t_node.text and find_text in t_node.text:
                        t_node.text = t_node.text.replace(find_text, "")
                
                p.append(del_elem)
                p.append(ins_elem)
                edits_applied += 1

    updated_xml = etree.tostring(tree, xml_declaration=True, encoding="UTF-8")
    file_map["word/document.xml"] = updated_xml

    # Re-zip byte-identical structure
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for name, data in file_map.items():
            zout.writestr(name, data)

    return {
        "success": True,
        "edits_applied": edits_applied,
        "output_path": output_path
    }

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: redline_docx.py <docx_path> <edits_json> <output_path>"}))
        sys.exit(1)

    docx_path = sys.argv[1]
    edits_json = sys.argv[2]
    output_path = sys.argv[3]

    try:
        edits = json.loads(edits_json)
    except Exception as e:
        print(json.dumps({"error": f"Invalid edits JSON: {str(e)}"}))
        sys.exit(1)

    result = apply_redline_edits(docx_path, edits, output_path)
    print(json.dumps(result))
