import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";

export default async function RootPage() {
  const session = await currentSession();
  redirect(session ? "/today" : "/signin");
}
