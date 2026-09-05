from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing expected snippet: {label}")
    return text.replace(old, new, 1)


def add_classes_after_id(text: str, element_id: str, classes: str) -> str:
    marker = f'id="{element_id}"'
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit(f"Missing id {element_id}")
    class_marker = 'className="'
    cidx = text.find(class_marker, idx)
    if cidx < 0:
        raise SystemExit(f"Missing className after {element_id}")
    start = cidx + len(class_marker)
    end = text.find('"', start)
    current = text[start:end]
    for cls in classes.split():
        if cls not in current.split():
            current = f"{cls} {current}"
    return text[:start] + current + text[end:]


# 1) Shared safe-area variables and reusable mobile ergonomics.
path = 'src/index.css'
s = read(path)
s = replace_once(
    s,
    '  :root {\n    --ios-bg-grouped:',
    '  :root {\n    --safe-area-top: env(safe-area-inset-top, 0px);\n    --safe-area-right: env(safe-area-inset-right, 0px);\n    --safe-area-bottom: env(safe-area-inset-bottom, 0px);\n    --safe-area-left: env(safe-area-inset-left, 0px);\n    --ios-bg-grouped:',
    'safe-area CSS variables',
)
s = s.replace('padding-top: max(env(safe-area-inset-top), 12px);', 'padding-top: max(var(--safe-area-top), 12px);')
s = s.replace('padding-bottom: max(env(safe-area-inset-bottom), 16px);', 'padding-bottom: max(var(--safe-area-bottom), 16px);')
s = s.replace('padding-top: max(env(safe-area-inset-top), 16px);', 'padding-top: max(var(--safe-area-top), 16px);')
anchor = '/* Custom scrollbar for clean minimal iOS feel */'
safe_block = '''/* Safe-area-aware layout for real iPhones, including Home Screen/PWA mode. */
.home-mobile-header {
  padding-top: max(var(--safe-area-top), 16px);
  padding-left: max(var(--safe-area-left), 16px);
  padding-right: max(var(--safe-area-right), 16px);
}

.safe-horizontal {
  padding-left: max(var(--safe-area-left), 16px);
  padding-right: max(var(--safe-area-right), 16px);
}

.modal-safe-backdrop {
  padding-top: max(var(--safe-area-top), 16px);
  padding-right: max(var(--safe-area-right), 16px);
  padding-bottom: max(var(--safe-area-bottom), 16px);
  padding-left: max(var(--safe-area-left), 16px);
}

.attachment-mobile-header {
  padding-top: max(var(--safe-area-top), 12px);
  padding-left: max(var(--safe-area-left), 16px);
  padding-right: max(var(--safe-area-right), 16px);
}

.attachment-safe-content {
  padding-right: max(var(--safe-area-right), 16px);
  padding-bottom: max(var(--safe-area-bottom), 16px);
  padding-left: max(var(--safe-area-left), 16px);
}

.in-app-alert-safe {
  top: max(var(--safe-area-top), 16px);
}

'''
if safe_block not in s:
    s = replace_once(s, anchor, safe_block + anchor, 'safe-area utility insertion')
# Make editor header respect left/right notches too.
s = replace_once(
    s,
    '.editor-mobile-header {\n  padding-top: max(var(--safe-area-top), 16px);\n}',
    '.editor-mobile-header {\n  padding-top: max(var(--safe-area-top), 16px);\n  padding-left: max(var(--safe-area-left), 12px);\n  padding-right: max(var(--safe-area-right), 12px);\n}',
    'editor safe horizontal',
)
# Mobile Safari zoom prevention must also work in landscape, where width exceeds 639px.
coarse = '''
@media (hover: none) and (pointer: coarse) {
  input:not([type="checkbox"]):not([type="file"]):not([type="hidden"]),
  textarea,
  select {
    font-size: 16px !important;
  }

  #note-content-textarea {
    font-size: 16px !important;
  }
}
'''
if coarse not in s:
    s += coarse
write(path, s)

# 2) Home: real safe area, 44px controls, horizontal notch protection.
path = 'src/components/NoteList.tsx'
s = read(path)
s = replace_once(
    s,
    'className="pt-3 px-4 pb-2 bg-[#f2f2f7]/80 dark:bg-[#000000]/80 backdrop-blur-md sticky top-0 z-20"',
    'className="home-mobile-header px-4 pb-2 bg-[#f2f2f7]/80 dark:bg-[#000000]/80 backdrop-blur-md sticky top-0 z-20"',
    'home header safe area',
)
for eid in ['reminders-header-btn', 'cloudflare-header-btn', 'theme-toggle-btn']:
    s = add_classes_after_id(s, eid, 'min-w-11 min-h-11 inline-flex items-center justify-center')
s = add_classes_after_id(s, 'notes-search-input', 'min-h-11')
s = replace_once(
    s,
    'className="absolute right-2.5 p-0.5 rounded-full bg-neutral-400 dark:bg-neutral-600 text-white"',
    'className="absolute right-0 top-1/2 -translate-y-1/2 min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl text-neutral-400 dark:text-neutral-500"',
    'search clear touch target',
)
s = s.replace('className={`px-3 py-1 rounded-full', 'className={`min-h-11 px-3 py-1 rounded-full')
s = replace_once(
    s,
    'className="flex-1 overflow-y-auto px-4 py-2 pb-safe space-y-4"',
    'className="safe-horizontal flex-1 overflow-y-auto px-4 py-2 pb-safe space-y-4"',
    'home list safe horizontal',
)
s = replace_once(
    s,
    'className="mt-4 px-4 py-2 rounded-full bg-amber-500 text-black text-xs font-semibold shadow-xs hover:bg-amber-400 transition-colors"',
    'className="mt-4 min-h-11 px-4 py-2 rounded-full bg-amber-500 text-black text-sm font-semibold shadow-xs hover:bg-amber-400 transition-colors"',
    'empty state create target',
)
write(path, s)

# 3) App shell: dynamic viewport and status-bar-safe notification banner.
path = 'src/App.tsx'
s = read(path)
s = replace_once(
    s,
    'className="min-h-screen w-full bg-neutral-200 dark:bg-neutral-950 flex flex-col items-center justify-center relative font-sans transition-colors duration-200"',
    'className="min-h-[100dvh] w-full bg-neutral-200 dark:bg-neutral-950 flex flex-col items-center justify-center relative font-sans transition-colors duration-200"',
    'dynamic app viewport',
)
s = replace_once(
    s,
    'className="fixed top-4 z-50 max-w-md w-[92%] bg-neutral-900/95 dark:bg-[#1c1c1e]/95 text-white p-3.5 rounded-2xl',
    'className="fixed in-app-alert-safe z-50 max-w-md w-[92%] bg-neutral-900/95 dark:bg-[#1c1c1e]/95 text-white p-3.5 rounded-2xl',
    'toast safe top',
)
s = replace_once(
    s,
    'className="p-1 rounded-full text-neutral-400 hover:text-white"',
    'className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-full text-neutral-400 hover:text-white"',
    'toast close touch target',
)
write(path, s)

# 4) Editor: safe horizontal content, landscape form, safer/friendlier touch targets.
path = 'src/components/NoteEditor.tsx'
s = read(path)
s = replace_once(
    s,
    '  const handleDeleteAttachment = (attId: string) => {\n    onUpdateNote({',
    "  const handleDeleteAttachment = (attId: string) => {\n    if (!confirm('この添付ファイルを削除しますか？')) return;\n    onUpdateNote({",
    'attachment deletion confirmation',
)
s = replace_once(
    s,
    'className="px-4 sm:px-6 py-1.5 flex items-center gap-2 border-b',
    'className="safe-horizontal px-4 sm:px-6 py-1.5 flex items-center gap-2 border-b',
    'save status safe horizontal',
)
s = replace_once(
    s,
    'className="px-4 py-3 bg-amber-50/70 dark:bg-amber-950/30 border-b',
    'className="safe-horizontal px-4 py-3 bg-amber-50/70 dark:bg-amber-950/30 border-b',
    'reminder drawer safe horizontal',
)
s = replace_once(
    s,
    'className="editor-scroll-content flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4"',
    'className="editor-scroll-content safe-horizontal flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4"',
    'editor body safe horizontal',
)
# Reminder drawer controls.
s = replace_once(s, 'className="text-neutral-500 hover:text-rose-500"', 'className="min-h-11 px-2 inline-flex items-center text-neutral-500 hover:text-rose-500"', 'reminder clear target')
s = replace_once(s, 'className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"', 'className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"', 'reminder close target')
# Task completion and More controls.
s = replace_once(
    s,
    '<button\n                      type="button"\n                      onClick={() => handleToggleTask(task.id)}\n                      className="text-neutral-400 hover:text-amber-500 transition-colors shrink-0"',
    '<button\n                      type="button"\n                      data-testid="task-toggle-complete-btn"\n                      aria-label={`${task.text} を${task.completed ? \'未完了\' : \'完了\'}にする`}\n                      onClick={() => handleToggleTask(task.id)}\n                      className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-amber-500 transition-colors shrink-0"',
    'task completion touch target',
)
s = replace_once(
    s,
    'id={`task-more-btn-${task.id}`}\n                        type="button"',
    'id={`task-more-btn-${task.id}`}\n                        data-testid="task-more-btn"\n                        type="button"',
    'task more test id',
)
s = replace_once(
    s,
    'className="text-[11px] bg-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 outline-none w-28 cursor-pointer"',
    'className="min-h-11 text-[11px] bg-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 outline-none w-28 cursor-pointer"',
    'task date touch target',
)
# Keep the add-task form stacked on phones even in landscape.
s = s.replace('className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1"', 'className="flex flex-col lg:flex-row lg:items-center gap-2 pt-1"')
s = s.replace('className="w-full sm:flex-1 min-h-11 text-base sm:text-xs', 'className="w-full lg:flex-1 min-h-11 text-base lg:text-xs')
s = s.replace('className="flex items-center gap-2 w-full sm:w-auto"', 'className="flex items-center gap-2 w-full lg:w-auto"')
s = s.replace('className="flex-1 sm:flex-none sm:w-44 min-h-11 text-base sm:text-xs', 'className="flex-1 lg:flex-none lg:w-44 min-h-11 text-base lg:text-xs')
s = s.replace('text-sm sm:text-xs font-semibold rounded-xl transition-colors"', 'text-sm lg:text-xs font-semibold rounded-xl transition-colors"', 1)
# Add-tag temporary controls should also be easy to hit.
s = replace_once(s, 'className="text-xs px-2 py-0.5 rounded-full bg-white dark:bg-neutral-800 border border-amber-500 outline-none w-24"', 'className="min-h-11 text-base sm:text-xs px-2 py-1 rounded-xl bg-white dark:bg-neutral-800 border border-amber-500 outline-none w-28"', 'tag input touch target')
s = replace_once(s, 'className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-black font-semibold"', 'className="min-h-11 px-3 py-1 rounded-xl bg-amber-500 text-black text-sm font-semibold"', 'tag add touch target')
# Attachment action buttons are destructive/open actions: 44px minimum.
s = s.replace('className="p-1.5 text-neutral-400 hover:text-amber-500 rounded-lg transition-colors"', 'className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-amber-500 rounded-lg transition-colors"')
s = s.replace('className="p-1.5 text-neutral-400 hover:text-rose-500 rounded-lg transition-colors"', 'className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-rose-500 rounded-lg transition-colors"')
write(path, s)

# 5) Cloudflare modal: safe-area-contained dialog and larger common controls.
path = 'src/components/CloudflareModal.tsx'
s = read(path)
s = replace_once(
    s,
    'className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60',
    'className="modal-safe-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60',
    'cloud modal safe backdrop',
)
s = s.replace('max-h-[90vh]', 'max-h-full', 1)
for eid in ['close-cloudflare-modal-btn', 'cf-copy-sync-code-btn']:
    s = add_classes_after_id(s, eid, 'min-w-11 min-h-11 inline-flex items-center justify-center')
for eid in ['cf-sync-code-input', 'cf-worker-url-input', 'cf-save-btn', 'cf-sync-now-btn']:
    s = add_classes_after_id(s, eid, 'min-h-11')
s = replace_once(
    s,
    'className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400"',
    'className="absolute right-0 top-1/2 -translate-y-1/2 min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400"',
    'sync code visibility touch target',
)
s = replace_once(
    s,
    'className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline"',
    'className="min-h-11 px-2 -my-2 inline-flex items-center text-[11px] text-amber-600 dark:text-amber-400 hover:underline"',
    'generate code touch target',
)
s = replace_once(s, 'className="w-4 h-4 rounded accent-amber-500"', 'className="w-6 h-6 rounded accent-amber-500"', 'auto sync checkbox size')
s = replace_once(s, 'className="flex items-center justify-between pt-1"', 'className="min-h-11 flex items-center justify-between gap-3 pt-1"', 'auto sync row target')
s = s.replace('className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs rounded-xl', 'className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs rounded-xl')
write(path, s)

# 6) Reminders modal: safe-area dialog and usable touch targets.
path = 'src/components/RemindersModal.tsx'
s = read(path)
s = replace_once(
    s,
    'className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60',
    'className="modal-safe-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60',
    'reminder modal safe backdrop',
)
s = s.replace('max-h-[90vh]', 'max-h-full', 1)
s = add_classes_after_id(s, 'close-reminders-modal-btn', 'min-w-11 min-h-11 inline-flex items-center justify-center')
s = replace_once(
    s,
    'className="px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold shrink-0 transition-colors shadow-xs"',
    'id="enable-notifications-btn" className="min-h-11 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold shrink-0 transition-colors shadow-xs"',
    'notification permission target',
)
s = replace_once(
    s,
    'onClick={() => onToggleTask(note.id, task.id)}\n                    className="mt-0.5 text-neutral-400 hover:text-amber-500 shrink-0 transition-colors"',
    'data-testid="reminder-task-toggle-btn"\n                    onClick={() => onToggleTask(note.id, task.id)}\n                    className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-amber-500 shrink-0 transition-colors"',
    'reminder task toggle target',
)
s = replace_once(
    s,
    'className="inline-flex items-center gap-1 text-neutral-500 hover:text-amber-500 transition-colors"',
    'className="min-h-11 inline-flex items-center gap-1 text-neutral-500 hover:text-amber-500 transition-colors"',
    'reminder note link target',
)
s = replace_once(
    s,
    'className="text-neutral-400 hover:text-amber-500 underline decoration-dotted"',
    'className="min-h-11 inline-flex items-center text-neutral-400 hover:text-amber-500 underline decoration-dotted"',
    'set due date target',
)
s = replace_once(
    s,
    'className="text-xs bg-white dark:bg-neutral-900 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700"',
    'className="min-h-11 text-base sm:text-xs bg-white dark:bg-neutral-900 px-2 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700"',
    'reminder date editor target',
)
s = replace_once(s, 'className="text-xs px-2.5 py-1 bg-amber-500 text-black font-semibold rounded"', 'className="min-h-11 px-3 py-1 bg-amber-500 text-black text-sm font-semibold rounded-lg"', 'reminder date save target')
s = replace_once(s, 'className="text-xs px-2 py-1 text-neutral-400 hover:text-neutral-200"', 'className="min-h-11 px-3 py-1 text-sm text-neutral-400 hover:text-neutral-200"', 'reminder date cancel target')
write(path, s)

# 7) Attachment viewer: top safe area and 44px controls.
path = 'src/components/AttachmentViewer.tsx'
s = read(path)
s = replace_once(
    s,
    'className="flex items-center justify-between px-4 py-3 bg-neutral-900/90 border-b border-neutral-800"',
    'className="attachment-mobile-header flex items-center justify-between gap-2 px-4 py-3 bg-neutral-900/90 border-b border-neutral-800"',
    'attachment header safe area',
)
s = replace_once(
    s,
    'className="flex-1 flex items-center justify-center p-4 overflow-auto"',
    'className="attachment-safe-content flex-1 flex items-center justify-center p-4 overflow-auto"',
    'attachment content safe area',
)
for eid in ['attachment-download-btn', 'attachment-close-btn']:
    s = add_classes_after_id(s, eid, 'min-w-11 min-h-11 inline-flex items-center justify-center')
s = replace_once(
    s,
    'className="flex items-center gap-1 text-xs text-amber-400 hover:underline"',
    'className="min-h-11 inline-flex items-center gap-1 text-xs text-amber-400 hover:underline"',
    'pdf external link target',
)
s = replace_once(
    s,
    'className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-black font-semibold text-xs rounded-full"',
    'className="min-h-11 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-black font-semibold text-sm rounded-xl"',
    'fallback attachment download target',
)
write(path, s)

# 8) Strengthen permanent comprehensive audit itself.
path = '.github/workflows/mobile-complete-ux-audit.yml'
s = read(path)
s = s.replace("page.locator('[data-testid=\"task-more-btn\"]').first()", "page.locator('[id^=\"task-more-btn-\"]').first()")
needle = """            const bodyMetrics = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
            if (bodyMetrics.sw > bodyMetrics.iw + 1) addFailure(c.name, `home horizontal overflow ${bodyMetrics.sw}px > ${bodyMetrics.iw}px`);
"""
extra = needle + """
            const homeCard = page.locator('[data-note-card]').first();
            if (await homeCard.count()) {
              const hr = await homeCard.evaluate((el) => { const r=el.getBoundingClientRect(); return {x:r.x,right:r.right}; });
              if (hr.x < c.left) addFailure(c.name, `note card enters left safe area: x=${hr.x}`);
              if (hr.right > c.width - c.right + 0.5) addFailure(c.name, `note card enters right safe area: right=${hr.right}`);
            }
"""
s = replace_once(s, needle, extra, 'audit home safe horizontal')
needle = """            const editorMetrics = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
            if (editorMetrics.sw > editorMetrics.iw + 1) addFailure(c.name, `editor horizontal overflow ${editorMetrics.sw}px > ${editorMetrics.iw}px`);
"""
extra = needle + """
            const editorBody = await rect(page, '#note-content-textarea');
            if (editorBody.x < c.left) addFailure(c.name, `editor body enters left safe area: x=${editorBody.x}`);
            if (editorBody.right > c.width - c.right + 0.5) addFailure(c.name, `editor body enters right safe area: right=${editorBody.right}`);
            const tinyInputs = await page.locator('input:not([type="checkbox"]):not([type="file"]):not([type="hidden"]), textarea, select').evaluateAll((els) => els.filter((el) => {
              const r=el.getBoundingClientRect(); return r.width>0 && r.height>0 && parseFloat(getComputedStyle(el).fontSize) < 16;
            }).map((el) => ({ id:el.id || el.getAttribute('type') || el.tagName, font:getComputedStyle(el).fontSize })));
            for (const field of tinyInputs) addFailure(c.name, `focused form control can trigger iPhone zoom: ${field.id} at ${field.font}`);
"""
s = replace_once(s, needle, extra, 'audit input font and editor safe horizontal')
# Common modal action touch targets.
needle = """            await assertTouch(page, c, '#close-cloudflare-modal-btn', 'cloud modal close');
"""
extra = needle + """            for (const [selector, label] of [['#cf-sync-code-input','sync code field'],['#cf-copy-sync-code-btn','copy sync code'],['#cf-worker-url-input','worker URL field'],['#cf-save-btn','cloud save'],['#cf-sync-now-btn','cloud sync now']]) await assertTouch(page, c, selector, label);
"""
s = replace_once(s, needle, extra, 'audit cloud actions')
needle = """            await assertTouch(page, c, '#attachment-download-btn', 'attachment save');
"""
extra = needle + """            const openAction = page.locator('[title="拡大表示 / 開く"]').first();
            if (await openAction.count()) {
              const or = await openAction.evaluate((el) => { const r=el.getBoundingClientRect(); return {width:r.width,height:r.height}; });
              if (or.width < 44 || or.height < 44) addFailure(c.name, `attachment open target is ${or.width}x${or.height}`);
            }
            const deleteAction = page.locator('[title="削除"]').first();
            if (await deleteAction.count()) {
              const dr = await deleteAction.evaluate((el) => { const r=el.getBoundingClientRect(); return {width:r.width,height:r.height}; });
              if (dr.width < 44 || dr.height < 44) addFailure(c.name, `attachment delete target is ${dr.width}x${dr.height}`);
            }
"""
s = replace_once(s, needle, extra, 'audit attachment actions')
write(path, s)

print('Applied complete mobile safe-area and touch UX fixes.')
