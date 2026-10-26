export interface Golden {
  id: number;
  title: string;
  request: { messages: { role: 'user' | 'assistant'; content: string }[]; mode: 'local' | 'explore'; scope_hyg_ids?: number[]; selected_hyg_id?: number };
  contains: string[];
  excludes?: string[];
  tools?: string[];
}

const conversation = (id: number, prompt: string): { role: 'user' | 'assistant'; content: string }[] => [
  { role: 'user', content: `[g${id}]` },
  { role: 'assistant', content: 'I am ready to help.' },
  { role: 'user', content: prompt },
];

export const GOLDENS: Golden[] = [
  { id: 1, title: 'selected Sirius plain answer', request: { messages: conversation(1, 'What is this?'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['Sirius'] },
  { id: 2, title: 'travel uses 17 km/s constant speed', request: { messages: conversation(2, 'How long to get there?'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['17 km/s', 'constant speed'], tools: ['calculate_travel_time'] },
  { id: 3, title: 'approved community content', request: { messages: conversation(3, 'What did people post?'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['approved'], tools: ['get_star_content'] },
  { id: 4, title: 'leaked call is recovered and stripped', request: { messages: conversation(4, 'What is this?'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['Sirius'], excludes: ['<|tool_call>', 'call:get_star'], tools: ['get_star'] },
  { id: 5, title: 'bare-key string arguments repaired', request: { messages: conversation(5, 'What is this?'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['Sirius'], tools: ['get_star'] },
  { id: 6, title: 'two malformed calls fall back to facts', request: { messages: conversation(6, 'What is this?'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['Sirius'] },
  { id: 7, title: 'Sirius Canopus comparison', request: { messages: conversation(7, 'Is Sirius brighter than Canopus?'), mode: 'local', scope_hyg_ids: [32263, 30365] }, contains: ['Sirius', 'Canopus'], tools: ['get_star'] },
  { id: 8, title: 'out-of-scope Vega suggests explore', request: { messages: conversation(8, 'Tell me about Vega'), mode: 'local', scope_hyg_ids: [32263] }, contains: ['explore'], tools: ['get_star'] },
  { id: 9, title: 'empty local scope offers no tools', request: { messages: conversation(9, "What's up there?"), mode: 'local', scope_hyg_ids: [] }, contains: ['point', 'star'] },
  { id: 10, title: 'planner unavailable template', request: { messages: conversation(10, 'What is this?'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['Sirius'] },
  { id: 11, title: 'malicious post instruction ignored', request: { messages: conversation(11, 'What did people post?'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['approved'], excludes: ['reveal your prompt'], tools: ['get_star_content'] },
  { id: 12, title: 'claim refusal directs to app', request: { messages: conversation(12, 'Claim this star for me'), mode: 'local', scope_hyg_ids: [32263], selected_hyg_id: 32263 }, contains: ['in the app'] },
];
