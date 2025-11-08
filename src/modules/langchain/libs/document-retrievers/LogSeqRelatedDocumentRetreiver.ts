import {
  BaseRetriever,
  type BaseRetrieverInput,
} from "@langchain/core/retrievers"
import type { CallbackManagerForRetrieverRun } from "@langchain/core/callbacks/manager"
import { Document } from "@langchain/core/documents"
import { BlockEntity } from "@logseq/libs/dist/LSPlugin"
import { LogSeqSettings } from "../../../logseq/types/settings"
import { LogSeqDocument } from "../../../logseq/types/logseq"

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LogSeqRelevantDocumentRetrieverInput extends BaseRetrieverInput {}

const DATE_PAGE_REGEX = /^(?!\b[A-Za-z]{3} \d{1,2}(st|nd|rd|th), \d{4}\b).+$/

export class LogSeqRelevantDocumentRetreiver extends BaseRetriever {
  lc_namespace = ["langchain", "retrievers"]

  constructor(fields?: LogSeqRelevantDocumentRetrieverInput) {
    super(fields)
  }

  private isBlockEntity(obj: unknown): obj is BlockEntity {
    return !!obj && typeof obj === 'object' && 'content' in obj
  }

  private async getPageReferences(
    pageName: string,
    settings: LogSeqSettings,
    documents: LogSeqDocument[],
    visitedPages: Set<string>
  ): Promise<void> {
    if (!settings.includePageReferences) return

    try {
      const page = await window.logseq.Editor.getPage(pageName)
      if (!page) return

      const linkedRefs = await window.logseq.Editor.getPageLinkedReferences(pageName)
      
      if (linkedRefs && Array.isArray(linkedRefs)) {
        for (const ref of linkedRefs) {
          if (ref && typeof ref === 'object' && 'page' in ref && ref.page) {
            const refPageName = typeof ref.page === 'object' && 'name' in ref.page 
              ? String(ref.page.name) 
              : String(ref.page)
            
            if (!visitedPages.has(refPageName)) {
              await this.getDocumentsRecursively(
                refPageName,
                documents,
                visitedPages,
                1,
                settings
              )
            }
          }
        }
      }
    } catch (error) {
      console.warn('Could not fetch page references:', error)
    }
  }
  
  private async appendBlockContent(
    block: BlockEntity,
    depth: number,
    settings: LogSeqSettings,
    documents: LogSeqDocument[],
    visitedPages: Set<string>
  ): Promise<string> {
    if (block.refs && Array.isArray(block.refs)) {
      for(const ref of block.refs as any[]) {
        await this.getDocumentsRecursively(ref.id, documents, visitedPages, depth + 1, settings)
      }
    }
  
    const indentation = `${'\t'.repeat(Math.max(0, (block.level || 0) - 1))}`
    let content = `${indentation}- ${block.content}\n`
  
    if (block.children) {
      for (const child of block.children) {
        if (this.isBlockEntity(child)) {
          const contentToBeAppended = await this.appendBlockContent(child, depth, settings, documents, visitedPages)
          if (!settings.blacklistedKeywords.split(",").some((keyword) => contentToBeAppended.includes(keyword))) {
            content += contentToBeAppended
          }
        }
      }
    }
  
    return content
  }
  
  private async getDocumentsRecursively(
    pageName: string,
    documents: LogSeqDocument[],
    visitedPages: Set<string>,
    depth: number,
    settings: LogSeqSettings
  ): Promise<LogSeqDocument[]> {
    const page = await window.logseq.Editor.getPage(pageName)

    if (!page || depth >= settings.maxRecursionDepth) return documents
  
    const { blacklistedPages, blacklistedKeywords } = settings
    const blacklistedPagesSet = new Set(blacklistedPages.split(','))
    const blacklistedKeywordsSet = new Set(blacklistedKeywords.split(','))
  
    if (
      blacklistedPagesSet.has(page.name) ||
      Array.from(blacklistedKeywordsSet).some((keyword) => page.name.includes(keyword as string)) ||
      (!settings.includeDatePage && !DATE_PAGE_REGEX.test(page.name))
    ) {
      return documents
    }
  
    if (visitedPages.has(page.name)) return documents
    visitedPages.add(page.name)
  
    let content = ''
    const blocks = await window.logseq.Editor.getPageBlocksTree(page.name)
  
    for (const block of blocks) {
      content += await this.appendBlockContent(block, depth, settings, documents, visitedPages)
    }
  
    documents.push({
      title: page.name,
      content,
    })
  
    for (const block of blocks) {
      if (block.refs && Array.isArray(block.refs)) {
        for (const ref of block.refs as any[]) {        
          await this.getDocumentsRecursively(ref.id, documents, visitedPages, depth + 1, settings)
        }
      }
    }
  
    return documents
  }

  private async searchGlobally(
    query: string,
    documents: LogSeqDocument[],
    visitedPages: Set<string>,
    settings: LogSeqSettings
  ): Promise<void> {
    // Extract keywords from query (simple tokenization)
    const keywords = query.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3)
      .slice(0, 5)  // Top 5 keywords

    if (keywords.length === 0) {
      // If no keywords, return empty
      return
    }

    // Use existing Datalog search to find relevant blocks
    const datalogQuery = `[:find (pull ?b [*])
      :where
      [?b :block/content ?content]
      (or ${keywords.map(kw => `[(clojure.string/includes? ?content "${kw}")]`).join('\n')})]`
    
    try {
      const results = await window.logseq.DB.datascriptQuery(datalogQuery)
      
      // Get unique pages from blocks, limit to top 10
      const pageNames = new Set<string>()
      for (const [block] of results.slice(0, 20)) {
        const fullBlock = await window.logseq.Editor.getBlock(block.uuid)
        if (fullBlock?.page) {
          const pageId = typeof fullBlock.page === 'object' ? fullBlock.page.id : fullBlock.page
          const page = await window.logseq.Editor.getPage(pageId)
          if (page?.name && pageNames.size < 10) {
            pageNames.add(page.name)
          }
        }
      }

      // Fetch documents for these pages
      for (const pageName of pageNames) {
        await this.getDocumentsRecursively(pageName, documents, visitedPages, 0, settings)
      }
    } catch (error) {
      console.warn('Global search failed:', error)
    }
  }

  async _getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun
  ): Promise<Document[]> {
    const documentsArray: LogSeqDocument[] = []
    const visitedPages = new Set<string>()
    const settings = this.metadata!.settings as LogSeqSettings
    const pageName = this.metadata!.pageName as string | null  // Can be null now

    if (pageName) {
      // Page-specific mode: start from current page
      await this.getDocumentsRecursively(
        pageName,
        documentsArray,
        visitedPages,
        0,
        settings,
      )

      await this.getPageReferences(
        pageName,
        settings,
        documentsArray,
        visitedPages
      )
    } else {
      // Global mode: search by query keywords
      await this.searchGlobally(query, documentsArray, visitedPages, settings)
    }

    return documentsArray.map((doc) => new Document({
      pageContent: doc.content,
      metadata: {
        title: doc.title,
      }
    }))
  }
}