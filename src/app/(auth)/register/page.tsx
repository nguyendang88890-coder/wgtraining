"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "./actions";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, undefined);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Register</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="name"
          type="text"
          placeholder="Họ tên"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password (tối thiểu 8 ký tự)"
          required
          minLength={8}
          className="rounded border px-3 py-2"
        />
        {state?.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? "Đang tạo tài khoản..." : "Register"}
        </button>
      </form>
      <p className="text-sm">
        Đã có tài khoản?{" "}
        <Link href="/login" className="underline">
          Đăng nhập
        </Link>
      </p>
    </main>
  );
}
