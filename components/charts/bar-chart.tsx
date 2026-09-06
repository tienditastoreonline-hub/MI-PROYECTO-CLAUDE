'use client';

import { useState } from 'react';

import { cx } from '@/components/ui';

export interface PuntoBarras {
  etiqueta: string;
  etiquetaLarga: string;
  valores: [number, number];
}

interface Props {
  puntos: PuntoBarras[];
  series: [string, string];
  titulo: string;
}

/**
 * Gráfica de barras agrupadas para dos series comparables.
 *
 * Las dos series se cuentan en la misma unidad (número de eventos), así que
 * comparten un único eje: dos escalas distintas en la misma gráfica harían que
 * las alturas relativas mintieran.
 *
 * Sin librería de gráficas: son catorce barras y una capa de hover, y una
 * dependencia de cliente para esto añadiría más peso que valor.
 */
export function BarChart({ puntos, series, titulo }: Props) {
  const [activo, setActivo] = useState<number | null>(null);

  const maximo = Math.max(1, ...puntos.flatMap((p) => p.valores));
  // Techo redondeado para que las líneas de referencia caigan en números limpios.
  const techo = Math.max(2, Math.ceil(maximo / 2) * 2);

  return (
    <figure className="flex flex-col gap-4">
      <figcaption className="sr-only">{titulo}</figcaption>

      {/* Leyenda: con dos series la identidad nunca puede depender solo del color. */}
      <div className="flex items-center gap-4">
        {series.map((nombre, indice) => (
          <span key={nombre} className="flex items-center gap-1.5 text-xs text-tinta-suave">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: `var(--color-serie-${indice + 1})` }}
            />
            {nombre}
          </span>
        ))}
      </div>

      <div className="relative">
        {/* Rejilla de referencia, deliberadamente tenue. */}
        <div aria-hidden className="absolute inset-0 flex flex-col justify-between pb-6">
          {[techo, techo / 2, 0].map((valor) => (
            <div key={valor} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-[10px] text-tinta-tenue">{valor}</span>
              <span className="h-px flex-1 bg-borde" />
            </div>
          ))}
        </div>

        <div className="relative flex h-44 items-end gap-1 pl-8">
          {puntos.map((punto, indice) => (
            <div
              key={punto.etiqueta}
              className="group relative flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setActivo(indice)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(indice)}
              onBlur={() => setActivo(null)}
              tabIndex={0}
              aria-label={`${punto.etiquetaLarga}: ${punto.valores[0]} ${series[0]}, ${punto.valores[1]} ${series[1]}`}
            >
              {activo === indice ? (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 rounded-panel border border-borde bg-superficie px-2.5 py-1.5 text-xs shadow-md">
                  <p className="font-medium text-tinta">{punto.etiquetaLarga}</p>
                  {series.map((nombre, s) => (
                    <p key={nombre} className="flex items-center gap-1.5 text-tinta-suave">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: `var(--color-serie-${s + 1})` }}
                      />
                      {nombre}: {punto.valores[s]}
                    </p>
                  ))}
                </div>
              ) : null}

              {/* Hueco de 2px entre las barras del mismo grupo. */}
              <div className="flex h-full items-end justify-center gap-[2px] pb-6">
                {punto.valores.map((valor, s) => (
                  <div
                    key={s}
                    className={cx(
                      'w-2.5 rounded-t-[4px] transition-opacity sm:w-3',
                      activo !== null && activo !== indice ? 'opacity-40' : 'opacity-100',
                    )}
                    style={{
                      height: `${Math.max(valor === 0 ? 0 : 2, (valor / techo) * 100)}%`,
                      backgroundColor: `var(--color-serie-${s + 1})`,
                    }}
                  />
                ))}
              </div>

              <span className="absolute bottom-0 left-0 w-full text-center text-[10px] text-tinta-tenue">
                {punto.etiqueta}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Los mismos datos en tabla: es la vía de lectura cuando el color no basta. */}
      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">{series[0]}</th>
            <th scope="col">{series[1]}</th>
          </tr>
        </thead>
        <tbody>
          {puntos.map((punto) => (
            <tr key={punto.etiqueta}>
              <th scope="row">{punto.etiquetaLarga}</th>
              <td>{punto.valores[0]}</td>
              <td>{punto.valores[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
