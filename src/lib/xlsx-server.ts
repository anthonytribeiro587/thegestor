import { inflateRawSync } from "node:zlib";

type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function u16(buffer: Buffer, offset: number) {
  return buffer.readUInt16LE(offset);
}

function u32(buffer: Buffer, offset: number) {
  return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const min = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (u32(buffer, offset) === 0x06054b50) return offset;
  }
  throw new Error("Arquivo XLSX inválido: diretório ZIP não encontrado.");
}

function listZipEntries(buffer: Buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const directoryOffset = u32(buffer, eocd + 16);
  const entryCount = u16(buffer, eocd + 10);
  const entries = new Map<string, ZipEntry>();
  let offset = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (u32(buffer, offset) !== 0x02014b50) throw new Error("Arquivo XLSX inválido: entrada ZIP corrompida.");
    const compression = u16(buffer, offset + 10);
    const compressedSize = u32(buffer, offset + 20);
    const fileNameLength = u16(buffer, offset + 28);
    const extraLength = u16(buffer, offset + 30);
    const commentLength = u16(buffer, offset + 32);
    const localHeaderOffset = u32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    entries.set(name, { name, compression, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset;
  if (u32(buffer, offset) !== 0x04034b50) throw new Error(`Arquivo XLSX inválido: cabeçalho ausente em ${entry.name}.`);
  const fileNameLength = u16(buffer, offset + 26);
  const extraLength = u16(buffer, offset + 28);
  const start = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);

  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return inflateRawSync(compressed);
  throw new Error(`Compressão XLSX não suportada (${entry.compression}).`);
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textNodes(xml: string) {
  const values: string[] = [];
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) values.push(decodeXml(match[1]));
  return values.join("");
}

export function parseSharedStringsXml(xml: string) {
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) strings.push(textNodes(match[1]));
  return strings;
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function attribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
}

function parseCell(attributes: string, body: string, sharedStrings: string[]) {
  const type = attribute(attributes, "t");
  if (type === "inlineStr") return textNodes(body);

  const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
  if (raw == null) return null;
  const value = decodeXml(raw);

  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1";
  if (type === "str") return value;

  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

export function parseWorksheetXml(xml: string, sharedStrings: string[] = []) {
  const rows: Array<Array<string | number | boolean | null>> = [];

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Array<string | number | boolean | null> = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = attribute(cellMatch[1], "r") ?? "A1";
      const index = columnIndex(ref);
      while (row.length <= index) row.push(null);
      row[index] = parseCell(cellMatch[1], cellMatch[2], sharedStrings);
    }
    rows.push(row);
  }

  return rows;
}

export function readFirstWorksheetFromXlsx(buffer: Buffer) {
  const entries = listZipEntries(buffer);
  const sheet = entries.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("A primeira planilha do arquivo XLSX não foi encontrada.");

  const sharedEntry = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedEntry ? parseSharedStringsXml(readZipEntry(buffer, sharedEntry).toString("utf8")) : [];
  const sheetXml = readZipEntry(buffer, sheet).toString("utf8");
  return parseWorksheetXml(sheetXml, sharedStrings);
}
