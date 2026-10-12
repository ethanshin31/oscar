import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Hud from "@/components/Hud";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { MODEL } from "@/lib/persona";

export const dynamic = "force-dynamic";

export default async function Home() {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) redirect("/login");
  const home = {
    name: process.env.OSCAR_HOME_NAME || "Mississippi, USA",
    lat: Number(process.env.OSCAR_HOME_LAT) || 32.3,
    lon: Number(process.env.OSCAR_HOME_LON) || -90.18,
  };
  return <Hud userName={process.env.OSCAR_USER_NAME || "Peter"} model={MODEL} home={home} />;
}
