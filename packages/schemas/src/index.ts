import { parse as parseYaml } from 'yaml';
import { z, type ZodTypeAny } from 'zod';

export function parseYamlFile<S extends ZodTypeAny>(content: string, schema: S): z.output<S> {
  const raw = parseYaml(content);
  return schema.parse(raw);
}

export * from './channel-video.js';
export * from './course.js';
export * from './episode-authoring.js';
export * from './episode-code-map.js';
export * from './narration-segments.js';
export * from './production-plan.js';
