import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import AdminPanel from "@/components/AdminPanel";

export const metadata = { title: "Admin — Remixt" };

export default async function AdminPage() {
  // Anyone who isn't an admin gets a plain 404, not a hint the page exists.
  const admin = await currentAdmin();
  if (!admin) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="mt-1 text-sm text-muted">Manage users, songs and remixes, and clean up leftovers.</p>
      <AdminPanel adminId={admin.id} />
    </div>
  );
}
