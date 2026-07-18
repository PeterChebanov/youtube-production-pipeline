import {
  BUILD_APP_BALANCE_TARGETS,
  countNarrationWords,
  readNarrativeFromVideo,
  type NarrativeBalance,
} from '@ecpe/prompts';
import { reportProgress } from './progress.js';

export interface ScriptSectionTiming {
  title: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  kind: 'theory' | 'build' | 'demo' | 'hook' | 'other';
  words: number;
}

export function classifyScriptSectionTitle(title: string): ScriptSectionTiming['kind'] {
  const t = title.toLowerCase();
  if (/\btheory\b/.test(t) || /\brecap\b/.test(t) || /\bconcept\b/.test(t)) return 'theory';
  if (/\bbuild\b/.test(t) || /\bwalkthrough\b/.test(t) || /\bimplement/.test(t) || /\bcode\b/.test(t)) {
    return 'build';
  }
  if (/\bdemo\b/.test(t) || /\bverif/.test(t) || /\bresult\b/.test(t)) return 'demo';
  if (/\bhook\b/.test(t) || /\bintro\b/.test(t) || /\boutro\b/.test(t) || /\bclose\b/.test(t)) {
    return 'hook';
  }
  return 'other';
}

function extractNarration(sectionBody: string): string {
  const match = sectionBody.match(
    /\*\*What I Should Say:\*\*\s*\n(?:"([\s\S]*?)"|([\s\S]*?))(?=\n\*\*|\n---|\n## |$)/i,
  );
  if (!match) return '';
  return (match[1] ?? match[2] ?? '').trim();
}

/** Balance by topic headers + narration words (no clock timecodes). */
export function parseScriptSectionTimings(scriptMarkdown: string): ScriptSectionTiming[] {
  const sections: ScriptSectionTiming[] = [];
  const parts = scriptMarkdown.split(/(?=^##\s+)/m);
  for (const part of parts) {
    if (!part.trim().startsWith('##')) continue;
    const headingEnd = part.indexOf('\n');
    const headingLine = (headingEnd >= 0 ? part.slice(0, headingEnd) : part)
      .replace(/^##\s*/, '')
      .trim();
    // Strip legacy clocks if present
    const title = headingLine.replace(/^\[\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\]\s*/, '').trim();
    const body = headingEnd >= 0 ? part.slice(headingEnd + 1) : '';
    const narration = extractNarration(body);
    const words = narration ? countNarrationWords(narration) : 0;
    sections.push({
      title,
      startSec: 0,
      endSec: 0,
      durationSec: words, // reuse field as word weight for share math
      kind: classifyScriptSectionTitle(title),
      words,
    });
  }
  return sections;
}

export function estimateScriptTheoryShare(scriptMarkdown: string): {
  theorySec: number;
  practiceSec: number;
  totalSec: number;
  theoryShare: number | null;
  sections: ScriptSectionTiming[];
} {
  const sections = parseScriptSectionTimings(scriptMarkdown);
  let theoryWords = 0;
  let practiceWords = 0;
  let otherWords = 0;
  for (const s of sections) {
    if (s.kind === 'theory') theoryWords += s.words;
    else if (s.kind === 'build' || s.kind === 'demo') practiceWords += s.words;
    else otherWords += s.words;
  }
  const totalWords = theoryWords + practiceWords + otherWords;
  if (totalWords <= 0) {
    return {
      theorySec: 0,
      practiceSec: 0,
      totalSec: 0,
      theoryShare: null,
      sections,
    };
  }
  const classified = theoryWords + practiceWords;
  const theoryShare = classified > 0 ? theoryWords / classified : null;
  return {
    theorySec: theoryWords,
    practiceSec: practiceWords,
    totalSec: totalWords,
    theoryShare,
    sections,
  };
}

const CODE_PATH_RE =
  /\b[\w./-]+\.(?:py|ts|tsx|js|jsx|sql|yml|yaml|toml|json|md|sh)\b|`[\w./-]+`/gi;

export function estimateResearchImplementationSignal(researchMarkdown: string): {
  codePathMentions: number;
  theoryHeavy: boolean;
} {
  const codePathMentions = (researchMarkdown.match(CODE_PATH_RE) ?? []).length;
  const lower = researchMarkdown.toLowerCase();
  const theoryMarkers =
    (lower.match(/\b(must know|token limit|cosine distance|embedding model|vector database theory)\b/g) ??
      []).length;
  const theoryHeavy = codePathMentions < 8 && theoryMarkers >= 4;
  return { codePathMentions, theoryHeavy };
}

export function logBuildAppNarrativeBalance(
  stageId: string,
  video: Record<string, unknown> | undefined,
): NarrativeBalance {
  const { balance } = readNarrativeFromVideo(video);
  const targets = BUILD_APP_BALANCE_TARGETS[balance];
  reportProgress({
    stage: stageId,
    message: `Build-app narrative_balance=${balance} (${targets.summary})`,
  });
  return balance;
}

/** Soft warnings only — never fails the pipeline. */
export function warnBuildAppBalanceAfterStage(
  stageId: string,
  content: string,
  balance: NarrativeBalance,
): void {
  const targets = BUILD_APP_BALANCE_TARGETS[balance];

  if (stageId === 'script-writer' || stageId === 'youtube-editor') {
    const est = estimateScriptTheoryShare(content);
    if (est.theoryShare == null) {
      reportProgress({
        stage: stageId,
        message:
          'Build-app balance check: no ## topic sections with narration found — cannot estimate theory/practice split',
      });
      return;
    }
    const pct = Math.round(est.theoryShare * 100);
    const maxPct = Math.round(targets.theoryMax * 100);
    const minPct = Math.round(targets.theoryMin * 100);
    if (est.theoryShare > targets.theoryMax + 0.05) {
      reportProgress({
        stage: stageId,
        message: `Build-app balance ⚠️ theory ~${pct}% of classified words (target ${minPct}–${maxPct}% for ${balance}) — lean into code walkthrough/demo`,
      });
    } else if (est.theoryShare < targets.theoryMin - 0.08 && balance === 'theory-first') {
      reportProgress({
        stage: stageId,
        message: `Build-app balance note: theory ~${pct}% (target ${minPct}–${maxPct}% for ${balance})`,
      });
    } else {
      reportProgress({
        stage: stageId,
        message: `Build-app balance OK: theory ~${pct}% of classified words (target ${minPct}–${maxPct}% for ${balance})`,
      });
    }
    return;
  }

  if (stageId === 'research') {
    const signal = estimateResearchImplementationSignal(content);
    if (balance === 'practice-first' && signal.theoryHeavy) {
      reportProgress({
        stage: stageId,
        message: `Build-app balance ⚠️ research looks theory-heavy for practice-first (code-path mentions=${signal.codePathMentions}) — prefer file/API facts from Demo walkthrough`,
      });
    } else {
      reportProgress({
        stage: stageId,
        message: `Build-app research signal: code-path mentions=${signal.codePathMentions}`,
      });
    }
  }
}
