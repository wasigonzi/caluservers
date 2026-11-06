import "server-only";
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {db} from "@/lib/db";
type Credentials={identifier:string;secret:string;accessKey?:string};
function key(){const raw=process.env.SETTINGS_ENCRYPTION_KEY||"";if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error("SETTINGS_ENCRYPTION_KEY must be a 64-character hex string");return Buffer.from(raw,"hex")}
function encrypt(data:Credentials){const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",key(),iv),cipher=Buffer.concat([c.update(JSON.stringify(data)),c.final()]);return [iv.toString("hex"),c.getAuthTag().toString("hex"),cipher.toString("hex")].join(":")}
function decrypt(blob:string):Credentials{const [i,t,data]=blob.split(":");const d=createDecipheriv("aes-256-gcm",key(),Buffer.from(i,"hex"));d.setAuthTag(Buffer.from(t,"hex"));return JSON.parse(Buffer.concat([d.update(Buffer.from(data,"hex")),d.final()]).toString())}
export function endpointFor(raw:string){const value=raw.trim();const url=new URL(value);const host=(process.env.WHMCS_ALLOWED_HOST||"").trim().toLowerCase();if(!host||url.hostname.toLowerCase()!==host||url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash)throw new Error("WHMCS URL must use HTTPS and match WHMCS_ALLOWED_HOST");let pathname=url.pathname.replace(/\/+$/,"");pathname=pathname.replace(/\/includes\/api\.php$/i,"");url.pathname=(pathname||"")+"/includes/api.php";return url.toString()}
export async function configuration(){return db.integrationConfig.findUnique({where:{id:"whmcs"}})}
export async function saveConfiguration(input:{url:string;identifier?:string;secret?:string;accessKey?:string}){
 const endpoint=endpointFor(input.url),old=await configuration();const previous=old?decrypt(old.encryptedCredentials):null;
 const identifier=input.identifier||previous?.identifier,secret=input.secret||previous?.secret;
 if(!identifier||!secret)throw new Error("Identifier and Secret are required");
 const credentials={identifier,secret,accessKey:input.accessKey!==undefined?input.accessKey:previous?.accessKey};
 await db.integrationConfig.upsert({where:{id:"whmcs"},create:{id:"whmcs",endpoint,encryptedCredentials:encrypt(credentials)},update:{endpoint,encryptedCredentials:encrypt(credentials)}});
 await db.adminAudit.create({data:{action:"whmcs.settings.updated",details:"WHMCS endpoint and credentials updated (secrets omitted)"}});
}
export const READ_ACTIONS={clients:"GetClients",orders:"GetOrders",invoices:"GetInvoices",products:"GetProducts",tickets:"GetTickets",services:"GetClientsProducts"} as const;
export type Section=keyof typeof READ_ACTIONS;
export async function whmcsCall(action:string,params:Record<string,string>={}){
 const cfg=await configuration();if(!cfg)throw new Error("WHMCS is not configured");const creds=decrypt(cfg.encryptedCredentials);
 const body=new URLSearchParams({action,username:creds.identifier,password:creds.secret,responsetype:"json",...params});
 if(creds.accessKey)body.set("accesskey",creds.accessKey);
 const response=await fetch(cfg.endpoint,{method:"POST",body,headers:{"Content-Type":"application/x-www-form-urlencoded"},cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error("WHMCS HTTP "+response.status);
 const raw=await response.text();let parsed:Record<string,unknown>;
 try{parsed=JSON.parse(raw)}catch{throw new Error("Invalid WHMCS response; check API URL and access permissions")}
 if(parsed.result!=="success")throw new Error(String(parsed.message||"WHMCS rejected request"));
 return parsed;
}
