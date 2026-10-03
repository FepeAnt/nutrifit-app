# NutriFit — Auditoría funcional, nutricional y de código (briefing para otra IA)

> **Cómo usar este archivo:** adjunta junto a él `index.html`, `app.js` y `style.css` (las versiones auditadas). Las referencias a líneas corresponden a `app.js` tal como fue auditado. Todo se obtuvo por **lectura estática**; la app no se ejecutó en un navegador. Los puntos marcados **[VERIFICAR]** requieren comprobarse en DevTools.

## 0. Prompt sugerido para pegarle a la otra IA

```
Actúa como Arquitecto de Software Senior y Nutricionista. Adjunto index.html, app.js y style.css de una app
de registro de calorías (HTML + Tailwind CDN + JS vanilla, datos en localStorage) y un informe de auditoría.
Aplica las correcciones en el orden de la sección 5, empezando por los bugs que corrompen datos.
Reglas: (1) no cambies el diseño visual ni los `id` del HTML salvo que una corrección lo exija y lo expliques;
(2) mantén los nombres de las funciones llamadas desde onclick/onchange/oninput;
(3) entrégame los archivos completos corregidos y una lista de qué cambiaste y por qué;
(4) no inventes cambios fuera del informe sin avisar.
```

## 1. Contexto del proyecto

- **App:** NutriFit, calculadora de TDEE y food tracker (calorías, macros, 13 micronutrientes, hidratación, 5 comidas, calendario semanal/mensual, racha, progreso con peso y fotos, biblioteca de recientes/favoritos/creados, recetas compuestas).
- **Stack:** `index.html` (Tailwind por CDN `cdn.tailwindcss.com`, FontAwesome 6.0.0, Plus Jakarta Sans), `app.js` (~1260 líneas, funciones globales, handlers `onclick` inline), `style.css`.
- **Persistencia:** `localStorage` (`nutrifit_user` con todo el historial y fotos en base64; `nutrifit_alimentos` con alimentos creados; `nutrifit_theme` con el tema).
- **Datos externos:** OpenFoodFacts (`world.openfoodfacts.org/cgi/search.pl`).
- **Rediseño ya aplicado:** estilo "Fitia" (tarjetas `rounded-3xl`, mobile-first, bottom sheets), con modo oscuro por clase `dark` y un script independiente al final del HTML para el botón de tema. **No romper:** los IDs, los handlers inline y la clase `dark` en `<html>`.
- **Comportamiento del JS que condiciona el CSS:** el JS reasigna `className` de las barras (`#ui-progress`, `#ui-prot-bar`, `#ui-carb-bar`, `#ui-fat-bar`, `#ui-agua-bar`) con clases `bg-gray-400 / bg-green-500 / bg-red-500 / bg-cyan-400`. El semáforo visual depende de reglas CSS por ID sobre esas clases. Y las tarjetas de comida y listas generadas por JS se estilizan desde `style.css` con selectores por ID, porque su HTML tiene clases claras sin variantes `dark:`.

## 2. Resumen ejecutivo

- Los IDs y handlers son consistentes: todo ID que el JS pide existe en el HTML y todo handler tiene función definida (comprobado con script). El script marcó `dashboard` como "duplicado", pero la segunda aparición es un comentario HTML (`<!-- Cierre de div id="dashboard"-->`), no una etiqueta: no es un problema real.
- **7 bugs críticos** que corrompen datos o rompen funciones enteras (sección 3.1).
- Nutricionalmente: déficit fijo sin piso de seguridad, METs brutos, semáforo que penaliza pasarse de proteína, micronutrientes sin metas y mensajes con mitos nutricionales (sección 3.2).
- Arquitectura: dos esquemas de datos en paralelo, código muerto, 13 micronutrientes repetidos en más de 6 sitios, `innerHTML` sin escapar y `onclick` con JSON embebido (sección 4).

## 3. Auditoría funcional y nutricional

### 3.1 Errores funcionales (por gravedad)

| ID | Gravedad | Problema | Ubicación |
|---|---|---|---|
| F-01 | 🔴 | `style.css` probablemente no aplica sus `@apply` | `index.html` línea 15 + `style.css` |
| F-02 | 🔴 | Recetas guardan macros `NaN` (esquemas `proteinas/carbohidratos/grasas` contra `p/c/f`) | `app.js` 1119-1213 |
| F-03 | 🔴 | Alimentos "por unidad/porción/taza" guardan kcal ÷ 100 | `app.js` 539-601 |
| F-04 | 🔴 | `evaluarDia()` usa `c.kal` (inexistente) → siempre `NaN` → siempre "te pasaste" | `app.js` 1046-1070 |
| F-05 | 🔴 | `registrarComidaSeleccionada` no valida cantidad → guarda `NaN` persistente | `app.js` 495-537 |
| F-06 | 🔴 | XSS/rotura por nombres sin escapar y `onclick='...JSON.stringify(item)...'` | `app.js` 418-437 y varios `innerHTML` |
| F-07 | 🔴 | Doble copia de `alimentosPersonalizados`: al guardar una receta se pisa la lista global y se pierden datos | `app.js` 1204-1206 |
| F-08 | 🟠 | `actividadExtraHoy` no se asocia a fecha ni se reinicia; infla la meta de todos los días | `app.js` 363-366, 393-397 |
| F-09 | 🟠 | Meta calórica actual aplicada al historial (`evaluarEstadoDia`, racha) | `app.js` 102-114, 152-176 |
| F-10 | 🟠 | La edad se guarda una vez y no se actualiza; `new Date('YYYY-MM-DD')` parsea como UTC (error en zonas UTC−) | `app.js` 303-308 |
| F-11 | 🟠 | `finalizarOnboarding` no valida altura/peso → `NaN` en toda la fórmula | `app.js` 321-344 |
| F-12 | 🟠 | `resetAppTotal` no borra `nutrifit_alimentos` | `app.js` 734 |
| F-13 | 🟠 | `modoAgregandoReceta` no se reinicia al cerrar el panel; el siguiente alimento abre un `prompt` de receta | `app.js` 1112-1147 |
| F-14 | 🟡 | Racha: un día con un solo snack cuenta como racha | `app.js` 152-176 |
| F-15 | 🟡 | `activate:scale-95` (typo de `active:`) en el botón "Completar Día" | `index.html` línea 181 |
| F-16 | 🟡 | Línea 493: `let estaGuardandoComida =дет = false;` (letras cirílicas; crea un global o rompe en strict mode) | `app.js` 493 |
| F-17 | 🟡 | `JSON.parse(localStorage...)` sin `try/catch` en la línea 14; un valor corrupto mata todo el script | `app.js` 14 |
| F-18 | 🟡 | `setItem` sin `try/catch`; las fotos base64 comparten blob con todo el historial (cuota ~5 MB) | `app.js` 55 |

**F-01 [VERIFICAR].** El CDN de Tailwind solo procesa `@apply` dentro de `<style type="text/tailwindcss">`. Cargado con `<link rel="stylesheet" href="style.css">`, las clases `.card`, `.inp`, `.btn-p`, `.btn-s`, `.btn-t`, `.lbl`, `.well`, `.track`, `.h-sec` pueden quedar sin estilos. Prueba: inspeccionar un `.card` en DevTools. Fix mínimo: mover el bloque `@layer components { ... }` a un `<style type="text/tailwindcss">` en el `<head>` y dejar el resto del CSS plano en `style.css`. Fix de fondo: compilar con la CLI (`npx tailwindcss -i style.css -o dist.css --minify`), porque el CDN no es para producción.

**F-02 detalle.** En el interceptor de `prepararRegistro`, el ingrediente se arma con `alimentoSeleccionado.proteinas`, `.carbohidratos` y `.grasas`, que no existen en los alimentos normales (que usan `p/c/f`). Además el `prompt` lee `unidadBase` (inexistente) y asume gramos. `recetaNormalizada` tampoco tiene `p/c/f` ni `unidadMedida`, así que al registrarla desde el popup de éxito los macros salen `NaN`, y desde las pestañas quedan en 0 (`item.p || 0`). Hay **migración pendiente** para recetas ya guardadas con `proteinas/carbohidratos/grasas`.

**F-03 detalle.** `toggleCrearBaseInput` oculta el campo pero `crearCantidadBase` conserva `value="100"`. La función lo lee y calcula `factorNormalizacion = 1/100`. Resultado: "Empanada, 250 kcal" se guarda como 2,5 kcal por unidad. Parece funcionar solo porque `cantidadPreferida` queda en 100 y se muestra "Tu porción: 100unidad".

### 3.2 Inconsistencias nutricionales

- **Sin piso calórico.** `−500` fijo puede bajar de la TMB en personas de gasto bajo. Debe ser porcentual con piso.
- **METs brutos.** `met × kg × horas` incluye el 1 MET de reposo que ya cuenta la TMB. Debe usarse `(met − 1)`: sobrestima unas 70 kcal/hora a 70 kg.
- **Proteína.** 2,2 g/kg en mantenimiento y 2,0 en volumen es contraintuitivo; sobre peso total, una persona de 120 kg recibe 264 g.
- **Datos recogidos y no usados.** % grasa y masa muscular se piden y no entran al cálculo. Con % graso se puede usar Katch-McArdle (`370 + 21,6 × masa magra`).
- **Semáforo.** Pasarse de proteína (mínimo) se pinta rojo; sodio y azúcar (límites) no tienen semáforo.
- **Micronutrientes sin metas ni %VD.** Mostrar "Hierro 7,2 mg" sin referencia no le sirve al usuario.
- **Mensajes de `evaluarDia`.** "No comer puede frenar el metabolismo" (mito de starvation mode) y "a compensar" (refuerza conducta compensatoria). Los días >130 % se pintan en negro: culpabilizante. Riesgo con usuarios con conductas alimentarias de riesgo.
- **Sin verificación de Atwater** al crear alimentos. La semilla tiene desvíos de 7-10 % (pollo: 4·23 + 9·1,2 = 103 contra 110 kcal declaradas). Avisar si `4p + 4c + 9f` difiere >15 % de las kcal.

### 3.3 Faltantes críticos
- Editar la cantidad de una entrada ya registrada (hoy solo borrar), con deshacer.
- Copiar comida o día anterior.
- Respaldo: exportar/importar JSON. Borrar datos del navegador destruye todo.
- Gráfico de peso con media móvil de 7 días (se guarda el progreso y no se muestra).
- Escáner de código de barras (el placeholder lo promete y no existe).
- Subtotal de kcal por comida.
- Advertencias de seguridad: menores de edad, embarazo y lactancia, condiciones médicas.

### 3.4 Adiciones de alto valor
- TDEE adaptativo (tendencia de peso + ingesta de 2-3 semanas, estilo MacroFactor).
- Metas de fibra (~14 g por 1000 kcal) y sodio (< 2300 mg como límite).
- Registro en un toque desde "Recientes" usando `cantidadPreferida`.
- PWA offline (service worker + `manifest.json`).
- Raciones en recetas (hoy es "1 porción" fija).

### 3.5 Simplificar o eliminar
- Los 3 modales entre pasos del onboarding y los `alert()` de validación: usar errores inline.
- `apellido`: se pide como obligatorio y se descarta.
- Botón "Completar Día": redundante con la barra en vivo.
- Tres lugares para cargar ejercicio (onboarding, perfil, extra de hoy) y movimiento base en 3 unidades.
- Las 4 categorías de racha con colores.

## 4. Auditoría de código

### 4.1 Hallazgos de arquitectura y base de datos

- **Cuatro esquemas de alimento:** `baseGramos` (semilla), `cantidadBase/unidadMedida` (creados), `proteinas/carbohidratos/grasas` (recetas) y `p/c/f` (resto). Unificar en uno solo + migración.
- **Código muerto:** `baseSemilla` (5 alimentos) solo se referencia desde `buscarAlimentoPorId` ← `calcularTotalesDeReceta` ← `crearRecetaCompuesta`, que nadie invoca. Nunca aparecen al buscar. `biblioteca.creaciones` nunca se escribe. Eliminar ese sistema o conectarlo.
- **Conversión de unidades de OpenFoodFacts incompleta.** OFF devuelve `_100g` en gramos. Solo se convierten sodio y vitamina C (×1000). Potasio, calcio, hierro, magnesio y zinc requieren ×1000 (mg); vitaminas A, D, B12 y folato, ×1.000.000 (mcg). Hoy se muestran 1000× por debajo. `energy-kcal_100g` ausente se convierte en 0 kcal: filtrar o usar `energy_100g / 4.184`.
- **Búsqueda:** sin `AbortController` (una respuesta vieja puede pisar una nueva), `includes` sin normalizar acentos, consulta sin `fields=`, un request por pausa de tecleo con límites de uso de OFF (consultar su cuota vigente) y sin caché.
- **Duplicación (DRY):** el factor de porción está copiado en 4 sitios; los 13 micronutrientes se repiten en más de 6 (mapeo OFF, registro, creación, suma, render, HTML dos veces).
- **Estado y render mezclados:** `calcularMetabolismo` guarda en disco, actualiza la UI y recalcula; `actualizarVistaFecha` llama a `calcularRachaGeneral`, que ya corre dentro de `recalcularComidasTotales` (se ejecuta dos veces; en la carga inicial, 3-4). Separar funciones puras de un único `render()`.
- **`categoriasComida`** vive en un `<script>` inline dentro de un `<section>` y `app.js` depende de él: moverlo a `app.js`.
- **Monkeypatch:** `prepararRegistro` se reasigna y envuelve (`const funcionPrepararRegistroOriginal = prepararRegistro; prepararRegistro = function...`). Frágil: que la función consulte `modoAgregandoReceta` directamente.
- **10 `alert()/prompt()/confirm()`** bloquean el hilo; reutilizar el modal existente.
- **Modelo de datos de comidas:** `userData.comidas[fecha]` guarda copias congeladas, sin referencia al alimento ni cantidad/unidad, por eso no son editables. Guardar `{ foodId, cantidad, unidad, snapshot }`.
- **Menores:** `window.onload` pisa otros `onload` (usar `DOMContentLoaded`); `dashName` recibe una línea larga en un `<p>` truncado; división por cero cuando la meta de carbos es 0.

### 4.2 Correcciones propuestas (código)

**C-01 (F-15, F-16, F-17, F-18) — higiene y persistencia**

```js
// Borrar la línea 493 completa (let estaGuardandoComida =дет = false;)

const leerJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
let alimentosPersonalizados = leerJSON('nutrifit_alimentos', []);

function guardarDatosLocales() {
  try { localStorage.setItem('nutrifit_user', JSON.stringify(userData)); }
  catch (e) { mostrarMensajeDinamico('⚠️ No se pudo guardar: almacenamiento lleno. Exporta un respaldo.'); }
}
```
```html
<!-- index.html: active, no activate -->
... hover:bg-slate-700 active:scale-95 transition-all ...
```

**C-02 (F-03) — normalización de alimentos por unidad**

```js
const esGramos = unidad === 'g';
const cantidadIngresada = esGramos ? (parseFloat(document.getElementById('crearCantidadBase').value) || 100) : 1;
const cantidadBaseEstandar = esGramos ? 100 : 1;
const factorNormalizacion = cantidadBaseEstandar / cantidadIngresada;
```

**C-03 (F-04) — `evaluarDia`**

```js
let sumKal = comidasDia.reduce((acc, c) => acc + (c.kcal || 0), 0);   // era c.kal
// cerrar el </b> faltante del tercer mensaje; usar los mismos umbrales (90/110) que el semáforo
// y reemplazar los mensajes sobre "metabolismo" y "compensar" por mensajes neutros.
```

**C-04 (F-05) — validar antes de registrar**

```js
let cantidad = parseFloat(document.getElementById('regCantidad').value);
if (!Number.isFinite(cantidad) || cantidad <= 0) { /* mostrar error inline en el panel */ return; }
```

**C-05 (F-06) — escapar y no incrustar JSON en onclick**

```js
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let resultadosActuales = [];
// al construir los resultados (locales + OFF):  resultadosActuales = [...locales, ...remotos];
html += `<div onclick="seleccionarResultado(${i})" class="...">${esc(a.nombre)} ...</div>`;
function seleccionarResultado(i) { prepararRegistro(resultadosActuales[i]); }
```
Aplicar `esc()` también a `c.nombre` (lista de comidas), `ing.nombre` (recetas), `alimento.nombre` (popup de éxito) y `item.nombre` (pestañas). El patrón `seleccionarItemTab(index)` ya es correcto y es el modelo a seguir.

**C-06 (F-02, F-07, F-13) — recetas con el esquema `p/c/f`**

```js
function factorDe(it, cant) { return (it.unidadMedida || 'g') === 'g' ? cant / (it.cantidadBase || it.baseGramos || 100) : cant; }

// ingrediente:
let ing = { nombre: a.nombre, cantidad: cant, kcal: a.kcal * f, p: a.p * f, c: a.c * f, f: a.f * f };

// receta guardada:
let receta = { id: 'receta_' + Date.now(), nombre, unidadMedida: 'porcion', cantidadBase: 1,
               kcal: totalK, p: totalP, c: totalC, f: totalG, esReceta: true };
alimentosPersonalizados.push(receta);                       // la lista GLOBAL, no una copia local
localStorage.setItem('nutrifit_alimentos', JSON.stringify(alimentosPersonalizados));

// cerrarPanelRegistro():
modoAgregandoReceta = false;

// migración al cargar:
alimentosPersonalizados.forEach(a => {
  if (a.proteinas !== undefined) { a.p = a.proteinas; a.c = a.carbohidratos; a.f = a.grasas; a.unidadMedida ||= 'porcion'; }
});
```
Y eliminar la declaración local `let alimentosPersonalizados = JSON.parse(...)` dentro de `guardarRecetaCompuesta`.

**C-07 — tabla única de micronutrientes con metas y conversión OFF**

```js
const MICROS = [
  { k:'fibra',   label:'Fibra',    unit:'g',   off:'fiber',      mult:1,    meta:{ tipo:'min', porKcal:14/1000 } },
  { k:'azucar',  label:'Azúcares', unit:'g',   off:'sugars',     mult:1,    meta:{ tipo:'max', valor:50 } },
  { k:'sodio',   label:'Sodio',    unit:'mg',  off:'sodium',     mult:1000, meta:{ tipo:'max', valor:2300 } },
  { k:'potasio', label:'Potasio',  unit:'mg',  off:'potassium',  mult:1000, meta:{ tipo:'min', valor:3400 } },
  { k:'calcio',  label:'Calcio',   unit:'mg',  off:'calcium',    mult:1000, meta:{ tipo:'min', valor:1000 } },
  { k:'hierro',  label:'Hierro',   unit:'mg',  off:'iron',       mult:1000, meta:{ tipo:'min', valor:8 } },
  { k:'magnesio',label:'Magnesio', unit:'mg',  off:'magnesium',  mult:1000, meta:{ tipo:'min', valor:400 } },
  { k:'zinc',    label:'Zinc',     unit:'mg',  off:'zinc',       mult:1000, meta:{ tipo:'min', valor:11 } },
  { k:'vita',    label:'Vit A',    unit:'mcg', off:'vitamin-a',  mult:1e6,  meta:{ tipo:'min', valor:900 } },
  { k:'vitc',    label:'Vit C',    unit:'mg',  off:'vitamin-c',  mult:1000, meta:{ tipo:'min', valor:90 } },
  { k:'vitd',    label:'Vit D',    unit:'mcg', off:'vitamin-d',  mult:1e6,  meta:{ tipo:'min', valor:15 } },   // 1 mcg = 40 UI
  { k:'vitb12',  label:'Vit B12',  unit:'mcg', off:'vitamin-b12',mult:1e6,  meta:{ tipo:'min', valor:2.4 } },
  { k:'folato',  label:'Ác. Fólico',unit:'mcg',off:'folates',    mult:1e6,  meta:{ tipo:'min', valor:400 } },
];
const microsDe  = (it, f) => Object.fromEntries(MICROS.map(m => [m.k, (it[m.k] || 0) * f]));
const desdeOFF  = n => Object.fromEntries(MICROS.map(m => [m.k, (n[`${m.off}_100g`] || 0) * m.mult]));
```
Los valores de meta son referencias orientativas para adulto; la otra IA debe parametrizarlos por sexo/edad o citar la fuente. Si se cambia la unidad de vitamina D de IU a mcg, ajustar la etiqueta en el HTML (`ui-micro-vitd`) y migrar los datos ya guardados.

**C-08 — búsqueda robusta**

```js
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const cacheOFF = new Map();
let abortar;
async function buscarOFF(q) {
  if (cacheOFF.has(q)) return cacheOFF.get(q);
  abortar?.abort(); abortar = new AbortController();
  const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1'
    + `&page_size=8&fields=code,product_name,brands,nutriments&search_terms=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal: abortar.signal });
  const lista = ((await r.json()).products ?? []).filter(p => p.nutriments?.['energy-kcal_100g'] > 0);
  cacheOFF.set(q, lista);
  return lista;
}
// Locales: filtrar con norm(nombre).includes(norm(q)) y ordenar primero los que empiezan con q.
// Incluir también la base semilla (o ampliarla) en la búsqueda local.
```

**C-09 (F-08, F-09, F-10, F-11) — metas por fecha, METs netos, piso, edad**

```js
userData.actividadExtra = {};   // { 'YYYY-MM-DD': [ { nombre, met, min } ] }
userData.metas = {};            // { 'YYYY-MM-DD': kcal }  ← se fija al primer registro del día
const metaDelDia = f => userData.metas[f] ?? userData.calculos.metaDiaria;

const kcalActividad = (met, kg, horas) => Math.max(0, met - 1) * kg * horas;   // MET neto

const ajuste = { deficit: -0.20, recomposicion: -0.10, volumen: 0.10, mantenimiento: 0 }[userData.objetivo] ?? 0;
const piso = Math.max(bmr, userData.genero === 'm' ? 1500 : 1200);
const objetivoKcal = Math.max(mantenimiento * (1 + ajuste), piso);

// Guardar fechaNac (ISO) en userData y derivar la edad:
function edadDe(iso) {
  const [y, m, d] = iso.split('-').map(Number), hoy = new Date();
  let e = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) e--;
  return e;
}
```
Validar en el onboarding altura, peso y fecha (`Number.isFinite` y rangos razonables) con errores inline. Además `evaluarEstadoDia` y `calcularRachaGeneral` deben usar `metaDelDia(iso)`. Considerar bloquear o advertir en menores de 18 años y en embarazo/lactancia, y sugerir consulta profesional.

**C-10 — semáforo por tipo de nutriente**

```js
function claseSemaforo(pct, tipo = 'rango') {
  if (tipo === 'min') return pct < 90 ? 'bg-gray-400' : 'bg-green-500';                       // proteína, fibra
  if (tipo === 'max') return pct <= 90 ? 'bg-green-500' : pct <= 100 ? 'bg-amber-400' : 'bg-red-500'; // sodio, azúcar
  return pct < 90 ? 'bg-gray-400' : pct <= 110 ? 'bg-green-500' : 'bg-red-500';              // kcal, carbos, grasas
}
```
`bg-amber-400` necesita su regla de gradiente en el CSS por ID de las barras. Usar `tipo:'min'` para `#ui-prot-bar`.

**C-11 (F-12) — reset completo**

```js
function resetAppTotal() {
  if (confirm('⚠ ¿Borrar todos los datos para siempre?')) {
    ['nutrifit_user', 'nutrifit_alimentos'].forEach(k => localStorage.removeItem(k));
    location.reload();
  }
}
```

## 5. Orden de ataque recomendado

1. **F-01:** confirmar y corregir el procesamiento de `@apply` (sin esto la UI puede verse rota).
2. **Corrupción de datos:** C-04 (validar cantidad), C-03 (`c.kal`), C-02 (alimentos por unidad), C-01 (línea 493 y `try/catch`).
3. **C-06:** unificar el esquema `p/c/f`, reparar recetas y corregir la doble copia de `alimentosPersonalizados` (con migración).
4. **C-05:** escapar HTML y eliminar los `onclick` con JSON embebido.
5. **C-07 y C-08:** tabla `MICROS` con conversión correcta de OFF, metas y búsqueda robusta.
6. **C-09, C-10, C-11:** metas por fecha, METs netos, piso calórico, edad desde fecha de nacimiento, semáforo por tipo y reset completo.
7. **Funciones nuevas:** exportar/importar JSON, edición de entradas, fotos en IndexedDB, gráfico de peso, copiar día.
8. **Arquitectura:** separar funciones puras de `render()`, mover `categoriasComida` a `app.js`, reemplazar `alert/prompt/confirm`, eliminar el monkeypatch y el código muerto.

## 6. Checklist de pruebas tras aplicar los cambios

- Crear alimento por gramos y por unidad (p. ej. "Empanada, 250 kcal, 1 unidad"): registrar 1 unidad debe sumar 250 kcal.
- Registrar con cantidad vacía o 0: no debe guardar nada y debe mostrar un error.
- Nombre con apóstrofe o `<b>` (p. ej. `Kellogg's`, `<img src=x onerror=alert(1)>`): debe verse como texto y poder seleccionarse.
- Crear una receta con 2-3 ingredientes y registrarla: macros y kcal coherentes (sin `NaN`); luego crear un alimento y comprobar que la receta sigue ahí.
- Cerrar el panel en modo receta y registrar un alimento normal: no debe aparecer ningún `prompt`.
- "Completar Día" con comidas registradas: el mensaje debe corresponder al porcentaje real.
- Buscar un producto de OFF con calcio/hierro: los valores deben estar en mg razonables (no 0,001).
- Agregar actividad extra "hoy" y cambiar a otro día: la meta del otro día no debe cambiar.
- Escribir en `localStorage` un JSON inválido en `nutrifit_alimentos` y recargar: la app debe arrancar igualmente.
- Alternar modo claro/oscuro y recargar: debe recordar el tema; barras de progreso y tarjetas de comida con el semáforo correcto en ambos modos.
