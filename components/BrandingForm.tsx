"use client";
import {useState} from "react";
import type {SiteBranding} from "@/lib/branding";
const groups:{name:string;fields:{key:keyof SiteBranding;label:string;kind?:"color"|"url"|"email"|"checkbox"|"textarea"}[]}[]=[
{name:"Marca y recursos",fields:[{key:"brandName",label:"Nombre de marca"},{key:"logoUrl",label:"URL del logo (PNG / SVG)",kind:"url"},{key:"faviconUrl",label:"URL del favicon",kind:"url"}]},
{name:"Paleta de colores",fields:[{key:"primaryColor",label:"Color principal",kind:"color"},{key:"secondaryColor",label:"Color secundario",kind:"color"},{key:"backgroundColor",label:"Fondo de la web",kind:"color"}]},
{name:"Hero y textos",fields:[{key:"eyebrow",label:"Etiqueta superior"},{key:"heading",label:"Título principal"},{key:"highlight",label:"Texto destacado"},{key:"subtitle",label:"Continuación del título"},{key:"footerText",label:"Texto del footer"}]},
{name:"Enlaces y contacto",fields:[{key:"customerPortalUrl",label:"URL área de clientes",kind:"url"},{key:"supportUrl",label:"URL soporte",kind:"url"},{key:"contactEmail",label:"Correo de contacto",kind:"email"}]},
{name:"Servicios visibles",fields:[{key:"showHosting",label:"Mostrar Web Hosting",kind:"checkbox"},{key:"showVps",label:"Mostrar VPS",kind:"checkbox"},{key:"showDedicated",label:"Mostrar servidores dedicados",kind:"checkbox"}]}
];
export default function BrandingForm({initial}:{initial:SiteBranding}){
 const [value,setValue]=useState(initial),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const update=(key:keyof SiteBranding,v:string|boolean)=>setValue(old=>({...old,[key]:v}));
 async function save(e:React.FormEvent){e.preventDefault();setMessage("");setBusy(true);try{
 const response=await fetch("/api/admin/branding",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
 const body=await response.json();if(!response.ok)throw Error(body.error||"No se pudo guardar");
 setValue(body.branding);setMessage("Branding guardado. Los cambios ya están disponibles en la web.");
 }catch(e){setMessage(e instanceof Error?e.message:"Error desconocido")}finally{setBusy(false)}}
 return <form onSubmit={save} style={{maxWidth:920}}>
 <div className="glass" style={{margin:"20px 0",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
 <div style={{width:70,height:70,background:value.backgroundColor,border:"1px solid #ffffff33",borderRadius:15,display:"grid",placeItems:"center"}}>
 {value.logoUrl?<img src={value.logoUrl} alt="Vista previa del logo" style={{maxWidth:"90%",maxHeight:"90%",objectFit:"contain"}}/>:<strong style={{color:value.primaryColor}}>CS</strong>}
 </div><div><strong style={{fontSize:22,color:value.primaryColor}}>{value.brandName}</strong><p className="muted" style={{margin:"4px 0"}}>Vista previa de identidad</p></div>
 </div>
 {groups.map(group=><section key={group.name} className="glass" style={{margin:"20px 0"}}><h2>{group.name}</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:"10px 20px"}}>{group.fields.map(field=><label key={field.key} className="field">{field.kind==="checkbox"?<span><input type="checkbox" style={{width:"auto",marginRight:10}} checked={Boolean(value[field.key])} onChange={e=>update(field.key,e.target.checked)}/>{field.label}</span>:<>{field.label}<input type={field.kind==="color"?"color":field.kind==="email"?"email":field.kind==="url"?"text":"text"} value={String(value[field.key])} onChange={e=>update(field.key,e.target.value)} required={["brandName","heading","customerPortalUrl"].includes(field.key)}/></>}</label>)}</div></section>)}
 <button className="btn" disabled={busy} type="submit">{busy?"Guardando…":"Guardar cambios de la web"}</button><a href="/" target="_blank" rel="noopener noreferrer" style={{marginLeft:16}}>Ver página pública ↗</a>
 {message&&<p className="glass" role="status" style={{marginTop:20}}>{message}</p>}
 </form>
}
