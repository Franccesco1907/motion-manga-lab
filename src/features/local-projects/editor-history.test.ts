import { expect, it } from 'vitest'
import { createHistory, recordEdit, restoreContent, undoContent, redoContent } from './editor-history'
import { newRegion } from './draft-editing'
import type { LocalDraft } from './contracts'
const initial: LocalDraft = { schemaVersion: 1, projectId: 'page', sourceVersion: 'source', normalizationVersion: 'working-image-v1', revision: 0, duration: '6', fps: '24', regions: [newRegion('part')] }
it('restores raw content without rolling back authority metadata or revision', () => {
  const changed = { ...initial, duration: '' }
  const history = recordEdit(createHistory(), initial, changed)
  const result = undoContent(history, { ...changed, revision: 7 })!
  expect(restoreContent({ ...changed, revision: 7 }, result.content)).toEqual({ ...initial, revision: 7 })
  expect(result.content).not.toHaveProperty('projectId')
  expect(result.content).not.toHaveProperty('sourceVersion')
  expect(result.content).not.toHaveProperty('revision')
  expect(redoContent(result.history, initial)?.content.duration).toBe('')
})
it('bounds history and invalidates redo on a new edit without recording no-ops', () => {
  let history = createHistory(), current = initial
  for (let i = 0; i < 60; i++) { const next = { ...current, duration: String(i) }; history = recordEdit(history, current, next); current = next }
  expect(history.past).toHaveLength(50)
  const undo = undoContent(history, current)!
  const restored = restoreContent(current, undo.content)
  expect(recordEdit(undo.history, restored, restored)).toEqual(undo.history)
  expect(recordEdit(undo.history, restored, { ...restored, fps: '-' }).future).toEqual([])
})
