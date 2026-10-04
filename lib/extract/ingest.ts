import { exec } from 'child_process';
import path from 'path';
import util from 'util';
import fs from 'fs';
import { runPythonScript } from './runPython';
import { updateDocumentStatus, updateDocumentExtractedData, saveDocumentPages, getDocumentById } from '../db/documents';
import { createChunksFromText } from '../chunk/chunker';
import { insertChunks } from '../db/chunks';

const execAsync = util.promisify(exec);

export async function processDocumentIngestion(documentId: string): Promise<void> {
  try {
    const doc = await getDocumentById(documentId);
    if (!doc) throw new Error('Document not found');

    await updateDocumentStatus(documentId, 'extracting');

    const storageDir = path.join(process.cwd(), 'storage');
    let targetPdfPath = doc.original_path;
    let convertedPdfPath: string | undefined = undefined;

    // Handle DOCX conversion to PDF for unified viewer & highlight boxes
    if (doc.file_type === 'docx') {
      try {
        const cmd = `soffice --headless --convert-to pdf --outdir "${storageDir}" "${doc.original_path}"`;
        await execAsync(cmd);
        const expectedPdfName = path.basename(doc.original_path, path.extname(doc.original_path)) + '.pdf';
        const generatedPdfPath = path.join(storageDir, expectedPdfName);
        if (fs.existsSync(generatedPdfPath)) {
          convertedPdfPath = generatedPdfPath;
          targetPdfPath = generatedPdfPath;
        }
      } catch (err) {
        console.warn('LibreOffice conversion unavailable or failed. Falling back to DOCX text extraction:', err);
      }
    }

    let extractionResult: any;

    if (targetPdfPath.endsWith('.pdf') && fs.existsSync(targetPdfPath)) {
      extractionResult = await runPythonScript('extract_pdf.py', [targetPdfPath]);
    } else {
      extractionResult = await runPythonScript('extract_docx.py', [doc.original_path]);
    }

    if (extractionResult.is_scanned) {
      await updateDocumentStatus(
        documentId,
        'needs_ocr',
        'This looks like a scanned document with no selectable text. OCR is not supported yet.'
      );
      return;
    }

    // Save pages and word bounding boxes to DB
    const pages = extractionResult.pages || [
      {
        page_number: 1,
        text: extractionResult.full_text,
        words: [],
      },
    ];

    await saveDocumentPages(documentId, pages);

    await updateDocumentStatus(documentId, 'chunking');

    // Generate chunks and insert into Postgres
    const chunks = createChunksFromText(pages);
    await insertChunks(documentId, chunks);

    await updateDocumentExtractedData(documentId, {
      page_count: extractionResult.page_count || pages.length,
      full_text: extractionResult.full_text,
      converted_pdf_path: convertedPdfPath,
      status: 'ready',
    });
  } catch (error: any) {
    console.error(`Ingestion failed for doc ${documentId}:`, error);
    await updateDocumentStatus(documentId, 'failed', error.message || 'Processing error');
  }
}
