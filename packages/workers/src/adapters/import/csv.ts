export type CsvRecord = {
  /** 1-based line number the record starts on, for error messages. */
  line: number;
  fields: string[];
};

export type CsvTable = {
  header: string[];
  records: CsvRecord[];
};

/**
 * Minimal RFC 4180 reader: comma-separated, `"`-quoted fields with `""` as an
 * escaped quote, CRLF or LF record breaks, newlines allowed inside quotes. A
 * leading UTF-8 BOM (spreadsheet exports) is ignored, as are blank lines. A
 * quote inside an unquoted field is kept literally; an unterminated quoted
 * field is an error because everything after it would be misread.
 */
export function readCsv(text: string): CsvTable {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];

  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };
  const endRecord = () => {
    endField();
    const blank = fields.length === 1 && fields[0] === '';
    if (!blank) records.push({ line: recordLine, fields });
    fields = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '' && !fieldWasQuoted) {
      inQuotes = true;
      fieldWasQuoted = true;
      field = '';
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else if (fieldWasQuoted && (ch === ' ' || ch === '\t')) {
      // Padding between a closing quote and the next delimiter.
      continue;
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    throw new Error(`CSV: unterminated quoted field starting on line ${recordLine}`);
  }
  if (field !== '' || fieldWasQuoted || fields.length > 0) endRecord();

  const [first, ...rest] = records;
  if (!first) throw new Error('CSV: file is empty (expected a header row)');
  return { header: first.fields, records: rest };
}
