import { AIMessage, SystemMessage, ToolMessage, isAIMessage } from "@langchain/core/messages"
import { AgentState, AgentConfig } from "./types"
import { buildAgentSystemPrompt } from "./prompts"

const KROKI_PROMPT = `
VISUALIZATION CAPABILITIES:
You can create diagrams and visualizations to help explain concepts. Use the kroki-mermaid syntax for creating diagrams.

**CRITICAL**: Use \`kroki-mermaid\` (NOT just \`mermaid\`) as the code block language.

**Supported Diagram Types:**
- Flowcharts: \`flowchart TD\`, \`flowchart LR\`
- Sequence Diagrams: \`sequenceDiagram\`
- Class Diagrams: \`classDiagram\`
- State Diagrams: \`stateDiagram-v2\`
- ER Diagrams: \`erDiagram\`
- Mind Maps: \`mindmap\`
- Gantt Charts: \`gantt\`
- Pie Charts: \`pie\`
- Journey Diagrams: \`journey\`

**Example:**
\`\`\`kroki-mermaid
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Action 1]
  B -->|No| D[Action 2]
  C --> E[End]
  D --> E
\`\`\`

**Important Notes:**
- NEVER use LogSeq page syntax \`[[page]]\` inside diagrams - it breaks the syntax
- Wrap special words like "end" in quotes if they cause issues
- Use descriptive node labels to make diagrams clear
`

export async function* executeReActAgent(config: AgentConfig) {
  const {
    modelWithTools,
    initialMessages,
    documents,
    currentGraph,
    currentPage,
    settings,
    toolsByName,
    signal
  } = config

  // Get list of actual available tools
  const availableTools = Object.values(toolsByName)
  
  console.log('🔧 Agent executor - Tools actually available:', Object.keys(toolsByName))

  // Initialize state
  let state: AgentState = {
    messages: [...initialMessages],
    documents,
    currentGraphName: currentGraph?.name || '',
    currentPageName: (currentPage as any)?.name || currentPage?.['original-name'] || '',
    krokiPrompt: settings.includeVisualization ? KROKI_PROMPT : '',
    iterations: 0,
    maxIterations: 3
  }

  // Add system message with ACTUAL available tools
  const systemMessage = new SystemMessage(buildAgentSystemPrompt(state, availableTools))

  while (state.iterations < state.maxIterations) {
    // Check abort signal
    if (signal?.aborted) {
      throw new Error('Agent execution aborted')
    }

    console.log(`🔄 Starting iteration ${state.iterations + 1}/${state.maxIterations}`)
    console.log(`📝 Current messages in history: ${state.messages.length}`)

    // Invoke model with system + messages
    const aiResponse = await modelWithTools.invoke([
      systemMessage,
      ...state.messages
    ])

    console.log(`🤖 AI response type: ${aiResponse.constructor.name}`)
    console.log(`🤖 AI response content length: ${(aiResponse as AIMessage).content?.length || 0}`)

    // Add AI response to messages
    state.messages.push(aiResponse)
    state.iterations++

    // Yield current state for streaming
    console.log(`⬆️ Yielding state - iteration ${state.iterations}, messages: ${state.messages.length}`)
    yield { ...state }

    // Check if AI made tool calls
    const toolCalls = (aiResponse as AIMessage).tool_calls

    if (!toolCalls || toolCalls.length === 0) {
      // No tools called - agent decided to stop
      console.log(`✅ Agent completed after ${state.iterations} iterations (no more tool calls)`)
      break
    }

    // Execute all tool calls
    console.log(`🔧 Executing ${toolCalls.length} tool(s) in iteration ${state.iterations}`)
    toolCalls.forEach((tc, idx) => {
      console.log(`  Tool ${idx + 1}: ${tc.name}`)
    })
    
    for (const toolCall of toolCalls) {
      const tool = toolsByName[toolCall.name]
      
      if (!tool) {
        console.error(`❌ Tool not found: ${toolCall.name}`)
        const errorMessage = new ToolMessage({
          content: `Error: Tool "${toolCall.name}" not found`,
          tool_call_id: toolCall.id || ''
        })
        state.messages.push(errorMessage)
        continue
      }

      try {
        console.log(`✅ Executing: ${toolCall.name}`, toolCall.args)
        const toolResult = await tool.invoke(toolCall.args)
        state.messages.push(toolResult)
      } catch (error: any) {
        console.error(`❌ Tool error: ${toolCall.name}`, error)
        const errorMessage = new ToolMessage({
          content: `Error executing ${toolCall.name}: ${error.message}`,
          tool_call_id: toolCall.id || ''
        })
        state.messages.push(errorMessage)
      }
    }

    // Continue loop for next iteration
  }

  // Max iterations reached
  if (state.iterations >= state.maxIterations) {
    console.log(`⚠️ Max iterations (${state.maxIterations}) reached`)
  }
}

