const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/**
 * Format currency helper
 */
const formatAmount = (amount) => {
  return (parseFloat(amount) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getCurrencyPrefix = (currency = 'INR') => {
  switch (currency) {
    case 'INR':
      return 'Rs. ';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    default:
      return `${currency} `;
  }
};

/**
 * Generates an invoice PDF matching 1:1 the exact layout of InvoiceDocument.jsx
 * @param {Object} invoice - Invoice document from MongoDB
 * @returns {Promise<Buffer>}
 */
const generateInvoicePdf = (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      const currency = invoice.currency || 'INR';
      const currPrefix = getCurrencyPrefix(currency);
      const startX = 40;
      const pageWidth = 595.28; // Standard A4 width in points
      const printableWidth = pageWidth - startX * 2; // 515.28pt

      // =============================================================
      // 1. HEADER: Brand Info (Left) & Document Details (Right)
      // =============================================================
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      let currentY = 40;

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, startX, currentY, { height: 38 });
          currentY += 46;
        } catch (e) {
          console.warn('Could not load logo in PDF:', e.message);
        }
      }

      // Left Column: Sender / Company Info
      const senderStartY = currentY;
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#111827')
        .text(
          invoice.sender?.name || invoice.sender?.companyName || 'Techie Nutpam',
          startX,
          currentY
        );

      currentY = doc.y + 2;

      if (invoice.sender?.website) {
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#4f46e5')
          .text(invoice.sender.website, startX, currentY);
        currentY = doc.y + 3;
      }

      doc.font('Helvetica').fontSize(8.5).fillColor('#64748b');

      if (invoice.sender?.taxId) {
        doc.text(`Tax ID: ${invoice.sender.taxId}`, startX, currentY);
        currentY = doc.y + 2;
      }

      if (invoice.sender?.address) {
        const fullAddr = `${invoice.sender.address}${
          invoice.sender?.postalCode ? ' - ' + invoice.sender.postalCode : ''
        }`;
        doc.text(fullAddr, startX, currentY, { width: 250 });
        currentY = doc.y + 2;
      }

      if (invoice.sender?.email) {
        doc.text(`Email: ${invoice.sender.email}`, startX, currentY);
        currentY = doc.y + 2;
      }

      if (invoice.sender?.phone) {
        doc.text(`Phone: ${invoice.sender.phone}`, startX, currentY);
        currentY = doc.y + 2;
      }

      const senderEndY = currentY;

      // Right Column: INVOICE title, number, dates
      let rightY = 40;
      const rightWidth = 240;
      const rightX = startX + printableWidth - rightWidth;

      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor('#111827')
        .text((invoice.invoiceType || 'INVOICE').toUpperCase(), rightX, rightY, {
          width: rightWidth,
          align: 'right',
        });

      rightY = doc.y + 2;

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#4f46e5')
        .text(`#${invoice.invoiceNumber || ''}`, rightX, rightY, {
          width: rightWidth,
          align: 'right',
        });

      rightY = doc.y + 2;

      if (invoice.orderNumber) {
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#64748b')
          .text(`Order No: ${invoice.orderNumber}`, rightX, rightY, {
            width: rightWidth,
            align: 'right',
          });
        rightY = doc.y + 3;
      }

      rightY += 4;
      const issueDateStr = invoice.issueDate
        ? new Date(invoice.issueDate).toLocaleDateString('en-GB')
        : '-';
      const dueDateStr = invoice.dueDate
        ? new Date(invoice.dueDate).toLocaleDateString('en-GB')
        : null;

      doc.font('Helvetica').fontSize(8.5).fillColor('#64748b');
      doc.text(`Date: ${issueDateStr}`, rightX, rightY, {
        width: rightWidth,
        align: 'right',
      });
      rightY = doc.y + 2;

      if (dueDateStr) {
        doc.text(`Due date: ${dueDateStr}`, rightX, rightY, {
          width: rightWidth,
          align: 'right',
        });
        rightY = doc.y + 2;
      }

      currentY = Math.max(senderEndY, rightY) + 16;

      // Divider below Header
      doc
        .strokeColor('#e5e7eb')
        .lineWidth(0.75)
        .moveTo(startX, currentY)
        .lineTo(startX + printableWidth, currentY)
        .stroke();

      currentY += 14;

      // =============================================================
      // 2. RECIPIENT DETAILS BOX
      // =============================================================
      const recipientBoxY = currentY;
      const boxPadding = 12;
      const boxWidth = printableWidth;

      // Calculate heights to size box properly
      const clientColW = (boxWidth - boxPadding * 2 - 20) / 2;

      // Background card
      doc
        .roundedRect(startX, recipientBoxY, boxWidth, 76, 8)
        .fillColor('#f8fafc')
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .fillAndStroke();

      // Top label inside box
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#4f46e5')
        .text('RECIPIENT DETAILS', startX + boxPadding, recipientBoxY + boxPadding);

      const clientContentY = recipientBoxY + boxPadding + 14;

      // Left: Client Name & Address
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#111827')
        .text(invoice.client?.name || '-', startX + boxPadding, clientContentY, {
          width: clientColW,
        });

      let cLeftY = doc.y + 2;
      doc.font('Helvetica').fontSize(8.5).fillColor('#64748b');

      if (invoice.client?.companyName) {
        doc.text(invoice.client.companyName, startX + boxPadding, cLeftY, {
          width: clientColW,
        });
        cLeftY = doc.y + 2;
      }

      if (invoice.client?.taxId) {
        doc.text(`Tax ID: ${invoice.client.taxId}`, startX + boxPadding, cLeftY, {
          width: clientColW,
        });
        cLeftY = doc.y + 2;
      }

      if (invoice.client?.address) {
        const fullClientAddr = `${invoice.client.address}${
          invoice.client?.postalCode ? ' - ' + invoice.client.postalCode : ''
        }`;
        doc.text(fullClientAddr, startX + boxPadding, cLeftY, {
          width: clientColW,
        });
      }

      // Right: Email & Phone
      const cRightX = startX + boxWidth - boxPadding - clientColW;
      let cRightY = clientContentY + 2;
      doc.font('Helvetica').fontSize(8.5).fillColor('#475569');

      if (invoice.client?.email) {
        doc.text(`Email: ${invoice.client.email}`, cRightX, cRightY, {
          width: clientColW,
          align: 'right',
        });
        cRightY = doc.y + 3;
      }

      if (invoice.client?.phone) {
        doc.text(`Phone: ${invoice.client.phone}`, cRightX, cRightY, {
          width: clientColW,
          align: 'right',
        });
      }

      currentY = recipientBoxY + 88;

      // =============================================================
      // 3. ITEMS TABLE
      // Matches: QTY | DESCRIPTION | PRICE (₹) | TAXES | SUBTOTAL (₹)
      // =============================================================
      const colX = {
        qty: startX,
        desc: startX + 45,
        price: startX + 275,
        tax: startX + 355,
        subtotal: startX + 415,
      };

      const colW = {
        qty: 40,
        desc: 220,
        price: 75,
        tax: 55,
        subtotal: printableWidth - 415,
      };

      // Table Header Underline
      const tableHeaderY = currentY;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569');

      doc.text('QTY', colX.qty, tableHeaderY, { width: colW.qty, align: 'center' });
      doc.text('DESCRIPTION', colX.desc, tableHeaderY, { width: colW.desc, align: 'left' });
      doc.text(`PRICE (${currPrefix.trim()})`, colX.price, tableHeaderY, {
        width: colW.price,
        align: 'right',
      });
      doc.text('TAXES', colX.tax, tableHeaderY, { width: colW.tax, align: 'center' });
      doc.text(`SUBTOTAL (${currPrefix.trim()})`, colX.subtotal, tableHeaderY, {
        width: colW.subtotal,
        align: 'right',
      });

      currentY += 14;

      doc
        .strokeColor('#cbd5e1')
        .lineWidth(1)
        .moveTo(startX, currentY)
        .lineTo(startX + printableWidth, currentY)
        .stroke();

      currentY += 6;

      // Items Rows
      const items = invoice.items || [];
      items.forEach((item) => {
        const itemQty = String(item.quantity || 1);
        const itemDesc = item.description || '-';
        const itemPrice = formatAmount(item.rate || 0);
        const itemTax = item.tax ? `${item.tax}%` : '-';
        const itemSubtotal = formatAmount(item.amount || 0);

        const rowY = currentY + 4;
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155');

        doc.text(itemQty, colX.qty, rowY, { width: colW.qty, align: 'center' });
        doc.font('Helvetica-Bold').text(itemDesc, colX.desc, rowY, {
          width: colW.desc,
          align: 'left',
          ellipsis: true,
        });
        doc.font('Helvetica').text(itemPrice, colX.price, rowY, {
          width: colW.price,
          align: 'right',
        });
        doc.text(itemTax, colX.tax, rowY, { width: colW.tax, align: 'center' });
        doc.font('Helvetica-Bold').text(itemSubtotal, colX.subtotal, rowY, {
          width: colW.subtotal,
          align: 'right',
        });

        currentY = rowY + 16;

        // Subtle row divider
        doc
          .strokeColor('#f1f5f9')
          .lineWidth(0.5)
          .moveTo(startX, currentY)
          .lineTo(startX + printableWidth, currentY)
          .stroke();

        currentY += 2;
      });

      currentY += 8;

      // Divider above bottom section
      doc
        .strokeColor('#e5e7eb')
        .lineWidth(0.75)
        .moveTo(startX, currentY)
        .lineTo(startX + printableWidth, currentY)
        .stroke();

      currentY += 14;

      // =============================================================
      // 4. BANK DETAILS / TERMS (Left) & FINANCIAL TOTALS (Right)
      // =============================================================
      const splitLeftW = 240;
      const splitRightW = 210;
      const splitRightX = startX + printableWidth - splitRightW;
      const bottomStartY = currentY;

      // --- Left Column: Bank Details or Terms ---
      let leftBottomY = bottomStartY;
      const pDetails = invoice.paymentDetails;

      if (
        invoice.invoiceType === 'Tax Invoice' &&
        pDetails &&
        (pDetails.primaryHolderName || pDetails.bankName || pDetails.accountNumber)
      ) {
        doc
          .roundedRect(startX, leftBottomY, splitLeftW, 88, 8)
          .fillColor('#f5f3ff')
          .strokeColor('#e9d5ff')
          .lineWidth(1)
          .fillAndStroke();

        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#581c87')
          .text('BANK DETAILS', startX + 10, leftBottomY + 8);

        let bankY = leftBottomY + 22;
        doc.font('Helvetica').fontSize(7.5).fillColor('#334155');

        if (pDetails.primaryHolderName) {
          doc.text(`Primary holder's name: `, startX + 10, bankY, { continued: true });
          doc.font('Helvetica-Bold').text(pDetails.primaryHolderName);
          bankY = doc.y + 3;
        }

        if (pDetails.accountNumber) {
          doc.font('Helvetica').text(`Account Number: `, startX + 10, bankY, { continued: true });
          doc
            .font('Helvetica-Bold')
            .fillColor('#312e81')
            .text(pDetails.accountNumber);
          bankY = doc.y + 3;
        }

        if (pDetails.accountType) {
          doc
            .font('Helvetica')
            .fillColor('#334155')
            .text(`Account Type: ${pDetails.accountType}`, startX + 10, bankY);
          bankY = doc.y + 3;
        }

        doc
          .font('Helvetica')
          .fillColor('#334155')
          .text(`Bank: ${pDetails.bankName || 'HDFC Bank'}`, startX + 10, bankY);
        bankY = doc.y + 3;

        if (pDetails.ifscCode) {
          doc.text(`IFSC: ${pDetails.ifscCode}`, startX + 10, bankY);
          bankY = doc.y + 3;
        }

        if (pDetails.branch) {
          doc.text(`Branch: ${pDetails.branch}`, startX + 10, bankY);
        }

        leftBottomY += 96;
      }

      if (invoice.terms) {
        doc
          .roundedRect(startX, leftBottomY, splitLeftW, 50, 6)
          .fillColor('#f8fafc')
          .strokeColor('#e2e8f0')
          .lineWidth(0.75)
          .fillAndStroke();

        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor('#475569')
          .text('TERMS AND CONDITIONS', startX + 8, leftBottomY + 7);

        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor('#64748b')
          .text(invoice.terms, startX + 8, leftBottomY + 18, {
            width: splitLeftW - 16,
            lineGap: 1.5,
          });

        leftBottomY += 58;
      }

      // --- Right Column: Financial Summary ---
      let rightTotalsY = bottomStartY;

      // Subtotal
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      doc.text('Subtotal', splitRightX, rightTotalsY);
      doc.font('Helvetica-Bold').fillColor('#111827');
      doc.text(`${currPrefix}${formatAmount(invoice.subtotal || 0)}`, splitRightX, rightTotalsY, {
        width: splitRightW,
        align: 'right',
      });
      rightTotalsY += 18;

      // Discount
      if (invoice.discount > 0) {
        doc.font('Helvetica').fillColor('#059669');
        doc.text('Discount', splitRightX, rightTotalsY);
        doc.text(
          `-${currPrefix}${formatAmount(invoice.discount)}`,
          splitRightX,
          rightTotalsY,
          { width: splitRightW, align: 'right' }
        );
        rightTotalsY += 18;
      }

      // Taxes
      if (invoice.taxAmount > 0) {
        doc.font('Helvetica').fillColor('#475569');
        doc.text('Taxes', splitRightX, rightTotalsY);
        doc.font('Helvetica-Bold').fillColor('#111827');
        doc.text(
          `+${currPrefix}${formatAmount(invoice.taxAmount)}`,
          splitRightX,
          rightTotalsY,
          { width: splitRightW, align: 'right' }
        );
        rightTotalsY += 18;
      }

      // Thick separator above Total Amount
      doc
        .strokeColor('#111827')
        .lineWidth(1.5)
        .moveTo(splitRightX, rightTotalsY + 2)
        .lineTo(startX + printableWidth, rightTotalsY + 2)
        .stroke();

      rightTotalsY += 10;

      // Total Amount
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827');
      doc.text('Total Amount', splitRightX, rightTotalsY);

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#4338ca');
      doc.text(
        `${currPrefix}${formatAmount(invoice.totalAmount || 0)}`,
        splitRightX,
        rightTotalsY,
        { width: splitRightW, align: 'right' }
      );

      rightTotalsY += 26;

      currentY = Math.max(leftBottomY, rightTotalsY) + 20;

      // =============================================================
      // 5. SIGNATURE & AUTHENTICITY FOOTER
      // =============================================================
      const sigSectionY = Math.max(currentY, 690);

      // Top divider of signature area
      doc
        .strokeColor('#f1f5f9')
        .lineWidth(0.75)
        .moveTo(startX, sigSectionY)
        .lineTo(startX + printableWidth, sigSectionY)
        .stroke();

      const footerTextY = sigSectionY + 25;

      // Left: Valid without physical seal notice
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#9ca3af')
        .text(
          'This document was electronically generated and is valid without physical seal.',
          startX,
          footerTextY,
          { width: 280 }
        );

      // Right: Signature
      const sigW = 140;
      const sigX = startX + printableWidth - sigW;
      const sigImgY = sigSectionY + 6;

      if (invoice.signature?.data) {
        if (invoice.signature.signatureType === 'typed') {
          doc
            .font('Helvetica-BoldOblique')
            .fontSize(14)
            .fillColor('#1e1b4b')
            .text(invoice.signature.data, sigX, sigImgY + 4, {
              width: sigW,
              align: 'right',
            });
        } else if (invoice.signature.data.startsWith('data:image')) {
          try {
            const base64Data = invoice.signature.data.split(';base64,').pop();
            const imgBuffer = Buffer.from(base64Data, 'base64');
            doc.image(imgBuffer, sigX + 20, sigImgY - 6, {
              width: 120,
              height: 32,
              fit: [120, 32],
            });
          } catch (e) {
            console.warn('Could not render signature image into PDF:', e.message);
          }
        }
      } else {
        doc
          .font('Helvetica-Oblique')
          .fontSize(10)
          .fillColor('#64748b')
          .text(invoice.sender?.name || '', sigX, sigImgY + 8, {
            width: sigW,
            align: 'right',
          });
      }

      const sigLineY = sigSectionY + 36;
      doc
        .strokeColor('#d1d5db')
        .lineWidth(1)
        .moveTo(sigX, sigLineY)
        .lineTo(startX + printableWidth, sigLineY)
        .stroke();

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#9ca3af')
        .text(
          (invoice.signature?.signatoryName || 'AUTHORIZED SIGNATORY').toUpperCase(),
          sigX,
          sigLineY + 5,
          { width: sigW, align: 'right' }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateInvoicePdf,
};
