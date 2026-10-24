import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromExcelSerial, headerKey, kindOf, parseAmount, parseDate, parseSession, readTable } from './parse';
import { crc32, writeXlsx } from './xlsx';

const iso = (v: string, x = false) => { const r = parseDate(v, x); return r.ok ? r.iso : null; };

test('dates: DD-MM-YYYY, ISO and dotted are read day first', () => {
  assert.equal(iso('05-06-2024'), '2024-06-05');
  assert.equal(iso('5-6-2024'), '2024-06-05');
  assert.equal(iso('05.06.2024'), '2024-06-05');
  assert.equal(iso('2024-06-05'), '2024-06-05');
});

test('dates: slashes only when the day cannot be a month', () => {
  assert.equal(iso('25/06/2024'), '2024-06-25');
  assert.equal(iso('06/06/2024'), '2024-06-06');
  const r = parseDate('03/04/2025');
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : '', /two ways/);
});

test('dates: impossible days, two-digit years and words are refused', () => {
  for (const v of ['31-02-2024', '29-02-2023', '05-06-24', 'June 5', '2024-13-01', '']) assert.equal(iso(v), null, v);
  assert.equal(iso('29-02-2024'), '2024-02-29');
});

test('dates: Excel serials only from .xlsx', () => {
  assert.equal(fromExcelSerial(45448), '2024-06-05');
  assert.equal(iso('45448', true), '2024-06-05');
  assert.equal(iso('45448'), null);
});

test('sessions, amounts and headers', () => {
  assert.equal(parseSession('2024-25'), '2024-25');
  assert.equal(parseSession('2024-2025'), '2024-25');
  assert.equal(parseSession('2024/25'), '2024-25');
  assert.equal(parseSession('2099-00'), '2099-00');
  assert.equal(parseSession('2024-26'), null);
  assert.equal(parseAmount('₹ 12,500.50'), 12500.5);
  assert.equal(parseAmount('Rs. 400'), 400);
  assert.equal(parseAmount('12.345'), null);
  assert.equal(parseAmount('-5'), null);
  assert.equal(headerKey(' Admission No. '), 'admission_no');
  assert.equal(headerKey('Date (DD-MM-YYYY)'), 'date');
  assert.equal(kindOf('Fees.XLSX'), 'xlsx');
  assert.equal(kindOf('a.csv'), 'csv');
  assert.equal(kindOf('a.xls'), null);
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('xlsx: what we write, readXlsx reads back (first sheet, text kept as typed)', async () => {
  const rows = [['admission_no', 'name', 'date'], ['00123', 'Asha <R> & "Co"', '05-06-2024'], ['', 'blank first', '']];
  const bytes = writeXlsx([{ name: 'Template', rows, widths: [14, 20, 12] }, { name: 'Guide', rows: [['column', 'meaning']] }]);
  const back = await readTable(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'xlsx');
  assert.deepEqual(back, rows);
});
