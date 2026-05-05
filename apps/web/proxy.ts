import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/audits(.*)",
  "/api/audits(.*)",
]);

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/report/(.*)",
  "/api/render-pdf",
]);

export default clerkMiddleware(async (auth, req) => {
  const { isAuthenticated } = await auth();

  // Redirect root to /audits (signed in) or /sign-in (signed out)
  if (req.nextUrl.pathname === "/") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/audits", req.url));
    }
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // Protect dashboard and API routes
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
