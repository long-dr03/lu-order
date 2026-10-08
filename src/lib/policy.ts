import { z } from "zod";

/** Workshop rules the owner can tune without code changes. */
export const policySchema = z
  .object({
    /** How far above the ordered quantity cutting may go. */
    overcut_percent: z.number().int().min(0).max(100),
    /** Whether pieces cut above the order are paid as piece-work. */
    overcut_paid: z.boolean(),
    /** Share of the unit price suggested as deduction for a defective piece. 0 = only track. */
    defect_penalty_percent: z.number().int().min(0).max(100),
  })
  .strict();
export type Policy = z.infer<typeof policySchema>;
export const DEFAULT_POLICY: Policy = {
  overcut_percent: 10,
  overcut_paid: true,
  defect_penalty_percent: 0,
};
