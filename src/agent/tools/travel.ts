import type { FactCard } from '../types.js';
import type { ToolDef, ToolEnv, ToolResult } from './types.js';
import { ToolDenied } from './types.js';
import { factCard, readFacts } from './facts.js';

const INTEGER_ID = { type: 'integer', minimum: 0 };

export const computeTravelTime: ToolDef = {
  name: 'compute_travel_time',
  description: 'Calculate travel time using the user’s selected fraction of light speed.',
  parameters: {
    type: 'object',
    properties: {
      hyg_id: INTEGER_ID,
      speed_c: { type: 'number', minimum: 0.01, maximum: 0.999 },
    },
    required: ['hyg_id'],
    additionalProperties: false,
  },
  modes: ['local', 'explore'],
  clients: ['ios', 'web'],
  access: 'read',
  idArgs: ['hyg_id'],
  async run(args, env, signal): Promise<ToolResult> {
    const hygId = args.hyg_id as number;
    const speed = typeof args.speed_c === 'number' ? args.speed_c : env.prefs.speed_c;
    const facts = await readFacts(env, hygId, signal);
    if (facts.distance_ly === null) throw new ToolDenied('distance_unknown');
    const travel = await env.backend.travelTime(hygId, speed, env.ctx.userId, signal);
    if (travel === null) throw new ToolDenied('distance_unknown');
    const card: FactCard = { ...factCard(facts), travel };
    return {
      data: {
        hyg_id: hygId,
        speed_c: travel.speed_c,
        earth_years: travel.earth_years,
        ship_years: travel.ship_years,
        years_lost: travel.years_lost,
      },
      card,
      refs: [hygId],
    };
  },
};
