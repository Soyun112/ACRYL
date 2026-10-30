import { z } from "zod";
import { BATCH_SETTINGS } from "@/lib/criteria";
import { lookupDemoRows } from "@/server/demo-catalog";

export const dynamic = "force-dynamic";

const fieldSchema = z.string().max(BATCH_SETTINGS.maxFieldLength);
const bodySchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            contactId: z.string().trim().min(1).max(200),
            fields: z
              .object({
                세그먼트: fieldSchema,
                요청유형: fieldSchema,
                현장요청: fieldSchema,
                관심제품: fieldSchema,
                관심분야: fieldSchema,
                참관목적: fieldSchema,
                후속미팅희망: fieldSchema,
              })
              .strict(),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict();

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const ids = parsed.data.rows.map((row) => row.contactId);
  if (new Set(ids).size !== ids.length) {
    return Response.json({ message: "접점ID가 중복되었습니다." }, { status: 400 });
  }
  const result = lookupDemoRows(
    parsed.data.rows.map((row) => ({
      contactId: row.contactId,
      fields: {
        세그먼트: row.fields.세그먼트,
        요청유형: row.fields.요청유형,
        현장요청: row.fields.현장요청,
        관심제품: row.fields.관심제품,
        관심분야: row.fields.관심분야,
        참관목적: row.fields.참관목적,
        후속미팅희망: row.fields.후속미팅희망,
      },
    })),
  );
  return Response.json(result);
}
