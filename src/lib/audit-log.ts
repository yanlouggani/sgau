import { createClient } from "@/lib/supabase/server";

export type AuditAction =
  | "payment.create"
  | "payment.update"
  | "payroll.generate"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "user.reset_password";

/**
 * Journalise une action sensible de façon non-bloquante.
 */
export async function logAuditEvent(params: {
  action: AuditAction;
  targetId?: string;
  targetType?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      user_id: user?.id || null,
      action: params.action,
      target_id: params.targetId || null,
      target_type: params.targetType || null,
      details: params.details || {},
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("audit_logs").insert(payload);
    if (error) {
      console.warn("[AUDIT_LOG_INFO] audit_logs table not active or error:", error.message);
    }
  } catch (err) {
    console.warn("[AUDIT_LOG_ERROR]", err);
  }
}
