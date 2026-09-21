import { Schema, SchemaOptions, Types } from 'mongoose';

function stringifyValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = stringifyValue(item);
    }
    return out;
  }
  return value;
}

/**
 * Base schema helper (inventory §1 "core"): timestamps, `versionKey: false`,
 * and a `toJSON` transform that stringifies every ObjectId.
 */
export function createSchema(
  definition: Record<string, unknown>,
  options: SchemaOptions = {},
): Schema {
  return new Schema(definition, {
    timestamps: true,
    versionKey: false,
    id: true,
    minimize: false,
    toJSON: {
      virtuals: false,
      transform: (_doc, ret) => stringifyValue(ret),
    },
    ...options,
  });
}
