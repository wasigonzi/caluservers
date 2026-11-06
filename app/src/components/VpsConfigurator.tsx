// Configurador "Arma tu VPS": ubicación + vCores/RAM/disco.
// Recomienda el plan REAL del catálogo que cubre lo pedido (exacto si
// existe; si no, el siguiente que lo cubre). Nada se inventa: los valores
// de los deslizadores son los que existen en el catálogo.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Plan, VpsLocation } from "../lib/catalog";
import { isPriceToConfirm } from "../lib/catalog";
import {
  VPS_CORE_STEPS,
  VPS_RAM_STEPS,
  VPS_STORAGE_STEPS,
  matchVpsPlan,
} from "../lib/vps";
import { PlanCard } from "./Layout";

function SliderRow({
  label,
  unit,
  steps,
  index,
  onChange,
}: {
  label: string;
  unit: string;
  steps: number[];
  index: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="config-slider">
      <div className="config-slider-head">
        <label>
          {label}
        </label>
        <strong>
          {steps[index]} {unit}
        </strong>
      </div>
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        aria-label={`${label} (${steps[index]} ${unit})`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="config-slider-range">
        <span>
          {steps[0]} {unit}
        </span>
        <span>
          {steps[steps.length - 1]} {unit}
        </span>
      </div>
    </div>
  );
}

export function VpsConfigurator({
  locations,
  locationId,
  onLocationChange,
  plans,
}: {
  locations: VpsLocation[];
  locationId: string;
  onLocationChange: (id: string) => void;
  plans: Plan[];
}) {
  const [coreIdx, setCoreIdx] = useState(0);
  const [ramIdx, setRamIdx] = useState(0);
  const [storageIdx, setStorageIdx] = useState(0);

  const selected =
    locations.find((l) => l.id === locationId) ?? locations[0];
  const locationPlans = useMemo(
    () =>
      plans
        .filter((p) => p.locationId === (selected?.id ?? locationId))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [plans, selected, locationId],
  );
  const match = useMemo(
    () =>
      matchVpsPlan(
        locationPlans,
        VPS_CORE_STEPS[coreIdx],
        VPS_RAM_STEPS[ramIdx],
        VPS_STORAGE_STEPS[storageIdx],
      ),
    [locationPlans, coreIdx, ramIdx, storageIdx],
  );

  return (
    <div className="configurator glass">
      <div className="configurator-grid">
        <div>
          <span className="kicker">Arma tu VPS</span>
          <h3>Elige lo que necesitas</h3>
          <p className="muted">
            Mueve los controles y te mostramos el plan real que cubre esa
            configuración en la ubicación elegida.
          </p>
          <div className="config-locations" role="group" aria-label="Ubicación">
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                className={`config-loc pill${loc.id === selected?.id ? " selected" : ""}`}
                aria-pressed={loc.id === selected?.id}
                onClick={() => onLocationChange(loc.id)}
              >
                {loc.flag} {loc.city}
              </button>
            ))}
          </div>
          <SliderRow
            label="vCores"
            unit="vCores"
            steps={VPS_CORE_STEPS}
            index={coreIdx}
            onChange={setCoreIdx}
          />
          <SliderRow
            label="Memoria RAM"
            unit="GB DDR5"
            steps={VPS_RAM_STEPS}
            index={ramIdx}
            onChange={setRamIdx}
          />
          <SliderRow
            label="Almacenamiento NVMe"
            unit="GB"
            steps={VPS_STORAGE_STEPS}
            index={storageIdx}
            onChange={setStorageIdx}
          />
          <p className="fineprint">
            Pedido: {VPS_CORE_STEPS[coreIdx]} vCores ·{" "}
            {VPS_RAM_STEPS[ramIdx]} GB RAM · {VPS_STORAGE_STEPS[storageIdx]}{" "}
            GB NVMe en {selected?.city ?? "la ubicación elegida"}.
          </p>
        </div>
        <div className="config-result">
          {match ? (
            <>
              <PlanCard
                plan={match.plan}
                featured
                tag={
                  match.exact
                    ? "Coincidencia exacta"
                    : match.exceedsBiggest
                      ? "El plan más grande"
                      : "Recomendado para ti"
                }
              />
              {match.exceedsBiggest ? (
                <p className="notice glass">
                  Lo que pides supera al plan más grande disponible en{" "}
                  {selected?.city ?? "esta ubicación"} (
                  {match.plan.name},{" "}
                  {isPriceToConfirm(match.plan.price)
                    ? "precio a consultar"
                    : `${match.plan.price}/mes`}
                  ). Para una configuración a medida,{" "}
                  <Link to="/contact">contacta con nosotros</Link>.
                </p>
              ) : null}
            </>
          ) : (
            <p className="notice glass">
              No hay planes en esta ubicación.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
