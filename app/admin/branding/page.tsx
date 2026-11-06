import {redirect} from "next/navigation";
import {isAdmin} from "@/lib/auth";
import {getBranding} from "@/lib/branding";
import BrandingForm from "@/components/BrandingForm";
export const dynamic="force-dynamic";
export default async function BrandingPage(){
 if(!await isAdmin())redirect("/admin/login");
 const config=await getBranding();
 return <><p className="accent">CONFIGURACIÓN / IDENTIDAD</p><h1>Branding y contenido</h1><p className="muted">Administra la identidad visual y los textos públicos de CaluServers. Los cambios se guardan en Supabase.</p><BrandingForm initial={config}/></>;
}
