import type { DiagramAction, ExcalidrawElement } from "../types"

export interface ProcessingResult {
  elementsToAdd: ExcalidrawElement[]
  elementsToRemove: number[]
  elementsToModify: { index: number; changes: Partial<ExcalidrawElement> }[]
  shouldClear: boolean
}

const ELEMENT_MARGIN = 60
const ARROW_MARGIN = 30
const MAX_SHIFT = 500

function createLabelElement(
  parent: ExcalidrawElement,
  label: string
): ExcalidrawElement {
  return {
    type: "text",
    x: parent.x + 4,
    y: parent.y + parent.height / 2 - 10,
    width: parent.width - 8,
    height: 20,
    text: label,
    fontSize: 16,
    fontFamily: 1,
    textAlign: "center",
  }
}

function segmentHitsRect(
  ax: number, ay: number,
  bx: number, by: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  const minX = Math.min(ax, bx), maxX = Math.max(ax, bx)
  const minY = Math.min(ay, by), maxY = Math.max(ay, by)
  if (maxX <= rx || minX >= rx + rw || maxY <= ry || minY >= ry + rh) return false
  return true
}

function pathOverlapsAnyElement(
  path: number[][],
  elements: ExcalidrawElement[],
  fromId: string | undefined,
  toId: string | undefined
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i]
    const [bx, by] = path[i + 1]
    for (const el of elements) {
      if (el.id === fromId || el.id === toId) continue
      if (el.type === "text") continue
      if (segmentHitsRect(ax, ay, bx, by, el.x, el.y, el.width, el.height)) return true
    }
  }
  return false
}

function pathLength(path: number[][]): number {
  let len = 0
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1][0] - path[i][0]
    const dy = path[i + 1][1] - path[i][1]
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return len
}

function findObstaclesOnVerticalLine(
  x: number,
  y1: number,
  y2: number,
  elements: ExcalidrawElement[],
  fromId: string | undefined,
  toId: string | undefined
): { x: number; y: number; w: number; h: number }[] {
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  const result: { x: number; y: number; w: number; h: number }[] = []
  for (const el of elements) {
    if (el.id === fromId || el.id === toId || el.type === "text") continue
    if (x > el.x && x < el.x + el.width && maxY > el.y && minY < el.y + el.height) {
      result.push({ x: el.x, y: el.y, w: el.width, h: el.height })
    }
  }
  return result
}

function findObstaclesOnHorizontalLine(
  y: number,
  x1: number,
  x2: number,
  elements: ExcalidrawElement[],
  fromId: string | undefined,
  toId: string | undefined
): { x: number; y: number; w: number; h: number }[] {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const result: { x: number; y: number; w: number; h: number }[] = []
  for (const el of elements) {
    if (el.id === fromId || el.id === toId || el.type === "text") continue
    if (y > el.y && y < el.y + el.height && maxX > el.x && minX < el.x + el.width) {
      result.push({ x: el.x, y: el.y, w: el.width, h: el.height })
    }
  }
  return result
}

function computeClearOffsets(
  obstacles: { x: number; y: number; w: number; h: number }[],
  original: number,
  minBound: number,
  maxBound: number,
  axis: "x" | "y"
): number[] {
  if (obstacles.length === 0) return [original]
  const candidates = new Set<number>([original])

  let clearLeft = Infinity
  let clearRight = -Infinity

  for (const obs of obstacles) {
    const obsStart = axis === "x" ? obs.x : obs.y
    const obsEnd = axis === "x" ? obs.x + obs.w : obs.y + obs.h
    clearLeft = Math.min(clearLeft, obsStart - ARROW_MARGIN)
    clearRight = Math.max(clearRight, obsEnd + ARROW_MARGIN)
  }

  const leftCandidate = Math.max(clearLeft, minBound - MAX_SHIFT)
  const rightCandidate = Math.min(clearRight, maxBound + MAX_SHIFT)

  if (leftCandidate < original - 1) candidates.add(leftCandidate)
  if (rightCandidate > original + 1) candidates.add(rightCandidate)

  return Array.from(candidates).sort((a, b) => Math.abs(a - original) - Math.abs(b - original))
}

function computeArrowPointsDefault(
  fromElement: ExcalidrawElement,
  toElement: ExcalidrawElement
): { edgeFromX: number; edgeFromY: number; edgeToX: number; edgeToY: number; isHorizontal: boolean } {
  const fromCX = fromElement.x + fromElement.width / 2
  const fromCY = fromElement.y + fromElement.height / 2
  const toCX = toElement.x + toElement.width / 2
  const toCY = toElement.y + toElement.height / 2
  const dx = toCX - fromCX
  const dy = toCY - fromCY
  const isHorizontal = Math.abs(dx) >= Math.abs(dy)

  let edgeFromX: number, edgeFromY: number
  let edgeToX: number, edgeToY: number

  if (isHorizontal) {
    edgeFromX = dx > 0 ? fromElement.x + fromElement.width : fromElement.x
    edgeFromY = fromCY
    edgeToX = dx > 0 ? toElement.x : toElement.x + toElement.width
    edgeToY = toCY
  } else {
    edgeFromX = fromCX
    edgeFromY = dy > 0 ? fromElement.y + fromElement.height : fromElement.y
    edgeToX = toCX
    edgeToY = dy > 0 ? toElement.y : toElement.y + toElement.height
  }

  return { edgeFromX, edgeFromY, edgeToX, edgeToY, isHorizontal }
}

function computeArrowPoints(
  fromElement: ExcalidrawElement,
  toElement: ExcalidrawElement,
  allElements: ExcalidrawElement[] = []
): number[][] {
  const { edgeFromX, edgeFromY, edgeToX, edgeToY, isHorizontal } =
    computeArrowPointsDefault(fromElement, toElement)

  const fromCX = fromElement.x + fromElement.width / 2
  const fromCY = fromElement.y + fromElement.height / 2
  const toCX = toElement.x + toElement.width / 2
  const toCY = toElement.y + toElement.height / 2
  const dx = toCX - fromCX
  const dy = toCY - fromCY

  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
    return [[edgeFromX, edgeFromY], [edgeToX, edgeToY]]
  }

  const candidates: { path: number[][]; score: number }[] = []

  // Horizontal-dominant routing: H → V → H
  if (isHorizontal) {
    const midX = (edgeFromX + edgeToX) / 2
    const obstacles = findObstaclesOnVerticalLine(midX, edgeFromY, edgeToY, allElements, fromElement.id, toElement.id)
    const offsets = computeClearOffsets(obstacles, midX, edgeFromX, edgeToX, "x")
    for (const offset of offsets) {
      const path: number[][] = [
        [edgeFromX, edgeFromY],
        [offset, edgeFromY],
        [offset, edgeToY],
        [edgeToX, edgeToY],
      ]
      const penalty = pathOverlapsAnyElement(path, allElements, fromElement.id, toElement.id) ? 100000 : 0
      candidates.push({ path, score: pathLength(path) + penalty })
    }
  } else {
    // Also try horizontal routing as fallback
    const hEdgeFromX = dx > 0 ? fromElement.x + fromElement.width : fromElement.x
    const hEdgeToX = dx > 0 ? toElement.x : toElement.x + toElement.width
    const midX = (hEdgeFromX + hEdgeToX) / 2
    const obstacles = findObstaclesOnVerticalLine(midX, fromCY, toCY, allElements, fromElement.id, toElement.id)
    const offsets = computeClearOffsets(obstacles, midX, hEdgeFromX, hEdgeToX, "x")
    for (const offset of offsets) {
      const path: number[][] = [
        [hEdgeFromX, fromCY],
        [offset, fromCY],
        [offset, toCY],
        [hEdgeToX, toCY],
      ]
      const penalty = pathOverlapsAnyElement(path, allElements, fromElement.id, toElement.id) ? 100000 : 0
      candidates.push({ path, score: pathLength(path) + penalty })
    }
  }

  // Vertical-dominant routing: V → H → V
  if (!isHorizontal) {
    const midY = (edgeFromY + edgeToY) / 2
    const obstacles = findObstaclesOnHorizontalLine(midY, edgeFromX, edgeToX, allElements, fromElement.id, toElement.id)
    const offsets = computeClearOffsets(obstacles, midY, edgeFromY, edgeToY, "y")
    for (const offset of offsets) {
      const path: number[][] = [
        [edgeFromX, edgeFromY],
        [edgeFromX, offset],
        [edgeToX, offset],
        [edgeToX, edgeToY],
      ]
      const penalty = pathOverlapsAnyElement(path, allElements, fromElement.id, toElement.id) ? 100000 : 0
      candidates.push({ path, score: pathLength(path) + penalty })
    }
  } else {
    // Also try vertical routing as fallback
    const vEdgeFromY = dy > 0 ? fromElement.y + fromElement.height : fromElement.y
    const vEdgeToY = dy > 0 ? toElement.y : toElement.y + toElement.height
    const midY = (vEdgeFromY + vEdgeToY) / 2
    const obstacles = findObstaclesOnHorizontalLine(midY, fromCX, toCX, allElements, fromElement.id, toElement.id)
    const offsets = computeClearOffsets(obstacles, midY, vEdgeFromY, vEdgeToY, "y")
    for (const offset of offsets) {
      const path: number[][] = [
        [fromCX, vEdgeFromY],
        [fromCX, offset],
        [toCX, offset],
        [toCX, vEdgeToY],
      ]
      const penalty = pathOverlapsAnyElement(path, allElements, fromElement.id, toElement.id) ? 100000 : 0
      candidates.push({ path, score: pathLength(path) + penalty })
    }
  }

  candidates.sort((a, b) => a.score - b.score)
  return candidates[0].path
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

  const newNonArrowElements: ExcalidrawElement[] = []
  const arrowActions: ExcalidrawElement[] = []

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
        if (!action.element) break

        if (action.element.type === "arrow") {
          arrowActions.push({ ...action.element })
          break
        }

        const el = { ...action.element }
        delete (el as any).fromElementIndex
        delete (el as any).toElementIndex
        result.elementsToAdd.push(el)
        newNonArrowElements.push(el)

        if (el.text && el.type !== "text") {
          const label = createLabelElement(el, el.text)
          result.elementsToAdd.push(label)
          newNonArrowElements.push(label)
        }
        break
    }
  }

  const combinedElements = [...existingElements, ...newNonArrowElements]

  for (const el of arrowActions) {

    if (
      el.fromElementIndex !== undefined &&
      el.toElementIndex !== undefined
    ) {
      const fromIdx = el.fromElementIndex - 1
      const toIdx = el.toElementIndex - 1

      const fromEl =
        fromIdx >= 0 && fromIdx < combinedElements.length
          ? combinedElements[fromIdx]
          : null
      const toEl =
        toIdx >= 0 && toIdx < combinedElements.length
          ? combinedElements[toIdx]
          : null

      if (fromEl && toEl) {
        const rawPoints = computeArrowPoints(fromEl, toEl, combinedElements)
        const xs = rawPoints.map(p => p[0])
        const ys = rawPoints.map(p => p[1])
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        el.x = minX
        el.y = minY
        el.width = Math.max(...xs) - minX || 20
        el.height = Math.max(...ys) - minY || 20
        el.points = rawPoints.map(p => [p[0] - minX, p[1] - minY])
      }
    }

    if (!el.points) {
      el.points = [[el.x, el.y], [el.x + (el.width || 80), el.y]]
    }

    delete (el as any).fromElementIndex
    delete (el as any).toElementIndex
    result.elementsToAdd.push(el)
  }

  return result
}
