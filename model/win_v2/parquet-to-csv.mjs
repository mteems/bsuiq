// usage: node tocsv.mjs in.parquet out.csv [col1,col2,...]
import { parquetReadObjects } from "hyparquet";
import { readFileSync, writeFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";
const [inp, out, cols] = process.argv.slice(2);
const b = readFileSync(inp); const file = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const columns = cols ? cols.split(",") : undefined;
const rows = await parquetReadObjects({ file, columns, compressors: { ZSTD: (input) => new Uint8Array(zstdDecompressSync(input)) } });
const keys = columns || Object.keys(rows[0]);
const q = (v) => { if (v == null) return ""; if (typeof v === "bigint") return v.toString(); if (v instanceof Date) return v.toISOString().slice(0, 10); const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const lines = [keys.join(",")]; for (const r of rows) lines.push(keys.map((k) => q(r[k])).join(","));
writeFileSync(out, lines.join("\n")); console.log(out, rows.length);
