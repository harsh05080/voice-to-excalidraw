import type { ExcalidrawElement } from "../types"

export function elementToExcalidrawFormat(el: ExcalidrawElement, id: string): Record<string, unknown> {
  return {
    id,
    type: el.type,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    strokeColor: el.strokeColor ?? "#1e1e1e",
    backgroundColor: el.backgroundColor ?? "transparent",
    fillStyle: el.fillStyle ?? "solid",
    strokeWidth: el.strokeWidth ?? 2,
    roughness: el.roughness ?? 1,
    opacity: el.opacity ?? 100,
    angle: el.angle ?? 0,
    ...(el.text !== undefined && { text: el.text }),
    ...(el.points !== undefined && { points: el.points }),
    ...(el.fontSize !== undefined && { fontSize: el.fontSize }),
    ...(el.fontFamily !== undefined && { fontFamily: el.fontFamily }),
    ...(el.textAlign !== undefined && { textAlign: el.textAlign }),
    ...(el.strokeStyle !== undefined && { strokeStyle: el.strokeStyle }),
    ...(el.roundness !== undefined && { roundness: el.roundness }),
    ...(el.groupIds !== undefined && { groupIds: el.groupIds }),
    ...(el.isFrame !== undefined && { isFrame: el.isFrame }),
    ...(el.isDeleted !== undefined && { isDeleted: el.isDeleted }),
  }
}
