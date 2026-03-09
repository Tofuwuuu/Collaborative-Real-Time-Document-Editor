import { useMemo, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'

import { DocEditor } from './editor/DocEditor'
import { WsYjsProvider } from './realtime/wsProvider'
import { HistoryPanel } from './history/HistoryPanel'

function randomColor() {
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7']
  return colors[Math.floor(Math.random() * colors.length)]
}

function Home() {
  const nav = useNavigate()
  const [docId, setDocId] = useState('')

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Collaborative Real-Time Document Editor</h2>
      <p style={{ marginTop: 0, color: '#6b7280' }}>Create or join a document by ID.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          placeholder="e.g. team-notes"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb' }}
        />
        <button
          onClick={() => nav(`/docs/${encodeURIComponent(docId || crypto.randomUUID())}`)}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #111827',
            background: '#111827',
            color: 'white',
          }}
        >
          Open
        </button>
      </div>
    </div>
  )
}

function DocPage() {
  const { docId = 'default' } = useParams()
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  const user = useMemo(() => {
    const stored = localStorage.getItem('crde_user')
    if (stored) return JSON.parse(stored) as { name: string; color: string }
    const next = { name: `User_${Math.floor(Math.random() * 10000)}`, color: randomColor() }
    localStorage.setItem('crde_user', JSON.stringify(next))
    return next
  }, [])

  const ydoc = useMemo(() => new Y.Doc(), [docId])
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])

  const provider = useMemo(() => {
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${wsProto}://localhost:8000/ws/docs/${encodeURIComponent(docId)}`
    return new WsYjsProvider({ url, docId, doc: ydoc, awareness, user })
  }, [docId, ydoc, awareness, user])

  useMemo(() => {
    provider.connect()
    const off = provider.onSnapshotSaved(() => setHistoryRefreshKey((x) => x + 1))
    return () => {
      off()
      provider.disconnect()
    }
  }, [provider])

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <Link to="/" style={{ color: '#3b82f6', textDecoration: 'none' }}>
            ← Home
          </Link>
          <h2 style={{ margin: '8px 0 0 0' }}>Doc: {docId}</h2>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Signed in as <strong>{user.name}</strong>
          </div>
        </div>
        <button
          onClick={() => provider.requestSnapshot()}
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'white' }}
        >
          Save snapshot
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <DocEditor ydoc={ydoc} awareness={awareness} user={user} />
        </div>
        <HistoryPanel docId={docId} refreshKey={historyRefreshKey} />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs/:docId" element={<DocPage />} />
      </Routes>
    </BrowserRouter>
  )
}
