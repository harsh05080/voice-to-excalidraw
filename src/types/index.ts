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
  fromElementIndex?: number
  toElementIndex?: number
}

export interface SpeechState {
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
}

export type ActionType = "add" | "modify" | "delete" | "clear"

export interface AddAction {
  type: "add"
  element: ExcalidrawElement
}

export interface ModifyAction {
  type: "modify"
  targetIndex: number
  element: Partial<ExcalidrawElement>
}

export interface DeleteAction {
  type: "delete"
  targetIndex: number
}

export interface ClearAction {
  type: "clear"
}

export type DiagramAction = AddAction | ModifyAction | DeleteAction | ClearAction

export interface ActionsResponse {
  actions: DiagramAction[]
}

export interface TextToElementsRequest {
  description: string
  existingElements: ExcalidrawElement[]
  viewportWidth: number
  viewportHeight: number
  conversationHistory: { role: "user" | "assistant"; content: string }[]
}
