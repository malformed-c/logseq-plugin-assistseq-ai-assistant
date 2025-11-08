import { LogSeqDocument } from "../../logseq/types/logseq"

export enum ChatMessageRoleEnum {
  User = 'user',
  AI = 'model'
}

export type AgentStep = {
  type: 'tool_call' | 'tool_result' | 'thinking'
  toolName?: string
  content: string
  timestamp: number
}

export type ChatMessage = {
  id: string
  content: string
  role: ChatMessageRoleEnum
  relatedDocuments: LogSeqDocument[]
  agentSteps?: AgentStep[]
}