import type { NoulQuestion } from "../models/clef.js";

/** Checked-in moderation policy (spec §9). Bump POLICY_VERSION whenever wording or thresholds change. */
export const POLICY_VERSION = "star-tagger-policy-v1-2026-10-25";

export const CATEGORIES = {
  sexual: {
    threshold: 0.5,
    reject: "explicit sexual acts or sexually explicit imagery or text",
    allow: "nonsexual people, ordinary clothing, and factual nonexplicit discussion",
  },
  graphic_violence: {
    threshold: 0.5,
    reject: "gore or graphic severe injury",
    allow: "astronomy, ordinary sports, and non-graphic factual discussion",
  },
  targeted_abuse: {
    threshold: 0.5,
    reject: "targeted harassment, dehumanization, or hateful attacks on people or groups",
    allow: "civil disagreement and non-abusive discussion",
  },
  threats_harm: {
    threshold: 0.5,
    reject: "credible threats, or encouragement of violence or self-harm",
    allow: "neutral reporting, prevention, and supportive discussion",
  },
  spam_fraud: {
    threshold: 0.5,
    reject: "unsolicited repetitive promotion, phishing, or deceptive solicitations",
    allow: "relevant legitimate links and ordinary personal posts",
  },
} as const;
export type Category = keyof typeof CATEGORIES;

/** One yes/no question per category; the answer's noul value is P(violates). */
export function questionsFor(component: "text" | "image"): Record<Category, NoulQuestion> {
  const what = component === "image" ? "the attached image" : "this user-submitted text";
  return Object.fromEntries(
    Object.entries(CATEGORIES).map(([name, c]) => [
      name,
      {
        type: "noul" as const,
        instructions: `Content moderation for a public stargazing app. Does ${what} contain ${c.reject}? Content that only shows ${c.allow} does not violate this rule.`,
        criteria: { true: `Violates: contains ${c.reject}`, false: `Acceptable: ${c.allow} or unrelated content` },
      },
    ]),
  ) as Record<Category, NoulQuestion>;
}

export function verdict(scores: Record<string, number>) {
  const violations = (Object.keys(CATEGORIES) as Category[]).filter((c) => scores[c] >= CATEGORIES[c].threshold);
  return { approved: violations.length === 0, violations };
}
