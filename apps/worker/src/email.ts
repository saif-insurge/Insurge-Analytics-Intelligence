/**
 * Email notifications via Resend.
 * Sends "your audit is ready" email when an audit completes.
 */

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendAuditReadyEmail(opts: {
  to: string;
  domain: string;
  score: number;
  grade: string;
  reportUrl: string;
  auditId: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.log("RESEND_API_KEY not set, skipping email");
    return;
  }

  const gradeLabel = opts.grade === "pass" ? "Good" : opts.grade === "evaluate" ? "Needs Work" : "Critical Issues";
  const gradeColor = opts.grade === "pass" ? "#10b981" : opts.grade === "evaluate" ? "#f59e0b" : "#ef4444";

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Insurge <onboarding@resend.dev>",
    to: opts.to,
    subject: `GA4 Audit Ready — ${opts.domain} (${opts.score}/100)`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <strong style="font-size: 18px; color: #111;">Insurge</strong>
          <span style="font-size: 10px; color: #6366f1; text-transform: uppercase; letter-spacing: 1.5px; margin-left: 8px;">Tracking Intelligence</span>
        </div>

        <h1 style="font-size: 22px; color: #111; margin-bottom: 8px;">Your GA4 audit is ready</h1>
        <p style="color: #666; font-size: 15px; margin-bottom: 24px;">
          We've completed the ecommerce tracking audit for <strong>${opts.domain}</strong>.
        </p>

        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 48px; font-weight: 700; color: ${gradeColor};">${opts.score}</div>
          <div style="font-size: 13px; color: #999;">out of 100 — ${gradeLabel}</div>
        </div>

        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${opts.reportUrl}" style="display: inline-block; background: #6366f1; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 15px;">
            View Full Report
          </a>
        </div>

        <p style="color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 16px;">
          This is an automated audit by Insurge Tracking Intelligence.
          <a href="${opts.reportUrl}" style="color: #6366f1;">View report</a>
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send email:", error);
  }
}
