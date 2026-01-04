import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

export async function ensureDefaultProject(userId: string) {
  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.isDefault, true)))
    .orderBy(desc(projects.updatedAt))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(projects)
    .values({
      userId,
      name: "My Project",
      isDefault: true,
    })
    .returning();

  return created;
}


