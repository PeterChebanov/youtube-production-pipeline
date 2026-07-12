import { stringify as stringifyYaml } from 'yaml';
import { VideoSchema, parseYamlFile } from '@ecpe/schemas';
import { ARTIFACTS } from './artifacts.js';
import { readArtifact, writeArtifact } from './project.js';

export interface RoadmapMetadata {
  title?: string;
  topic?: string;
  runtimeMinutes?: number;
}

/** Extract title, topic, and runtime from a creator roadmap (source-brief). */
export function parseRoadmapMetadata(brief: string): RoadmapMetadata {
  const lines = brief
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const meta: RoadmapMetadata = {};

  if (lines[0]) {
    meta.title = lines[0].replace(/^#+\s*/, '').replace(/^\*+\s*/, '').trim();
  }

  const runtimeLine = lines.find((l, i) => i > 0 && /runtime/i.test(l)) ?? lines[1];
  if (runtimeLine) {
    const m =
      runtimeLine.match(/runtime:\s*~?\s*(\d+(?:\.\d+)?)/i) ??
      runtimeLine.match(/(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?|m)\b/i);
    if (m) meta.runtimeMinutes = Number(m[1]);
  }

  const topicLine = lines.find((l) => /^topic:/i.test(l));
  if (topicLine) {
    meta.topic = topicLine.replace(/^topic:\s*/i, '').trim();
  } else if (lines[2] && !/^\[/.test(lines[2]) && !/^runtime/i.test(lines[2])) {
    meta.topic = lines[2].replace(/^#+\s*/, '').trim();
  }

  return meta;
}

/** Apply roadmap metadata to video.yaml (runtime, title, topic) when present. */
export async function syncVideoYamlFromRoadmap(
  projectRoot: string,
  brief: string,
): Promise<void> {
  const meta = parseRoadmapMetadata(brief);
  if (!meta.runtimeMinutes && !meta.title && !meta.topic) return;

  const raw = await readArtifact(projectRoot, ARTIFACTS.video);
  const video = parseYamlFile(raw, VideoSchema);

  if (meta.runtimeMinutes && meta.runtimeMinutes > 0) {
    video.target_length_minutes = meta.runtimeMinutes;
  }
  if (meta.title) video.title = meta.title;
  if (meta.topic) video.topic = meta.topic;

  await writeArtifact(projectRoot, ARTIFACTS.video, stringifyYaml(video));
}
