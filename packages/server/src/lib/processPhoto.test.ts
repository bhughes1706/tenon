import { describe, it, expect } from 'vitest'
import { extractDateTimeOriginal } from './processPhoto.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a minimal TIFF/EXIF buffer containing a single DateTimeOriginal tag.
// Structure (little-endian):
//   0-1:   byte order ("II")          2-3:   magic 42
//   4-7:   IFD0 offset (8)
//   IFD0 @ 8: 1 entry — ExifIFD pointer (0x8769) pointing to ExifIFD
//   ExifIFD: 1 entry — DateTimeOriginal (0x9003) pointing to ASCII data
//   ASCII: "YYYY:MM:DD HH:MM:SS\0" (20 bytes)
function makeLEExifBuffer(datetime: string): Buffer {
  // datetime must be exactly "YYYY:MM:DD HH:MM:SS" (19 chars)
  const ascii = datetime + '\0' // 20 bytes
  const buf = Buffer.alloc(64, 0)

  // Byte order + magic
  buf.write('II', 0, 'ascii')
  buf.writeUInt16LE(42, 2)
  buf.writeUInt32LE(8, 4) // IFD0 at offset 8

  // IFD0: 1 entry (ExifIFD pointer)
  buf.writeUInt16LE(1, 8)           // entry count
  buf.writeUInt16LE(0x8769, 10)     // tag ExifIFD
  buf.writeUInt16LE(4, 12)          // type LONG
  buf.writeUInt32LE(1, 14)          // count
  buf.writeUInt32LE(26, 18)         // value: ExifIFD at offset 26
  buf.writeUInt32LE(0, 22)          // next IFD offset

  // ExifIFD at 26: 1 entry (DateTimeOriginal)
  buf.writeUInt16LE(1, 26)          // entry count
  buf.writeUInt16LE(0x9003, 28)     // tag DateTimeOriginal
  buf.writeUInt16LE(2, 30)          // type ASCII
  buf.writeUInt32LE(20, 32)         // count (19 chars + null)
  buf.writeUInt32LE(44, 36)         // value: ASCII data at offset 44
  buf.writeUInt32LE(0, 40)          // next IFD offset

  // ASCII data at 44
  buf.write(ascii, 44, 'ascii')

  return buf
}

// Big-endian variant (byte order "MM")
function makeBEExifBuffer(datetime: string): Buffer {
  const ascii = datetime + '\0'
  const buf = Buffer.alloc(64, 0)

  buf.write('MM', 0, 'ascii')
  buf.writeUInt16BE(42, 2)
  buf.writeUInt32BE(8, 4)

  buf.writeUInt16BE(1, 8)
  buf.writeUInt16BE(0x8769, 10)
  buf.writeUInt16BE(4, 12)
  buf.writeUInt32BE(1, 14)
  buf.writeUInt32BE(26, 18)
  buf.writeUInt32BE(0, 22)

  buf.writeUInt16BE(1, 26)
  buf.writeUInt16BE(0x9003, 28)
  buf.writeUInt16BE(2, 30)
  buf.writeUInt32BE(20, 32)
  buf.writeUInt32BE(44, 36)
  buf.writeUInt32BE(0, 40)

  buf.write(ascii, 44, 'ascii')

  return buf
}

// IFD0 with no ExifIFD pointer — should return null
function makeLEExifBufferNoExifIFD(): Buffer {
  const buf = Buffer.alloc(32, 0)
  buf.write('II', 0, 'ascii')
  buf.writeUInt16LE(42, 2)
  buf.writeUInt32LE(8, 4)
  // IFD0 with 1 dummy entry (tag 0x0100 = ImageWidth, not ExifIFD)
  buf.writeUInt16LE(1, 8)
  buf.writeUInt16LE(0x0100, 10)
  buf.writeUInt16LE(4, 12)
  buf.writeUInt32LE(1, 14)
  buf.writeUInt32LE(1024, 18)
  buf.writeUInt32LE(0, 22)
  return buf
}

// ExifIFD present but no DateTimeOriginal tag
function makeLEExifBufferNoDateTag(): Buffer {
  const buf = Buffer.alloc(48, 0)
  buf.write('II', 0, 'ascii')
  buf.writeUInt16LE(42, 2)
  buf.writeUInt32LE(8, 4)

  buf.writeUInt16LE(1, 8)
  buf.writeUInt16LE(0x8769, 10)
  buf.writeUInt16LE(4, 12)
  buf.writeUInt32LE(1, 14)
  buf.writeUInt32LE(26, 18)
  buf.writeUInt32LE(0, 22)

  // ExifIFD with 1 dummy entry (not 0x9003)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(0x9000, 28) // ExifVersion, not DateTimeOriginal
  buf.writeUInt16LE(7, 30)
  buf.writeUInt32LE(4, 32)
  buf.writeUInt32LE(0x30323330, 36) // "0230" inline
  buf.writeUInt32LE(0, 40)

  return buf
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractDateTimeOriginal', () => {
  it('parses a little-endian EXIF buffer', () => {
    const buf = makeLEExifBuffer('2023:05:01 12:30:00')
    expect(extractDateTimeOriginal(buf)).toBe('2023-05-01T12:30:00')
  })

  it('parses a big-endian EXIF buffer', () => {
    const buf = makeBEExifBuffer('2023:05:01 12:30:00')
    expect(extractDateTimeOriginal(buf)).toBe('2023-05-01T12:30:00')
  })

  it('returns naive local time — no Z suffix, no UTC conversion', () => {
    const buf = makeLEExifBuffer('2023:12:31 23:59:59')
    const result = extractDateTimeOriginal(buf)
    expect(result).toBe('2023-12-31T23:59:59')
    expect(result).not.toMatch(/Z$/)
    expect(result).not.toMatch(/[+-]\d{2}:\d{2}$/)
  })

  it('handles midnight (00:00:00)', () => {
    const buf = makeLEExifBuffer('2024:01:01 00:00:00')
    expect(extractDateTimeOriginal(buf)).toBe('2024-01-01T00:00:00')
  })

  it('returns null when there is no ExifIFD pointer in IFD0', () => {
    const buf = makeLEExifBufferNoExifIFD()
    expect(extractDateTimeOriginal(buf)).toBeNull()
  })

  it('returns null when ExifIFD has no DateTimeOriginal tag', () => {
    const buf = makeLEExifBufferNoDateTag()
    expect(extractDateTimeOriginal(buf)).toBeNull()
  })

  it('returns null for an empty buffer (does not throw)', () => {
    expect(extractDateTimeOriginal(Buffer.alloc(0))).toBeNull()
  })

  it('returns null for a truncated buffer (does not throw)', () => {
    expect(extractDateTimeOriginal(Buffer.from([0x49, 0x49, 0x2a, 0x00]))).toBeNull()
  })

  it('returns null when ASCII data does not match the expected format', () => {
    const buf = makeLEExifBuffer('bad value!!!!!!!!!')
    expect(extractDateTimeOriginal(buf)).toBeNull()
  })
})
