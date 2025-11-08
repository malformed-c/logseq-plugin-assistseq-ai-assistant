import { z } from "zod"
import { BlockEntity } from "@logseq/libs/dist/LSPlugin"

export const advancedQuerySchema = z.object({
  queryIntent: z.string().describe("Natural language description of what to find (e.g., 'all TODO items tagged #project from last week')"),
  generatedQuery: z.string().optional().describe("The Datalog query you generated. If provided, will be validated and executed."),
})

/**
 * Validates a Datalog query for basic safety
 */
function validateDatalogQuery(query: string): { valid: boolean; error?: string } {
  // Basic validation checks
  if (!query.includes('[:find') || !query.includes(':where')) {
    return { valid: false, error: 'Query must have :find and :where clauses' }
  }
  
  // Check for dangerous patterns (just in case)
  const dangerousPatterns = [
    /retract/i,
    /transact/i,
    /delete/i,
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(query)) {
      return { valid: false, error: 'Query contains disallowed operations' }
    }
  }
  
  // Check complexity (prevent extremely complex queries)
  const orCount = (query.match(/\(or/g) || []).length
  const andCount = query.split('\n').length
  
  if (orCount > 10 || andCount > 50) {
    return { valid: false, error: 'Query too complex (max 10 OR conditions, 50 lines)' }
  }
  
  return { valid: true }
}

/**
 * Fallback: Generate query from structured parameters
 */
function generateQueryFromIntent(intent: string): string {
  // Extract common patterns from intent
  const keywords = intent.toLowerCase()
  
  // Simple pattern matching for common query types
  if (keywords.includes('todo') || keywords.includes('task')) {
    return `[:find (pull ?b [*])
 :where
 [?b :block/marker ?marker]
 [(contains? #{"TODO" "DOING"} ?marker)]]`
  }
  
  if (keywords.includes('tag')) {
    const tagMatch = intent.match(/#(\w+)/g)
    const tags = tagMatch?.map(t => t.slice(1)) || []
    
    if (tags.length > 0) {
      return `[:find (pull ?b [*])
 :where
 [?b :block/refs ?r]
 [?r :block/name "${tags[0]}"]]`
    }
  }
  
  // Default: content search
  const words = intent.split(' ').filter(w => w.length > 3).slice(0, 3)
  const orClauses = words.map(w => `[(clojure.string/includes? ?content "${w}")]`).join('\n   ')
  
  return `[:find (pull ?b [*])
 :where
 [?b :block/content ?content]
 (or ${orClauses})]`
}

export async function executeAdvancedQuery(params: z.infer<typeof advancedQuerySchema>) {
  let query = params.generatedQuery
  let usingAIGenerated = false
  
  // If AI provided a query, validate it
  if (query) {
    const validation = validateDatalogQuery(query)
    
    if (validation.valid) {
      console.log("✅ Using AI-generated query:", query)
      usingAIGenerated = true
    } else {
      console.warn("❌ AI query validation failed:", validation.error)
      console.log("🔄 Falling back to structured generation")
      query = generateQueryFromIntent(params.queryIntent)
    }
  } else {
    // No AI query provided, use fallback
    query = generateQueryFromIntent(params.queryIntent)
  }
  
  try {
    console.log("Executing query:", query)
    
    // Execute query with timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 5000)
    )
    
    const queryPromise = window.logseq.DB.datascriptQuery<BlockEntity[][]>(query)
    
    const results = await Promise.race([queryPromise, timeoutPromise]) as BlockEntity[][]
    
    // Format results
    const formatted = []
    for (const [block] of results.slice(0, 20)) {
      const fullBlock = await window.logseq.Editor.getBlock(block.uuid)
      if (fullBlock) {
        const page = await window.logseq.Editor.getPage(fullBlock.page.id)
        formatted.push(
          `**Page**: ${page?.name || 'Unknown'}\n` +
          `**Content**: ${fullBlock.content}\n` +
          `**UUID**: ${fullBlock.uuid}`
        )
      }
    }
    
    const resultText = formatted.length > 0 
      ? formatted.join("\n---\n")
      : "No results found for this query."
    
    return `Query executed successfully ${usingAIGenerated ? '(AI-generated)' : '(fallback)'}\n\nResults (${formatted.length}):\n\n${resultText}`
    
  } catch (error: any) {
    console.error("Query execution error:", error)
    
    // If AI query failed, try fallback
    if (usingAIGenerated) {
      console.log("🔄 AI query failed, trying fallback...")
      query = generateQueryFromIntent(params.queryIntent)
      
      try {
        const results = await window.logseq.DB.datascriptQuery<BlockEntity[][]>(query)
        const formatted = []
        
        for (const [block] of results.slice(0, 20)) {
          const fullBlock = await window.logseq.Editor.getBlock(block.uuid)
          if (fullBlock) {
            formatted.push(`**Content**: ${fullBlock.content}`)
          }
        }
        
        return `Query executed (fallback mode)\n\nResults (${formatted.length}):\n\n${formatted.join("\n---\n")}`
      } catch (fallbackError: any) {
        return `Query execution failed. Error: ${fallbackError.message}`
      }
    }
    
    return `Query execution failed. Error: ${error.message}`
  }
}

export const advancedQueryTool = {
  schema: advancedQuerySchema,
  name: "generate_logseq_advanced_query",
  description: `Generate and execute advanced LogSeq Datalog queries. 

You SHOULD attempt to generate the actual Datalog query in the 'generatedQuery' field based on the user's intent and the LogSeq query syntax guide provided in your system prompt.

The query will be validated before execution. If validation fails, a fallback structured query will be used.

Example:
- queryIntent: "Find all TODO items tagged #project"
- generatedQuery: "[:find (pull ?b [*]) :where [?b :block/marker ?marker] [(contains? #{\\"TODO\\"} ?marker)] [?b :block/refs ?r] [?r :block/name \\"project\\"]]"

Always include both fields for best results.`,
}

