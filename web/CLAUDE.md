@AGENTS.md

The Next.js docs for this version are in `web/.next-docs/` (copied from node_modules on every `npm install`; read them before touching Next.js code).

## Finding code

The repo knowledge graph is one folder up. Query it before grepping for "where is X" or "how does X work" questions:

```
graphify query "how does X work?" --graph ../graphify-out/graph.json
```

Grep only for exact strings, or when the graph has no answer.
