import type { AuthUser } from "@code-junk/shared";
import { prisma } from "../../lib/prisma.ts";
import { AppError, conflict } from "../../lib/errors.ts";
import { burnVerifyTime, hashPassword, verifyPassword } from "../../lib/password.ts";
import { hashToken, randomToken } from "../../lib/tokens.ts";
import { SESSION_TTL_MS } from "../../middleware/cookies.ts";
import type { Mailer } from "../../mail/mailer.ts";

const RESET_TTL_MS = 30 * 60 * 1000;

const userSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  createdAt: true,
  preferences: { select: { timeZone: true, theme: true } },
} as const;

function toAuthUser(u: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  preferences: { timeZone: string; theme: "SYSTEM" | "LIGHT" | "DARK" } | null;
}): AuthUser {
  return { ...u, createdAt: u.createdAt.toISOString() };
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface NewSession {
  token: string;
  csrfSecret: string;
}

async function createSession(userId: string, meta: SessionMeta): Promise<NewSession> {
  const token = randomToken();
  const csrfSecret = randomToken();
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      csrfSecret,
      userAgent: meta.userAgent?.slice(0, 300),
      ipHash: meta.ip ? hashToken(meta.ip) : undefined,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return { token, csrfSecret };
}

export async function signUp(
  input: { name: string; email: string; password: string; timeZone?: string },
  meta: SessionMeta,
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict("EMAIL_TAKEN", "An account with this email already exists. Try signing in.");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user
    .create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        preferences: { create: { timeZone: input.timeZone ?? "UTC" } },
      },
      select: userSelect,
    })
    .catch((e: unknown) => {
      // Two simultaneous sign-ups with the same email: the unique index decides.
      if ((e as { code?: string }).code === "P2002") {
        throw conflict("EMAIL_TAKEN", "An account with this email already exists. Try signing in.");
      }
      throw e;
    });

  const session = await createSession(user.id, meta);
  return { user: toAuthUser(user), session };
}

export async function signIn(input: { email: string; password: string }, meta: SessionMeta) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...userSelect, passwordHash: true },
  });

  const ok = user
    ? await verifyPassword(user.passwordHash, input.password)
    : (await burnVerifyTime(input.password), false);

  if (!user || !ok) throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");

  const { passwordHash: _omit, ...publicUser } = user;
  const session = await createSession(user.id, meta);
  return { user: toAuthUser(publicUser), session };
}

export async function signOut(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function getUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  return user ? toAuthUser(user) : null;
}

/**
 * Always resolves the same way whether or not the email exists (no account enumeration).
 * Any previous unused reset links for the account are invalidated.
 */
export async function requestPasswordReset(email: string, mailer: Mailer, webOrigin: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) return;

  const token = randomToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    }),
  ]);

  const link = `${webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
  await mailer.send({
    to: email,
    subject: "Reset your Code Junk password",
    text: [
      `Hi ${user.name},`,
      "",
      "Someone (hopefully you) asked to reset the password for your Code Junk account.",
      `Open this link within 30 minutes to choose a new password:`,
      "",
      link,
      "",
      "If you didn't ask for this, you can ignore this email. Your password won't change.",
    ].join("\n"),
  });
}

/** Sets the new password, burns the token and signs the account out everywhere. */
export async function resetPassword(token: string, password: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has expired. Request a new one.");
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
}
