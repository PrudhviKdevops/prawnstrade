const ExcelJS = require('exceljs');

const COLUMN_SETS = {
  purchase: [
    { header: 'Transaction ID', key: 'transaction_number', width: 18 },
    { header: 'Date', key: 'transaction_date', width: 14 },
    { header: 'Farmer', key: 'farmer_name_snapshot', width: 22 },
    { header: 'Count', key: 'count_value', width: 10 },
    { header: 'Tonnage (KG)', key: 'tonnage_kg', width: 14 },
    { header: 'Farmer Price', key: 'farmer_price', width: 14 },
    { header: 'Purchase Value', key: 'purchase_amount', width: 16 },
  ],
  sales: [
    { header: 'Transaction ID', key: 'transaction_number', width: 18 },
    { header: 'Date', key: 'transaction_date', width: 14 },
    { header: 'Exporter', key: 'exporter_name_snapshot', width: 22 },
    { header: 'Count', key: 'count_value', width: 10 },
    { header: 'Tonnage (KG)', key: 'tonnage_kg', width: 14 },
    { header: 'Exporter Price', key: 'exporter_price', width: 14 },
    { header: 'Sales Value', key: 'sales_amount', width: 16 },
  ],
  commission: [
    { header: 'Transaction ID', key: 'transaction_number', width: 18 },
    { header: 'Date', key: 'transaction_date', width: 14 },
    { header: 'Farmer', key: 'farmer_name_snapshot', width: 22 },
    { header: 'Exporter', key: 'exporter_name_snapshot', width: 22 },
    { header: 'Tonnage (KG)', key: 'tonnage_kg', width: 14 },
    { header: 'Commission Amount', key: 'commission_amount', width: 18 },
  ],
  payment: [
    { header: 'Transaction ID', key: 'transaction_number', width: 18 },
    { header: 'Farmer', key: 'farmer_name_snapshot', width: 22 },
    { header: 'Exporter', key: 'exporter_name_snapshot', width: 22 },
    { header: 'Farmer Payment Status', key: 'farmer_payment_status', width: 18 },
    { header: 'Farmer Paid', key: 'farmer_paid_amount', width: 14 },
    { header: 'Farmer Balance', key: 'farmer_balance', width: 14 },
    { header: 'Exporter Payment Status', key: 'exporter_payment_status', width: 18 },
    { header: 'Exporter Paid', key: 'exporter_paid_amount', width: 14 },
    { header: 'Exporter Balance', key: 'exporter_balance', width: 14 },
    { header: 'Bill Status', key: 'bill_status', width: 16 },
  ],
  complete: [
    { header: 'Transaction ID', key: 'transaction_number', width: 18 },
    { header: 'Transaction Date', key: 'transaction_date', width: 14 },
    { header: 'Farmer Name', key: 'farmer_name_snapshot', width: 20 },
    { header: 'Count', key: 'count_value', width: 8 },
    { header: 'Tonnage (KG)', key: 'tonnage_kg', width: 14 },
    { header: 'Farmer Price', key: 'farmer_price', width: 12 },
    { header: 'Purchase Amount', key: 'purchase_amount', width: 16 },
    { header: 'Exporter Company', key: 'exporter_name_snapshot', width: 20 },
    { header: 'Exporter Price', key: 'exporter_price', width: 13 },
    { header: 'Sales Amount', key: 'sales_amount', width: 15 },
    { header: 'Commission Amount', key: 'commission_amount', width: 17 },
    { header: 'Exporter Payment Status', key: 'exporter_payment_status', width: 18 },
    { header: 'Exporter Paid Amount', key: 'exporter_paid_amount', width: 18 },
    { header: 'Exporter Balance', key: 'exporter_balance', width: 15 },
    { header: 'Farmer Payment Status', key: 'farmer_payment_status', width: 18 },
    { header: 'Farmer Paid Amount', key: 'farmer_paid_amount', width: 17 },
    { header: 'Farmer Balance', key: 'farmer_balance', width: 14 },
    { header: 'Bill Status', key: 'bill_status', width: 16 },
    { header: 'Notes', key: 'notes', width: 25 },
  ],
};

async function buildReportExcel({ type, rows }, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Prawn Trade Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`${type} report`.slice(0, 31));
  const columns = COLUMN_SETS[type] || COLUMN_SETS.complete;
  sheet.columns = columns;

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  rows.forEach((row) => {
    const rowData = {};
    columns.forEach((col) => {
      let value = row[col.key];
      if (col.key === 'transaction_date' && value) value = new Date(value).toLocaleDateString('en-IN');
      rowData[col.key] = value != null ? value : '';
    });
    sheet.addRow(rowData);
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { buildReportExcel };
