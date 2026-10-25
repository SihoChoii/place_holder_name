import { Ajv, type ValidateFunction } from 'ajv';

import type { ToolDef } from './types.js';

const ajv = new Ajv({ allErrors: false, coerceTypes: false, strict: false });
const validators = new Map<ToolDef, ValidateFunction>();

function validatorFor(tool: ToolDef): ValidateFunction {
  const existing = validators.get(tool);
  if (existing !== undefined) return existing;
  const validator = ajv.compile(tool.parameters);
  validators.set(tool, validator);
  return validator;
}

export function validateArgs(tool: ToolDef, args: unknown): string | null {
  const validator = validatorFor(tool);
  if (validator(args)) return null;
  const error = validator.errors?.[0];
  if (error === undefined) return 'invalid arguments';
  const additional = error.params.additionalProperty;
  const location = error.instancePath || (typeof additional === 'string' ? additional : undefined);
  return `${location ?? 'arguments'} ${error.message ?? 'is invalid'}`.trim();
}
