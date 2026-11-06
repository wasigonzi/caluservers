"use client";
// Mini-quiz "¿Cuál me conviene?" para Web Hosting.
// Recomienda usando SOLO las diferencias reales entre los planes del
// catálogo: nº de sitios, cuentas de correo y almacenamiento/potencia.
// Starter = 1 sitio, 100 correos, 20 GB · Professional = sitios y correos
// ilimitados, 50 GB · Business = lo mismo con 100 GB y más potencia.
import { useMemo, useState } from "react";
import type { Plan } from "@/lib/catalog";
import { PlanCard } from "@/components/site/SiteShell";

const QUESTIONS: {
  id: string;
  q: string;
  options: { value: string; label: string; score: number; reason: string }[];
}[] = [
  {
    id: "sites",
    q: "¿Cuántos sitios web vas a alojar?",
    options: [
      { value: "sites-1", label: "1 sitio", score: 0, reason: "un solo sitio" },
      { value: "sites-some", label: "Varios sitios", score: 1, reason: "varios sitios" },
      { value: "sites-unlimited", label: "Ilimitados", score: 1, reason: "sitios ilimitados" },
    ],
  },
  {
    id: "email",
    q: "¿Cuánto correo necesitas?",
    options: [
      { value: "email-little", label: "Poco (hasta 100 cuentas)", score: 0, reason: "poco correo" },
      { value: "email-lots", label: "Mucho (cuentas ilimitadas)", score: 1, reason: "correo ilimitado" },
    ],
  },
  {
    id: "heavy",
    q: "¿Tienda en línea o tráfico alto?",
    options: [
      { value: "heavy-no", label: "No, sitio normal", score: 0, reason: "" },
      { value: "heavy-yes", label: "Sí, tienda o tráfico alto", score: 2, reason: "tienda o tráfico alto" },
    ],
  },
];

export function HostingQuiz({ plans }: { plans: Plan[] }) {
  const sorted = useMemo(
    () => [...plans].sort((a, b) => a.sortOrder - b.sortOrder),
    [plans],
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const answered = QUESTIONS.filter((q) => answers[q.id]).length;
  const result = useMemo(() => {
    if (answered < QUESTIONS.length || sorted.length === 0) return null;
    let score = 0;
    const reasons: string[] = [];
    for (const q of QUESTIONS) {
      const opt = q.options.find((o) => o.value === answers[q.id]);
      if (!opt) continue;
      score = Math.max(score, opt.score);
      if (opt.reason) reasons.push(opt.reason);
    }
    const plan = sorted[Math.min(score, sorted.length - 1)];
    return { plan, reasons };
  }, [answers, answered, sorted]);

  function reset() {
    setAnswers({});
  }

  return (
    <div className="quiz glass">
      <span className="kicker">¿Cuál me conviene?</span>
      <h3>Responde 3 preguntas rápidas</h3>
      <p className="muted">
        Te recomendamos el plan según lo que realmente necesitas: sitios,
        correo y potencia.
      </p>
      <div className="quiz-questions">
        {QUESTIONS.map((q) => (
          <fieldset key={q.id} className="quiz-question">
            <legend>{q.q}</legend>
            <div className="quiz-options">
              {q.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`quiz-option pill${answers[q.id] === opt.value ? " selected" : ""}`}
                  aria-pressed={answers[q.id] === opt.value}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {result ? (
        <div className="quiz-result">
          <p className="quiz-reason">
            <strong>Te conviene {result.plan.name}</strong>
            {result.reasons.length > 0
              ? ` porque necesitas ${result.reasons.join(", ")}.`
              : "."}{" "}
            {result.plan.description}
          </p>
          <div className="quiz-plan">
            <PlanCard plan={result.plan} featured tag="Recomendado para ti" />
          </div>
          <button type="button" className="btn ghost" onClick={reset}>
            Empezar de nuevo
          </button>
        </div>
      ) : (
        <p className="muted">
          Respondidas {answered} de {QUESTIONS.length} preguntas.
        </p>
      )}
    </div>
  );
}
