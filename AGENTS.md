# Waveguide mode solver guidance

## Carbon y diseño

- Usa la versión instalada de `@carbon/react` y los controles existentes.
- Usa Carbon de forma pragmática: no lo fuerces si empeora la jerarquía de configuración, preview, plots o diagnósticos.
- Consulta Storybook o la documentación oficial solo al introducir un componente, resolver una duda o sobrescribir estilos internos.
- Evalúa la interfaz renderizada: accesibilidad, foco, teclado, responsive y legibilidad de plots y advertencias importan tanto como TypeScript.

## Propiedad de la interfaz y del solver

- React es propietario de la configuración, tabs, preview SVG, resultados y estado visual que renderiza.
- `solver.ts`, `solver.worker.ts`, `workerClient.ts` y Rust/WASM solo reciben configuraciones serializables y devuelven resultados tipados; no guardan referencias React/DOM ni mutan la interfaz.
- `CrossSectionPreview` es una proyección React del modelo geométrico; no dupliques la geometría con un renderer imperativo paralelo.
- Plotly puede usar APIs imperativas dentro de efectos React, con `Plotly.react`, purge y limpieza explícita; no controla visibilidad, ARIA, tabs ni formularios.
- Conserva cancelación, estado obsoleto, diagnósticos, advertencias, backend y la distinción entre solución, sweep, convergencia y tolerancia.

## `scientific-ui`

- Corrige primero los problemas específicos del solver dentro de este repositorio.
- Modifica `scientific-ui` solo si la causa pertenece al componente compartido y la corrección debe propagarse.
- Al actualizarlo, cambia conjuntamente `package.json`, `pnpm-lock.yaml` y el tarball de `vendor/`; comprueba que el `.tgz` nuevo quede rastreado por Git.

## Camino rápido

- Atiende una familia concreta por iteración; no conviertas un ajuste del formulario, preview o plot en una auditoría general.
- Inspecciona el flujo afectado y entrega una iteración visible; amplía el alcance solo si el riesgo o el resultado lo justifican.
- Para cambios visuales localizados, comprueba preview/plot y una resolución representativa. No ejecutes sweeps, benchmarks, convergencias o tolerancias si el cambio es puramente visual.
- Mantén separadas la validez física/numérica y la calidad visual; respeta unidades, malla, residuos, clasificación modal y advertencias del backend.

## Subagentes

- Usa subagentes `gpt-5.6-luna` con razonamiento `max` en paralelo solo para partes independientes cuando mejore claramente velocidad, cobertura o calidad.
- Asigna alcances sin solapamiento, evita que editen el mismo archivo y revisa el diff/estado integrado antes de aceptar su trabajo.
- No uses subagentes para cambios pequeños, secuenciales o fuertemente acoplados.

## Verificación y comandos reales

- Para tareas visuales usa `$browser:control-in-app-browser` cuando esté disponible; inspecciona la pantalla renderizada antes y después.
- Reutiliza `pnpm dev` y HMR; usa `pnpm preview` solo para comprobar la salida de producción.
- Cambio visual/preview/plot: navegador interno y resolución relevante; `pnpm test:ui` cuando el escenario browser lo justifique.
- Cambio React/TypeScript: `pnpm typecheck` y pruebas afectadas; `pnpm test` recompila Rust/WASM y ejecuta Vitest/metadatos.
- Cambio solver/worker/WASM: `pnpm build:rust-wasm`, `pnpm typecheck` y `pnpm test`; comprueba backend, unidades, residuos y advertencias.
- Cambio amplio o previo a publicar: `pnpm lint`, `pnpm test` y `pnpm build`.
- Storybook solo cuando sea útil: `pnpm storybook` o `pnpm build-storybook`.
- No declares verificaciones que no hayas ejecutado.
