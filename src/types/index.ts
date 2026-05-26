export type ExcalidrawElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"

export interface ExcalidrawElement {
  type: ExcalidrawElementType
  x: number
  y: number
  width: number
  height: number
  strokeColor?: string
  backgroundColor?: string
  fillStyle?: "hachure" | "solid" | "cross-hatch" | "zigzag" | "zigzag-line"
  strokeWidth?: number
  roughness?: number
  opacity?: number
  angle?: number
  text?: string
  points?: number[][]
  fontSize?: number
  fontFamily?: number
  textAlign?: "left" | "center" | "right"
  strokeStyle?: "solid" | "dashed" | "dotted"
  roundness?: { type: number }
  groupIds?: string[]
  isFrame?: boolean
  isDeleted?: boolean
}

export interface SpeechState {
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
}
