import { useEffect, useMemo, useState } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { EditorContent, useEditor } from '@tiptap/react'
import * as Y from 'yjs'

type SnapshotRow = {
  id: string
  ts?: string
  version?: string
  data?: string
}

function formatTs(ts?: string) {
  const n = ts ? Number(ts) : NaN
  if (!Number.isFinite(n)) return 'No date'
  return new Date(n).toLocaleString()
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function SnapshotPreview(props: { snapshotB64: string }) {
  const ydoc = useMemo(() => {
    const d = new Y.Doc()
    Y.applyUpdate(d, fromBase64(props.snapshotB64))
    return d
  }, [props.snapshotB64])

  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
    ],
    editorProps: {
      attributes: {
        class: 'editor-content snapshot-content',
      },
    },
  })

  return (
    <div className="snapshot-preview">
      <EditorContent editor={editor} />
    </div>
  )
}

export function HistoryPanel(props: { docId: string; refreshKey: number }) {
  const [rows, setRows] = useState<SnapshotRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<SnapshotRow | null>(null)
  const [openData, setOpenData] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`http://localhost:8000/api/docs/${encodeURIComponent(props.docId)}/history`)
        if (!res.ok) throw new Error('History unavailable')
        const json = (await res.json()) as SnapshotRow[]
        if (!cancelled) setRows(Array.isArray(json) ? json : [])
      } catch {
        if (!cancelled) {
          setRows([])
          setError('History is unavailable while the backend is offline.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [props.docId, props.refreshKey])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!open) return
      setOpenData(null)
      try {
        const res = await fetch(
          `http://localhost:8000/api/docs/${encodeURIComponent(props.docId)}/snapshot/${encodeURIComponent(open.id)}`,
        )
        if (!res.ok) return
        const json = (await res.json()) as SnapshotRow
        if (cancelled) return
        setOpenData(typeof json?.data === 'string' ? json.data : null)
      } catch {
        if (!cancelled) setOpenData(null)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [open, props.docId])

  return (
    <aside className="history-panel">
      <div className="section-heading">
        <h2>History</h2>
        <span>{loading ? 'Loading' : rows.length}</span>
      </div>

      <div className="history-list">
        {error ? (
          <div className="empty-history">
            <strong>History offline</strong>
            <span>{error}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-history">
            <strong>No snapshots yet</strong>
            <span>Save one when the document reaches a useful point.</span>
          </div>
        ) : (
          <div className="snapshot-list">
            {rows.map((row) => (
              <button key={row.id} type="button" className="snapshot-row" onClick={() => setOpen(row)}>
                <strong>{formatTs(row.ts)}</strong>
                <span>{row.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div role="dialog" aria-modal="true" className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="snapshot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <strong>Snapshot preview</strong>
                <span>{formatTs(open.ts)}</span>
              </div>
              <button type="button" className="ghost-button" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>

            {openData ? (
              <SnapshotPreview snapshotB64={openData} />
            ) : (
              <div className="loading-snapshot">Loading snapshot...</div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
