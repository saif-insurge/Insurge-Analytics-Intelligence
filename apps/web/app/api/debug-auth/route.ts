import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const authResult = await auth();
  return NextResponse.json({
    userId: authResult.userId,
    orgId: authResult.orgId,
    sessionId: authResult.sessionId,
    keys: Object.keys(authResult),
  });
}
