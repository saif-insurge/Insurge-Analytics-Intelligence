import { auth } from "@clerk/nextjs/server";

/** Gets the current user's auth context. Throws if not authenticated. */
export async function requireAuth() {
  const { userId, orgId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return {
    userId,
    organizationId: orgId ?? `org_${userId}`,
  };
}
