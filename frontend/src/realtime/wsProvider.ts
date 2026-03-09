import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness'

type UserInfo = { name: string; color: string }

type WsMessage =
  | { type: 'sync_init'; snapshot: string | null; updates: string[] }
  | { type: 'y_update'; clientId?: number; data: string }
  | { type: 'awareness'; clientId?: number; data: string }
  | { type: 'snapshot_saved' }

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export class WsYjsProvider {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  readonly docId: string
  readonly url: string
  readonly user: UserInfo

  private ws: WebSocket | null = null
  private connected = false
  private applyingRemote = false
  private snapshotSavedHandlers = new Set<() => void>()
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null

  constructor(opts: { url: string; docId: string; doc: Y.Doc; awareness: Awareness; user: UserInfo }) {
    this.url = opts.url
    this.docId = opts.docId
    this.doc = opts.doc
    this.awareness = opts.awareness
    this.user = opts.user
  }

  connect() {
    if (this.ws) return

    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {
      this.connected = true
      this.reconnectAttempt = 0
      this.send({
        type: 'hello',
        clientId: this.doc.clientID,
        user: this.user,
      })
      // Emit initial awareness state
      this.awareness.setLocalStateField('user', this.user)
    }

    this.ws.onmessage = (ev) => {
      const parsed = safeJsonParse<WsMessage>(ev.data)
      if (!parsed) return
      this.onMessage(parsed)
    }

    this.ws.onclose = () => {
      this.connected = false
      this.ws = null
      this.scheduleReconnect()
    }

    this.doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
  }

  disconnect() {
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.connected = false
  }

  requestSnapshot() {
    const full = Y.encodeStateAsUpdate(this.doc)
    this.send({ type: 'snapshot', data: toBase64(full) })
  }

  onSnapshotSaved(handler: () => void) {
    this.snapshotSavedHandlers.add(handler)
    return () => this.snapshotSavedHandlers.delete(handler)
  }

  private onMessage(msg: WsMessage) {
    if (msg.type === 'sync_init') {
      this.applyingRemote = true
      try {
        if (msg.snapshot) {
          Y.applyUpdate(this.doc, fromBase64(msg.snapshot), 'remote')
        }
        for (const u of msg.updates || []) {
          Y.applyUpdate(this.doc, fromBase64(u), 'remote')
        }
      } finally {
        this.applyingRemote = false
      }
      return
    }

    if (msg.type === 'y_update') {
      this.applyingRemote = true
      try {
        Y.applyUpdate(this.doc, fromBase64(msg.data), 'remote')
      } finally {
        this.applyingRemote = false
      }
      return
    }

    if (msg.type === 'awareness') {
      applyAwarenessUpdate(this.awareness, fromBase64(msg.data), 'remote')
      return
    }

    if (msg.type === 'snapshot_saved') {
      for (const h of this.snapshotSavedHandlers) h()
      return
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (!this.connected) return
    if (origin === 'remote') return
    if (this.applyingRemote) return
    this.send({ type: 'y_update', clientId: this.doc.clientID, data: toBase64(update) })
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (!this.connected) return
    if (origin === 'remote') return
    const changed = added.concat(updated).concat(removed)
    const update = encodeAwarenessUpdate(this.awareness, changed)
    this.send({ type: 'awareness', clientId: this.doc.clientID, data: toBase64(update) })
  }

  private send(obj: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(obj))
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return
    const attempt = this.reconnectAttempt++
    const delay = Math.min(10_000, 250 * Math.pow(2, attempt))
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      if (this.ws) return
      this.connect()
    }, delay)
  }
}

function safeJsonParse<T>(data: any): T | null {
  try {
    return JSON.parse(data) as T
  } catch {
    return null
  }
}

