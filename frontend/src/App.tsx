import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'

import './App.css'
import { DocEditor } from './editor/DocEditor'
import { HistoryPanel } from './history/HistoryPanel'
import { WsYjsProvider } from './realtime/wsProvider'
import type { ConnectionStatus } from './realtime/wsProvider'

type UserInfo = { name: string; color: string }
type RecentDoc = { id: string; openedAt: number }
type Participant = UserInfo & { clientId: number }

const RECENTS_KEY = 'crde_recent_docs'
const USER_KEY = 'crde_user'

function randomColor() {
  const colors = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed']
  return colors[Math.floor(Math.random() * colors.length)]
}

function getStoredUser() {
  const stored = localStorage.getItem(USER_KEY)
  if (stored) {
    try {
      return JSON.parse(stored) as UserInfo
    } catch {
      localStorage.removeItem(USER_KEY)
    }
  }

  const next = { name: `User ${Math.floor(Math.random() * 10000)}`, color: randomColor() }
  localStorage.setItem(USER_KEY, JSON.stringify(next))
  return next
}

function getRecentDocs() {
  const stored = localStorage.getItem(RECENTS_KEY)
  if (!stored) return []

  try {
    const parsed = JSON.parse(stored) as RecentDoc[]
    return Array.isArray(parsed) ? parsed.slice(0, 6) : []
  } catch {
    localStorage.removeItem(RECENTS_KEY)
    return []
  }
}

function rememberDoc(docId: string) {
  const next = [{ id: docId, openedAt: Date.now() }, ...getRecentDocs().filter((doc) => doc.id !== docId)].slice(0, 6)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
}

function createDocId() {
  return `doc-${crypto.randomUUID().slice(0, 8)}`
}

function initials(name: string) {
  return name
    .split(/\s|_/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function statusLabel(status: ConnectionStatus) {
  if (status === 'connected') return 'Live'
  if (status === 'connecting') return 'Connecting'
  if (status === 'reconnecting') return 'Reconnecting'
  return 'Offline'
}

function Home() {
  const nav = useNavigate()
  const [docId, setDocId] = useState('')
  const [recents, setRecents] = useState<RecentDoc[]>(() => getRecentDocs())

  function openDoc(id: string) {
    const nextDocId = id.trim() || createDocId()
    rememberDoc(nextDocId)
    setRecents(getRecentDocs())
    nav(`/docs/${encodeURIComponent(nextDocId)}`)
  }

  return (
    <main className="home-shell">
      <section className="home-panel">
        <div className="brand-mark">Co</div>
        <div className="home-copy">
          <p className="eyebrow">Realtime workspace</p>
          <h1>Collaborative Real-Time Document Editor</h1>
          <p className="home-subtitle">Open a shared document and start writing with everyone in the room.</p>
        </div>

        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault()
            openDoc(docId)
          }}
        >
          <label htmlFor="doc-id">Document ID</label>
          <div className="join-row">
            <input
              id="doc-id"
              value={docId}
              onChange={(event) => setDocId(event.target.value)}
              placeholder="team-notes"
              autoComplete="off"
            />
            <button type="submit">Open</button>
          </div>
        </form>

        <button className="secondary-action" type="button" onClick={() => openDoc(createDocId())}>
          Start a new document
        </button>

        {recents.length > 0 && (
          <section className="recent-list" aria-label="Recent documents">
            <div className="section-heading">
              <h2>Recent documents</h2>
              <span>{recents.length}</span>
            </div>
            <div className="recent-grid">
              {recents.map((doc) => (
                <button key={doc.id} type="button" className="recent-card" onClick={() => openDoc(doc.id)}>
                  <span>{doc.id}</span>
                  <small>{new Date(doc.openedAt).toLocaleDateString()}</small>
                </button>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

function DocPage() {
  const { docId = 'default' } = useParams()
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [snapshotState, setSnapshotState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [copied, setCopied] = useState(false)

  const user = useMemo(() => getStoredUser(), [])
  const ydoc = useMemo(() => new Y.Doc({ guid: docId }), [docId])
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])

  const provider = useMemo(() => {
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${wsProto}://localhost:8000/ws/docs/${encodeURIComponent(docId)}`
    return new WsYjsProvider({ url, docId, doc: ydoc, awareness, user })
  }, [docId, ydoc, awareness, user])

  useEffect(() => {
    rememberDoc(docId)
  }, [docId])

  useEffect(() => {
    provider.connect()
    const offSnapshot = provider.onSnapshotSaved(() => {
      setHistoryRefreshKey((x) => x + 1)
      setSnapshotState('saved')
      window.setTimeout(() => setSnapshotState('idle'), 1600)
    })
    const offStatus = provider.onStatusChange(setConnectionStatus)

    return () => {
      offSnapshot()
      offStatus()
      provider.disconnect()
    }
  }, [provider])

  useEffect(() => {
    function updateParticipants() {
      const seen = new Map<number, Participant>()
      awareness.getStates().forEach((state, clientId) => {
        const stateUser = state.user as UserInfo | undefined
        if (stateUser) seen.set(clientId, { ...stateUser, clientId })
      })
      if (!seen.has(ydoc.clientID)) seen.set(ydoc.clientID, { ...user, clientId: ydoc.clientID })
      setParticipants(Array.from(seen.values()))
    }

    updateParticipants()
    awareness.on('change', updateParticipants)
    return () => awareness.off('change', updateParticipants)
  }, [awareness, user, ydoc])

  function saveSnapshot() {
    setSnapshotState('saving')
    provider.requestSnapshot()
  }

  async function copyInviteLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <main className="editor-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="back-link">
            Back
          </Link>
          <div>
            <p className="eyebrow">Document</p>
            <h1>{docId}</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <div className={`connection-pill ${connectionStatus}`}>
            <span />
            {statusLabel(connectionStatus)}
          </div>
          <button className="ghost-button" type="button" onClick={copyInviteLink}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button className="primary-button" type="button" onClick={saveSnapshot}>
            {snapshotState === 'saving' ? 'Saving...' : snapshotState === 'saved' ? 'Saved' : 'Save snapshot'}
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="presence-panel">
          <div className="section-heading">
            <h2>People</h2>
            <span>{participants.length}</span>
          </div>
          <div className="participant-list">
            {participants.map((participant) => (
              <div key={participant.clientId} className="participant-row">
                <div className="avatar" style={{ backgroundColor: participant.color }}>
                  {initials(participant.name)}
                </div>
                <div>
                  <strong>{participant.name}</strong>
                  <small>{participant.clientId === ydoc.clientID ? 'You' : 'Editing now'}</small>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="document-stage" aria-label="Document editor">
          <DocEditor ydoc={ydoc} awareness={awareness} user={user} />
        </section>

        <HistoryPanel docId={docId} refreshKey={historyRefreshKey} />
      </section>
    </main>
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
