import { auth, signOut } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-4">
        Xin chào, {session?.user?.name} ({session?.user?.email}) — role:{" "}
        {session?.user?.role}
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="mt-4 rounded border px-3 py-2">
          Đăng xuất
        </button>
      </form>
    </main>
  );
}
