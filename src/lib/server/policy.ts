import { db } from "../db";
import { DEFAULT_POLICY, policySchema, type Policy } from "../policy";
import { type Context, audit } from "./auth";

export async function getPolicy(): Promise<Policy> {
  const row = (await db
    .prepare("SELECT value FROM app_settings WHERE key='policy'")
    .get()) as { value: string } | undefined;
  if (!row) return DEFAULT_POLICY;
  try {
    return policySchema.parse({ ...DEFAULT_POLICY, ...JSON.parse(row.value) });
  } catch {
    return DEFAULT_POLICY;
  }
}

export async function savePolicy(ctx: Context, input: Policy) {
  const before = await getPolicy();
  await db
    .prepare(
      "INSERT INTO app_settings VALUES ('policy',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(JSON.stringify(input));
  await audit(
    ctx,
    "Đổi quy định xưởng",
    `Trước ${JSON.stringify(before)}; Sau ${JSON.stringify(input)}`,
    null,
    "management",
  );
  return input;
}
