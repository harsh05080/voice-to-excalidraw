import type { DiagramAction, ExcalidrawElement } from "../types"

export interface ProcessingResult {
  elementsToAdd: ExcalidrawElement[]
  elementsToRemove: number[]  // indices to remove
  elementsToModify: { index: number; changes: Partial<ExcalidrawElement> }[]
  shouldClear: boolean
}

function computeArrowPoints(
  fromElement: ExcalidrawElement,
  toElement: ExcalidrawElement
): number[][] {
  const fromCX = fromElement.x + fromElement.width / 2
  const fromCY = fromElement.y + fromElement.height / 2
  const toCX = toElement.x + toElement.width / 2
  const toCY = toElement.y + toElement.height / 2

  const dx = toCX - fromCX
  const dy = toCY - fromCY

  let startX: number, startY: number
  let endX: number, endY: number

  if (Math.abs(dx) >= Math.abs(dy)) {
    startX = dx > 0 ? fromElement.x + fromElement.width : fromElement.x
    startY = fromCY
    endX = dx > 0 ? toElement.x : toElement.x + toElement.width
    endY = toCY
  } else {
    startX = fromCX
    startY = dy > 0 ? fromElement.y + fromElement.height : fromElement.y
    endX = toCX
    endY = dy > 0 ? toElement.y : toElement.y + toElement.height
  }

  return [[startX, startY], [endX, endY]]
}

export function processActions(
  actions: DiagramAction[],
  existingElements: ExcalidrawElement[]
): ProcessingResult {
  const result: ProcessingResult = {
    elementsToAdd: [],
    elementsToRemove: [],
    elementsToModify: [],
    shouldClear: false,
  }

  for (const action of actions) {
    switch (action.type) {
      case "clear":
        result.shouldClear = true
        break

      case "delete":
        if (action.targetIndex !== undefined) {
          const idx = action.targetIndex - 1
          if (idx >= 0 && idx < existingElements.length) {
            result.elementsToRemove.push(idx)
          }
        }
        break

      case "modify":
        if (action.targetIndex !== undefined && action.element) {
          const idx = action.targetIndex - 1
          if (idx >= 0 && idx < existingElements.length) {
            result.elementsToModify.push({
              index: idx,
              changes: action.element,
            })
          }
        }
        break

      case "add":
        if (action.element) {
          const el = { ...action.element }

          if (
            (el.type === "arrow" || el.type === "line") &&
            (el.fromElementIndex !== undefined || el.toElementIndex !== undefined)
          ) {
            const fromIdx = el.fromElementIndex !== undefined ? el.fromElementIndex - 1 : -1
            const toIdx = el.toElementIndex !== undefined ? el.toElementIndex - 1 : -1

            const elements = [...existingElements]
            const allElements = [...elements, ...result.elementsToAdd]

            const fromEl = fromIdx >= 0 && fromIdx < allElements.length ? allElements[fromIdx] : null
            const toEl = toIdx >= 0 && toIdx < allElements.length ? allElements[toIdx] : null

            if (fromEl && toEl) {
              el.points = computeArrowPoints(fromEl, toEl)
              el.x = el.points[0][0]
              el.y = el.points[0][1]
              el.width = Math.abs(el.points[1][0] - el.points[0][0])
              el.height = Math.abs(el.points[1][1] - el.points[0][1])
            }
          }

          delete (el as any).fromElementIndex
          delete (el as any).toElementIndex

          result.elementsToAdd.push(el)
        }
        break
    }
  }

  return result
}
