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

type OutboundWsMessage =
  | { type: 'hello'; clientId: number; user: UserInfo }
  | { type: 'snapshot'; data: string }
  | { type: 'y_update'; clientId: number; data: string }
  | { type: 'awareness'; clientId: number; data: string }

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

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
  private statusHandlers = new Set<(status: ConnectionStatus) => void>()
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private status: ConnectionStatus = 'offline'
  private closedByUser = false
  private subscribed = false

  constructor(opts: { url: string; docId: string; doc: Y.Doc; awareness: Awareness; user: UserInfo }) {
    this.url = opts.url
    this.docId = opts.docId
    this.doc = opts.doc
    this.awareness = opts.awareness
    this.user = opts.user
  }

  connect() {
    if (this.ws) return

    this.closedByUser = false
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
    const socket = new WebSocket(this.url)
    this.ws = socket

    socket.onopen = () => {
      if (this.ws !== socket) return
      this.connected = true
      this.reconnectAttempt = 0
      this.setStatus('connected')
      this.send({
        type: 'hello',
        clientId: this.doc.clientID,
        user: this.user,
      })
      // Emit initial awareness state
      this.awareness.setLocalStateField('user', this.user)
    }

    socket.onmessage = (ev) => {
      if (this.ws !== socket) return
      const parsed = safeJsonParse<WsMessage>(ev.data)
      if (!parsed) return
      this.onMessage(parsed)
    }

    socket.onclose = () => {
      if (this.ws !== socket && !this.closedByUser) return
      this.connected = false
      if (this.ws === socket) this.ws = null
      if (this.closedByUser) {
        this.setStatus('offline')
        return
      }
      this.setStatus(this.reconnectTimer == null ? 'reconnecting' : this.status)
      this.scheduleReconnect()
    }

    socket.onerror = () => {
      if (this.ws !== socket) return
      this.setStatus('reconnecting')
    }

    if (!this.subscribed) {
      this.doc.on('update', this.onDocUpdate)
      this.awareness.on('update', this.onAwarenessUpdate)
      this.subscribed = true
    }
  }

  disconnect() {
    if (this.subscribed) {
      this.doc.off('update', this.onDocUpdate)
      this.awareness.off('update', this.onAwarenessUpdate)
      this.subscribed = false
    }
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.closedByUser = true
    this.ws?.close()
    this.ws = null
    this.connected = false
    this.setStatus('offline')
  }

  requestSnapshot() {
    const full = Y.encodeStateAsUpdate(this.doc)
    this.send({ type: 'snapshot', data: toBase64(full) })
  }

  onSnapshotSaved(handler: () => void) {
    this.snapshotSavedHandlers.add(handler)
    return () => this.snapshotSavedHandlers.delete(handler)
  }

  onStatusChange(handler: (status: ConnectionStatus) => void) {
    this.statusHandlers.add(handler)
    handler(this.status)
    return () => this.statusHandlers.delete(handler)
  }

  getStatus() {
    return this.status
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

  private send(obj: OutboundWsMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(obj))
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return
    this.status = status
    for (const handler of this.statusHandlers) handler(status)
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

function safeJsonParse<T>(data: unknown): T | null {
  try {
    return JSON.parse(typeof data === 'string' ? data : String(data)) as T
  } catch {
    return null
  }
}
