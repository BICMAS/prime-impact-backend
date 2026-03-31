import { put } from '@vercel/blob';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function slugify(value) {
    return String(value || 'certificate')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function formatIssueDate(date) {
    return new Date(date).toLocaleDateString('en-GB');
}

export class CertificatePdfService {
    /**
     * Render learner/course/date onto template PDF, then upload generated file.
     * NOTE: Text positions are intentionally conservative for generic templates.
     */
    static async generateAndUpload({ templateUrl, traineeName, courseTitle, issuedAt }) {
        if (!templateUrl) throw new Error('Template URL required');
        if (!traineeName) throw new Error('Trainee name required');
        if (!courseTitle) throw new Error('Course title required');

        const templateRes = await fetch(templateUrl);
        if (!templateRes.ok) {
            throw new Error('Failed to fetch certificate template');
        }

        const templateBytes = await templateRes.arrayBuffer();
        const pdfDoc = await PDFDocument.load(templateBytes);
        const pages = pdfDoc.getPages();
        if (!pages.length) throw new Error('Template PDF has no pages');

        const page = pages[0];
        const { width, height } = page.getSize();
        const titleFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        const bodyFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const textColor = rgb(0.12, 0.17, 0.24);

        const drawCenteredText = (text, y, size, font) => {
            const safeText = String(text || '');
            const textWidth = font.widthOfTextAtSize(safeText, size);
            const x = Math.max(24, (width - textWidth) / 2);
            page.drawText(safeText, { x, y, size, font, color: textColor });
        };

        drawCenteredText(traineeName, height * 0.44, 34, titleFont);
        drawCenteredText(`Course: ${courseTitle}`, height * 0.32, 18, bodyFont);
        drawCenteredText(`Issued on ${formatIssueDate(issuedAt)}`, height * 0.26, 14, bodyFont);

        const generatedBytes = await pdfDoc.save();
        const filename = `${slugify(traineeName)}-${slugify(courseTitle)}-${Date.now()}.pdf`;
        const blobPath = `certificates/generated/${filename}`;
        const blob = await put(blobPath, Buffer.from(generatedBytes), {
            access: 'public',
            contentType: 'application/pdf',
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        return {
            filename,
            blobUrl: blob.url
        };
    }
}

