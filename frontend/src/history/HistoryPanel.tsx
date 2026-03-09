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
  if (!Number.isFinite(n)) return '—'
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
  })

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, minHeight: 240 }}>
      <EditorContent editor={editor} />
    </div>
  )
}

export function HistoryPanel(props: { docId: string; refreshKey: number }) {
  const [rows, setRows] = useState<SnapshotRow[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<SnapshotRow | null>(null)
  const [openData, setOpenData] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const res = await fetch(`http://localhost:8000/api/docs/${encodeURIComponent(props.docId)}/history`)
        const json = (await res.json()) as SnapshotRow[]
        if (!cancelled) setRows(Array.isArray(json) ? json : [])
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
      const res = await fetch(
        `http://localhost:8000/api/docs/${encodeURIComponent(props.docId)}/snapshot/${encodeURIComponent(open.id)}`,
      )
      const json = (await res.json()) as SnapshotRow
      if (cancelled) return
      setOpenData(typeof json?.data === 'string' ? json.data : null)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [open, props.docId])

  return (
    <div style={{ width: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: '0 0 6px 0' }}>History</h3>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{loading ? 'Loading…' : `${rows.length} snapshots`}</div>
      </div>
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 8 }}>
        {rows.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13, padding: 8 }}>No snapshots yet. Click “Save snapshot”.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpen(r)}
                style={{
                  textAlign: 'left',
                  border: '1px solid #f3f4f6',
                  background: 'white',
                  borderRadius: 10,
                  padding: 10,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{formatTs(r.ts)}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>id: {r.id}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setOpen(null)}
        >
          <div
            style={{ background: 'white', borderRadius: 12, padding: 16, width: 900, maxWidth: '95vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Snapshot preview</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{formatTs(open.ts)}</div>
              </div>
              <button
                onClick={() => setOpen(null)}
                style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'white' }}
              >
                Close
              </button>
            </div>

            {openData ? (
              <SnapshotPreview snapshotB64={openData} />
            ) : (
              <div style={{ color: '#6b7280', fontSize: 13 }}>Loading snapshot…</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

