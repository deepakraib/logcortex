import { createReadStream } from 'node:fs'
import { open as fsOpen, readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { Readable } from 'node:stream'

/**
 * Minimal File-like object for parseLogFile() in Node.js.
 */
export class PathFile {
  constructor(filePath) {
    this.path = filePath
    this.name = basename(filePath)
    this._size = null
  }

  async _ensureStat() {
    if (this._size == null) {
      const st = await stat(this.path)
      this._size = st.size
    }
    return this._size
  }

  get size() {
    if (this._size != null) return this._size
    throw new Error('Access PathFile.size after await ensureSize() or arrayBuffer()')
  }

  async ensureSize() {
    await this._ensureStat()
    return this._size
  }

  async arrayBuffer() {
    const buf = await readFile(this.path)
    this._size = buf.byteLength
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }

  stream() {
    const nodeStream = createReadStream(this.path)
    return Readable.toWeb(nodeStream)
  }

  // Mirrors the browser File.slice() API: returns a Blob-like object
  // synchronously; arrayBuffer() is async and reads the byte range on demand.
  slice(start, end) {
    const path = this.path
    const length = Math.max(0, end - start)
    return {
      async arrayBuffer() {
        if (length === 0) return new ArrayBuffer(0)
        const handle = await fsOpen(path, 'r')
        try {
          const buf = Buffer.alloc(length)
          const { bytesRead } = await handle.read(buf, 0, length, start)
          const view = buf.subarray(0, bytesRead)
          return view.buffer.slice(view.byteOffset, view.byteOffset + bytesRead)
        } finally {
          await handle.close()
        }
      },
    }
  }
}

export async function openPathFile(filePath) {
  const file = new PathFile(filePath)
  await file.ensureSize()
  return file
}
