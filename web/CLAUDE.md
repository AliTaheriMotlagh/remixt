@AGENTS.md

## Finding code

The repo knowledge graph is one folder up. Query it before grepping for "where is X" or "how does X work" questions:

```
graphify query "how does X work?" --graph ../graphify-out/graph.json
```

Grep only for exact strings, or when the graph has no answer.
