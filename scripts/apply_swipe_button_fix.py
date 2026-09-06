from pathlib import Path

p = Path('src/components/NoteList.tsx')
s = p.read_text()

old = """  const finishNoteSwipe = (noteId: string, e: React.PointerEvent<HTMLDivElement>) => {
    const state = swipeRef.current;
    if (!state || state.noteId !== noteId || state.pointerId !== e.pointerId) return;
    const shouldTrash = state.dragging && state.offset <= -72;
    if (state.dragging) {
      suppressClickRef.current = { noteId, until: Date.now() + 700 };
    }
    swipeRef.current = null;
    setActiveSwipeNoteId(null);
    setSwipeOffsets((prev) => ({ ...prev, [noteId]: shouldTrash ? -116 : 0 }));
    if (shouldTrash) onMoveToTrash(noteId);
  };
"""
new = """  const finishNoteSwipe = (noteId: string, e: React.PointerEvent<HTMLDivElement>) => {
    const state = swipeRef.current;
    if (!state || state.noteId !== noteId || state.pointerId !== e.pointerId) return;
    const shouldRevealTrash = state.dragging && state.offset <= -52;
    if (state.dragging) {
      suppressClickRef.current = { noteId, until: Date.now() + 700 };
    }
    swipeRef.current = null;
    setActiveSwipeNoteId(null);
    // A swipe only reveals the destructive action. It never deletes by itself.
    setSwipeOffsets((prev) => ({ ...prev, [noteId]: shouldRevealTrash ? -116 : 0 }));
  };
"""
if old not in s:
    raise SystemExit('finishNoteSwipe marker not found')
s = s.replace(old, new, 1)

old = """        <div
          className=\"absolute inset-y-0 right-0 w-28 bg-rose-600 text-white flex flex-col items-center justify-center gap-1 select-none\"
          aria-hidden=\"true\"
        >
          <Trash2 className=\"w-5 h-5\" />
          <span className=\"text-sm font-bold\">ゴミ箱</span>
        </div>
"""
new = """        <button
          type=\"button\"
          data-swipe-trash-button={note.id}
          aria-label={`${note.title || '無題のメモ'}をゴミ箱へ移動`}
          onClick={(e) => {
            e.stopPropagation();
            setSwipeOffsets((prev) => ({ ...prev, [note.id]: 0 }));
            onMoveToTrash(note.id);
          }}
          className=\"absolute inset-y-0 right-0 w-28 bg-rose-600 text-white flex flex-col items-center justify-center gap-1 select-none active:bg-rose-700 transition-colors\"
        >
          <Trash2 className=\"w-5 h-5\" />
          <span className=\"text-sm font-bold\">ゴミ箱</span>
        </button>
"""
if old not in s:
    raise SystemExit('trash reveal marker not found')
s = s.replace(old, new, 1)

p.write_text(s)
