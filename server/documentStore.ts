import { v4 as uuidv4 } from 'uuid';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { StoredDocumentMeta } from '../src/types/pdf.ts';

export interface StoredDocument {
  id: string;
  originalName: string;
  pageCount: number;
  sizeBytes: number;
  buffer: Buffer;
  createdAt: Date;
  expiresAt: Date; // createdAt + 10 minutes
}

class DocumentStore {
  private documents = new Map<string, StoredDocument>();

  constructor() {
    // Run cleanup every 2 minutes to automatically purge documents older than 10 minutes
    setInterval(() => {
      this.purgeExpired();
    }, 2 * 60 * 1000);
  }

  public purgeExpired(): number {
    const now = Date.now();
    let purgedCount = 0;
    for (const [id, doc] of this.documents.entries()) {
      if (doc.expiresAt.getTime() <= now) {
        this.documents.delete(id);
        purgedCount++;
      }
    }
    return purgedCount;
  }

  public addDocument(originalName: string, buffer: Buffer, pageCount: number): StoredDocument {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes auto-cleanup TTL

    const doc: StoredDocument = {
      id: uuidv4(),
      originalName,
      pageCount,
      sizeBytes: buffer.length,
      buffer,
      createdAt: now,
      expiresAt,
    };

    this.documents.set(doc.id, doc);
    return doc;
  }

  public getDocument(id: string): StoredDocument | undefined {
    const doc = this.documents.get(id);
    if (!doc) return undefined;
    if (doc.expiresAt.getTime() <= Date.now()) {
      this.documents.delete(id);
      return undefined;
    }
    return doc;
  }

  public deleteDocument(id: string): boolean {
    return this.documents.delete(id);
  }

  public getDocumentMeta(id: string): StoredDocumentMeta | undefined {
    const doc = this.getDocument(id);
    if (!doc) return undefined;
    return {
      id: doc.id,
      originalName: doc.originalName,
      pageCount: doc.pageCount,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt.toISOString(),
      expiresAt: doc.expiresAt.toISOString(),
    };
  }

  public async generateSamplePdf(pagesCount: number = 3, title = 'Sample Document'): Promise<StoredDocument> {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const colors = [
      rgb(0.12, 0.45, 0.85), // Blue
      rgb(0.15, 0.68, 0.38), // Green
      rgb(0.85, 0.35, 0.15), // Orange
      rgb(0.55, 0.25, 0.75), // Purple
      rgb(0.18, 0.72, 0.78), // Teal
    ];

    for (let i = 1; i <= pagesCount; i++) {
      const page = pdfDoc.addPage([612, 792]); // Standard US Letter
      const { width, height } = page.getSize();
      const themeColor = colors[(i - 1) % colors.length];

      // Top color accent bar
      page.drawRectangle({
        x: 0,
        y: height - 16,
        width,
        height: 16,
        color: themeColor,
      });

      // Document title header
      page.drawText(title, {
        x: 50,
        y: height - 60,
        size: 22,
        font: helveticaBold,
        color: rgb(0.1, 0.15, 0.25),
      });

      // Page subtitle badge
      page.drawRectangle({
        x: 50,
        y: height - 100,
        width: 130,
        height: 28,
        color: themeColor,
      });

      page.drawText(`SECTION ${i} OF ${pagesCount}`, {
        x: 62,
        y: height - 92,
        size: 11,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });

      // Main content block
      page.drawText(`Page Overview & Key Metrics`, {
        x: 50,
        y: height - 150,
        size: 16,
        font: helveticaBold,
        color: rgb(0.15, 0.2, 0.3),
      });

      const description = `This is page ${i} of our test PDF demonstration document.\nIt was dynamically generated to test merging, splitting, rotation, and watermarking.\nAll operations are handled completely in-memory using pdf-lib.`;
      page.drawText(description, {
        x: 50,
        y: height - 190,
        size: 12,
        font: helvetica,
        color: rgb(0.35, 0.4, 0.45),
        lineHeight: 18,
      });

      // Decorative sample card
      page.drawRectangle({
        x: 50,
        y: height - 380,
        width: width - 100,
        height: 150,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 1.5,
        color: rgb(0.97, 0.98, 1),
      });

      page.drawText(`Report Item #${i}0${i * 2}`, {
        x: 75,
        y: height - 260,
        size: 14,
        font: helveticaBold,
        color: themeColor,
      });

      page.drawText(
        `• Status: Verified and Ready for Processing\n• Security: Clean / Unencrypted / Memory Stored\n• Timestamp: ${new Date().toLocaleTimeString()}\n• Page Identifier: Page ${i} / ${pagesCount}`,
        {
          x: 75,
          y: height - 340,
          size: 11,
          font: helvetica,
          color: rgb(0.25, 0.3, 0.35),
          lineHeight: 18,
        }
      );

      // Page footer
      page.drawText(`PDF Toolkit • Test Document • Page ${i}`, {
        x: width / 2 - 80,
        y: 35,
        size: 10,
        font: helvetica,
        color: rgb(0.55, 0.6, 0.65),
      });
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    const filename = `${title.toLowerCase().replace(/\s+/g, '-')}-${pagesCount}p.pdf`;
    return this.addDocument(filename, buffer, pagesCount);
  }

  public async generateFillableFormSamplePdf(): Promise<StoredDocument> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const form = pdfDoc.getForm();

    // Top Header Banner
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width,
      height: 100,
      color: rgb(0.12, 0.23, 0.53), // Deep Indigo
    });

    page.drawText('CLIENT REGISTRATION & SERVICE AGREEMENT', {
      x: 45,
      y: height - 55,
      size: 18,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    page.drawText('Official Membership Application • Interactive Fillable Form', {
      x: 45,
      y: height - 78,
      size: 11,
      font: helvetica,
      color: rgb(0.85, 0.9, 1),
    });

    // Instructions Box
    page.drawRectangle({
      x: 45,
      y: height - 150,
      width: width - 90,
      height: 38,
      color: rgb(0.95, 0.97, 1),
      borderColor: rgb(0.8, 0.86, 0.96),
      borderWidth: 1,
    });
    page.drawText('Instructions: Complete all fields below or click anywhere to stamp text, dates, checkmarks & signature.', {
      x: 58,
      y: height - 135,
      size: 9.5,
      font: helvetica,
      color: rgb(0.2, 0.3, 0.5),
    });

    // Section 1: Personal Details
    page.drawText('1. APPLICANT INFORMATION', {
      x: 45,
      y: height - 175,
      size: 13,
      font: helveticaBold,
      color: rgb(0.15, 0.2, 0.3),
    });

    // Full Name
    page.drawText('Full Legal Name *', {
      x: 45,
      y: height - 200,
      size: 10,
      font: helveticaBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    const fullNameField = form.createTextField('fullName');
    fullNameField.setText('');
    fullNameField.addToPage(page, {
      x: 45,
      y: height - 232,
      width: (width - 110) / 2,
      height: 26,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.75, 0.8),
      backgroundColor: rgb(0.98, 0.99, 1),
    });

    // Email
    page.drawText('Email Address *', {
      x: width / 2 + 10,
      y: height - 200,
      size: 10,
      font: helveticaBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    const emailField = form.createTextField('email');
    emailField.setText('');
    emailField.addToPage(page, {
      x: width / 2 + 10,
      y: height - 232,
      width: (width - 110) / 2,
      height: 26,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.75, 0.8),
      backgroundColor: rgb(0.98, 0.99, 1),
    });

    // Phone
    page.drawText('Phone Number', {
      x: 45,
      y: height - 275,
      size: 10,
      font: helveticaBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    const phoneField = form.createTextField('phone');
    phoneField.setText('');
    phoneField.addToPage(page, {
      x: 45,
      y: height - 307,
      width: (width - 110) / 2,
      height: 26,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.75, 0.8),
      backgroundColor: rgb(0.98, 0.99, 1),
    });

    // Membership Tier (Dropdown)
    page.drawText('Membership Plan', {
      x: width / 2 + 10,
      y: height - 275,
      size: 10,
      font: helveticaBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    const tierDropdown = form.createDropdown('tier');
    tierDropdown.addOptions(['Standard Member', 'Professional ($49/mo)', 'Enterprise Executive ($199/mo)']);
    tierDropdown.select('Standard Member');
    tierDropdown.addToPage(page, {
      x: width / 2 + 10,
      y: height - 307,
      width: (width - 110) / 2,
      height: 26,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.75, 0.8),
      backgroundColor: rgb(0.98, 0.99, 1),
    });

    // Company / Organization
    page.drawText('Company / Organization', {
      x: 45,
      y: height - 350,
      size: 10,
      font: helveticaBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    const companyField = form.createTextField('company');
    companyField.setText('');
    companyField.addToPage(page, {
      x: 45,
      y: height - 382,
      width: width - 90,
      height: 26,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.75, 0.8),
      backgroundColor: rgb(0.98, 0.99, 1),
    });

    // Section 2: Declarations & Checkboxes
    page.drawText('2. DECLARATIONS & CONSENT', {
      x: 45,
      y: height - 425,
      size: 13,
      font: helveticaBold,
      color: rgb(0.15, 0.2, 0.3),
    });

    // Agree Terms Checkbox
    const agreeBox = form.createCheckBox('agreeTerms');
    agreeBox.addToPage(page, {
      x: 45,
      y: height - 460,
      width: 18,
      height: 18,
      borderWidth: 1.5,
      borderColor: rgb(0.3, 0.4, 0.6),
      backgroundColor: rgb(0.98, 0.99, 1),
    });
    page.drawText('I agree to the Terms of Service, Privacy Policy, and code of conduct.', {
      x: 72,
      y: height - 455,
      size: 10,
      font: helvetica,
      color: rgb(0.2, 0.25, 0.3),
    });

    // Newsletter Checkbox
    const newsletterBox = form.createCheckBox('marketingConsent');
    newsletterBox.addToPage(page, {
      x: 45,
      y: height - 495,
      width: 18,
      height: 18,
      borderWidth: 1.5,
      borderColor: rgb(0.3, 0.4, 0.6),
      backgroundColor: rgb(0.98, 0.99, 1),
    });
    page.drawText('Keep me updated on member announcements, exclusive features, and updates.', {
      x: 72,
      y: height - 490,
      size: 10,
      font: helvetica,
      color: rgb(0.2, 0.25, 0.3),
    });

    // Section 3: Signature & Authorization
    page.drawText('3. AUTHORIZATION & SIGNATURE', {
      x: 45,
      y: height - 545,
      size: 13,
      font: helveticaBold,
      color: rgb(0.15, 0.2, 0.3),
    });

    page.drawText('By signing below, I certify that all supplied information is true, accurate, and complete.', {
      x: 45,
      y: height - 565,
      size: 9.5,
      font: helvetica,
      color: rgb(0.4, 0.45, 0.5),
    });

    // Signature Area Box
    page.drawRectangle({
      x: 45,
      y: height - 670,
      width: (width - 110) * 0.65,
      height: 85,
      color: rgb(0.99, 0.99, 1),
      borderColor: rgb(0.75, 0.8, 0.88),
      borderWidth: 1,
    });
    page.drawLine({
      start: { x: 60, y: height - 640 },
      end: { x: 45 + (width - 110) * 0.65 - 15, y: height - 640 },
      thickness: 1,
      color: rgb(0.7, 0.75, 0.8),
    });
    page.drawText('Authorized Signature (Draw, type or stamp signature here)', {
      x: 60,
      y: height - 656,
      size: 9,
      font: helvetica,
      color: rgb(0.5, 0.55, 0.6),
    });

    // Date Box
    page.drawText('Date Signed *', {
      x: 45 + (width - 110) * 0.65 + 20,
      y: height - 595,
      size: 10,
      font: helveticaBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    const dateField = form.createTextField('signDate');
    dateField.setText(new Date().toISOString().slice(0, 10));
    dateField.addToPage(page, {
      x: 45 + (width - 110) * 0.65 + 20,
      y: height - 635,
      width: (width - 110) * 0.35,
      height: 28,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.75, 0.8),
      backgroundColor: rgb(0.98, 0.99, 1),
    });

    // Footer
    page.drawLine({
      start: { x: 45, y: 50 },
      end: { x: width - 45, y: 50 },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.92),
    });
    page.drawText('Form Ref: APP-2026-F • Confidential • AI Studio PDF Toolkit', {
      x: 45,
      y: 35,
      size: 9,
      font: helvetica,
      color: rgb(0.5, 0.55, 0.6),
    });

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    return this.addDocument('fillable-registration-agreement.pdf', buffer, 1);
  }
}

export const documentStore = new DocumentStore();
