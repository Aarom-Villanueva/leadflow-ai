import { z } from "zod";

const environmentSchema = z.object({
  LOG_LEVEL: z.enum(["error", "warn", "info"]).default("info"),
});

/** Pure parser: never serializes supplied values or unrelated process variables. */
export function loadEnvironment(input: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid environment configuration: ${names.join(", ")}`);
  }
  return result.data;
}
