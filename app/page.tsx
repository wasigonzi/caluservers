import Link from "next/link";
import {getBranding} from "@/lib/branding";
export const dynamic="force-dynamic";
export default async function Home(){
 const b=await getBranding();
 const services=[b.showHosting?{title:"Web Hosting",description:"Hosting optimizado para empresas y proyectos digitales."}:null,b.showVps?{title:"VPS Cloud",description:"Recursos dedicados y configuraciones flexibles para aplicaciones."}:null,b.showDedicated?{title:"Servidores dedicados",description:"Infraestructura de alto rendimiento para cargas exigentes."}:null].filter((s):s is {title:string;description:string}=>!!s);
 return <div className="wrap" style={{["--brand-primary" as string]:b.primaryColor,["--brand-secondary" as string]:b.secondaryColor,["--brand-bg" as string]:b.backgroundColor} as React.CSSProperties}>
 <nav className="nav"><Link className="brand" href="/">{b.logoUrl?<img src={b.logoUrl} alt={b.brandName} style={{width:"auto",maxWidth:230,maxHeight:58}}/>:<>{b.brandName.slice(0,4)}<span className="accent">{b.brandName.slice(4)}</span></>}</Link><div><a href="#servicios">Servicios</a><a href={b.supportUrl}>Soporte</a><Link href="/admin">Admin</Link></div><a className="btn" href={b.customerPortalUrl}>Área de clientes ↗</a></nav>
 <section className="hero"><div><p className="accent">{b.eyebrow}</p><h1>{b.heading} <span className="accent">{b.highlight}</span> {b.subtitle}</h1><p className="muted">Web Hosting, VPS y servidores dedicados con infraestructura de alto rendimiento. Controla tus servicios y pagos desde nuestro portal.</p><a className="btn" href="#servicios">Explorar servicios →</a>{b.contactEmail&&<p className="muted">Contacto: <a href={"mailto:"+b.contactEmail}>{b.contactEmail}</a></p>}</div><div className="glass symbol" aria-label="CS CaluServers">{b.logoUrl?<img src={b.logoUrl} alt={b.brandName} style={{maxWidth:"100%",maxHeight:340,objectFit:"contain"}}/>:"CS"}</div></section>
 <section id="servicios" className="section"><p className="accent">NUESTRAS SOLUCIONES</p><h2>Infraestructura para crecer contigo</h2><div className="cards">{services.map(s=><article className="glass card" key={s.title}><h3>{s.title}</h3><p className="muted">{s.description}</p><a className="btn" href={b.customerPortalUrl}>Ver planes ↗</a></article>)}</div></section>
 <footer className="muted">© {new Date().getFullYear()} {b.brandName} · {b.footerText}</footer></div>
}
