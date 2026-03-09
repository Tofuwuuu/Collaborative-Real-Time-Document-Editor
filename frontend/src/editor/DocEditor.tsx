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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: props.ydoc,
      }),
      CollaborationCursor.configure({
        provider: { awareness: props.awareness } as any,
        user: props.user,
      }),
    ],
    autofocus: true,
  })

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, minHeight: 320 }}>
      <EditorContent editor={editor} />
    </div>
  )
}

