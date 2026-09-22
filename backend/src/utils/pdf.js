const PDFDocument = require('pdfkit');

const REPORT_TITLES = {
  purchase: 'PURCHASE REPORT',
  sales: 'SALES REPORT',
  commission: 'COMMISSION REPORT',
  payment: 'PAYMENT REPORT',
  complete: 'COMPLETE TRANSACTION REPORT',
};

const COLUMN_SETS = {
  purchase: [
    { key: 'transaction_number', label: 'ID', width: 70 },
    { key: 'transaction_date', label: 'Date', width: 60 },
    { key: 'farmer_name_snapshot', label: 'Farmer', width: 90 },
    { key: 'count_value', label: 'Count', width: 45 },
    { key: 'tonnage_kg', label: 'KG', width: 60 },
    { key: 'farmer_price', label: 'Price', width: 55 },
    { key: 'purchase_amount', label: 'Value', width: 75 },
  ],
  sales: [
    { key: 'transaction_number', label: 'ID', width: 70 },
    { key: 'transaction_date', label: 'Date', width: 60 },
    { key: 'exporter_name_snapshot', label: 'Exporter', width: 100 },
    { key: 'count_value', label: 'Count', width: 45 },
    { key: 'tonnage_kg', label: 'KG', width: 60 },
    { key: 'exporter_price', label: 'Price', width: 55 },
    { key: 'sales_amount', label: 'Value', width: 65 },
  ],
  commission: [
    { key: 'transaction_number', label: 'ID', width: 70 },
    { key: 'transaction_date', label: 'Date', width: 60 },
    { key: 'farmer_name_snapshot', label: 'Farmer', width: 90 },
    { key: 'exporter_name_snapshot', label: 'Exporter', width: 90 },
    { key: 'tonnage_kg', label: 'KG', width: 60 },
    { key: 'commission_amount', label: 'Commission', width: 80 },
  ],
  payment: [
    { key: 'transaction_number', label: 'ID', width: 65 },
    { key: 'farmer_name_snapshot', label: 'Farmer', width: 75 },
    { key: 'exporter_name_snapshot', label: 'Exporter', width: 75 },
    { key: 'farmer_payment_status', label: 'Farmer Pay', width: 65 },
    { key: 'exporter_payment_status', label: 'Exp. Pay', width: 65 },
    { key: 'farmer_balance', label: 'F.Bal', width: 55 },
    { key: 'exporter_balance', label: 'E.Bal', width: 55 },
    { key: 'bill_status', label: 'Bill', width: 55 },
  ],
  complete: [
    { key: 'transaction_number', label: 'ID', width: 60 },
    { key: 'transaction_date', label: 'Date', width: 50 },
    { key: 'farmer_name_snapshot', label: 'Farmer', width: 65 },
    { key: 'exporter_name_snapshot', label: 'Exporter', width: 65 },
    { key: 'count_value', label: 'Cnt', width: 30 },
    { key: 'tonnage_kg', label: 'KG', width: 45 },
    { key: 'commission_amount', label: 'Comm.', width: 55 },
    { key: 'bill_status', label: 'Bill', width: 60 },
  ],
};

function fmtCell(key, value) {
  if (value == null) return '-';
  if (key === 'transaction_date') return new Date(value).toLocaleDateString('en-IN');
  if (['farmer_price', 'exporter_price', 'purchase_amount', 'sales_amount', 'commission_amount', 'farmer_balance', 'exporter_balance'].includes(key)) {
    return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  return String(value);
}

function buildReportPdf({ type, from, to, rows, totals }, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#0f766e').text('PRAWN TRADE BUSINESS REPORT', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(12).fillColor('#111827').text(REPORT_TITLES[type] || 'REPORT', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#374151').text(
    `Report Period: ${from || 'All time'}  to  ${to || 'Present'}     |     Generated: ${new Date().toLocaleString('en-IN')}`,
    { align: 'center' }
  );
  doc.moveDown(1);

  if (totals) {
    doc.fontSize(10).fillColor('#0f766e');
    const summaryLine = Object.entries(totals).map(([k, v]) => `${k}: ${v}`).join('     ');
    doc.text(summaryLine, { align: 'center' });
    doc.moveDown(1);
  }

  const columns = COLUMN_SETS[type] || COLUMN_SETS.complete;
  let y = doc.y;
  const startX = doc.page.margins.left;

  function drawHeader() {
    let x = startX;
    doc.fontSize(9).fillColor('#ffffff');
    doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), 20).fill('#0f766e');
    doc.fillColor('#ffffff');
    columns.forEach((col) => {
      doc.text(col.label, x + 4, y + 6, { width: col.width - 6 });
      x += col.width;
    });
    y += 20;
  }

  drawHeader();

  doc.fontSize(8.5);
  rows.forEach((row, idx) => {
    if (y > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
      doc.fontSize(8.5);
    }
    let x = startX;
    if (idx % 2 === 0) {
      doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), 18).fill('#f0fdfa');
    }
    doc.fillColor('#111827');
    columns.forEach((col) => {
      doc.text(fmtCell(col.key, row[col.key]), x + 4, y + 5, { width: col.width - 6 });
      x += col.width;
    });
    y += 18;
  });

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#6b7280').text(`Total records: ${rows.length}`, startX, y + 10);

  doc.end();
}

module.exports = { buildReportPdf };
