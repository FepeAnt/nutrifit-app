// ==========================================
// ESTADO, ESQUEMA Y VALIDACIÓN
// ==========================================
const STORAGE_KEY = 'nutrifit_user';

function perfilVacio() {                       // function (hoisted): se usa justo debajo
    return {
        rutinaDeportes: [], actividadExtra: {}, comidas: {}, aguaMl: {}, progreso: [],
        recordatorioDias: 7, movimiento: { cant: 0, unidad: 'pasos' },
        biblioteca: { favoritos: [], creaciones: [], recetas: [], recientes: [] }
    };
}
let userData = perfilVacio();

function leerJSON(clave, defecto) {
    try { const raw = localStorage.getItem(clave); return raw ? JSON.parse(raw) : defecto; }
    catch (e) { console.warn(`Dato corrupto en ${clave}`, e); return defecto; }
}

function calcularEdad(iso) {                   // sin el desfase UTC de new Date('YYYY-MM-DD')
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return NaN;
    const hoy = new Date(); let e = hoy.getFullYear() - +m[1];
    if (hoy.getMonth() + 1 < +m[2] || (hoy.getMonth() + 1 === +m[2] && hoy.getDate() < +m[3])) e--;
    return e;
}

function normalizarUserData(raw) {
    const base = perfilVacio(), esObj = o => o && typeof o === 'object' && !Array.isArray(o);
    const u = { ...base, ...(esObj(raw) ? raw : {}) };
    if (!esObj(u.comidas)) u.comidas = {};
    if (!esObj(u.aguaMl)) u.aguaMl = {};
    if (!esObj(u.actividadExtra)) u.actividadExtra = {};
    if (!esObj(u.metasCongeladas)) u.metasCongeladas = {};
    if (!Array.isArray(u.rutinaDeportes)) u.rutinaDeportes = [];
    if (!Array.isArray(u.progreso)) u.progreso = [];
    u.biblioteca = { ...base.biblioteca, ...(esObj(u.biblioteca) ? u.biblioteca : {}) };
    u.movimiento = { ...base.movimiento, ...(esObj(u.movimiento) ? u.movimiento : {}) };
    u.recordatorioDias = Number(u.recordatorioDias) || 7;

    if (Array.isArray(u.actividadExtraHoy) && u.actividadExtraHoy.length) {   // migración
        const hoy = obtenerFechaIso(new Date());
        u.actividadExtra[hoy] = [...(u.actividadExtra[hoy] ?? []), ...u.actividadExtraHoy];
    }
    delete u.actividadExtraHoy;

    ['pesoKg', 'alturaCm', 'edad'].forEach(k => { u[k] = (u[k] == null || u[k] === '') ? NaN : Number(u[k]); });
    if (u.fechaNac) { const e = calcularEdad(u.fechaNac); if (Number.isFinite(e)) u.edad = e; } // la edad se renueva sola
    return u;
}

const esNum = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
function perfilCompleto(u) {
    return !!u.nombre && (u.genero === 'm' || u.genero === 'f') && !!u.objetivo
        && esNum(u.pesoKg, 20, 400) && esNum(u.alturaCm, 80, 250) && esNum(u.edad, 10, 110);
}

let modoVistaDashboard = 'restantes'; // Puede ser 'restantes' o 'totales'

function alternarVistaDashboard() {
    modoVistaDashboard = modoVistaDashboard === 'restantes' ? 'totales' : 'restantes';
    recalcularComidasTotales(); 
}


const baseSemilla = [
    { id: "bs_001", nombre: "Pechuga de Pollo cruda", kcal: 110, p: 23, c: 0, f: 1.2, baseGramos: 100 },
    { id: "bs_002", nombre: "Arroz Blanco cocido", kcal: 130, p: 2.7, c: 28, f: 0.3, baseGramos: 100 },
    { id: "bs_003", nombre: "Huevo entero (Unidad)", kcal: 78, p: 6, c: 0.6, f: 5, baseGramos: 50 },
    { id: "bs_004", nombre: "Carne picada magra (5% grasa)", kcal: 137, p: 21, c: 0, f: 5, baseGramos: 100 },
    { id: "bs_005", nombre: "Manzana mediana", kcal: 95, p: 0.5, c: 25, f: 0.3, baseGramos: 150 }
];

// ==========================================
// MOTOR DE ALIMENTOS (esquema único + factor único)
// ==========================================
function normalizarAlimento(a) {
    const unidad = a.unidadMedida || 'g';
    return { ...a, unidadMedida: unidad,
        cantidadBase: a.cantidadBase || a.baseGramos || (unidad === 'g' ? 100 : 1),
        kcal: a.kcal ?? 0, p: a.p ?? a.proteinas ?? 0, c: a.c ?? a.carbohidratos ?? 0, f: a.f ?? a.grasas ?? 0 };
}
const factorDe = (a, cant) => a.unidadMedida === 'g' ? cant / a.cantidadBase : cant;   // regla única
const macrosDe = (a, cant) => { const k = factorDe(a, cant);
    return { kcal: a.kcal * k, p: a.p * k, c: a.c * k, f: a.f * k }; };

// Lista para un futuro creador de recetas con porciones / peso final (aún sin UI que la llame).
function crearReceta(nombre, ingredientes, porciones = 1, pesoFinalG = null) {
    const t = ingredientes.reduce((acc, { alimento, cantidad }) => {
        const m = macrosDe(alimento, cantidad);
        return { kcal: acc.kcal + m.kcal, p: acc.p + m.p, c: acc.c + m.c, f: acc.f + m.f };
    }, { kcal: 0, p: 0, c: 0, f: 0 });
    const por = x => +(x / porciones).toFixed(2);
    return normalizarAlimento({
        id: 'rec_' + Date.now(), nombre, esReceta: true, unidadMedida: 'porcion', cantidadBase: 1,
        kcal: por(t.kcal), p: por(t.p), c: por(t.c), f: por(t.f),
        porciones, pesoFinalG, pesoPorUnidad: pesoFinalG ? +(pesoFinalG / porciones).toFixed(1) : null,
        ingredientes: ingredientes.map(i => ({ id: i.alimento.id, cantidad: i.cantidad, unidad: i.alimento.unidadMedida }))
    });
}

const sinAcentos = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// _n (nombre sin acentos) es no enumerable: no se copia con {...a} ni acaba en localStorage / onclick
function indexarAlimento(a) {
    Object.defineProperty(a, '_n', { value: sinAcentos(a.nombre), writable: true, enumerable: false, configurable: true });
    return a;
}
const Alimentos = {
    lista: [],
    cargar() {
        const propios = leerJSON('nutrifit_alimentos', []);
        this.lista = [...baseSemilla.map(a => ({ ...a, origen: 'semilla' })), ...(Array.isArray(propios) ? propios : [])]
            .map(normalizarAlimento).map(indexarAlimento);
    },
    guardar() {
        const propios = this.lista.filter(a => a.origen !== 'semilla');
        try { localStorage.setItem('nutrifit_alimentos', JSON.stringify(propios)); } catch (e) { console.error(e); }
    },
    agregar(a) { const n = indexarAlimento(normalizarAlimento(a)); this.lista.push(n); this.guardar(); return n; },
    buscar(q) { const t = sinAcentos(q);
        return this.lista.filter(a => a._n.includes(t)).sort((x, y) => y._n.startsWith(t) - x._n.startsWith(t)).slice(0, 20); }
};

let categoriaSeleccionadaActual = 'desayuno';
let fechaSeleccionada = obtenerFechaIso(new Date());
let mesCalendarioActual = new Date();

function obtenerFechaIso(d) {
    let ano = d.getFullYear();
    let mes = String(d.getMonth() + 1).padStart(2, '0');
    let dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// ==========================================
// PINTADO Y ARRANQUE (cargar → validar → calcular → vista → pintar)
// ==========================================
function seguro(etapa, fn) { try { fn(); } catch (e) { console.error(`[NutriFit] "${etapa}" falló:`, e); } }

function etiquetaDeFecha(iso) {
    return iso === obtenerFechaIso(new Date()) ? 'Hoy'
        : new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function pintarEncabezado() {
    const u = userData;
    document.getElementById('dashName').innerText =
        `Hola, ${u.nombre} — ${u.edad} años | ${u.pesoKg.toFixed(1)}kg | Obj: ${String(u.objetivo).toUpperCase()}`;
}
function pintarEtiquetaFecha() {               // sale de actualizarVistaFecha
    const esHoy = fechaSeleccionada === obtenerFechaIso(new Date());
    const label = etiquetaDeFecha(fechaSeleccionada);
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
    set('dashLabelHoy', label);
    set('ui-fecha-titulo', esHoy ? 'Presupuesto calórico de hoy' : `Presupuesto para el ${label}`);
}

function renderDia() {
    seguro('encabezado',   pintarEncabezado);
    seguro('fecha',        pintarEtiquetaFecha);
    seguro('agua',         actualizarAguaUI);
    seguro('presupuesto',  actualizarUIDashboard);
    seguro('comidas',      recalcularComidasTotales);   // ya incluye calcularRachaGeneral()
    seguro('recordatorio', verificarAlertaProgreso);
}
function renderTodo() { seguro('semana', renderizarCalendarioSemanal); renderDia(); }
function actualizarVistaFecha() { renderDia(); }        // alias: no rompe llamadas existentes

function mostrarVista(vista) {
    document.getElementById('onboarding').style.display = vista === 'onboarding' ? '' : 'none';
    document.getElementById('dashboard').style.display  = vista === 'dashboard' ? 'block' : 'none';
    document.getElementById('fabContainer').classList.toggle('hidden', vista !== 'dashboard');
}

function iniciarApp() {
    Alimentos.cargar();                          // 0. catálogo antes de pintar
    const raw = leerJSON(STORAGE_KEY, null);
    userData = normalizarUserData(raw);
    if (!perfilCompleto(userData)) {             // perfil nuevo, a medias o corrupto → onboarding limpio
        mostrarVista('onboarding'); mostrarModalAlerta(1); return;
    }
    if (raw && raw.actividadExtraHoy) guardarDatosLocales();   // persiste la migración una sola vez
    asegurarCalculos();                          // 1. datos derivados ANTES de cualquier pintado
    fechaSeleccionada = obtenerFechaIso(new Date());
    mostrarVista('dashboard');                   // 2. vista
    seguro('secciones', renderizarSeccionesComidas);   // 3. solo crea el DOM
    renderTodo();                                // 4. un único pintado
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarApp);   // reemplaza window.onload
else iniciarApp();

function guardarDatosLocales() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); }
    catch (e) { console.error('[NutriFit] No se pudo guardar (¿almacenamiento lleno?):', e); }
}

// --- SISTEMA DE CALENDARIO Y FECHAS ---
function cambiarFechaSeleccionada(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    fechaSeleccionada = iso;
    renderTodo();                                // semana + agua + presupuesto + macros + racha
}
function moverDia(delta) {                       // útil para flechas ‹ › o swipe
    const d = new Date(fechaSeleccionada + 'T00:00:00'); d.setDate(d.getDate() + delta);
    cambiarFechaSeleccionada(obtenerFechaIso(d));
}

function renderizarCalendarioSemanal() {
    let contenedor = document.getElementById('semanaContainer');
    let curr = new Date(fechaSeleccionada + 'T00:00:00');
    let diaSemana = curr.getDay(); 
    let diff = curr.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1); 
    let lunes = new Date(curr.setDate(diff));

    let diasLetras = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    let html = '';
    
    for(let i=0; i<7; i++) {
        let d = new Date(lunes);
        d.setDate(lunes.getDate() + i);
        let iso = obtenerFechaIso(d);
        let esSeleccionado = (iso === fechaSeleccionada);
        let estadoColor = evaluarEstadoDia(iso);

        html += `
        <button onclick="cambiarFechaSeleccionada('${iso}')" class="flex flex-col items-center py-2 px-1 rounded-2xl transition-all ${esSeleccionado ? 'bg-emerald-500 text-white shadow-md' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}">
            <span class="text-[10px] font-bold uppercase opacity-75">${diasLetras[i]}</span>
            <span class="text-sm font-extrabold my-1">${d.getDate()}</span>
            <span class="w-2 h-2 rounded-full ${estadoColor}"></span>
        </button>`;
    }
    contenedor.innerHTML = html;
}

function evaluarEstadoDia(iso) {
    let comidasDia = userData.comidas[iso] || [];
    if(comidasDia.length === 0) return 'bg-slate-300 dark:bg-slate-700'; 

    let sumKcal = comidasDia.reduce((acc, c) => acc + c.kcal, 0);
    let meta = obtenerMetaDelDia(iso).totalKcal; // META AISLADA
    let pct = (sumKcal / meta) * 100;

    if(pct >= 90 && pct <= 110) return 'bg-emerald-500'; 
    if(pct < 90) return 'bg-amber-400'; 
    if(pct > 110 && pct <= 130) return 'bg-rose-500'; 
    return 'bg-slate-900 dark:bg-black'; 
}

function abrirCalendarioMes() {
    mesCalendarioActual = new Date(fechaSeleccionada + 'T00:00:00');
    renderizarGridMes();
    document.getElementById('modalCalendarioMes').classList.add('modal-active');
}
function cerrarCalendarioMes() { document.getElementById('modalCalendarioMes').classList.remove('modal-active'); }
function cambiarMesCalendario(dir) {
    mesCalendarioActual.setMonth(mesCalendarioActual.getMonth() + dir);
    renderizarGridMes();
}
function renderizarGridMes() {
    let ano = mesCalendarioActual.getFullYear();
    let mes = mesCalendarioActual.getMonth();
    document.getElementById('calMesTitulo').innerText = new Date(ano, mes).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    let primerDiaIndex = new Date(ano, mes, 1).getDay();
    primerDiaIndex = primerDiaIndex === 0 ? 6 : primerDiaIndex - 1; 
    let totalDias = new Date(ano, mes + 1, 0).getDate();

    let gridHtml = '';
    for(let i=0; i<primerDiaIndex; i++) gridHtml += `<div></div>`;

    for(let d=1; d<=totalDias; d++) {
        let fechaIso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        let esSel = (fechaIso === fechaSeleccionada);
        let punto = evaluarEstadoDia(fechaIso);

        gridHtml += `
        <button onclick="cambiarFechaSeleccionada('${fechaIso}'); cerrarCalendarioMes();" class="p-2 rounded-xl flex flex-col items-center justify-center transition-colors ${esSel ? 'bg-emerald-500 text-white font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}">
            <span class="text-sm">${d}</span>
            <span class="w-1.5 h-1.5 rounded-full ${punto} mt-1"></span>
        </button>`;
    }
    document.getElementById('gridMesDias').innerHTML = gridHtml;
}

function calcularRachaGeneral() {
    let rachaActual = 0;
    let optimos = 0, bajos = 0, excedidos = 0, negros = 0;
    
    let d = new Date();
    for(let i=0; i<365; i++) {
        let iso = obtenerFechaIso(d);
        let comidas = userData.comidas[iso] || [];
        if(comidas.length === 0) {
            if(i === 0) { d.setDate(d.getDate() - 1); continue; } 
            else break; 
        }
        
        rachaActual++;
        let sumKcal = comidas.reduce((acc, c) => acc + c.kcal, 0);
        let meta = obtenerMetaDelDia(iso).totalKcal; // META AISLADA
        let pct = (sumKcal / meta) * 100;

        if(pct >= 90 && pct <= 110) optimos++;
        else if(pct < 90) bajos++;
        else if(pct > 110 && pct <= 130) excedidos++;
        else negros++;

        d.setDate(d.getDate() - 1);
    }

    document.getElementById('rachaNumeroUI').innerText = rachaActual;
    document.getElementById('rachaModalNumero').innerText = `${rachaActual} días`;
    document.getElementById('rachaOptimos').innerText = optimos;
    document.getElementById('rachaBajos').innerText = bajos;
    document.getElementById('rachaExcedidos').innerText = excedidos;
    document.getElementById('rachaNegros').innerText = negros;

    let badge = document.getElementById('btnRachaBadge');
    let numUI = document.getElementById('rachaNumeroUI');
    let iconoFuego = document.getElementById('rachaIconoUI');
    
    badge.className = "flex items-center gap-1.5 border px-3 py-1.5 rounded-full shadow-sm hover:scale-105 transition-transform ";
    
    if (rachaActual === 0) {
        badge.classList.add('bg-slate-100', 'dark:bg-slate-800', 'border-slate-200', 'dark:border-slate-700');
        iconoFuego.className = "fa-solid fa-fire-flame-curved text-lg text-slate-400";
        numUI.className = "font-extrabold text-sm text-slate-400";
    } else if (rachaActual >= 1 && rachaActual <= 6) {
        badge.classList.add('bg-amber-50', 'dark:bg-amber-500/10', 'border-amber-200', 'dark:border-amber-500/30');
        iconoFuego.className = "fa-solid fa-fire-flame-curved text-lg text-amber-400";
        numUI.className = "font-extrabold text-sm text-amber-500";
    } else if (rachaActual >= 7 && rachaActual <= 13) {
        badge.classList.add('bg-orange-50', 'dark:bg-orange-500/10', 'border-orange-200', 'dark:border-orange-500/30');
        iconoFuego.className = "fa-solid fa-fire-flame-curved text-lg text-orange-500";
        numUI.className = "font-extrabold text-sm text-orange-500";
    } else {
        badge.classList.add('bg-rose-50', 'dark:bg-rose-500/10', 'border-rose-200', 'dark:border-rose-500/30');
        iconoFuego.className = "fa-solid fa-fire-flame-curved text-lg text-rose-500 animate-pulse";
        numUI.className = "font-extrabold text-sm text-rose-500";
    }
}

function abrirModalRacha() { document.getElementById('modalRacha').classList.add('modal-active'); }
function cerrarModalRacha() { document.getElementById('modalRacha').classList.remove('modal-active'); }

function renderizarSeccionesComidas() {
    let container = document.getElementById('seccionesComidasContainer');
    if(!container) return;
    container.innerHTML = '';
    
    categoriasComida.forEach(cat => {
        container.innerHTML += `
        <div class="bg-white dark:bg-slate-900 rounded-[1.5rem] p-4 shadow-sm border border-slate-100 dark:border-slate-800">
            <div class="flex justify-between items-center mb-3">
                <div>
                    <h3 class="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                        <i class="fa-solid ${cat.icono} text-slate-400"></i> ${cat.nombre}
                    </h3>
                    <!-- AQUÍ SE INYECTAN LOS MACROS PEQUEÑOS -->
                    <span id="kcal-${cat.id}" class="text-[11px] font-semibold text-slate-400">🔥 0 kcal • 0 P | 0 C | 0 G</span>
                </div>
                <button onclick="abrirPanelRegistro('${cat.id}')" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center font-bold">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            <div id="lista-${cat.id}" class="space-y-2"></div>
        </div>`;
    });
}

function abrirPanelRegistro(catId) {
    const catNombre = categoriasComida.find(c => c.id === catId)?.nombre ?? catId;
    categoriaSeleccionadaActual = catId;
    document.getElementById('regTituloSeccion').innerText = `Añadir a ${catNombre}`;
    document.getElementById('panelRegistro').classList.remove('hidden');
    document.getElementById('detalleAlimentoElegido').classList.add('hidden');
    
    let buscador = document.getElementById('buscadorAlimento');
    buscador.value = '';
    
    // Arrancamos siempre en la pestaña de Recientes
    cambiarTabRegistro('recientes'); 
}

function cerrarPanelRegistro() {
    document.getElementById('panelRegistro').classList.add('hidden');
    alimentoSeleccionadoBase = null;
}

function modificarAgua(cantidad) {
    if(!userData.aguaMl[fechaSeleccionada]) userData.aguaMl[fechaSeleccionada] = 0;
    userData.aguaMl[fechaSeleccionada] = Math.max(0, userData.aguaMl[fechaSeleccionada] + cantidad);
    guardarDatosLocales();
    actualizarAguaUI();
}

function actualizarAguaUI() {
    let aguaActual = userData.aguaMl[fechaSeleccionada] || 0;
    let metaAgua = userData.calculos?.aguaMeta || 2000;
    document.getElementById('ui-agua-text').innerText = `${aguaActual} / ${metaAgua} ml`;
    
    let pct = Math.min((aguaActual / metaAgua) * 100, 100);
    let bar = document.getElementById('ui-agua-bar');
    bar.style.width = pct + '%';
    
    if (aguaActual >= metaAgua) {
        bar.classList.remove('bg-cyan-400');
        bar.classList.add('bg-green-500');
    } else {
        bar.classList.remove('bg-green-500');
        bar.classList.add('bg-cyan-400');
    }
}

function obtenerClaseSemaforo(pct) {
    if (pct < 90) return 'bg-gray-400';
    if (pct >= 90 && pct <= 110) return 'bg-green-500';
    return 'bg-red-500';
}

const mensajesModal = {
    1: "<b>¡Bienvenido a NutriFit!</b> 👋<br><br>Por favor preséntate y cuéntanos cuál es tu objetivo para conocerte mejor.",
    2: "<b>¡Un gusto conocerte!</b> 🧬<br><br>Para calcular tu metabolismo de forma precisa, necesitamos tus datos corporales.",
    3: "<b>¡Ya casi terminamos!</b> 🏃‍♂️<br><br>Queremos saber tu nivel de actividad física diaria y entrenamientos para ajustar la energía que necesitas."
};
function mostrarModalAlerta(step) {
    const overlay = document.getElementById('modalOverlay'); const box = document.getElementById('modalBox');
    document.getElementById('modalContent').innerHTML = mensajesModal[step];
    overlay.classList.remove('hidden'); setTimeout(() => { overlay.classList.remove('opacity-0'); box.classList.remove('scale-90'); box.classList.add('scale-100'); }, 10);
}
function cerrarModalAlerta() {
    const overlay = document.getElementById('modalOverlay'); const box = document.getElementById('modalBox');
    overlay.classList.add('opacity-0'); box.classList.remove('scale-100'); box.classList.add('scale-90');
    setTimeout(() => { overlay.classList.add('hidden'); }, 300);
}

function nextStep(step) {
    if(step === 1 && (!document.getElementById('nombre').value || !document.getElementById('apellido').value)) { alert("Completa nombre y apellido"); return; }
    if(step === 2 && (!document.getElementById('fechaNac').value || !document.getElementById('peso').value)) { alert("Completa fecha y peso"); return; }
    document.getElementById(`step-${step}`).classList.add('hidden-step'); document.getElementById(`step-${step+1}`).classList.remove('hidden-step'); document.getElementById('step-indicator').innerText = `Paso ${step+1} de 3`;
    mostrarModalAlerta(step + 1);
}
function prevStep(step) { document.getElementById(`step-${step}`).classList.add('hidden-step'); document.getElementById(`step-${step-1}`).classList.remove('hidden-step'); document.getElementById('step-indicator').innerText = `Paso ${step-1} de 3`; }
function calcularEdadEnVivo() {                  // solo muestra: ya no escribe en userData.edad
    const e = calcularEdad(document.getElementById('fechaNac').value);
    document.getElementById('edadMostrada').innerText = Number.isFinite(e) ? `Edad exacta: ${e} años` : '';
}

function agregarDeporteRoutine() {
    const select = document.getElementById('deporteSelect'); const dias = parseFloat(document.getElementById('deporteDias').value); const min = parseFloat(document.getElementById('deporteMinutos').value);
    if(!dias || !min) return;
    userData.rutinaDeportes.push({ nombre: select.options[select.selectedIndex].text, met: parseFloat(select.value), dias, min, id: Date.now() });
    let li = document.createElement('li'); li.className = "flex justify-between border-b pb-1";
    li.innerHTML = `<span>${select.options[select.selectedIndex].text}</span> <span class="text-gray-500">${dias}d x ${min}m</span>`;
    document.getElementById('listaDeportesRoutine').appendChild(li);
    document.getElementById('deporteDias').value = ''; document.getElementById('deporteMinutos').value = '';
}

function finalizarOnboarding() {
    const val = id => document.getElementById(id).value, num = id => parseFloat(val(id));
    const kg = num('peso') * (val('unidadPeso') === 'lbs' ? 0.453592 : 1);
    const cm = val('unidadAltura') === 'cm' ? num('alturaCm')
             : ((num('alturaFt') || 0) * 30.48 + (num('alturaIn') || 0) * 2.54);
    let mMusc = num('masaMuscular') || 0; if (mMusc > 0 && val('unidadMusculo') === 'lbs') mMusc *= 0.453592;
    const pGrasa = num('porcentajeGrasa') || 0;

    const borrador = {
        ...userData, nombre: val('nombre').trim(), apellido: val('apellido').trim(),
        genero: val('genero'), objetivo: val('objetivo'),
        pesoKg: kg, alturaCm: cm, fechaNac: val('fechaNac'), edad: calcularEdad(val('fechaNac')),
        movimiento: { cant: num('movimientoCantidad') || 0, unidad: val('movimientoUnidad') },
        progreso: [{ fecha: new Date().toISOString(), peso: kg, grasa: pGrasa > 0 ? pGrasa : null, musculo: mMusc > 0 ? mMusc : null, foto: null }],
        calculos: null
    };
    if (!perfilCompleto(borrador)) { alert('Revisa peso, altura y fecha de nacimiento.'); return; }
    userData = borrador; guardarDatosLocales();
    iniciarApp();                                // sin location.reload()
    window.scrollTo(0, 0);
}

// ==========================================
// CÁLCULO PURO Y AUTO-REPARABLE
// ==========================================
function calcularPerfilMetabolico(u) {
    const kg = u.pesoKg;
    const bmr = 10 * kg + 6.25 * u.alturaCm - 5 * u.edad + (u.genero === 'm' ? 5 : -161);
    const { cant = 0, unidad = 'pasos' } = u.movimiento || {};
    let neat = 0;
    if (cant > 0) {
        if (unidad === 'pasos') neat = (cant / 1000) * 0.04 * kg * 10;
        else if (unidad === 'km') neat = cant * kg * 0.75;
        else if (unidad === 'mi') neat = cant * 1.609 * kg * 0.75;
    }
    const tea = u.rutinaDeportes.reduce((a, d) => a + Math.max(0, d.met - 1) * kg * (d.dias * d.min) / 60 / 7, 0);
    const metaBase = bmr + neat + tea + bmr * 0.1 + ({ deficit: -500, volumen: 300, recomposicion: -200 }[u.objetivo] || 0);
    const proT = kg * (u.objetivo === 'volumen' ? 2.0 : 2.2), fatT = kg * 0.9;
    const carbT = Math.max(0, (metaBase - proT * 4 - fatT * 9) / 4);
    return {
        bmr, neatKcal: neat, teaKcal: tea, metaBase,
        aguaMeta: Math.round(kg * 35) + (u.rutinaDeportes.length ? 500 : 0),
        macrosBase: { p: Math.round(proT), c: Math.round(carbT), f: Math.round(fatT) }
    };
}

const calculosValidos = c => !!c && Number.isFinite(c.metaBase) && c.metaBase > 0 && !!c.macrosBase
    && ['p', 'c', 'f'].every(k => Number.isFinite(c.macrosBase[k]));

function asegurarCalculos({ forzar = false } = {}) {
    if (forzar || !calculosValidos(userData.calculos)) {
        userData.calculos = calcularPerfilMetabolico(userData);
        guardarDatosLocales();
    }
    return userData.calculos;
}
function calcularMetabolismo() { asegurarCalculos({ forzar: true }); renderTodo(); }   // misma firma que usabas

// ==========================================
// META DEL DÍA: una sola fuente para kcal y macros
// ==========================================
function obtenerMetaDelDia(iso) {
    const c = asegurarCalculos();
    const base = userData.metasCongeladas?.[iso] ?? { metaBase: c.metaBase, macros: c.macrosBase, kg: userData.pesoKg };
    const extra = (userData.actividadExtra?.[iso] ?? [])
        .reduce((a, act) => a + Math.max(0, act.met - 1) * base.kg * (act.min / 60), 0);
    return {
        baseKcal: base.metaBase, extraKcal: extra, totalKcal: base.metaBase + extra,
        macros: { p: base.macros.p, c: base.macros.c + Math.round(extra / 4), f: base.macros.f }
    };
}
function congelarMetaDelDia(iso) {               // se llama al registrar la primera comida del día
    const c = asegurarCalculos();
    userData.metasCongeladas ??= {};
    userData.metasCongeladas[iso] ??= { metaBase: c.metaBase, macros: { ...c.macrosBase }, kg: userData.pesoKg };
}

function agregarActividadExtra() {
    let select = document.getElementById('extraActividad');
    let min = parseFloat(document.getElementById('extraMinutos').value);
    if(!min) return;

    if(!userData.actividadExtra[fechaSeleccionada]) {
        userData.actividadExtra[fechaSeleccionada] = [];
    }

    userData.actividadExtra[fechaSeleccionada].push({
        nombre: select.options[select.selectedIndex].text,
        met: parseFloat(select.value),
        min
    });

    document.getElementById('extraMinutos').value = '';
    guardarDatosLocales();
    renderDia();
}

function actualizarUIDashboard() {
    let c = asegurarCalculos();
    let metaDia = obtenerMetaDelDia(fechaSeleccionada);
    let extraHTML = metaDia.extraKcal > 0 ? `<div class="flex justify-between text-orange-500 font-bold"><span>Extra de este día:</span> <span>+${Math.round(metaDia.extraKcal)} kcal</span></div>` : '';

    document.getElementById('tdeeBreakdown').innerHTML = `<div class="flex justify-between"><span>Tasa Basal:</span> <span>${Math.round(c.bmr)} kcal</span></div><div class="flex justify-between"><span>Pasos/Distancia:</span> <span>+${Math.round(c.neatKcal)} kcal</span></div><div class="flex justify-between"><span>Deporte Regular:</span> <span>+${Math.round(c.teaKcal)} kcal/día</span></div>${extraHTML}`;

    document.getElementById('dashTDEE').innerText = `${Math.round(metaDia.totalKcal)} kcal`;

    let uiGoalElement = document.getElementById('ui-goal');
    if (uiGoalElement) uiGoalElement.innerText = `Objetivo: ${Math.round(metaDia.totalKcal)} kcal`;

    // Los macros objetivo (ui-prot-t / ui-carb-t / ui-fat-t) los pinta siempre recalcularComidasTotales.

    let caloriasExtraHoyEl = document.getElementById('caloriasExtraHoy');
    if(caloriasExtraHoyEl) {
        let cuando = fechaSeleccionada === obtenerFechaIso(new Date()) ? 'hoy' : `el ${etiquetaDeFecha(fechaSeleccionada)}`;
        caloriasExtraHoyEl.innerText = `+${Math.round(metaDia.extraKcal)} kcal extra ganadas ${cuando}`;
    }
}

function toggleCrearBaseInput() {
    let unidad = document.getElementById('crearUnidad').value;
    document.getElementById('containerCantidadBase').style.display = (unidad === 'g') ? 'block' : 'none';
    // Oculto o no, la base debe ser coherente con la unidad (si no, "por unidad" se dividía entre 100)
    document.getElementById('crearCantidadBase').value = (unidad === 'g') ? 100 : 1;
}

let alimentoSeleccionadoBase = null; let timeoutBusqueda = null;
function buscarEnOpenFoodFacts(termino) {
    clearTimeout(timeoutBusqueda); const contenedor = document.getElementById('resultadosBusqueda'); if(termino.length < 3) { 
        contenedor.classList.add('hidden'); 
        let divTabs = document.getElementById('contenidoTabsDinamico');
        if(divTabs) divTabs.classList.remove('hidden'); // Vuelve a mostrar las pestañas
        return; 
    }
    // Ocultar pestañas mientras busca
    let divTabs = document.getElementById('contenidoTabsDinamico');
    if(divTabs) divTabs.classList.add('hidden');
    timeoutBusqueda = setTimeout(async () => {
        contenedor.innerHTML = '<div class="p-2 text-xs text-gray-400">Buscando...</div>'; contenedor.classList.remove('hidden');
        let htmlResultados = '';
        Alimentos.buscar(termino).forEach(item => { 
            let etiquetaMedida = (item.unidadMedida === 'g') ? `por ${item.cantidadBase}g` : `por 1 ${item.unidadMedida}`;
            htmlResultados += `<div onclick='prepararRegistro(${JSON.stringify(item)})' class="p-2 hover:bg-gray-100 cursor-pointer text-sm border-b bg-indigo-50">${item.origen === 'semilla' ? '🌱' : '⭐'} <b>${item.nombre}</b> <span class="text-xs text-gray-500">(${item.kcal} kcal ${etiquetaMedida})</span></div>`; 
        });
        try {
            let response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(termino)}&search_simple=1&action=process&json=1&page_size=5`);
            let data = await response.json();
            data.products.forEach(p => { 
                let n = p.nutriments || {}; 
                let alimentoObj = { 
                    nombre: `${p.product_name || 'Sin nombre'} ${p.brands ? '('+p.brands+')' : ''}`, 
                    unidadMedida: 'g', cantidadBase: 100,
                    kcal: n['energy-kcal_100g'] || 0, p: n['proteins_100g'] || 0, c: n['carbohydrates_100g'] || 0, f: n['fat_100g'] || 0,
                    fibra: n['fiber_100g'] || 0, azucar: n['sugars_100g'] || 0, sodio: n['sodium_100g'] ? n['sodium_100g']*1000 : 0,
                    potasio: n['potassium_100g'] || 0, calcio: n['calcium_100g'] || 0, hierro: n['iron_100g'] || 0,
                    magnesio: n['magnesium_100g'] || 0, zinc: n['zinc_100g'] || 0, vita: n['vitamin-a_100g'] || 0,
                    vitc: n['vitamin-c_100g'] ? n['vitamin-c_100g']*1000 : 0, vitd: n['vitamin-d_100g'] || 0,
                    vitb12: n['vitamin-b12_100g'] || 0, folato: n['folates_100g'] || 0
                }; 
                htmlResultados += `<div onclick='prepararRegistro(${JSON.stringify(alimentoObj)})' class="p-2 hover:bg-gray-100 cursor-pointer text-sm border-b">🌍 <b>${alimentoObj.nombre}</b> <span class="text-xs text-gray-500">(${Math.round(alimentoObj.kcal)} kcal/100g)</span></div>`; 
            });
            contenedor.innerHTML = htmlResultados || '<div class="p-2 text-xs text-gray-500">No encontrado. Créalo abajo.</div>';
        } catch (e) { contenedor.innerHTML = htmlResultados || '<div class="p-2 text-xs text-red-500">Error de API.</div>'; }
    }, 400);
}

function prepararRegistro(item) {
    item = normalizarAlimento(item);

    // 1. Si estamos armando una receta, el alimento se desvía al creador de recetas
    if (manejarSeleccionParaReceta(item)) return;

    // 2. Flujo normal de registro
    alimentoSeleccionadoBase = item;
    document.getElementById('resultadosBusqueda').classList.add('hidden');

    let divTabs = document.getElementById('contenidoTabsDinamico');
    if(divTabs) divTabs.classList.add('hidden');

    document.getElementById('detalleAlimentoElegido').classList.remove('hidden');
    document.getElementById('regNombre').innerText = item.nombre;

    let strUnidad = item.unidadMedida;
    if (item.pesoPorUnidad && strUnidad !== 'g') strUnidad += ` (${item.pesoPorUnidad}g)`;
    document.getElementById('regUnidad').innerText = strUnidad;

    document.getElementById('regCantidad').value = item.cantidadPreferida || item.cantidadBase;

    let favs = userData.biblioteca.favoritos || [];
    let btnFav = document.getElementById('btnFav');
    if(btnFav) {
        if(favs.some(f => f.nombre === item.nombre)) {
            btnFav.classList.remove('text-slate-300'); btnFav.classList.add('text-amber-400');
        } else {
            btnFav.classList.remove('text-amber-400'); btnFav.classList.add('text-slate-300');
        }
    }
    recalcularPreview();
}

function recalcularPreview() {
    let cantidad = parseFloat(document.getElementById('regCantidad').value);
    if(isNaN(cantidad) || cantidad <= 0 || !alimentoSeleccionadoBase) {
        document.getElementById('prevKcal').innerText = "0";
        document.getElementById('prevP').innerText = "0"; document.getElementById('prevC').innerText = "0"; document.getElementById('prevF').innerText = "0";
        return;
    }
    const m = macrosDe(alimentoSeleccionadoBase, cantidad);
    document.getElementById('prevKcal').innerText = Math.round(m.kcal);
    document.getElementById('prevP').innerText = Number(m.p.toFixed(1));
    document.getElementById('prevC').innerText = Number(m.c.toFixed(1));
    document.getElementById('prevF').innerText = Number(m.f.toFixed(1));
}

const MICROS_KEYS = ['fibra','azucar','sodio','potasio','calcio','hierro','magnesio','zinc','vita','vitc','vitd','vitb12','folato'];

function registrarComidaSeleccionada() {
    if(!alimentoSeleccionadoBase) return;
    if (window.lockRegistro) return;
    window.lockRegistro = true; setTimeout(() => { window.lockRegistro = false; }, 400);

    const alimento = alimentoSeleccionadoBase;
    const cantidad = parseFloat(document.getElementById('regCantidad').value);
    if (!(cantidad > 0)) { alert("Ingresa una cantidad válida."); return; }
    const factor = factorDe(alimento, cantidad);
    const m = macrosDe(alimento, cantidad);

    let strMedida = alimento.unidadMedida;
    if (alimento.pesoPorUnidad && strMedida !== 'g') strMedida = `${strMedida}s de ${alimento.pesoPorUnidad}g`;

    const nuevaComida = {
        categoria: categoriaSeleccionadaActual,
        nombre: `${alimento.nombre} (${cantidad} ${strMedida})`,
        kcal: m.kcal,
        macros: { p: m.p, c: m.c, f: m.f },
        micros: alimento.micros ? Object.fromEntries(MICROS_KEYS.map(k => [k, (alimento.micros[k] || 0) * factor])) : {},
        id: Date.now()
    };

    if(!userData.comidas[fechaSeleccionada]) userData.comidas[fechaSeleccionada] = [];
    userData.comidas[fechaSeleccionada].push(nuevaComida);
    congelarMetaDelDia(fechaSeleccionada);       // el historial no cambia si luego cambias tu peso

    registrarEnRecientes({ ...alimento, cantidadPreferida: cantidad });

    alimentoSeleccionadoBase = null; cerrarPanelRegistro();
    guardarDatosLocales(); renderTodo();         // renderTodo repinta también el punto de color del día
}

function guardarAlimentoEnBD() { 
    let nombre = document.getElementById('crearName').value.trim(); 
    let unidad = document.getElementById('crearUnidad').value; 
    
    let cantidadIngresada = parseFloat(document.getElementById('crearCantidadBase').value) || (unidad === 'g' ? 100 : 1);
    let pesoPorUnidad = parseFloat(document.getElementById('crearPesoPorUnidad')?.value) || null;
    let kcalIngresadas = parseFloat(document.getElementById('crearKcal').value) || 0; 
    
    if(!nombre || kcalIngresadas <= 0) { 
        alert("Por favor completa el nombre y las calorías."); 
        return; 
    } 

    let pIn = parseFloat(document.getElementById('crearProt').value) || 0; 
    let cIn = parseFloat(document.getElementById('crearCarb').value) || 0; 
    let fIn = parseFloat(document.getElementById('crearFat').value) || 0;

    let cantidadBaseEstandar = (unidad === 'g') ? 100 : 1;
    let factor = cantidadBaseEstandar / cantidadIngresada;

    let alimentoNormalizado = { 
        id: 'creado_' + Date.now(),
        nombre: nombre, 
        unidadMedida: unidad, 
        cantidadBase: cantidadBaseEstandar,
        cantidadPreferida: (unidad === 'g') ? cantidadIngresada : 1, 
        pesoPorUnidad: (unidad !== 'g' && pesoPorUnidad) ? pesoPorUnidad : null,
        kcal: kcalIngresadas * factor, 
        p: pIn * factor, c: cIn * factor, f: fIn * factor,
        micros: {
            fibra: (parseFloat(document.getElementById('crearFibra').value)||0)*factor, azucar: (parseFloat(document.getElementById('crearAzucar').value)||0)*factor,
            sodio: (parseFloat(document.getElementById('crearSodio').value)||0)*factor, potasio: (parseFloat(document.getElementById('crearPotasio').value)||0)*factor,
            calcio: (parseFloat(document.getElementById('crearCalcio').value)||0)*factor, hierro: (parseFloat(document.getElementById('crearHierro').value)||0)*factor,
            magnesio: (parseFloat(document.getElementById('crearMagnesio').value)||0)*factor, zinc: (parseFloat(document.getElementById('crearZinc').value)||0)*factor,
            vita: (parseFloat(document.getElementById('crearVitA').value)||0)*factor, vitc: (parseFloat(document.getElementById('crearVitC').value)||0)*factor,
            vitd: (parseFloat(document.getElementById('crearVitD').value)||0)*factor, vitb12: (parseFloat(document.getElementById('crearVitB12').value)||0)*factor,
            folato: (parseFloat(document.getElementById('crearFolato').value)||0)*factor
        },
        esReceta: false
    }; 

    const guardado = Alimentos.agregar(alimentoNormalizado);
    
    ['crearName','crearKcal','crearProt','crearCarb','crearFat','crearPesoPorUnidad'].forEach(id=>{ let el = document.getElementById(id); if(el) el.value=''; }); 
    toggleCrearBaseInput();                       // restablece la base según la unidad elegida
    
    mostrarExitoCreacion(guardado);
}

function borrarComida(id) {
    const lista = userData.comidas[fechaSeleccionada];
    if(lista) {
        userData.comidas[fechaSeleccionada] = lista.filter(c => c.id !== id);
        if(userData.comidas[fechaSeleccionada].length === 0 && userData.metasCongeladas) {
            delete userData.metasCongeladas[fechaSeleccionada];   // día vacío: ya no hay historial que proteger
        }
    }
    guardarDatosLocales();
    renderTodo();
}

function recalcularComidasTotales() {
    let sumKcal = 0, sumP = 0, sumC = 0, sumF = 0;
    let comidasDelDia = userData.comidas[fechaSeleccionada] || [];

    let macrosPorCategoria = {
        desayuno: { k: 0, p: 0, c: 0, f: 0 },
        almuerzo: { k: 0, p: 0, c: 0, f: 0 },
        merienda: { k: 0, p: 0, c: 0, f: 0 },
        cena: { k: 0, p: 0, c: 0, f: 0 },
        snacks: { k: 0, p: 0, c: 0, f: 0 }
    };
    let htmlListas = { desayuno: '', almuerzo: '', merienda: '', cena: '', snacks: '' };

    comidasDelDia.forEach(c => {
        sumKcal += c.kcal;
        sumP += c.macros.p; sumC += c.macros.c; sumF += c.macros.f;
        let cat = c.categoria || 'snacks'; 

        if (macrosPorCategoria[cat]) {
            macrosPorCategoria[cat].k += c.kcal;
            macrosPorCategoria[cat].p += c.macros.p;
            macrosPorCategoria[cat].c += c.macros.c;
            macrosPorCategoria[cat].f += c.macros.f;
        }

        htmlListas[cat] += `
        <div class="flex justify-between items-center p-2.5 bg-gray-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 text-sm">
            <div>
                <p class="font-bold text-gray-800 dark:text-slate-100">${c.nombre}</p>
                <p class="text-[11px] text-gray-500">${Number(c.macros.p.toFixed(1))}P | ${Number(c.macros.c.toFixed(1))}C | ${Number(c.macros.f.toFixed(1))}G</p>
            </div>
            <div class="flex items-center gap-3">
                <span class="font-bold text-emerald-600 dark:text-emerald-400">${Math.round(c.kcal)} kcal</span>
                <button onclick="borrarComida(${c.id})" class="text-rose-400 hover:text-rose-600"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    });

    ['desayuno', 'almuerzo', 'merienda', 'cena', 'snacks'].forEach(cat => {
        let elKcal = document.getElementById(`kcal-${cat}`);
        if (elKcal) {
            let m = macrosPorCategoria[cat];
            elKcal.innerText = `🔥 ${Math.round(m.k)} kcal • ${Math.round(m.p)} P | ${Math.round(m.c)} C | ${Math.round(m.f)} G`;
        }
        let elem = document.getElementById(`lista-${cat}`);
        if(elem) elem.innerHTML = htmlListas[cat] || `<p class="text-gray-400 dark:text-slate-500 text-xs italic">Sin alimentos registrados.</p>`;
    });

    const meta = obtenerMetaDelDia(fechaSeleccionada);
    const metaKcal = meta.totalKcal;
    const { p: metaP, c: metaC, f: metaF } = meta.macros;

    let pctKcal = (sumKcal / metaKcal) * 100;
    let barra = document.getElementById('barraProgresoKcal');
    if(barra) barra.style.width = `${Math.min(pctKcal, 100)}%`;

    let tituloCabecera = document.getElementById('vistaKcalTitulo');
    let numeroCabecera = document.getElementById('vistaKcalNumero');

    if(tituloCabecera && numeroCabecera) {
        if (modoVistaDashboard === 'restantes') {
            tituloCabecera.innerHTML = 'kcal restantes <i class="fa-solid fa-chevron-right text-[10px]"></i>';
            numeroCabecera.innerText = Math.max(0, Math.round(metaKcal - sumKcal));
            document.getElementById('ui-prot-t').innerText = `${Math.max(0, Math.round(metaP - sumP))}g`;
            document.getElementById('ui-carb-t').innerText = `${Math.max(0, Math.round(metaC - sumC))}g`;
            document.getElementById('ui-fat-t').innerText = `${Math.max(0, Math.round(metaF - sumF))}g`;
        } else {
            tituloCabecera.innerHTML = 'kcal consumidas <i class="fa-solid fa-chevron-right text-[10px]"></i>';
            numeroCabecera.innerHTML = `<span class="text-slate-400 text-3xl">${Math.round(sumKcal)} /</span> ${Math.round(metaKcal)}`;
            document.getElementById('ui-prot-t').innerText = `${Math.round(sumP)} / ${metaP}g`;
            document.getElementById('ui-carb-t').innerText = `${Math.round(sumC)} / ${metaC}g`;
            document.getElementById('ui-fat-t').innerText = `${Math.round(sumF)} / ${metaF}g`;
        }
    }
    calcularRachaGeneral();
}

function abrirModalPerfil() {
    document.getElementById('editPeso').value = Number(userData.pesoKg.toFixed(1));
    document.getElementById('editAltura').value = Number(userData.alturaCm.toFixed(1));
    document.getElementById('editObjetivo').value = userData.objetivo;
    document.getElementById('editMovCantidad').value = userData.movimiento.cant;
    document.getElementById('editMovUnidad').value = userData.movimiento.unidad;
    renderizarDeportesPerfil();
    document.getElementById('modalPerfil').classList.add('modal-active');
}
function cerrarModalPerfil() { document.getElementById('modalPerfil').classList.remove('modal-active'); }

function renderizarDeportesPerfil() {
    let html = '';
    userData.rutinaDeportes.forEach((d, index) => {
        html += `<li class="flex justify-between items-center bg-white dark:bg-slate-800 border p-2 rounded text-sm">
                    <span><b>${d.nombre}</b> <span class="text-gray-500">(${d.dias}d x ${d.min}m)</span></span>
                    <button onclick="borrarDeportePerfil(${index})" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button>
                 </li>`;
    });
    document.getElementById('listaDeportesPerfilEdit').innerHTML = html || '<p class="text-xs text-gray-400 italic">No tienes deportes en tu rutina.</p>';
}

function agregarDeporteDesdePerfil() {
    const select = document.getElementById('editDeporteSelect'); const dias = parseFloat(document.getElementById('editDeporteDias').value); const min = parseFloat(document.getElementById('editDeporteMinutos').value);
    if(!dias || !min) { alert("Completa días y minutos"); return; }
    userData.rutinaDeportes.push({ nombre: select.options[select.selectedIndex].text, met: parseFloat(select.value), dias, min, id: Date.now() });
    document.getElementById('editDeporteDias').value = ''; document.getElementById('editDeporteMinutos').value = '';
    renderizarDeportesPerfil();
}

function borrarDeportePerfil(index) { userData.rutinaDeportes.splice(index, 1); renderizarDeportesPerfil(); }

function guardarPerfilEditado() {
    const kg = parseFloat(document.getElementById('editPeso').value);
    const cm = parseFloat(document.getElementById('editAltura').value);
    if (!esNum(kg, 20, 400) || !esNum(cm, 80, 250)) { alert("Revisa peso (20–400 kg) y altura (80–250 cm)."); return; }
    userData.pesoKg = kg;
    userData.alturaCm = cm;
    userData.objetivo = document.getElementById('editObjetivo').value;
    userData.movimiento.cant = parseFloat(document.getElementById('editMovCantidad').value || 0) || 0;
    userData.movimiento.unidad = document.getElementById('editMovUnidad').value;
    calcularMetabolismo(); cerrarModalPerfil();   // recalcula, guarda y repinta todo (encabezado incluido)
    alert("Perfil y rutina guardados correctamente.");
}
function resetAppTotal() { if(confirm("⚠ ¿Borrar todos los datos para siempre?")) { localStorage.removeItem('nutrifit_user'); location.reload(); } }

function abrirModalProgreso() {
    document.getElementById('diasRecordatorio').value = userData.recordatorioDias;
    document.getElementById('progPeso').value = Number(userData.pesoKg.toFixed(1));
    renderizarListaProgreso();
    document.getElementById('modalProgreso').classList.add('modal-active');
}
function cerrarModalProgreso() { document.getElementById('modalProgreso').classList.remove('modal-active'); }

function cambiarFrecuenciaRecordatorio() { userData.recordatorioDias = parseInt(document.getElementById('diasRecordatorio').value) || 7; guardarDatosLocales(); verificarAlertaProgreso(); }
function verificarAlertaProgreso() {
    if(!userData.progreso || userData.progreso.length === 0) return;
    let ultimo = new Date(userData.progreso[userData.progreso.length - 1].fecha);
    let diffDias = Math.ceil(Math.abs(new Date() - ultimo) / (1000 * 60 * 60 * 24));
    
    let btnProgreso = document.getElementById('btnProgreso');
    if(diffDias >= userData.recordatorioDias) {
        btnProgreso.className = "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-3xl bg-rose-500 text-white font-bold shadow-lg shadow-rose-500/40 hover:bg-rose-600 active:scale-95 transition-all animate-pulse";
    } else {
        btnProgreso.className = "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-3xl bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 active:scale-95 transition-all";
    }
}

function comprimirImagen(file, callback) {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = event => {
        const img = new Image(); img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas'); const MAX_WIDTH = 500; let width = img.width, height = img.height;
            if(width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        }
    }
}

function guardarRegistroProgreso() {
    let peso = parseFloat(document.getElementById('progPeso').value);
    let grasa = parseFloat(document.getElementById('progGrasa').value || 0);
    let musculo = parseFloat(document.getElementById('progMusculo').value || 0);
    let inputFoto = document.getElementById('progFoto');
    if(!esNum(peso, 20, 400)) { alert("Ingresa un peso válido (20–400 kg)."); return; }

    userData.pesoKg = peso; calcularMetabolismo(); 
    let nuevoRegistro = { fecha: new Date().toISOString(), peso: peso, grasa: grasa > 0 ? grasa : null, musculo: musculo > 0 ? musculo : null, foto: null };

    if(inputFoto.files && inputFoto.files[0]) {
        comprimirImagen(inputFoto.files[0], (base64Img) => { nuevoRegistro.foto = base64Img; userData.progreso.push(nuevoRegistro); finalizarGuardadoProgreso(); });
    } else {
        userData.progreso.push(nuevoRegistro); finalizarGuardadoProgreso();
    }
}

function finalizarGuardadoProgreso() {
    guardarDatosLocales(); renderizarListaProgreso(); verificarAlertaProgreso();
    document.getElementById('progGrasa').value = ''; document.getElementById('progMusculo').value = ''; document.getElementById('progFoto').value = '';
}

function renderizarListaProgreso() {
    let html = '';
    [...userData.progreso].reverse().forEach((p, index) => {
        let fechaFormateada = new Date(p.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        let esDiaUno = (index === userData.progreso.length - 1) ? `<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold ml-2">Día 1</span>` : '';
        
        let statsHtml = `<p class="text-xs text-gray-500 mt-0.5">`;
        if(p.grasa) statsHtml += `💧 Grasa: ${p.grasa}% `;
        if(p.musculo) statsHtml += `💪 Músculo: ${p.musculo}kg`;
        statsHtml += `</p>`;

        html += `
        <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
            <div class="flex items-center gap-3">
                ${p.foto ? `<img src="${p.foto}" class="w-12 h-12 object-cover rounded-md border border-gray-200">` : `<div class="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-md flex items-center justify-center text-gray-400 border"><i class="fa-solid fa-camera-retro"></i></div>`}
                <div>
                    <p class="font-bold text-gray-800 dark:text-slate-100 text-sm">${p.peso} Kg</p>
                    <p class="text-xs text-gray-400 font-medium">${fechaFormateada} ${esDiaUno}</p>
                    ${p.grasa || p.musculo ? statsHtml : ''}
                </div>
            </div>
        </div>`;
    });
    document.getElementById('listaProgreso').innerHTML = html;
}

// ==========================================
// SISTEMA DE BIBLIOTECA, CACHÉ Y RECETAS
// ==========================================

function registrarEnRecientes(alimentoObj) {
    let recientes = userData.biblioteca.recientes || [];
    // Filtramos por nombre para no tener duplicados del mismo alimento
    recientes = recientes.filter(item => item.nombre !== alimentoObj.nombre);
    recientes.unshift(alimentoObj); // Añadimos el objeto completo al inicio
    if (recientes.length > 30) recientes.pop(); // Mantenemos el máximo de 30
    
    userData.biblioteca.recientes = recientes;
    guardarDatosLocales();
}

function alternarFavorito() {
    if(!alimentoSeleccionadoBase) return;
    
    // Capturamos la cantidad actual del input para asociarla al favorito
    let cantidadActual = parseFloat(document.getElementById('regCantidad').value) || alimentoSeleccionadoBase.cantidadBase || 100;
    let itemParaFav = { ...alimentoSeleccionadoBase, cantidadPreferida: cantidadActual };

    let favs = userData.biblioteca.favoritos || [];
    let index = favs.findIndex(f => f.nombre === itemParaFav.nombre);
    let btnFav = document.getElementById('btnFav');
    
    if(index >= 0) {
        favs.splice(index, 1);
        btnFav.classList.remove('text-amber-400');
        btnFav.classList.add('text-slate-300');
    } else {
        favs.push(itemParaFav);
        btnFav.classList.remove('text-slate-300');
        btnFav.classList.add('text-amber-400');
    }
    userData.biblioteca.favoritos = favs;
    guardarDatosLocales();
    
    if(tabActual === 'favoritos') renderizarListasDelTab();
}

// ==========================================
// RENDERIZADO DE TABS (PESTAÑAS)
// ==========================================
let tabActual = 'recientes';

function cambiarTabRegistro(tab) {
    tabActual = tab;
    
    // NUEVO: Ocultar el recuadro de confirmación al cambiar de pestaña
    let detalleCaja = document.getElementById('detalleAlimentoElegido');
    if(detalleCaja) detalleCaja.classList.add('hidden');
    
    const tabs = ['recientes', 'favoritos', 'creaciones', 'crear'];
    tabs.forEach(t => {
        let btn = document.getElementById(`tab-${t}`);
        if(!btn) return;
        if(t === tab) {
            btn.className = "flex-1 py-2 px-3 rounded-xl text-[13px] font-bold bg-white dark:bg-slate-700 text-emerald-600 shadow-sm transition-all whitespace-nowrap flex items-center justify-center gap-1";
        } else {
            btn.className = "flex-1 py-2 px-3 rounded-xl text-[13px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all whitespace-nowrap flex items-center justify-center gap-1";
        }
    });

    let contListas = document.getElementById('contenedorListasRegistro');
    let contBuscador = document.getElementById('contenedorBuscador');
    let contCrear = document.getElementById('contenedorCrearAlimento');
    let divTabs = document.getElementById('contenidoTabsDinamico');

    if (tab === 'crear') {
        // Ocultar listas y buscador, mostrar formulario de creación
        contListas.classList.add('hidden');
        contBuscador.classList.add('hidden');
        if(divTabs) divTabs.classList.add('hidden');
        contCrear.classList.remove('hidden');
    } else {
        // Mostrar listas y buscador, ocultar formulario de creación
        contListas.classList.remove('hidden');
        contBuscador.classList.remove('hidden');
        contCrear.classList.add('hidden');
        renderizarListasDelTab();
    }
}

let tempListaTab = []; // Array temporal para indexar los clicks de las pestañas

function renderizarListasDelTab() {
    let html = '';
    tempListaTab = []; 

    if (tabActual === 'recientes') {
        tempListaTab = userData.biblioteca.recientes || [];
        if(tempListaTab.length === 0) html = `<p class="text-xs text-center text-slate-400 mt-6 font-medium">No hay comidas recientes. Empieza a registrar para poblar esta lista.</p>`;
    } else if (tabActual === 'favoritos') {
        tempListaTab = userData.biblioteca.favoritos || [];
        if(tempListaTab.length === 0) html = `<p class="text-xs text-center text-slate-400 mt-6 font-medium">Aún no tienes alimentos favoritos.</p>`;
    } else if (tabActual === 'creaciones') {
        tempListaTab = Alimentos.lista.filter(a => a.origen !== 'semilla');
        if(tempListaTab.length === 0) html = `<p class="text-xs text-center text-slate-400 mt-6 font-medium">No has creado alimentos propios aún.</p>`;
    }

    tempListaTab.forEach((raw, index) => {
        const item = normalizarAlimento(raw);
        const unidadMedida = item.unidadMedida;

        // Smart Preset: leer la cantidad preferida si existe
        const cantidadAMostrar = item.cantidadPreferida ? item.cantidadPreferida : item.cantidadBase;
        const kcalVisuales = Math.round(macrosDe(item, cantidadAMostrar).kcal);
        const textoPorcion = item.cantidadPreferida ? `Tu porción: ${cantidadAMostrar}${unidadMedida}` : `Base: ${item.cantidadBase}${unidadMedida}`;

        html += `
        <div onclick='seleccionarItemTab(${index})' class="flex justify-between items-center p-3.5 mb-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer rounded-2xl border border-slate-100 dark:border-slate-700/60 transition-all bg-white dark:bg-slate-900/40 shadow-sm group">
            <div class="pr-3">
                <p class="font-extrabold text-sm text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 transition-colors leading-tight">${item.nombre}</p>
                <p class="text-[11px] font-semibold text-slate-400 mt-1">${kcalVisuales} kcal | ${textoPorcion}</p>
            </div>
            <button class="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all shrink-0"><i class="fa-solid fa-plus"></i></button>
        </div>`;
    });

    let contenedorListas = document.getElementById('contenedorListasRegistro');
    let divTabs = document.getElementById('contenidoTabsDinamico');
    if(!divTabs) {
        divTabs = document.createElement('div');
        divTabs.id = 'contenidoTabsDinamico';
        contenedorListas.insertBefore(divTabs, document.getElementById('resultadosBusqueda'));
    }
    
    divTabs.innerHTML = html;
    divTabs.classList.remove('hidden');
    document.getElementById('resultadosBusqueda').classList.add('hidden');
}

function seleccionarItemTab(index) {
    let item = tempListaTab[index];
    if(!item) return;

    const objNormalizado = normalizarAlimento({
        ...item,
        id: item.id || null,
        cantidadPreferida: item.cantidadPreferida || null,
        micros: item.micros || { fibra: 0, azucar: 0, sodio: 0, potasio: 0, calcio: 0, hierro: 0, magnesio: 0, zinc: 0, vita: 0, vitc: 0, vitd: 0, vitb12: 0, folato: 0 }
    });

    prepararRegistro(objNormalizado);   // si hay una receta en curso, prepararRegistro lo desvía al creador de recetas
}

//=================================
// EVALUACION Y MOTIVACION DIARIA
//================================

function evaluarDia() {
    // CORRECCIÓN: Invoca a la meta específica de la fecha elegida
    let metaKcal = obtenerMetaDelDia(fechaSeleccionada).totalKcal;
    let comidasDia = userData.comidas[fechaSeleccionada] || [];
    
    // CORRECCIÓN: La propiedad correcta es kcal, no kal
    let sumKcal = comidasDia.reduce((acc, c) => acc + c.kcal, 0);

    if (sumKcal === 0) {
        mostrarMensajeDinamico("<b>¡El día está en blanco!</b> <br><br>Aún no has registrado ninguna comida. ¡Anota tus alimentos para poder progresar, tú puedes!");
        return;
    }

    let pct = (sumKcal / metaKcal) * 100;
    let mensaje = "";

    if (pct < 85) {
        mensaje = "<b>¡Aún falta un poco!</b> <br><br>Estás por debajo de tu meta diaria, ¡todavía puedes registrar tus alimentos! Recuerda que no comer puede frenar el metabolismo y dificultar la recuperación muscular. ¡A progresar!";
    } else if (pct >= 85 && pct <=110) {
        mensaje = "<b>¡Día Perfecto!</b> <br><br>Has clavado tus calorías y macros en la zona óptima. ¡Esta es la actitud para lograr nuestros objetivos! ¡A descansar y continuar mañana!";
    } else {
        mensaje ="<b>¡Hoy hubo energía de más!</b> <br><br>Te pasaste un poco del presupuesto calórico hoy, ¡pero es normal! Esta energía servirá para rendir mejor el día de mañana. ¡A compensar y seguir enfocados con todo!";
    }

    mostrarMensajeDinamico(mensaje);
}

//Funcion auxiliar para reusar el modal del Onboarding
function mostrarMensajeDinamico(htmlContent) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');

    document.getElementById('modalContent').innerHTML = htmlContent;

    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        box.classList.remove('scale-90');
        box.classList.add('scale-100');
    }, 10);
}

// ==========================================
// CREADOR DE RECETAS COMPUESTAS Y BUSCADOR
// ==========================================
let ingredientesRecetaTemp = [];
let modoAgregandoReceta = false;
let tituloOriginalPanel = "";

function cambiarModoCreacion(modo) {
    let btnAlimento = document.getElementById('btnModoAlimento');
    let btnReceta = document.getElementById('btnModoReceta');
    let formAlimento = document.getElementById('formAlimentoSimple');
    let formReceta = document.getElementById('formRecetaCompuesta');

    if (modo === 'alimento') {
        btnAlimento.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white dark:bg-emerald-500 transition-all shadow-md";
        btnReceta.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 transition-all hover:bg-slate-200 dark:hover:bg-slate-700";
        formAlimento.classList.remove('hidden');
        formReceta.classList.add('hidden');
    } else {
        btnReceta.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white dark:bg-emerald-500 transition-all shadow-md";
        btnAlimento.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 transition-all hover:bg-slate-200 dark:hover:bg-slate-700";
        formReceta.classList.remove('hidden');
        formAlimento.classList.add('hidden');
    }
}

function abrirBuscadorIngrediente() {
    modoAgregandoReceta = true;
    
    let tituloEl = document.getElementById('regTituloSeccion');
    tituloOriginalPanel = tituloEl.innerText;
    tituloEl.innerText = "Buscar ingredientes";
    
    document.getElementById('tab-creaciones').classList.add('hidden');
    document.getElementById('tab-crear').classList.add('hidden');
    
    document.getElementById('buscadorAlimento').placeholder = "🔍 Busca un ingrediente para tu receta...";
    cambiarTabRegistro('favoritos'); 
}

// Única implementación del "agregar ingrediente a receta" (antes duplicada en prepararRegistro)
function manejarSeleccionParaReceta(itemSeleccionado) {
    if (!modoAgregandoReceta) return false;
    const item = normalizarAlimento(itemSeleccionado);

    const defaultCant = item.cantidadPreferida || item.cantidadBase || 100;
    let cant = prompt(`¿Qué cantidad de ${item.nombre} (${item.unidadMedida}) vas a usar?`, defaultCant);

    if (cant !== null && !isNaN(cant) && parseFloat(cant) > 0) {
        const cantidadUsada = parseFloat(cant);
        const m = macrosDe(item, cantidadUsada);
        ingredientesRecetaTemp.push({
            nombre: item.nombre,
            cantidad: cantidadUsada,
            unidadMedida: item.unidadMedida,
            pesoPorUnidad: item.pesoPorUnidad || null,
            kcal: m.kcal, p: m.p, c: m.c, f: m.f
        });
    }

    // Restaurar interfaz del panel de creación
    modoAgregandoReceta = false;
    document.getElementById('regTituloSeccion').innerText = tituloOriginalPanel;
    document.getElementById('tab-creaciones').classList.remove('hidden');
    document.getElementById('tab-crear').classList.remove('hidden');
    document.getElementById('buscadorAlimento').placeholder = "🔍 Buscar alimento o código de barras...";

    cambiarTabRegistro('crear');
    cambiarModoCreacion('receta');
    actualizarResumenReceta();
    return true;
}

function actualizarResumenReceta() {
    let contenedor = document.getElementById('listaIngredientesReceta');
    let resumenTxt = document.getElementById('resumenMacrosReceta');
    
    if (ingredientesRecetaTemp.length === 0) {
        contenedor.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">No hay ingredientes sumados todavía.</p>`;
        resumenTxt.innerText = "0 kcal | P: 0g | C: 0g | G: 0g";
        return;
    }

    let totalK = 0, totalP = 0, totalC = 0, totalG = 0;
    contenedor.innerHTML = '';

    ingredientesRecetaTemp.forEach((ing, index) => {
        totalK += ing.kcal;
        totalP += ing.p;
        totalC += ing.c;
        totalG += ing.f;
        contenedor.innerHTML += `
            <div class="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-xl text-xs border border-slate-100 dark:border-slate-800 mb-1">
                <span class="font-bold text-slate-700 dark:text-slate-200">${ing.nombre} <span class="text-slate-400 font-normal">(${ing.cantidad}${ing.unidadMedida})</span></span>
                <div class="flex items-center gap-3">
                    <span class="text-slate-500 font-medium">${Math.round(ing.kcal)} kcal</span>
                    <button onclick="eliminarIngredienteReceta(${index})" class="text-rose-500 hover:text-rose-700 transition-colors"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>`;
    });
    resumenTxt.innerText = `${Math.round(totalK)} kcal | P: ${Math.round(totalP)}g | C: ${Math.round(totalC)}g | G: ${Math.round(totalG)}g`;
}

function eliminarIngredienteReceta(index) {
    ingredientesRecetaTemp.splice(index, 1);
    actualizarResumenReceta();
}

function guardarRecetaCompuesta() {
    let nombre = document.getElementById('recetaName').value.trim();
    if(!nombre) return alert("Dale un nombre a tu receta.");
    if(ingredientesRecetaTemp.length === 0) return alert("Añade al menos un ingrediente.");

    let totalK = 0, totalP = 0, totalC = 0, totalG = 0, pesoTotalGramos = 0;
    
    ingredientesRecetaTemp.forEach(ing => { 
        totalK += ing.kcal; totalP += (ing.p || 0); totalC += (ing.c || 0); totalG += (ing.f || 0); 
        
        // Sumatoria inteligente de gramos
        if (ing.unidadMedida === 'g') {
            pesoTotalGramos += ing.cantidad;
        } else if (ing.pesoPorUnidad) {
            pesoTotalGramos += (ing.cantidad * ing.pesoPorUnidad);
        }
    });

    let recetaNormalizada;

    // Si pudimos calcular el peso en gramos, convertimos la receta a GRAMOS
    if (pesoTotalGramos > 0) {
        let factorA100g = 100 / pesoTotalGramos;
        recetaNormalizada = {
            id: 'receta_' + Date.now(),
            nombre: nombre,
            unidadMedida: 'g',
            cantidadBase: 100,
            cantidadPreferida: pesoTotalGramos, // Por defecto, te sugerirá comer toda la receta entera
            kcal: totalK * factorA100g,
            p: totalP * factorA100g, c: totalC * factorA100g, f: totalG * factorA100g,
            micros: { fibra: 0, azucar: 0, sodio: 0, potasio: 0, calcio: 0, hierro: 0, magnesio: 0, zinc: 0, vita: 0, vitc: 0, vitd: 0, vitb12: 0, folato: 0 },
            esReceta: true,
            ingredientes: [...ingredientesRecetaTemp]
        };
    } else {
        // Si no sabemos los gramos de las unidades, la guardamos por "porción"
        recetaNormalizada = {
            id: 'receta_' + Date.now(),
            nombre: nombre,
            unidadMedida: 'porcion',
            cantidadBase: 1, cantidadPreferida: 1,
            kcal: totalK, p: totalP, c: totalC, f: totalG,
            micros: { fibra: 0, azucar: 0, sodio: 0, potasio: 0, calcio: 0, hierro: 0, magnesio: 0, zinc: 0, vita: 0, vitc: 0, vitd: 0, vitb12: 0, folato: 0 },
            esReceta: true,
            ingredientes: [...ingredientesRecetaTemp]
        };
    }

    recetaNormalizada = Alimentos.agregar(recetaNormalizada);

    document.getElementById('recetaName').value = '';
    ingredientesRecetaTemp = [];
    actualizarResumenReceta();

    mostrarExitoCreacion(recetaNormalizada);
}

let ultimoElementoCreado = null; 

function mostrarExitoCreacion(alimento) {
    ultimoElementoCreado = alimento;
    const overlay = document.getElementById('modalOverlay'); 
    const box = document.getElementById('modalBox');
    const content = document.getElementById('modalContent');
    const btnContinuar = document.getElementById('btnContinuarAlerta');
    
    // Ocultamos el botón "Continuar" normal
    if(btnContinuar) btnContinuar.style.display = 'none';

    // Nombre de la comida actual (ej. desayuno, almuerzo)
    let nombreComida = window.seccionActualRegistro ? window.seccionActualRegistro : "tu comida";

    content.innerHTML = `
        <div class="text-5xl mb-4 text-emerald-500"><i class="fa-solid fa-circle-check"></i></div>
        <h3 class="text-xl font-extrabold text-slate-800 dark:text-white mb-2">¡Guardado con éxito!</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-6"><b>${alimento.nombre}</b> ya está en tu base de datos.<br><br>¿Deseas registrarlo ahora mismo en tu <b>${nombreComida}</b>?</p>
        <div class="flex gap-2">
            <button onclick="accionDespuesDeCrear(false)" class="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all">No, guardar</button>
            <button onclick="accionDespuesDeCrear(true)" class="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/30">Sí, agregar</button>
        </div>
    `;
    
    overlay.classList.remove('hidden'); 
    setTimeout(() => { overlay.classList.remove('opacity-0'); box.classList.remove('scale-90'); box.classList.add('scale-100'); }, 10);
}

function accionDespuesDeCrear(quiereRegistrar) {
    cerrarModalAlerta();
    
    // Restaurar botón continuar para alertas futuras
    setTimeout(() => {
        let btnContinuar = document.getElementById('btnContinuarAlerta');
        if(btnContinuar) btnContinuar.style.display = 'block';
    }, 300);

    // SOLUCIÓN AL BUG: Te sacamos de la pestaña "Crear" y te llevamos a "Creados"
    cambiarTabRegistro('creaciones');

    if (quiereRegistrar && ultimoElementoCreado) {
        // Al estar en la pestaña correcta, el recuadro de macros se abrirá bien
        prepararRegistro(ultimoElementoCreado);
    }
}

// Función auxiliar para el Onboarding (selector de altura)
function toggleAlturaInputs() {
    let u = document.getElementById('unidadAltura').value;
    if(u === 'ft') {
        document.getElementById('alturaFtContainer').classList.remove('hidden');
        document.getElementById('alturaCm').classList.add('hidden');
    } else {
        document.getElementById('alturaFtContainer').classList.add('hidden');
        document.getElementById('alturaCm').classList.remove('hidden');
    }
}
