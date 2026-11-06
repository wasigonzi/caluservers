import "server-only";
import {db} from "@/lib/db";

export type SiteBranding = {
  brandName:string; logoUrl:string; faviconUrl:string; primaryColor:string; secondaryColor:string;
  backgroundColor:string; heading:string; highlight:string; subtitle:string; eyebrow:string;
  footerText:string; customerPortalUrl:string; contactEmail:string; supportUrl:string;
  showHosting:boolean; showVps:boolean; showDedicated:boolean;
};
export const defaultBranding:SiteBranding={
  brandName:"CALUSERVERS",logoUrl:"",faviconUrl:"",primaryColor:"#00e5ff",
  secondaryColor:"#007bff",backgroundColor:"#050b12",
  heading:"Potencia",highlight:"sin límites",subtitle:"para tus proyectos.",
  eyebrow:"CLOUD INFRASTRUCTURE",
  footerText:"Hosting • VPS • Dedicated Servers",customerPortalUrl:"https://client.caluservers.com/",
  contactEmail:"",supportUrl:"https://client.caluservers.com/submitticket.php",
  showHosting:true,showVps:true,showDedicated:true
};
type Key=keyof SiteBranding;
const colors:Key[]=["primaryColor","secondaryColor","backgroundColor"];
const urls:Key[]=["logoUrl","faviconUrl","customerPortalUrl","supportUrl"];
const bools:Key[]=["showHosting","showVps","showDedicated"];
export function validateBranding(input:unknown):SiteBranding{
  if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Invalid branding configuration");
  const raw=input as Record<string,unknown>;
  const out={...defaultBranding};
  for(const key of Object.keys(defaultBranding) as Key[]){
    const val=raw[key];if(val===undefined)continue;
    if(bools.includes(key)){if(typeof val!=="boolean")throw Error("Invalid "+key);(out as unknown as Record<string,unknown>)[key]=val;continue}
    if(typeof val!=="string"||val.length>500)throw Error("Invalid "+key);
    let normalized=val.trim();
    if(colors.includes(key)&&!/^\#[0-9a-fA-F]{6}$/.test(normalized))throw Error("Color must be #RRGGBB");
    if(urls.includes(key)&&normalized){
      if(normalized.startsWith("/")){if(normalized.startsWith("//")||normalized.includes("\\")||normalized.includes(".."))throw Error("Invalid relative URL")}
      else{let url:URL;try{url=new URL(normalized)}catch{throw Error("Invalid URL")};if(url.protocol!=="https:"||url.username||url.password)throw Error("HTTPS required")}
    }
    if(key==="contactEmail"&&normalized&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw Error("Invalid contact email");
    (out as unknown as Record<string,unknown>)[key]=normalized;
  }
  if(!out.brandName||!out.heading||!out.customerPortalUrl)throw Error("Required branding fields are missing");
  return out;
}
export async function getBranding():Promise<SiteBranding>{
  try{
    const record=await db.caluSetting.findUnique({where:{key:"site_branding"}});
    return record?validateBranding({...defaultBranding,...(record.value as object)}):defaultBranding;
  }catch(e){console.error("Unable to load branding settings",e instanceof Error?e.name:"Unknown");return defaultBranding}
}
