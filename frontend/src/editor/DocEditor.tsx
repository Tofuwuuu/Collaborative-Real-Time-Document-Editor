import { useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'

export function DocEditor(props: {
  ydoc: Y.Doc
  awareness: Awareness
  user: { name: string; color: string }
}) {
  const [stats, setStats] = useState({ words: 0, characters: 0 })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: props.ydoc,
      }),
      CollaborationCursor.configure({
        provider: { awareness: props.awareness },
        user: props.user,
      }),
    ],
    autofocus: true,
    editorProps: {
      attributes: {
        class: 'editor-content',
        'aria-label': 'Document body',
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText().trim()
      setStats({
        words: text ? text.split(/\s+/).length : 0,
        characters: editor.getText().length,
      })
    },
  })

  return (
    <div className="editor-card">
      <div className="editor-toolbar" aria-label="Formatting toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className={editor?.isActive('bold') ? 'is-active' : ''}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            aria-label="Bold"
          >
            B
          </button>
          <button
            type="button"
            className={editor?.isActive('italic') ? 'is-active' : ''}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            aria-label="Italic"
          >
            I
          </button>
          <button
            type="button"
            className={editor?.isActive('strike') ? 'is-active' : ''}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            aria-label="Strikethrough"
          >
            S
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className={editor?.isActive('heading', { level: 2 }) ? 'is-active' : ''}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </button>
          <button
            type="button"
            className={editor?.isActive('bulletList') ? 'is-active' : ''}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            List
          </button>
          <button
            type="button"
            className={editor?.isActive('blockquote') ? 'is-active' : ''}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            Quote
          </button>
        </div>

        <div className="toolbar-group">
          <button type="button" onClick={() => editor?.chain().focus().undo().run()} aria-label="Undo">
            Undo
          </button>
          <button type="button" onClick={() => editor?.chain().focus().redo().run()} aria-label="Redo">
            Redo
          </button>
        </div>

        <div className="editor-stats" aria-label="Document statistics">
          {stats.words} words
          <span>{stats.characters} chars</span>
        </div>
      </div>

      <div className="paper">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
