import { describe, expect, it } from 'vitest';

import { readCsv } from '../csv.ts';

describe('readCsv', () => {
  it('splits a header and records, trimming unquoted fields', () => {
    const table = readCsv('a, b ,c\n1,2,3\n4 , 5,6\n');
    expect(table.header).toEqual(['a', 'b', 'c']);
    expect(table.records).toEqual([
      { line: 2, fields: ['1', '2', '3'] },
      { line: 3, fields: ['4', '5', '6'] },
    ]);
  });

  it('handles quoted commas, escaped quotes and embedded newlines', () => {
    const table = readCsv('name,note\r\n"Coffee, Dark","say ""hi"""\r\n"two\nlines",x\r\n');
    expect(table.records[0]!.fields).toEqual(['Coffee, Dark', 'say "hi"']);
    expect(table.records[1]!.fields).toEqual(['two\nlines', 'x']);
  });

  it('keeps the starting line number of a record that spans lines', () => {
    const table = readCsv('a,b\n"x\ny",1\nz,2');
    expect(table.records.map((record) => record.line)).toEqual([2, 4]);
  });

  it('ignores a UTF-8 BOM, blank lines and a missing final newline', () => {
    const table = readCsv('﻿a,b\n\n1,2\n\n3,4');
    expect(table.header).toEqual(['a', 'b']);
    expect(table.records.map((record) => record.fields)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps empty fields, including a trailing one', () => {
    expect(readCsv('a,b,c\n1,,\n').records[0]!.fields).toEqual(['1', '', '']);
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => readCsv('a,b\n"open,1\n')).toThrow(/unterminated quoted field starting on line 2/);
  });

  it('rejects an empty file', () => {
    expect(() => readCsv('')).toThrow(/empty/);
  });
});
