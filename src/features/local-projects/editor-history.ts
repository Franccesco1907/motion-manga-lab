import type { LocalDraft } from './contracts'

export type DraftContent = Pick<LocalDraft, 'schemaVersion' | 'duration' | 'fps' | 'regions'>
export interface ContentHistory { past: DraftContent[]; future: DraftContent[] }
const LIMIT = 50
export function draftContent(draft: LocalDraft): DraftContent {
  return structuredClone({ schemaVersion: draft.schemaVersion, duration: draft.duration, fps: draft.fps, regions: draft.regions })
}
export function createHistory(): ContentHistory { return { past: [], future: [] } }
export function recordEdit(history: ContentHistory, previous: LocalDraft, next: LocalDraft): ContentHistory {
  const content = draftContent(previous)
  if (JSON.stringify(content) === JSON.stringify(draftContent(next))) return history
  return { past: [...history.past, content].slice(-LIMIT), future: [] }
}
export function restoreContent(current: LocalDraft, content: DraftContent): LocalDraft { return { ...current, ...structuredClone(content) } }
export function undoContent(history: ContentHistory, current: LocalDraft) {
  const content = history.past.at(-1)
  if (!content) return
  return { content, history: { past: history.past.slice(0, -1), future: [draftContent(current), ...history.future].slice(0, LIMIT) } }
}
export function redoContent(history: ContentHistory, current: LocalDraft) {
  const content = history.future[0]
  if (!content) return
  return { content, history: { past: [...history.past, draftContent(current)].slice(-LIMIT), future: history.future.slice(1) } }
}
