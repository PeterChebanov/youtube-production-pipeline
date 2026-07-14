#!/usr/bin/env node
import { Command } from 'commander';
import {
  createProject,
  defaultProjectsRoot,
  exportEditManifestCsv,
  exportMontageGuide,
  getProjectInfo,
  isKnowledgePipelineCommand,
  isProductionPipelineCommand,
  KNOWLEDGE_STAGES,
  PRODUCTION_STAGES,
  runKnowledge,
  runEpisodeWrap,
  runPipelineStage,
  runProduction,
} from '@ecpe/core';
import {
  checkAnthropic,
  checkGemini,
  checkOpenAI,
  DEFAULT_LLM_PROVIDER,
  getLlmConfig,
  loadEnv,
  type LlmProviderId,
} from '@ecpe/llm';

const ALL_STAGES = [...KNOWLEDGE_STAGES, ...PRODUCTION_STAGES, 'knowledge', 'production', 'episode-wrap'];

const program = new Command();

program.name('ecpe').description('Educational Content Production Engine CLI').version('0.1.0');

program
  .command('project')
  .description('Manage ECPE project directories')
  .addCommand(
    new Command('init')
      .description('Create a new self-contained project folder')
      .requiredOption('-n, --name <name>', 'Project name (used for slug and defaults)')
      .option('-d, --dir <directory>', 'Parent directory for the project')
      .option('-t, --topic <topic>', 'Initial video topic')
      .action(async (opts: { name: string; dir?: string; topic?: string }) => {
        const parentDir = opts.dir ?? defaultProjectsRoot();
        const paths = await createProject(parentDir, opts.name, {
          video: opts.topic ? { topic: opts.topic } : undefined,
        });
        console.log(`Created project: ${paths.root}`);
      }),
  )
  .addCommand(
    new Command('info')
      .description('Show project metadata and artifact status')
      .argument('<projectRoot>', 'Path to project directory')
      .action(async (projectRoot: string) => {
        const info = await getProjectInfo(projectRoot);
        console.log(JSON.stringify(info, null, 2));
      }),
  );

program
  .command('run')
  .description('Run a pipeline stage or composite command')
  .argument('<stageId>', `Stage id (${ALL_STAGES.join(', ')})`)
  .requiredOption('-p, --project <path>', 'Project directory')
  .option('--provider <provider>', `LLM provider (anthropic, openai, gemini; default: ${DEFAULT_LLM_PROVIDER})`)
  .option('--model <model>', 'Override model name')
  .option('-r, --revision <notes>', 'Revision notes appended to the user prompt')
  .option('--scene <sceneId>', 'Scene id for render-scene stage')
  .option(
    '--renderer <renderer>',
    'Render only scenes for this renderer (repeatable, e.g. motion, mermaid)',
    (val: string, memo: string[]) => {
      memo.push(val);
      return memo;
    },
    [] as string[],
  )
  .option('--motion-ratio <ratio>', 'Fraction of animatable scenes as MP4 (0–1)', parseFloat)
  .action(
    async (
      stageId: string,
      opts: {
        project: string;
        provider?: string;
        model?: string;
        revision?: string;
        scene?: string;
        renderer?: string[];
        motionRatio?: number;
      },
    ) => {
      const runOpts = {
        projectPath: opts.project,
        provider: (opts.provider as LlmProviderId | undefined) ?? DEFAULT_LLM_PROVIDER,
        model: opts.model,
        revisionNotes: opts.revision,
        sceneId: opts.scene,
        renderers: opts.renderer?.length ? opts.renderer : undefined,
        motionRatio: opts.motionRatio,
      };

      if (isKnowledgePipelineCommand(stageId)) {
        const result = await runKnowledge(runOpts);
        for (const stage of result.stages) {
          console.log(`Wrote ${stage.outputFile} (${stage.content.length} chars)`);
        }
        return;
      }

      if (isProductionPipelineCommand(stageId)) {
        const result = await runProduction(runOpts);
        for (const stage of result.stages) {
          const extra =
            stage.rendered !== undefined
              ? ` — rendered ${stage.rendered}, failed ${stage.failed ?? 0}`
              : '';
          console.log(`Wrote ${stage.outputFile} (${stage.content.length} chars)${extra}`);
        }
        return;
      }

      if (stageId === 'episode-wrap') {
        const result = await runEpisodeWrap({ ...runOpts, force: true });
        console.log(`Updated ${result.outputFile} on course ${result.courseRoot}`);
        return;
      }

      const result = await runPipelineStage(stageId, runOpts);
      const extra =
        'rendered' in result && result.rendered !== undefined
          ? ` — rendered ${result.rendered}, failed ${result.failed ?? 0}`
          : '';
      console.log(`Wrote ${result.outputFile} (${result.content.length} chars)${extra}`);
    },
  );

program
  .command('export')
  .description('Export project artifacts')
  .argument('<kind>', 'Export kind (manifest-csv | montage-guide)')
  .requiredOption('-p, --project <path>', 'Project directory')
  .action(async (kind: string, opts: { project: string }) => {
    if (kind === 'manifest-csv') {
      const out = await exportEditManifestCsv(opts.project);
      console.log(`Wrote ${out}`);
      return;
    }
    if (kind === 'montage-guide') {
      const out = await exportMontageGuide(opts.project);
      console.log(`Wrote ${out}`);
      return;
    }
    throw new Error(`Unknown export kind: ${kind}`);
  });

program
  .command('llm')
  .description('LLM provider utilities')
  .addCommand(
    new Command('check')
      .description('Ping configured providers')
      .action(async () => {
        loadEnv();
        const cfg = getLlmConfig();

        if (cfg.anthropicApiKey) {
          const result = await checkAnthropic();
          console.log(`Anthropic (default): ${result.ok ? 'ok' : `FAIL — ${result.message}`}`);
        } else {
          console.log('Anthropic (default): skip (no ANTHROPIC_API_KEY)');
        }

        if (cfg.openaiApiKey) {
          const result = await checkOpenAI();
          console.log(`OpenAI: ${result.ok ? 'ok' : `FAIL — ${result.message}`}`);
        } else {
          console.log('OpenAI: skip (no OPENAI_API_KEY)');
        }

        if (cfg.geminiApiKey) {
          const result = await checkGemini();
          console.log(`Gemini: ${result.ok ? 'ok' : `FAIL — ${result.message}`}`);
        } else {
          console.log('Gemini: skip (no GEMINI_API_KEY)');
        }
      }),
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
