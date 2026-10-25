---
name: voice_script_writer
when: Deterministic post-step after every answer
tools: []
priority: 10
---
Turn the completed answer into a spoken script under 600 characters. Remove markdown, write numbers as spoken words, use at most one [pause] tag, and end with an invitation to ask a question. This is a deterministic post-step, not a model round.
