export const LOGSEQ_QUERY_GUIDE = `
### LogSeq Datalog Query Syntax

**Basic Structure:**
\`\`\`clojure
[:find (pull ?b [*])
 :where
 [?b :block/content ?content]
 [(clojure.string/includes? ?content "keyword")]]
\`\`\`

**Common Patterns:**

1. **Search by Tag:**
\`\`\`clojure
[:find (pull ?b [*])
 :where
 [?b :block/refs ?r]
 [?r :block/name "tag-name"]]
\`\`\`

2. **Search by Page:**
\`\`\`clojure
[:find (pull ?b [*])
 :where
 [?b :block/page ?p]
 [?p :block/name "My Page"]]
\`\`\`

3. **Date Range:**
\`\`\`clojure
[:find (pull ?b [*])
 :where
 [?b :block/journal-day ?d]
 [(>= ?d 20250101)]
 [(<= ?d 20250131)]]
\`\`\`

4. **Multiple Keywords (OR):**
\`\`\`clojure
[:find (pull ?b [*])
 :where
 [?b :block/content ?content]
 (or
   [(clojure.string/includes? ?content "keyword1")]
   [(clojure.string/includes? ?content "keyword2")])]
\`\`\`

5. **Multiple Conditions (AND):**
\`\`\`clojure
[:find (pull ?b [*])
 :where
 [?b :block/content ?content]
 [?b :block/refs ?r]
 [?r :block/name "tag"]
 [(clojure.string/includes? ?content "keyword")]]
\`\`\`

6. **Find TODO Items:**
\`\`\`clojure
[:find (pull ?b [*])
 :where
 [?b :block/marker ?marker]
 [(contains? #{"TODO" "DOING"} ?marker)]]
\`\`\`

7. **Properties:**
\`\`\`clojure
[:find (pull ?b [*])
 :where
 [?b :block/properties ?props]
 [(get ?props :property-name) ?value]
 [(= ?value "expected-value")]]
\`\`\`
`

