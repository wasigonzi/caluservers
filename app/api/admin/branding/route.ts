import {NextRequest,NextResponse} from "next/server";
import {isAdmin} from "@/lib/auth";
import {getBranding,validateBranding} from "@/lib/branding";
import {trustedWrite} from "@/lib/request";
import {db} from "@/lib/db";
export const runtime="nodejs";
export async function GET(){if(!await isAdmin())return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({branding:await getBranding()},{headers:{"Cache-Control":"private, no-store"}})}
export async function POST(req:NextRequest){
 if(!await isAdmin())return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!trustedWrite(req))return NextResponse.json({error:"Invalid origin"},{status:403});
 try{
   const input=await req.json(),branding=validateBranding(input);
   await db.$transaction([
     db.caluSetting.upsert({where:{key:"site_branding"},create:{key:"site_branding",value:branding},update:{value:branding}}),
     db.adminAudit.create({data:{action:"branding.updated",details:"Public branding and site content updated"}})
   ]);
   return NextResponse.json({ok:true,branding},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to save settings"},{status:400})}
}
