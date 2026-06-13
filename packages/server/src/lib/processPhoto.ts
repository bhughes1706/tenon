import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

export interface PhotoResult {
  photoPath: string  // relative to dataDir: photos/{jobId}/{photoId}.jpg
  thumbPath: string  // relative to dataDir: photos/{jobId}/{photoId}_thumb.webp
  takenAt: string | null
  exifJson: string | null  // JSON: { width, height, format, orientation }
}

export async function processPhoto(
  buffer: Buffer,
  dataDir: string,
  jobId: string,
  photoId: string
): Promise<PhotoResult> {
  const jobDir = path.join(dataDir, 'photos', jobId)
  fs.mkdirSync(jobDir, { recursive: true })

  const photoFile = `${photoId}.jpg`
  const thumbFile = `${photoId}_thumb.webp`
  const absPhoto = path.join(jobDir, photoFile)
  const absThumb = path.join(jobDir, thumbFile)

  // Extract EXIF before any transforms
  const meta = await sharp(buffer).metadata()
  const takenAt = meta.exif ? extractDateTimeOriginal(meta.exif) : null
  const exifJson = JSON.stringify({
    width: meta.width ?? null,
    height: meta.height ?? null,
    format: meta.format ?? null,
    orientation: meta.orientation ?? null,
  })

  // Save original re-encoded as JPEG (strips corrupt headers, normalises orientation)
  await sharp(buffer).rotate().jpeg({ quality: 90 }).toFile(absPhoto)

  // 512px max-dimension WebP thumbnail
  await sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(absThumb)

  return {
    photoPath: path.join('photos', jobId, photoFile),
    thumbPath: path.join('photos', jobId, thumbFile),
    takenAt,
    exifJson,
  }
}

// Parse DateTimeOriginal (EXIF tag 0x9003) from the raw TIFF block that
// sharp.metadata().exif returns. Returns "YYYY-MM-DDTHH:MM:SS" with no
// timezone — EXIF timestamps are camera-local time with no zone info, so
// round-tripping through Date would silently shift by the server's UTC offset.
export function extractDateTimeOriginal(exifBuf: Buffer): string | null {
  try {
    const le = exifBuf[0] === 0x49 // 'I' = little-endian; 'M' = big-endian
    const r16 = (off: number) => le ? exifBuf.readUInt16LE(off) : exifBuf.readUInt16BE(off)
    const r32 = (off: number) => le ? exifBuf.readUInt32LE(off) : exifBuf.readUInt32BE(off)

    // IFD0: find ExifIFD pointer (tag 0x8769)
    const ifd0Off = r32(4)
    const ifd0Count = r16(ifd0Off)
    let exifIFDOff = -1
    for (let i = 0; i < ifd0Count; i++) {
      const e = ifd0Off + 2 + i * 12
      if (r16(e) === 0x8769) { exifIFDOff = r32(e + 8); break }
    }
    if (exifIFDOff < 0) return null

    // ExifIFD: find DateTimeOriginal (tag 0x9003)
    const exifCount = r16(exifIFDOff)
    for (let i = 0; i < exifCount; i++) {
      const e = exifIFDOff + 2 + i * 12
      if (r16(e) === 0x9003) {
        const valOff = r32(e + 8)
        const raw = exifBuf.toString('ascii', valOff, valOff + 19)
        // "YYYY:MM:DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS" (no tz conversion)
        const iso = raw.replace(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/, '$1-$2-$3T$4')
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso) ? iso : null
      }
    }
    return null
  } catch {
    return null
  }
}
