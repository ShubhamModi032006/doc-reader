import { exec } from 'child_process';
import path from 'path';
import os from 'os';
import util from 'util';
import fs from 'fs';
import { runPythonScript } from './runPython';
import { updateDocumentStatus, updateDocumentExtractedData, saveDocumentPages, getDocumentById } from '../db/documents';
import { getDocumentFile, saveDocumentFile } from '../db/files';
import { createChunksFromText } from '../chunk/chunker';
import { insertChunks } from '../db/chunks';

const execAsync = util.promisify(exec);

export async function processDocumentIngestion(documentId: string): Promise<void> {
  const tempFilesToClean: string[] = [];

  try {
    const doc = await getDocumentById(documentId);
    if (!doc) throw new Error('Document not found');

    await updateDocumentStatus(documentId, 'extracting');

    const originalBuffer = await getDocumentFile(documentId, 'original');
    if (!originalBuffer) {
      throw new Error(`Original file data missing from DB for document ${documentId}`);
    }

    const tempDir = os.tmpdir();
    const ext = doc.file_type === 'pdf' ? '.pdf' : '.docx';
    const tempOriginalPath = path.join(tempDir, `doc_${documentId}_orig${ext}`);
    fs.writeFileSync(tempOriginalPath, originalBuffer);
    tempFilesToClean.push(tempOriginalPath);

    let targetPdfPath: string | null = doc.file_type === 'pdf' ? tempOriginalPath : null;

    // Handle DOCX conversion to PDF for unified viewer & highlight boxes
    if (doc.file_type === 'docx') {
      try {
        const cmd = `soffice --headless --convert-to pdf --outdir "${tempDir}" "${tempOriginalPath}"`;
        await execAsync(cmd);
        const expectedPdfName = `doc_${documentId}_orig.pdf`;
        const generatedPdfPath = path.join(tempDir, expectedPdfName);
        if (fs.existsSync(generatedPdfPath)) {
          tempFilesToClean.push(generatedPdfPath);
          const pdfBuffer = fs.readFileSync(generatedPdfPath);
          await saveDocumentFile(documentId, 'viewer_pdf', pdfBuffer);
          targetPdfPath = generatedPdfPath;
        }
      } catch (err) {
        console.warn('LibreOffice conversion unavailable or failed. Falling back to DOCX text extraction:', err);
      }
    }

    let extractionResult: any;

    if (targetPdfPath && fs.existsSync(targetPdfPath)) {
      extractionResult = await runPythonScript('extract_pdf.py', [targetPdfPath]);
    } else {
      extractionResult = await runPythonScript('extract_docx.py', [tempOriginalPath]);
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
      status: 'ready',
    });
  } catch (error: any) {
    console.error(`Ingestion failed for doc ${documentId}:`, error);
    await updateDocumentStatus(documentId, 'failed', error.message || 'Processing error');
  } finally {
    // Clean up temporary disk files in os.tmpdir()
    for (const file of tempFilesToClean) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (_) {}
      }
    }
  }
}
