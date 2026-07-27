"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export async function registerAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    !name ||
    !email ||
    !password
  ) {
    return { error: "Vui lòng điền đầy đủ thông tin" };
  }

  if (password.length < 8) {
    return { error: "Mật khẩu phải có ít nhất 8 ký tự" };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Email đã được đăng ký" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.create({
    data: { name, email, passwordHash },
  });

  redirect("/login");
}
