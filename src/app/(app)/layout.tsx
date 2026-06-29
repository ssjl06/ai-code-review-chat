import Nav from "@/components/Nav";
import { requireUserId } from "@/server/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUserId(); // gate the whole (app) segment behind auth
  return (
    <>
      <Nav />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
    </>
  );
}
