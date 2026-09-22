const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const { sendStylishEmail } = require('../utils/emailService');
const { generateInvoicePdf } = require('../utils/invoicePdfGenerator');

// Helper to format currency symbol
const getCurrencySymbol = (currency) => {
  switch (currency) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'INR':
    default: return '₹';
  }
};

// GET /api/admin/invoices/next-number - Generate next invoice number based on invoice type
router.get('/next-number', async (req, res) => {
  try {
    const { type = 'Invoice' } = req.query;
    const year = new Date().getFullYear();
    let typePrefix = 'INV';
    if (type === 'Tax Invoice') {
      typePrefix = 'TAX';
    } else if (type === 'Proforma Invoice') {
      typePrefix = 'PRO';
    }

    const prefix = `${typePrefix}-${year}-`;
    const count = await Invoice.countDocuments({
      invoiceNumber: { $regex: `^${prefix}` }
    });
    const nextNum = String(count + 1).padStart(4, '0');
    let candidate = `${prefix}${nextNum}`;

    // Ensure uniqueness
    let exists = await Invoice.findOne({ invoiceNumber: candidate });
    let increment = count + 1;
    while (exists) {
      increment++;
      candidate = `${prefix}${String(increment).padStart(4, '0')}`;
      exists = await Invoice.findOne({ invoiceNumber: candidate });
    }

    res.json({ invoiceNumber: candidate });
  } catch (error) {
    console.error('Error getting next invoice number:', error);
    res.status(500).json({ message: 'Server error generating invoice number' });
  }
});

// GET /api/invoices/public/:id - Public view of invoice (for clients)
router.get('/public/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let invoice = null;
    
    // Check if ID is Mongo ObjectId or invoiceNumber
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      invoice = await Invoice.findById(id);
    }
    if (!invoice) {
      invoice = await Invoice.findOne({ invoiceNumber: id });
    }

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching public invoice:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/invoices - List all invoices with stats
router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { invoiceNumber: searchRegex },
        { 'client.name': searchRegex },
        { 'client.companyName': searchRegex },
        { 'client.email': searchRegex },
        { 'client.phone': searchRegex },
        { 'items.description': searchRegex },
      ];
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });

    // Aggregate stats over ALL invoices
    const allInvoices = await Invoice.find({});
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalOverdue = 0;

    const counts = {
      total: allInvoices.length,
      paid: 0,
      pending: 0,
      overdue: 0,
      draft: 0,
      cancelled: 0,
    };

    const now = new Date();

    allInvoices.forEach((inv) => {
      const amt = inv.totalAmount || 0;
      totalInvoiced += amt;

      let effectiveStatus = inv.status || 'Pending';
      const isPastDue = effectiveStatus !== 'Paid' && 
                        effectiveStatus !== 'Cancelled' && 
                        inv.dueDate && 
                        new Date(inv.dueDate) < now;

      if (effectiveStatus !== 'Paid' && effectiveStatus !== 'Cancelled' && isPastDue) {
        effectiveStatus = 'Overdue';
      }

      if (effectiveStatus === 'Paid') {
        totalPaid += amt;
        counts.paid++;
      } else if (effectiveStatus === 'Draft') {
        counts.draft++;
        totalPending += amt;
      } else if (effectiveStatus === 'Overdue') {
        counts.overdue++;
        totalOverdue += amt;
      } else if (effectiveStatus === 'Cancelled') {
        counts.cancelled++;
      } else {
        counts.pending++;
        totalPending += amt;
      }
    });

    res.json({
      invoices,
      stats: {
        totalInvoiced,
        totalPaid,
        totalPending,
        totalOverdue,
        counts,
      },
    });
  } catch (error) {
    console.error('Error listing invoices:', error);
    res.status(500).json({ message: 'Server error listing invoices' });
  }
});

// GET /api/admin/invoices/:id - Get single invoice
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    console.error('Error getting invoice:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/invoices - Create new invoice
router.post('/', async (req, res) => {
  try {
    const {
      invoiceType = 'Invoice',
      invoiceNumber,
      orderNumber = '',
      format = 'Standard',
      client,
      sender,
      items,
      taxRate = 0,
      discount = 0,
      currency = 'INR',
      issueDate,
      dueDate,
      status = 'Pending',
      signature,
      paymentDetails,
      notes,
      terms,
      extraFields,
      createdBy,
    } = req.body;

    if (!client || !client.name) {
      return res.status(400).json({ message: 'Recipient Name / Business is required' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'At least one invoice item is required' });
    }

    // Calculate item amounts & subtotal
    let totalItemTax = 0;
    const calculatedItems = items.map((item) => {
      const qty = parseFloat(item.quantity) || 1;
      const rate = parseFloat(item.rate) || 0;
      const tax = parseFloat(item.tax) || 0;
      const baseAmount = Math.round(qty * rate * 100) / 100;
      const itemTaxAmount = Math.round(baseAmount * (tax / 100) * 100) / 100;
      totalItemTax += itemTaxAmount;
      return {
        description: item.description || 'Item',
        quantity: qty,
        rate: rate,
        tax: tax,
        amount: baseAmount,
      };
    });

    const subtotal = calculatedItems.reduce((sum, item) => sum + item.amount, 0);
    const parsedTaxRate = parseFloat(taxRate) || 0;
    const parsedDiscount = parseFloat(discount) || 0;
    // Overall tax or accumulated item-level tax
    const taxAmount = parsedTaxRate > 0
      ? Math.round(((subtotal - parsedDiscount) * (parsedTaxRate / 100)) * 100) / 100
      : totalItemTax;
    const totalAmount = Math.max(0, Math.round((subtotal - parsedDiscount + taxAmount) * 100) / 100);

    let finalInvoiceNumber = invoiceNumber;
    if (!finalInvoiceNumber) {
      const year = new Date().getFullYear();
      let typePrefix = 'INV';
      if (invoiceType === 'Tax Invoice') typePrefix = 'TAX';
      else if (invoiceType === 'Proforma Invoice') typePrefix = 'PRO';

      const prefix = `${typePrefix}-${year}-`;
      const count = await Invoice.countDocuments({
        invoiceNumber: { $regex: `^${prefix}` }
      });
      finalInvoiceNumber = `${prefix}${String(count + 1).padStart(4, '0')}`;
    }

    const newInvoice = new Invoice({
      invoiceType,
      invoiceNumber: finalInvoiceNumber,
      orderNumber,
      format,
      client,
      sender,
      items: calculatedItems,
      subtotal,
      taxRate: parsedTaxRate,
      taxAmount,
      discount: parsedDiscount,
      totalAmount,
      currency,
      issueDate: issueDate || new Date(),
      dueDate: dueDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      status,
      signature,
      paymentDetails,
      notes,
      terms,
      extraFields,
      createdBy,
    });

    const savedInvoice = await newInvoice.save();
    res.status(201).json(savedInvoice);
  } catch (error) {
    console.error('Error creating invoice:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Invoice number already exists. Please choose a different number.' });
    }
    res.status(500).json({ message: error.message || 'Server error creating invoice' });
  }
});

// PUT /api/admin/invoices/:id - Update invoice
router.put('/:id', async (req, res) => {
  try {
    const {
      invoiceType,
      invoiceNumber,
      orderNumber,
      format,
      client,
      sender,
      items,
      taxRate = 0,
      discount = 0,
      currency = 'INR',
      issueDate,
      dueDate,
      status,
      signature,
      paymentDetails,
      notes,
      terms,
      extraFields,
    } = req.body;

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (items && items.length > 0) {
      let totalItemTax = 0;
      invoice.items = items.map((item) => {
        const qty = parseFloat(item.quantity) || 1;
        const rate = parseFloat(item.rate) || 0;
        const tax = parseFloat(item.tax) || 0;
        const baseAmount = Math.round(qty * rate * 100) / 100;
        const itemTaxAmount = Math.round(baseAmount * (tax / 100) * 100) / 100;
        totalItemTax += itemTaxAmount;
        return {
          description: item.description || 'Item',
          quantity: qty,
          rate: rate,
          tax: tax,
          amount: baseAmount,
        };
      });

      const subtotal = invoice.items.reduce((sum, item) => sum + item.amount, 0);
      const parsedTaxRate = parseFloat(taxRate) || 0;
      const parsedDiscount = parseFloat(discount) || 0;
      const taxAmount = parsedTaxRate > 0
        ? Math.round(((subtotal - parsedDiscount) * (parsedTaxRate / 100)) * 100) / 100
        : totalItemTax;
      const totalAmount = Math.max(0, Math.round((subtotal - parsedDiscount + taxAmount) * 100) / 100);

      invoice.subtotal = subtotal;
      invoice.taxRate = parsedTaxRate;
      invoice.taxAmount = taxAmount;
      invoice.discount = parsedDiscount;
      invoice.totalAmount = totalAmount;
    }

    if (invoiceType) invoice.invoiceType = invoiceType;
    if (invoiceNumber) invoice.invoiceNumber = invoiceNumber;
    if (orderNumber !== undefined) invoice.orderNumber = orderNumber;
    if (format) invoice.format = format;
    if (client) invoice.client = client;
    if (sender) invoice.sender = sender;
    if (currency) invoice.currency = currency;
    if (issueDate) invoice.issueDate = issueDate;
    if (dueDate) invoice.dueDate = dueDate;
    if (status) invoice.status = status;
    if (signature) invoice.signature = signature;
    if (paymentDetails) invoice.paymentDetails = paymentDetails;
    if (notes !== undefined) invoice.notes = notes;
    if (terms !== undefined) invoice.terms = terms;
    if (extraFields !== undefined) invoice.extraFields = extraFields;

    const updated = await invoice.save();
    res.json(updated);
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ message: error.message || 'Server error updating invoice' });
  }
});

// PATCH & PUT /api/admin/invoices/:id/status - Quick status change
const updateInvoiceStatusHandler = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

router.patch('/:id/status', updateInvoiceStatusHandler);
router.put('/:id/status', updateInvoiceStatusHandler);

// DELETE /api/admin/invoices/:id - Delete invoice
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/invoices/:id/download-pdf - Download generated PDF directly
router.get('/:id/download-pdf', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    const pdfBuffer = await generateInvoicePdf(invoice);
    const filename = `${invoice.invoiceNumber || 'Invoice'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error downloading invoice PDF:', error);
    res.status(500).json({ message: error.message || 'Error generating PDF' });
  }
});

// POST /api/admin/invoices/:id/send-email - Send invoice to client via email
router.post('/:id/send-email', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const recipientEmail = req.body.email || invoice.client?.email;
    if (!recipientEmail) {
      return res.status(400).json({ message: 'No recipient email provided for this client' });
    }

    const symbol = getCurrencySymbol(invoice.currency);
    const formattedTotal = `${symbol}${invoice.totalAmount?.toLocaleString('en-IN')}`;

    // Generate Invoice PDF
    const pdfBuffer = await generateInvoicePdf(invoice);
    const pdfFileName = `${invoice.invoiceNumber || 'Invoice'}.pdf`;

    // Clean, modern email body without the table and without any buttons
    const emailHtml = `
      <div style="text-align: left; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px 24px; margin: 15px 0;">
        <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: top;">
                <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Billed To</span>
                <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 3px;">${invoice.client?.name || 'Valued Client'}</div>
                ${invoice.client?.companyName ? `<div style="font-size: 13px; color: #64748b; margin-top: 2px;">${invoice.client.companyName}</div>` : ''}
              </td>
              <td style="vertical-align: top; text-align: right;">
                <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Document No</span>
                <div style="font-size: 15px; font-weight: 700; color: #4f46e5; margin-top: 3px;">${invoice.invoiceNumber}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Due: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-GB') : 'Due on receipt'}</div>
              </td>
            </tr>
          </table>
        </div>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="font-size: 15px; font-weight: 800; color: #0f172a;">Total Payable:</td>
              <td style="text-align: right; font-size: 17px; font-weight: 800; color: #4f46e5;">${formattedTotal}</td>
            </tr>
          </table>
        </div>

        ${invoice.invoiceType === 'Tax Invoice' && (invoice.paymentDetails?.bankName || invoice.paymentDetails?.primaryHolderName) ? `
          <div style="background-color: #f5f3ff; border-left: 4px solid #7c3aed; padding: 12px 14px; border-radius: 6px; font-size: 12px; color: #4c1d95; line-height: 1.6; margin-bottom: 16px; text-align: left;">
            <strong style="color: #5b21b6;">Payment Details:</strong><br/>
            ${invoice.paymentDetails.primaryHolderName ? `Account Name: <strong>${invoice.paymentDetails.primaryHolderName}</strong><br/>` : ''}
            ${invoice.paymentDetails.accountNumber ? `Account No: <strong style="font-family: monospace;">${invoice.paymentDetails.accountNumber}</strong> ${invoice.paymentDetails.accountType ? `(${invoice.paymentDetails.accountType})` : ''}<br/>` : ''}
            Bank: ${invoice.paymentDetails.bankName || 'HDFC Bank'} | IFSC: <strong>${invoice.paymentDetails.ifscCode || 'HDFC0002050'}</strong>
          </div>
        ` : ''}

        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #1e40af; text-align: left;">
          📎 <strong>Attachment:</strong> Please find your official invoice document (<strong>${pdfFileName}</strong>) attached to this email.
        </div>
      </div>
    `;

    await sendStylishEmail(
      recipientEmail,
      `Invoice ${invoice.invoiceNumber} from ${invoice.sender?.companyName || 'Techie Nutpam'}`,
      `${invoice.invoiceType || 'Invoice'} from ${invoice.sender?.companyName || 'Techie Nutpam'} 📄`,
      `Dear ${invoice.client?.name || 'Client'}, please find attached your official invoice for recent services rendered. Total amount payable is <strong>${formattedTotal}</strong>.`,
      emailHtml,
      `If you have any questions or need further clarification, feel free to reply directly to this email.`,
      [
        {
          filename: pdfFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      { showCta: false }
    );

    res.json({ message: `Invoice sent successfully to ${recipientEmail}` });
  } catch (error) {
    console.error('Error sending invoice email:', error);
    res.status(500).json({ message: error.message || 'Failed to send invoice email' });
  }
});

module.exports = router;
