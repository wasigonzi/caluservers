import "server-only";
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
const COOKIE="caluservers_admin_session";
function signature(v:string){const secret=process.env.AUTH_SECRET;if(!secret||secret.length<32)throw new Error("AUTH_SECRET is missing");return createHmac("sha256",secret).update(v).digest("hex")}
export function checkPassword(email:string,password:string){
 const hash=process.env.ADMIN_PASSWORD_HASH||"", expectedEmail=process.env.ADMIN_EMAIL||"";
 if(!expectedEmail||email.toLowerCase()!==expectedEmail.toLowerCase()||!hash.includes(":"))return false;
 const [salt,digest]=hash.split(":");if(!/^[0-9a-f]{32}$/i.test(salt)||!/^[0-9a-f]{128}$/i.test(digest))return false;
 const actual=scryptSync(password,Buffer.from(salt,"hex"),64),expected=Buffer.from(digest,"hex");
 return timingSafeEqual(actual,expected);
}
export function createSession(){const payload=Buffer.from(JSON.stringify({exp:Date.now()+8*3600000,email:process.env.ADMIN_EMAIL}),"utf8").toString("base64url");return payload+"."+signature(payload)}
export async function isAdmin(){try{const token=(await cookies()).get(COOKIE)?.value; if(!token)return false;const [payload,mac]=token.split(".");if(!payload||!/^[a-f0-9]{64}$/.test(mac))return false;const a=Buffer.from(mac,"hex"),b=Buffer.from(signature(payload),"hex");if(!timingSafeEqual(a,b))return false;const data=JSON.parse(Buffer.from(payload,"base64url").toString());return Number(data.exp)>Date.now()&&data.email===process.env.ADMIN_EMAIL}catch{return false}}
export async function requireAdmin(){if(!await isAdmin())throw new Error("UNAUTHORIZED")}
export const sessionCookie=COOKIE;
