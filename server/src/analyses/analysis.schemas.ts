import { z } from 'zod';

import { SuggestionGroup } from '../database/schemas/common';

/** Step 1 — compare_resume_jd. */
export const compareStepSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  atsScore: z.number().int().min(0).max(100),
  strongPoints: z.array(z.string().min(1).max(500)).max(20),
  weakPoints: z.array(z.string().min(1).max(500)).max(20),
  matchingSkills: z.array(z.string().min(1).max(120)).max(50),
  skillGaps: z.array(z.string().min(1).max(120)).max(50),
});
export type CompareStepOutput = z.infer<typeof compareStepSchema>;

/** Step 2 — generate_suggestions. */
export const suggestionsStepSchema = z.object({
  projectScore: z.number().int().min(0).max(100),
  suggestions: z
    .array(
      z.object({
        group: z.enum(SuggestionGroup),
        /** json-resume path the suggestion targets, e.g. "work[0].highlights". */
        fieldRef: z.string().min(1).max(200),
        title: z.string().min(1).max(300),
        description: z.string().min(1).max(5000),
        proposedValue: z.string().max(10_000).optional(),
      }),
    )
    .max(30),
});
export type SuggestionsStepOutput = z.infer<typeof suggestionsStepSchema>;

/** Step 3 — prepare_interview_questions. */
export const questionsStepSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(1000),
        suggestedAnswer: z.string().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(25),
});
export type QuestionsStepOutput = z.infer<typeof questionsStepSchema>;
