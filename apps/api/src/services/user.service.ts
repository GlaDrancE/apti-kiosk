import { prisma, type Prisma } from '@apti/db';
import type { Role } from '@apti/shared';
import { notFound } from '../lib/errors.js';

export async function listUsers(params: {
  page: number;
  pageSize: number;
  role?: Role;
  search?: string;
}) {
  const where: Prisma.UserProfileWhereInput = {
    ...(params.role ? { role: params.role } : {}),
    ...(params.search
      ? {
          OR: [
            { email: { contains: params.search, mode: 'insensitive' } },
            { fullName: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.userProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.userProfile.count({ where }),
  ]);

  return { items, total, page: params.page, pageSize: params.pageSize };
}

export async function getUser(id: string) {
  const user = await prisma.userProfile.findUnique({ where: { id } });
  if (!user) throw notFound('User not found');
  return user;
}

export function updateUserRole(id: string, role: Role) {
  return prisma.userProfile.update({ where: { id }, data: { role } });
}
