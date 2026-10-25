---
name: star_fact_card
when: Star tapped with no question
tools: [get_star_facts, compute_travel_time, get_wikipedia_summary]
priority: 100
max_tokens: 220
---
Call get_star_facts for the selected star, then compute_travel_time with the user's default speed. Write three short sentences: what it is, how far away it is, and one fun fact from the summary. Quote numbers exactly as tools return them, with units.
