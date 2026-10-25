import type { ToolDef, ToolResult } from './types.js';

export const findStarsNear: ToolDef = {
  name: 'find_stars_near',
  description: 'Find up to four bright catalog stars near a selected star.',
  parameters: {
    type: 'object',
    properties: {
      hyg_id: { type: 'integer', minimum: 0 },
      radius_deg: { type: 'number', minimum: 1, maximum: 20 },
      mag_limit: { type: 'number' },
    },
    required: ['hyg_id'],
    additionalProperties: false,
  },
  modes: ['local', 'explore'],
  clients: ['ios', 'web'],
  access: 'read',
  idArgs: ['hyg_id'],
  async run(args, env): Promise<ToolResult> {
    const centerId = args.hyg_id as number;
    const radius = typeof args.radius_deg === 'number' ? args.radius_deg : 5;
    const magnitude = typeof args.mag_limit === 'number' ? args.mag_limit : 6.5;
    const nearby = env.catalog.near(
      centerId,
      radius,
      magnitude,
      env.ctx.mode === 'local' ? (id) => env.ctx.inView.has(id) : undefined,
      4,
    );
    return {
      data: {
        hyg_id: centerId,
        results: nearby.map(({ star, separation_deg }) => ({
          hyg_id: star.hyg_id,
          name: star.name,
          mag: star.mag,
          separation_deg,
        })),
        result_count: nearby.length,
      },
      refs: [centerId, ...nearby.map(({ star }) => star.hyg_id)],
    };
  },
};
