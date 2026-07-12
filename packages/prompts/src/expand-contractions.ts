/** Expand common English contractions for aloud reading (narration scripts). */
export function expandContractionsInText(text: string): string {
  const rules: Array<[RegExp, string]> = [
    [/\bI'm\b/g, 'I am'],
    [/\bI've\b/g, 'I have'],
    [/\bI'll\b/g, 'I will'],
    [/\bI'd\b/g, 'I would'],
    [/\bwon't\b/gi, 'will not'],
    [/\bcan't\b/gi, 'cannot'],
    [/\bcouldn't\b/gi, 'could not'],
    [/\bwouldn't\b/gi, 'would not'],
    [/\bshouldn't\b/gi, 'should not'],
    [/\bmightn't\b/gi, 'might not'],
    [/\bmustn't\b/gi, 'must not'],
    [/\bneedn't\b/gi, 'need not'],
    [/\bdidn't\b/gi, 'did not'],
    [/\bdoesn't\b/gi, 'does not'],
    [/\bdon't\b/gi, 'do not'],
    [/\bhaven't\b/gi, 'have not'],
    [/\bhasn't\b/gi, 'has not'],
    [/\bhadn't\b/gi, 'had not'],
    [/\bisn't\b/gi, 'is not'],
    [/\baren't\b/gi, 'are not'],
    [/\bwasn't\b/gi, 'was not'],
    [/\bweren't\b/gi, 'were not'],
    [/\bwhere's\b/gi, 'where is'],
    [/\bwhat's\b/gi, 'what is'],
    [/\bwho's\b/gi, 'who is'],
    [/\bhow's\b/gi, 'how is'],
    [/\bhere's\b/gi, 'here is'],
    [/\bthere's\b/gi, 'there is'],
    [/\bthat's\b/gi, 'that is'],
    [/\bit's\b/gi, 'it is'],
    [/\bwe're\b/gi, 'we are'],
    [/\bthey're\b/gi, 'they are'],
    [/\byou're\b/gi, 'you are'],
    [/\bwe've\b/gi, 'we have'],
    [/\bthey've\b/gi, 'they have'],
    [/\byou've\b/gi, 'you have'],
    [/\bwe'll\b/gi, 'we will'],
    [/\bthey'll\b/gi, 'they will'],
    [/\byou'll\b/gi, 'you will'],
    [/\bhe'll\b/gi, 'he will'],
    [/\bshe'll\b/gi, 'she will'],
    [/\bit'll\b/gi, 'it will'],
    [/\blet's\b/gi, 'let us'],
  ];

  let out = text;
  for (const [pattern, replacement] of rules) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Expand contractions inside every "What I Should Say" block. */
export function expandContractionsForNarration(scriptMarkdown: string): string {
  return scriptMarkdown.replace(
    /(\*\*What I Should Say:\*\*\s*\n)("?)([\s\S]*?)("?)(?=\n\*\*|\n---|\n## |$)/gi,
    (_full, label, openQuote, narration, closeQuote) => {
      const expanded = expandContractionsInText(narration);
      const q1 = openQuote || '';
      const q2 = closeQuote || openQuote || '';
      return `${label}${q1}${expanded}${q2}`;
    },
  );
}
