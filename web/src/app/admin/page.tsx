import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import AdminPanel from "@/components/AdminPanel";
import ChangePassword from "@/components/ChangePassword";
import sql from "@/lib/db";
import { ensureEmailSchema } from "@/lib/emailTokens";

export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  // Anyone who isn't an admin gets a plain 404, not a hint the page exists.
  const admin = await currentAdmin();
  if (!admin) notFound();
  const weak = await ensureEmailSchema()
    .then(() => sql<{ password_weak: boolean }[]>`SELECT password_weak FROM users WHERE id = ${admin.id}`)
    .then((r) => !!r[0]?.password_weak)
    .catch(() => false);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="mt-1 text-sm text-muted">Manage users, songs and remixes, and clean up leftovers.</p>
      <div className="mt-3">
        <ChangePassword weak={weak} />
      </div>
      <AdminPanel adminId={admin.id} />
    </div>
  );
}
