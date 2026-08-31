import type { Request } from 'express';
import { prisma } from '@apti/db';

/**
 * Record an admin action. Fire-and-forget: an audit write must never fail the
 * request that triggered it, but it must also never be silently lost, so a
 * failure is logged loudly.
 */
export function audit(
  req: Request,
  action: string,
  targetType: string,
  targetId?: string | null,
  metadata: Record<string, unknown> = {},
) {
  const actorId = req.user?.id;
  if (!actorId) return;

  prisma.auditLog
    .create({
      data: {
        actorId,
        action,
        targetType,
        targetId: targetId ?? null,
        metadata: { ...metadata, ip: req.ip, userAgent: req.get('user-agent') ?? null },
      },
    })
    .catch((err) => console.error('audit log write failed', { action, targetType, err }));
}
