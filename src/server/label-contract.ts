import { z } from "zod";
import { ANALYSIS_FIELDS, BATCH_SETTINGS, CRITERIA_VERSION, type AnalysisField } from "@/lib/criteria";

const fieldShape = Object.fromEntries(
  ANALYSIS_FIELDS.map((field) => [field, z.string().max(BATCH_SETTINGS.maxFieldLength)]),
) as Record<AnalysisField, z.ZodString>;

export const labelRequestSchema = z
  .object({
    criteriaVersion: z.literal(CRITERIA_VERSION),
    contacts: z
      .array(
        z
          .object({
            contactId: z.string().min(1).max(200),
            fields: z.object(fieldShape).strict(),
          })
          .strict(),
      )
      .min(1)
      .max(BATCH_SETTINGS.maxBatchSize),
  })
  .strict();

export type LabelRequest = z.infer<typeof labelRequestSchema>;
