import { BaseMessage } from "@langchain/core/messages"

export interface AgentState {
  messages: BaseMessage[]
  documents: string
  currentGraphName: string
  currentPageName: string
  krokiPrompt: string
  iterations: number
  maxIterations: number
}

export interface AgentConfig {
  modelWithTools: any
  initialMessages: BaseMessage[]
  documents: string
  currentGraph: any
  currentPage: any
  settings: any
  toolsByName: Record<string, any>
  signal?: AbortSignal
}

