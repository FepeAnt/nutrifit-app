let userData = { 
    rutinaDeportes: [], actividadExtraHoy: [], comidas: {}, aguaMl: {}, progreso: [], recordatorioDias: 7,
    biblioteca: { favoritos: [], creaciones: [], recetas: [], recientes: [] }
};

let modoVistaDashboard = 'restantes';

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

let alimentosPersonalizados = JSON.parse(localStorage.getItem('nutrifit_alimentos')) || [];
let categoriaSeleccionadaActual = 'desayuno';
let fechaSeleccionada = obtenerFechaIso(new Date());
let mesCalendarioActual = new Date();
let tabActual = 'recientes';
let tempListaTab = []; 
let alimentoSeleccionadoBase = null; 
let timeoutBusqueda = null;
let ingredientesRecetaTemp = [];
let modoAgregandoReceta = false;
let tituloOriginalPanel = "";
let ultimoElementoCreado = null; 

function obtenerFechaIso(d) {
    let ano = d.getFullYear();
    let mes = String(d.getMonth() + 1).padStart(2, '0');
    let dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

window.onload = () => {
    let datosGuardados = localStorage.getItem('nutrifit_user');
    if(datosGuardados) {
        userData = JSON.parse(datosGuardados);
        if(!userData.progreso) userData.progreso = [];
        if(!userData.recordatorioDias) userData.recordatorioDias = 7;
        if(!userData.comidas || Array.isArray(userData.comidas)) userData.comidas = {}; 
        if(!userData.aguaMl || typeof userData.aguaMl === 'number') userData.aguaMl = {};
        
        if(!userData.actividadExtra) userData.actividadExtra = {};
        if(userData.actividadExtraHoy) { 
            userData.actividadExtra[obtenerFechaIso(new Date())] = userData.actividadExtraHoy;
            delete userData.actividadExtraHoy;
        }

        if(!userData.biblioteca) {
            userData.biblioteca = { favoritos: [], creaciones: [], recetas: [], recientes: [] };
            guardarDatosLocales();
        } 
        
        document.getElementById('onboarding').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('fabContainer').classList.remove('hidden');
        
        document.getElementById('dashName').innerText = `Hola, ${userData.nombre} — ${userData.edad} años | ${userData.pesoKg.toFixed(1)}kg`;
        
        renderizarSeccionesComidas();
        calcularMetabolismo(); 
        verificarAlertaProgreso();
        renderizarCalendarioSemanal();
        actualizarVistaFecha();
    } else {
        mostrarModalAlerta(1);
    }
};

function guardarDatosLocales() { localStorage.setItem('nutrifit_user', JSON.stringify(userData)); }

// --- ONBOARDING Y CONFIGURACIÓN ---
function nextStep(step) {
    if(step === 1 && (!document.getElementById('nombre').value || !document.getElementById('apellido').value)) { alert("Completa nombre y apellido"); return; }
    if(step === 2 && (!document.getElementById('fechaNac').value || !document.getElementById('peso').value)) { alert("Completa fecha y peso"); return; }
    document.getElementById(`step-${step}`).classList.add('hidden-step'); 
    document.getElementById(`step-${step+1}`).classList.remove('hidden-step'); 
    document.getElementById('step-indicator').innerText = `Paso ${step+1} de 3`;
    mostrarModalAlerta(step + 1);
}

function prevStep(step) { 
    document.getElementById(`step-${step}`).classList.add('hidden-step'); 
    document.getElementById(`step-${step-1}`).classList.remove('hidden-step'); 
    document.getElementById('step-indicator').innerText = `Paso ${step-1} de 3`; 
}

function calcularEdadEnVivo() {
    const fecha = new Date(document.getElementById('fechaNac').value); if(isNaN(fecha)) return;
    const hoy = new Date(); let anos = hoy.getFullYear() - fecha.getFullYear();
    if (hoy.getMonth() < fecha.getMonth() || (hoy.getMonth() === fecha.getMonth() && hoy.getDate() < fecha.getDate())) { anos--; }
    userData.edad = anos; document.getElementById('edadMostrada').innerText = `Edad exacta: ${anos} años`;
}

function finalizarOnboarding() {
    let pesoInput = parseFloat(document.getElementById('peso').value);
    userData.pesoKg = document.getElementById('unidadPeso').value === 'lbs' ? pesoInput * 0.453592 : pesoInput;
    userData.alturaCm = document.getElementById('unidadAltura').value === 'cm' ? parseFloat(document.getElementById('alturaCm').value) : ((parseFloat(document.getElementById('alturaFt').value||0)*30.48) + (parseFloat(document.getElementById('alturaIn').value||0)*2.54));
    
    userData.nombre = document.getElementById('nombre').value;
    userData.genero = document.getElementById('genero').value;
    userData.objetivo = document.getElementById('objetivo').value;
    userData.movimiento = { cant: parseFloat(document.getElementById('movimientoCantidad').value || 0), unidad: document.getElementById('movimientoUnidad').value };
    
    let mMusc = parseFloat(document.getElementById('masaMuscular').value || 0);
    if(mMusc > 0 && document.getElementById('unidadMusculo').value === 'lbs') mMusc = mMusc * 0.453592;
    let pGrasa = parseFloat(document.getElementById('porcentajeGrasa').value || 0);

    userData.progreso = [{ 
        fecha: new Date().toISOString(), 
        peso: userData.pesoKg, 
        grasa: pGrasa > 0 ? pGrasa : null, 
        musculo: mMusc > 0 ? mMusc : null,
        foto: null 
    }];

    guardarDatosLocales(); location.reload(); 
}

const mensajesModal = {
    1: "<b>¡Bienvenido a NutriFit!</b> 👋<br><br>Por favor preséntate y cuéntanos cuál es tu objetivo para conocerte mejor.",
    2: "<b>¡Un gusto conocerte!</b> 🧬<br><br>Para calcular tu metabolismo de forma precisa, necesitamos tus datos corporales.",
    3: "<b>¡Ya casi terminamos!</b> 🏃‍♂️<br><br>Queremos saber tu nivel de actividad física diaria y entrenamientos para ajustar la energía que necesitas."
};

function mostrarModalAlerta(step) {
    const overlay = document.getElementById('modalOverlay'); 
    const box = document.getElementById('modalBox');
    const content = document.getElementById('modalContent');
    const btnContinuar = document.getElementById('btnContinuarAlerta');
    
    if(btnContinuar) btnContinuar.style.display = 'block';
    if(content) content.innerHTML = mensajesModal[step] || "";
    
    if(overlay && box) {
        overlay.classList.remove('hidden'); 
        setTimeout(() => { 
            overlay.classList.remove('opacity-0'); 
            box.classList.remove('scale-90'); 
            box.classList.add('scale-100'); 
        }, 10);
    }
}

function cerrarModalAlerta() {
    const overlay = document.getElementById('modalOverlay'); 
    const box = document.getElementById('modalBox');
    if(overlay && box) {
        overlay.classList.add('opacity-0'); 
        box.classList.remove('scale-100'); 
        box.classList.add('scale-90');
        setTimeout(() => { overlay.classList.add('hidden'); }, 300);
    }
}

function mostrarMensajeDinamico(htmlContent) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    const content = document.getElementById('modalContent');
    
    if(content) content.innerHTML = htmlContent;
    if(overlay && box) {
        overlay.classList.remove('hidden');
        setTimeout(() => {
            overlay.classList.remove('opacity-0');
            box.classList.remove('scale-90');
            box.classList.add('scale-100');
        }, 10);
    }
}

// --- SISTEMA DE CALENDARIO ---
function cambiarFechaSeleccionada(fechaStr) {
    fechaSeleccionada = fechaStr;
    renderizarCalendarioSemanal();
    actualizarVistaFecha();
}

function actualizarVistaFecha() {
    let hoyIso = obtenerFechaIso(new Date());
    let label = (fechaSeleccionada === hoyIso) ? 'Hoy' : new Date(fechaSeleccionada + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    document.getElementById('dashLabelHoy').innerText = label;
    let tituloFecha = document.getElementById('ui-fecha-titulo');
    if(tituloFecha) tituloFecha.innerText = (fechaSeleccionada === hoyIso) ? 'Presupuesto calórico de hoy' : `Presupuesto para el ${label}`;
    
    actualizarAguaUI();
    actualizarUIDashboard(); 
    recalcularComidasTotales();
    calcularRachaGeneral();
}

function renderizarCalendarioSemanal() {
    let contenedor = document.getElementById('semanaContainer');
    if(!contenedor) return;
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
    let metaDia = obtenerMetaDelDia(iso);
    if(!metaDia) return 'bg-slate-300 dark:bg-slate-700';
    let meta = metaDia.totalKcal; 
    let pct = (sumKcal / meta) * 100;

    if(pct >= 90 && pct <= 110) return 'bg-emerald-500'; 
    if(pct < 90) return 'bg-amber-400'; 
    if(pct > 110 && pct <= 130) return 'bg-rose-500'; 
    return 'bg-slate-900 dark:bg-black'; 
}

function obtenerMetaDelDia(fechaIso) {
    if(!userData.calculos) return { totalKcal: 2000, extraKcal: 0, baseKcal: 2000 };
    let base = userData.calculos.metaBase || 2000;
    let extra = 0;
    let actividades = userData.actividadExtra[fechaIso] || [];
    
    actividades.forEach(act => {
        extra += (Math.max(0, act.met - 1) * userData.pesoKg * (act.min / 60));
    });
    
    return { totalKcal: base + extra, extraKcal: extra, baseKcal: base };
}

// --- CALCULO METABOLICO ---
function calcularMetabolismo() {
    let bmr = (10 * userData.pesoKg) + (6.25 * userData.alturaCm) - (5 * userData.edad);
    bmr = userData.genero === 'm' ? bmr + 5 : bmr - 161;
    
    let neatKcal = 0;
    if(userData.movimiento && userData.movimiento.cant > 0) {
        if(userData.movimiento.unidad === 'pasos') neatKcal = (userData.movimiento.cant / 1000) * 0.04 * userData.pesoKg * 10; 
        else if(userData.movimiento.unidad === 'km') neatKcal = userData.movimiento.cant * userData.pesoKg * 0.75;
        else if(userData.movimiento.unidad === 'mi') neatKcal = (userData.movimiento.cant * 1.609) * userData.pesoKg * 0.75;
    }
    
    let teaKcal = 0;
    if(userData.rutinaDeportes) {
        userData.rutinaDeportes.forEach(dep => { 
            teaKcal += (Math.max(0, dep.met - 1) * userData.pesoKg * ((dep.dias * dep.min) / 60 / 7)); 
        });
    }
    
    let mantenimiento = bmr + neatKcal + teaKcal + (bmr * 0.1); 
    let objetivoKcal = mantenimiento;
    if(userData.objetivo === 'deficit') objetivoKcal -= 500;
    if(userData.objetivo === 'volumen') objetivoKcal += 300;
    if(userData.objetivo === 'recomposicion') objetivoKcal -= 200;

    let proT = userData.pesoKg * (userData.objetivo === 'volumen' ? 2.0 : 2.2); 
    let fatT = userData.pesoKg * 0.9;
    let carbT = (objetivoKcal - (proT*4) - (fatT*9)) / 4;
    if(carbT < 0) carbT = 0;

    let aguaMeta = Math.round(userData.pesoKg * 35);
    if(userData.rutinaDeportes && userData.rutinaDeportes.length > 0) aguaMeta += 500;

    userData.calculos = { 
        bmr, neatKcal, teaKcal, metaBase: objetivoKcal, aguaMeta, 
        macrosBase: { p: Math.round(proT), c: Math.round(carbT), f: Math.round(fatT) } 
    };
    
    actualizarUIDashboard(); 
    actualizarAguaUI();
    guardarDatosLocales();
}

function actualizarUIDashboard() {
    let c = userData.calculos;
    if(!c) return;
    let metaDia = obtenerMetaDelDia(fechaSeleccionada);
    
    let tdeeHTML = document.getElementById('tdeeBreakdown');
    if(tdeeHTML) {
        let extraHTML = metaDia.extraKcal > 0 ? `<div class="flex justify-between text-orange-500 font-bold"><span>Extra de este día:</span> <span>+${Math.round(metaDia.extraKcal)} kcal</span></div>` : '';
        tdeeHTML.innerHTML = `<div class="flex justify-between"><span>Tasa Basal:</span> <span>${Math.round(c.bmr)} kcal</span></div><div class="flex justify-between"><span>Pasos/Distancia:</span> <span>+${Math.round(c.neatKcal)} kcal</span></div><div class="flex justify-between"><span>Deporte Regular:</span> <span>+${Math.round(c.teaKcal)} kcal/día</span></div>${extraHTML}`;
    }
    
    let dashTDEE = document.getElementById('dashTDEE');
    if(dashTDEE) dashTDEE.innerText = `${Math.round(metaDia.totalKcal)} kcal`; 
    
    let caloriasExtraHoyEl = document.getElementById('caloriasExtraHoy');
    if(caloriasExtraHoyEl) caloriasExtraHoyEl.innerText = `+${Math.round(metaDia.extraKcal)} kcal extra ganadas hoy`;
}

// --- RENDERIZADO Y CALCULOS DE COMIDA ---
function renderizarSeccionesComidas() {
    let container = document.getElementById('seccionesComidasContainer');
    if(!container) return;
    container.innerHTML = '';
    
    const cats = [
        { id: 'desayuno', nombre: 'Desayuno', icono: 'fa-mug-hot' },
        { id: 'almuerzo', nombre: 'Almuerzo', icono: 'fa-utensils' },
        { id: 'merienda', nombre: 'Merienda', icono: 'fa-cookie-bite' },
        { id: 'cena', nombre: 'Cena', icono: 'fa-moon' },
        { id: 'snacks', nombre: 'Snacks', icono: 'fa-apple-whole' }
    ];
    
    cats.forEach(cat => {
        container.innerHTML += `
        <div class="bg-white dark:bg-slate-900 rounded-[1.5rem] p-4 shadow-sm border border-slate-100 dark:border-slate-800">
            <div class="flex justify-between items-center mb-3">
                <div>
                    <h3 class="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                        <i class="fa-solid ${cat.icono} text-slate-400"></i> ${cat.nombre}
                    </h3>
                    <span id="kcal-${cat.id}" class="text-[11px] font-semibold text-slate-400">🔥 0 kcal • 0 P | 0 C | 0 G</span>
                </div>
                <button onclick="abrirPanelRegistro('${cat.id}', '${cat.nombre}')" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center font-bold">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            <div id="lista-${cat.id}" class="space-y-2"></div>
        </div>`;
    });
    
    recalcularComidasTotales();
}

function recalcularComidasTotales() {
    let sumKcal = 0, sumP = 0, sumC = 0, sumF = 0;
    let sumMicro = { fibra:0, azucar:0, sodio:0, potasio:0, calcio:0, hierro:0, magnesio:0, zinc:0, vita:0, vitc:0, vitd:0, vitb12:0, folato:0 };
    
    let comidasDelDia = userData.comidas[fechaSeleccionada] || [];

    let macrosPorCategoria = {
        desayuno: { k: 0, p: 0, c: 0, f: 0 }, almuerzo: { k: 0, p: 0, c: 0, f: 0 },
        merienda: { k: 0, p: 0, c: 0, f: 0 }, cena: { k: 0, p: 0, c: 0, f: 0 }, snacks: { k: 0, p: 0, c: 0, f: 0 }
    };
    
    let htmlListas = { desayuno: '', almuerzo: '', merienda: '', cena: '', snacks: '' };

    comidasDelDia.forEach(c => {
        sumKcal += c.kcal;
        sumP += c.macros.p; sumC += c.macros.c; sumF += c.macros.f;
        
        if (c.micros) {
            Object.keys(sumMicro).forEach(key => { if (c.micros[key]) sumMicro[key] += c.micros[key]; });
        }
        
        if (macrosPorCategoria[c.categoria]) {
            macrosPorCategoria[c.categoria].k += c.kcal;
            macrosPorCategoria[c.categoria].p += c.macros.p;
            macrosPorCategoria[c.categoria].c += c.macros.c;
            macrosPorCategoria[c.categoria].f += c.macros.f;
            
            htmlListas[c.categoria] += `
            <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <div class="pr-2">
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-200">${c.nombre}</p>
                    <p class="text-[11px] font-semibold text-slate-400">${Math.round(c.kcal)} kcal • ${Math.round(c.macros.p)}P | ${Math.round(c.macros.c)}C | ${Math.round(c.macros.f)}G</p>
                </div>
                <button onclick="borrarComida(${c.id})" class="text-rose-400 hover:text-rose-600 px-2 active:scale-90 transition-transform"><i class="fa-solid fa-trash-can text-sm"></i></button>
            </div>`;
        }
    });

    ['desayuno', 'almuerzo', 'merienda', 'cena', 'snacks'].forEach(cat => {
        let elKcal = document.getElementById(`kcal-${cat}`);
        if (elKcal) {
            let m = macrosPorCategoria[cat];
            elKcal.innerText = `🔥 ${Math.round(m.k)} kcal • ${Math.round(m.p)} P | ${Math.round(m.c)} C | ${Math.round(m.f)} G`;
        }
        
        let elem = document.getElementById(`lista-${cat}`);
        if(elem) {
            elem.innerHTML = htmlListas[cat] || `<p class="text-gray-400 dark:text-slate-500 text-xs italic">Sin alimentos registrados.</p>`;
        }
    });

    let metaDia = obtenerMetaDelDia(fechaSeleccionada);
    let metaKcal = metaDia.totalKcal; 
    let metaP = userData.calculos?.macrosBase?.p || 1;
    let metaC = (userData.calculos?.macrosBase?.c || 1) + Math.round(metaDia.extraKcal / 4);
    let metaF = userData.calculos?.macrosBase?.f || 1;

    let pctKcal = (sumKcal / metaKcal) * 100;
    
    // UI del Dashboard Principal
    let barra = document.getElementById('barraProgresoKcal');
    if(barra) barra.style.width = `${Math.min(pctKcal, 100)}%`;

    let tituloCabecera = document.getElementById('vistaKcalTitulo');
    let numeroCabecera = document.getElementById('vistaKcalNumero');

    if(tituloCabecera && numeroCabecera) {
        if (modoVistaDashboard === 'restantes') {
            tituloCabecera.innerHTML = 'kcal restantes <i class="fa-solid fa-chevron-right text-[10px]"></i>';
            numeroCabecera.innerText = Math.max(0, Math.round(metaKcal - sumKcal));
            if(document.getElementById('ui-prot-t')) document.getElementById('ui-prot-t').innerText = `${Math.max(0, Math.round(metaP - sumP))}g`;
            if(document.getElementById('ui-carb-t')) document.getElementById('ui-carb-t').innerText = `${Math.max(0, Math.round(metaC - sumC))}g`;
            if(document.getElementById('ui-fat-t')) document.getElementById('ui-fat-t').innerText = `${Math.max(0, Math.round(metaF - sumF))}g`;
        } else {
            tituloCabecera.innerHTML = 'kcal consumidas <i class="fa-solid fa-chevron-right text-[10px]"></i>';
            numeroCabecera.innerHTML = `<span class="text-slate-400 text-3xl">${Math.round(sumKcal)} /</span> ${Math.round(metaKcal)}`;
            if(document.getElementById('ui-prot-t')) document.getElementById('ui-prot-t').innerText = `${Math.round(sumP)} / ${metaP}g`;
            if(document.getElementById('ui-carb-t')) document.getElementById('ui-carb-t').innerText = `${Math.round(sumC)} / ${metaC}g`;
            if(document.getElementById('ui-fat-t')) document.getElementById('ui-fat-t').innerText = `${Math.round(sumF)} / ${metaF}g`;
        }
    }
}

// --- CREACIÓN DE ALIMENTOS Y RECETAS ---
function guardarAlimentoEnBD() { 
    let nombre = document.getElementById('crearName').value.trim(); 
    let unidad = document.getElementById('crearUnidad').value; 
    
    let cantidadIngresada = parseFloat(document.getElementById('crearCantidadBase').value) || (unidad === 'g' ? 100 : 1);
    let pesoPorUnidad = parseFloat(document.getElementById('crearPesoPorUnidad').value) || null;
    let kcalIngresadas = parseFloat(document.getElementById('crearKcal').value) || 0; 
    
    if(!nombre || kcalIngresadas <= 0) { alert("Por favor completa el nombre y las calorías."); return; } 

    let factor = (unidad === 'g' ? 100 : 1) / cantidadIngresada;

    let alimentoNormalizado = { 
        id: 'creado_' + Date.now(), nombre: nombre, unidadMedida: unidad, 
        cantidadBase: (unidad === 'g' ? 100 : 1), cantidadPreferida: (unidad === 'g') ? cantidadIngresada : 1, 
        pesoPorUnidad: (unidad !== 'g' && pesoPorUnidad) ? pesoPorUnidad : null,
        kcal: kcalIngresadas * factor, 
        p: (parseFloat(document.getElementById('crearProt').value) || 0) * factor, 
        c: (parseFloat(document.getElementById('crearCarb').value) || 0) * factor, 
        f: (parseFloat(document.getElementById('crearFat').value) || 0) * factor,
        micros: {}, esReceta: false
    }; 

    alimentosPersonalizados.push(alimentoNormalizado); 
    localStorage.setItem('nutrifit_alimentos', JSON.stringify(alimentosPersonalizados)); 
    mostrarExitoCreacion(alimentoNormalizado);
}

function registrarComidaSeleccionada() { 
    if(!alimentoSeleccionadoBase) return; 
    let cantidad = parseFloat(document.getElementById('regCantidad').value); 
    let base = alimentoSeleccionadoBase.cantidadBase || (alimentoSeleccionadoBase.unidadMedida === 'g' ? 100 : 1);
    let factor = cantidad / base; 
    
    let strMedida = alimentoSeleccionadoBase.unidadMedida || 'g';
    if (alimentoSeleccionadoBase.pesoPorUnidad && strMedida !== 'g') strMedida = `${strMedida}s de ${alimentoSeleccionadoBase.pesoPorUnidad}g`;

    let nuevaComida = { 
        categoria: categoriaSeleccionadaActual,
        nombre: `${alimentoSeleccionadoBase.nombre} (${cantidad} ${strMedida})`, 
        kcal: alimentoSeleccionadoBase.kcal * factor, 
        macros: { p: (alimentoSeleccionadoBase.p || 0) * factor, c: (alimentoSeleccionadoBase.c || 0) * factor, f: (alimentoSeleccionadoBase.f || 0) * factor }, 
        micros: {}, id: Date.now() 
    }; 

    if(!userData.comidas[fechaSeleccionada]) userData.comidas[fechaSeleccionada] = [];
    userData.comidas[fechaSeleccionada].push(nuevaComida); 
    
    registrarEnRecientes({ ...alimentoSeleccionadoBase, cantidadPreferida: cantidad });
    alimentoSeleccionadoBase = null; 
    document.getElementById('panelRegistro').classList.add('hidden');
    recalcularComidasTotales(); renderizarCalendarioSemanal(); guardarDatosLocales(); 
}

function registrarEnRecientes(alimentoObj) {
    let recientes = userData.biblioteca.recientes || [];
    recientes = recientes.filter(item => item.nombre !== alimentoObj.nombre);
    recientes.unshift(alimentoObj); 
    if (recientes.length > 30) recientes.pop(); 
    userData.biblioteca.recientes = recientes;
    guardarDatosLocales();
}

function cambiarModoCreacion(modo) {
    let btnAlimento = document.getElementById('btnModoAlimento');
    let btnReceta = document.getElementById('btnModoReceta');
    let formAlimento = document.getElementById('formAlimentoSimple');
    let formReceta = document.getElementById('formRecetaCompuesta');

    if (modo === 'alimento') {
        btnAlimento.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white dark:bg-emerald-500 transition-all shadow-md";
        btnReceta.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 transition-all hover:bg-slate-200 dark:hover:bg-slate-700";
        if(formAlimento) formAlimento.classList.remove('hidden');
        if(formReceta) formReceta.classList.add('hidden');
    } else {
        btnReceta.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white dark:bg-emerald-500 transition-all shadow-md";
        btnAlimento.className = "flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 transition-all hover:bg-slate-200 dark:hover:bg-slate-700";
        if(formReceta) formReceta.classList.remove('hidden');
        if(formAlimento) formAlimento.classList.add('hidden');
    }
}

