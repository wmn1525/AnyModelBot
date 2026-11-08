import { crc32, deflateRawSync } from "node:zlib";

/** 可构造重名、错误校验和、链接和压缩炸弹的真实 ZIP，不调用系统 unzip。 */
export function skillZip(entries: Array<{ path: string; text?: string; mode?: number; flags?: number; size?: number; crc?: number }>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.path);
    const data = Buffer.from(e.text ?? "");
    const zipped = deflateRawSync(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(e.flags ?? 0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(e.crc ?? crc32(data), 14);
    header.writeUInt32LE(zipped.length, 18);
    header.writeUInt32LE(e.size ?? data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(0x0314, 4);
    header.copy(record, 6, 4, 28);
    record.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    local.push(header, name, zipped);
    central.push(record, name);
    offset += header.length + name.length + zipped.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export const skillMd = (name = "weekly-report", body = "Write the report using references/template.txt.") => `---\nname: ${name}\ndescription: Prepare weekly reports\n---\n${body}\n`;
