"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { Server, ArrowUpRight, Layers3 } from "lucide-react";

type ServiceOption = {
  name: string;
  href: string;
  price: string;
  count: number;
};
export default function ServiceFinder({
  options,
}: {
  options: ServiceOption[];
}) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const option = options[selected];
  if (!option) return null;
  return (
    <div className="service-finder">
      <div className="service-finder-heading">
        <Layers3 size={18} aria-hidden="true" />
        <span>Encuentra tu infraestructura</span>
      </div>
      <div
        className="service-finder-options"
        role="group"
        aria-label="Tipo de alojamiento"
      >
        {options.map((item, index) => (
          <button
            key={item.href}
            type="button"
            aria-pressed={selected === index}
            aria-controls={id}
            onClick={() => setSelected(index)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="service-finder-result" id={id} aria-live="polite">
        <div>
          <Server size={22} aria-hidden="true" />
          <h2>{option.name}</h2>
          <p>
            {option.count
              ? `${option.count} ${option.count === 1 ? "plan disponible" : "planes disponibles"}`
              : "Sin planes activos"}
          </p>
        </div>
        <div className="finder-price">
          {option.count && option.price !== "Consultar" ? (
            <>
              <small>Desde</small>
              <strong>{option.price}</strong>
              <small>/mes</small>
            </>
          ) : (
            <strong>Consultar</strong>
          )}
        </div>
      </div>
      <Link className="finder-link" href={option.href}>
        Explorar {option.name} <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
    </div>
  );
}
