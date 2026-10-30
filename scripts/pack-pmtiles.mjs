#!/usr/bin/env node
/**
 * Packs a directory of vips Google-layout WebP tiles (<z>/<y>/<x>.webp)
 * into a single spec-compliant PMTiles v3 archive (.pmtiles).
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

const HEADER_SIZE_BYTES = 127;

function rotate(n, x, y, rx, ry) {
  if (ry === 0) {
    if (rx !== 0) {
      return [n - 1 - y, n - 1 - x];
    }
    return [y, x];
  }
  return [x, y];
}

/**
 * Convert (z, x, y) to PMTiles v3 Hilbert curve TileID.
 */
export function zxyToTileId(z, x, y) {
  if (z > 26) {
    throw new Error('Tile zoom level exceeds max safe number limit (26)');
  }
  if (x >= (1 << z) || y >= (1 << z)) {
    throw new Error(`Tile x/y (${x},${y}) outside zoom level ${z} bounds`);
  }
  let acc = (((1 << z) * (1 << z)) - 1) / 3;
  let a = z - 1;
  let tx = x;
  let ty = y;
  for (let s = 1 << a; s > 0; s >>= 1) {
    const rx = tx & s;
    const ry = ty & s;
    acc += ((3 * rx) ^ ry) * (1 << a);
    [tx, ty] = rotate(s, tx, ty, rx, ry);
    a--;
  }
  return acc;
}

function writeVarint(arr, value) {
  let v = BigInt(value);
  while (v >= 0x80n) {
    arr.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  arr.push(Number(v));
}

function serializeDirectory(entries) {
  const bytes = [];
  writeVarint(bytes, entries.length);

  let lastId = 0;
  for (let i = 0; i < entries.length; i++) {
    const delta = entries[i].tileId - lastId;
    writeVarint(bytes, delta);
    lastId = entries[i].tileId;
  }

  for (let i = 0; i < entries.length; i++) {
    writeVarint(bytes, entries[i].runLength);
  }

  for (let i = 0; i < entries.length; i++) {
    writeVarint(bytes, entries[i].length);
  }

  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].offset === entries[i - 1].offset + entries[i - 1].length) {
      writeVarint(bytes, 0);
    } else {
      writeVarint(bytes, entries[i].offset + 1);
    }
  }

  return Buffer.from(bytes);
}

function setUint64LE(view, byteOffset, value) {
  const big = BigInt(value);
  view.setUint32(byteOffset, Number(big & 0xffffffffn), true);
  view.setUint32(byteOffset + 4, Number(big >> 32n), true);
}

function collectTiles(tilesRootDir) {
  const rawTiles = [];
  let minZoom = Infinity;
  let maxZoom = 0;

  const zDirs = fs.readdirSync(tilesRootDir, { withFileTypes: true });
  for (const zDir of zDirs) {
    if (!zDir.isDirectory() || !/^\d+$/.test(zDir.name)) continue;
    const z = parseInt(zDir.name, 10);
    if (z < minZoom) minZoom = z;
    if (z > maxZoom) maxZoom = z;

    const zPath = path.join(tilesRootDir, zDir.name);
    const yDirs = fs.readdirSync(zPath, { withFileTypes: true });
    for (const yDir of yDirs) {
      if (!yDir.isDirectory() || !/^\d+$/.test(yDir.name)) continue;
      // Note: vips dzsave --layout google outputs <z>/<y>/<x>.webp
      const y = parseInt(yDir.name, 10);
      const yPath = path.join(zPath, yDir.name);
      const xFiles = fs.readdirSync(yPath, { withFileTypes: true });

      for (const xFile of xFiles) {
        if (!xFile.isFile() || !xFile.name.endsWith('.webp')) continue;
        const xStr = xFile.name.slice(0, -5);
        if (!/^\d+$/.test(xStr)) continue;
        const x = parseInt(xStr, 10);

        const filePath = path.join(yPath, xFile.name);
        const tileId = zxyToTileId(z, x, y);
        rawTiles.push({ z, x, y, tileId, filePath });
      }
    }
  }

  if (minZoom === Infinity) {
    minZoom = 0;
  }

  rawTiles.sort((a, b) => a.tileId - b.tileId);
  return { rawTiles, minZoom, maxZoom };
}

function packPmtiles(tilesRootDir, outputPmtilesPath, metadataJsonPath) {
  const { rawTiles, minZoom, maxZoom } = collectTiles(tilesRootDir);
  if (rawTiles.length === 0) {
    throw new Error(`No .webp tiles found in ${tilesRootDir}`);
  }

  let customMeta = {};
  if (metadataJsonPath && fs.existsSync(metadataJsonPath)) {
    customMeta = JSON.parse(fs.readFileSync(metadataJsonPath, 'utf8'));
  }

  // Deduplicate identical tile payloads while maintaining clustered offset order
  const hashToLocation = new Map();
  const dataBuffers = [];
  const entries = [];
  let currentDataOffset = 0;
  let numTileContents = 0;

  for (const tile of rawTiles) {
    const buf = fs.readFileSync(tile.filePath);
    const hash = crypto.createHash('sha1').update(buf).digest('hex');

    let loc = hashToLocation.get(hash);
    if (!loc) {
      loc = { offset: currentDataOffset, length: buf.length };
      hashToLocation.set(hash, loc);
      dataBuffers.push(buf);
      currentDataOffset += buf.length;
      numTileContents++;
    }

    // Merge runLength if contiguous tileId shares identical offset & length
    const prev = entries[entries.length - 1];
    if (
      prev &&
      prev.tileId + prev.runLength === tile.tileId &&
      prev.offset === loc.offset &&
      prev.length === loc.length
    ) {
      prev.runLength += 1;
    } else {
      entries.push({
        tileId: tile.tileId,
        offset: loc.offset,
        length: loc.length,
        runLength: 1
      });
    }
  }

  let compressedRootDir = zlib.gzipSync(serializeDirectory(entries));
  const leafDirBuffers = [];
  let leafDirsLength = 0;

  if (HEADER_SIZE_BYTES + compressedRootDir.length > 16384) {
    const CHUNK_SIZE = 2048;
    const rootEntries = [];
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      const compLeaf = zlib.gzipSync(serializeDirectory(chunk));
      rootEntries.push({
        tileId: chunk[0].tileId,
        offset: leafDirsLength,
        length: compLeaf.length,
        runLength: 0
      });
      leafDirBuffers.push(compLeaf);
      leafDirsLength += compLeaf.length;
    }
    compressedRootDir = zlib.gzipSync(serializeDirectory(rootEntries));
  }

  const pmJsonMetadata = {
    name: path.basename(outputPmtilesPath, '.pmtiles'),
    format: 'webp',
    type: 'baselayer',
    minzoom: String(minZoom),
    maxzoom: String(maxZoom),
    ...customMeta
  };
  const compressedMetadata = zlib.gzipSync(Buffer.from(JSON.stringify(pmJsonMetadata), 'utf8'));

  const rootDirOffset = HEADER_SIZE_BYTES;
  const rootDirLength = compressedRootDir.length;
  const jsonMetadataOffset = rootDirOffset + rootDirLength;
  const jsonMetadataLength = compressedMetadata.length;
  const leafDirsOffset = jsonMetadataOffset + jsonMetadataLength;
  const tileDataOffset = leafDirsOffset + leafDirsLength;
  const tileDataLength = currentDataOffset;

  const headerBuf = Buffer.alloc(HEADER_SIZE_BYTES, 0);
  headerBuf.write('PMTiles', 0, 'ascii');
  const view = new DataView(headerBuf.buffer, headerBuf.byteOffset, headerBuf.byteLength);

  view.setUint8(7, 3); // spec_version = 3
  setUint64LE(view, 8, rootDirOffset);
  setUint64LE(view, 16, rootDirLength);
  setUint64LE(view, 24, jsonMetadataOffset);
  setUint64LE(view, 32, jsonMetadataLength);
  setUint64LE(view, 40, leafDirsOffset);
  setUint64LE(view, 48, leafDirsLength);
  setUint64LE(view, 56, tileDataOffset);
  setUint64LE(view, 64, tileDataLength);
  setUint64LE(view, 72, rawTiles.length); // addressed_tiles_count
  setUint64LE(view, 80, entries.length); // tile_entries_count
  setUint64LE(view, 88, numTileContents); // tile_contents_count

  view.setUint8(96, 1); // clustered = true
  view.setUint8(97, 2); // internal_compression = Gzip (2)
  view.setUint8(98, 1); // tile_compression = None (1)
  view.setUint8(99, 4); // tile_type = WebP (4)
  view.setUint8(100, minZoom);
  view.setUint8(101, maxZoom);

  // Bounds in E7 (-180, -85.0511288, 180, 85.0511288)
  view.setInt32(102, -1800000000, true);
  view.setInt32(106, -850511288, true);
  view.setInt32(110, 1800000000, true);
  view.setInt32(114, 850511288, true);
  view.setUint8(118, minZoom);
  view.setInt32(119, 0, true);
  view.setInt32(123, 0, true);

  fs.mkdirSync(path.dirname(outputPmtilesPath), { recursive: true });
  const fd = fs.openSync(outputPmtilesPath, 'w');
  try {
    fs.writeSync(fd, headerBuf);
    fs.writeSync(fd, compressedRootDir);
    fs.writeSync(fd, compressedMetadata);
    for (const leafBuf of leafDirBuffers) {
      fs.writeSync(fd, leafBuf);
    }
    for (const buf of dataBuffers) {
      fs.writeSync(fd, buf);
    }
  } finally {
    fs.closeSync(fd);
  }

  console.log(
    `Packed ${rawTiles.length} tiles (${numTileContents} unique, ${entries.length} index entries) into ${outputPmtilesPath} (${tileDataOffset + tileDataLength} bytes)`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , tilesRootDir, outputPmtilesPath, metadataJsonPath] = process.argv;
  if (!tilesRootDir || !outputPmtilesPath) {
    console.error('Usage: node pack-pmtiles.mjs <tiles_root_dir> <output.pmtiles> [metadata.json]');
    process.exit(1);
  }
  packPmtiles(tilesRootDir, outputPmtilesPath, metadataJsonPath);
}
