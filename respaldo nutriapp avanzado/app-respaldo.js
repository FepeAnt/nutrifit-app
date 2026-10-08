let userData = { 
    rutinaDeportes: [], actividadExtraHoy: [], comidas: {}, aguaMl: {}, progreso: [], recordatorioDias: 7,
    biblioteca: { favoritos: [], creaciones: [], recetas: [], recientes: [] }
};

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
        
        // MIGRACIÓN: Actividad extra ahora se guarda por fecha
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
        
        document.getElementById('dashName').innerText = `Hola, ${userData.nombre} — ${userData.edad} años | ${userData.pesoKg.toFixed(1)}kg | Obj: ${userData.objetivo.toUpperCase()}`;
        
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

// --- SISTEMA DE CALENDARIO Y FECHAS ---
function cambiarFechaSeleccionada(fechaStr) {
    fechaSeleccionada = fechaStr;
    renderizarCalendarioSemanal();
    actualizarVistaFecha();
}

function actualizarVistaFecha() {
    let hoyIso = obtenerFechaIso(new Date());
    let label = (fechaSeleccionada === hoyIso) ? 'Hoy' : new Date(fechaSeleccionada + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    document.getElementById('dashLabelHoy').innerText = label;
    document.getElementById('ui-fecha-titulo').innerText = (fechaSeleccionada === hoyIso) ? 'Presupuesto calórico de hoy' : `Presupuesto para el ${label}`;
    
    actualizarAguaUI();
    actualizarUIDashboard(); // Esto actualiza el Desglose y los Macros de esa fecha
    recalcularComidasTotales();
    calcularRachaGeneral();
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
    let html = '';
    categoriasComida.forEach(cat => {
        html += `
        <div class="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-bold text-lg text-slate-800"><i class="fa-solid ${cat.icono} text-blue-600 mr-2"></i>${cat.nombre}</h3>
                <button onclick="abrirPanelRegistro('${cat.id}', '${cat.nombre}')" class="bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">+ Añadir alimento</button>
            </div>
            <div id="lista-${cat.id}" class="space-y-2">
                <p class="text-gray-400 text-xs italic">Sin alimentos registrados.</p>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function abrirPanelRegistro(catId, catNombre) {
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
function calcularEdadEnVivo() {
    const fecha = new Date(document.getElementById('fechaNac').value); if(isNaN(fecha)) return;
    const hoy = new Date(); let anos = hoy.getFullYear() - fecha.getFullYear();
    if (hoy.getMonth() < fecha.getMonth() || (hoy.getMonth() === fecha.getMonth() && hoy.getDate() < fecha.getDate())) { anos--; }
    userData.edad = anos; document.getElementById('edadMostrada').innerText = `Edad exacta: ${anos} años`;
}

function toggleCrearBaseInput() {
    let u = document.getElementById('crearUnidad').value;
    let lbl = document.getElementById('lblCantidadBase');
    let txt = document.getElementById('lblUnidadBaseTxt');
    let inputBase = document.getElementById('crearCantidadBase');
    let contPeso = document.getElementById('containerPesoUnidad');
    let txtNombre = document.getElementById('txtNombreUnidad');

    if (u === 'g') {
        lbl.innerText = "Macros para (g)";
        txt.innerText = 'g';
        inputBase.value = 100;
        contPeso.classList.add('hidden');
    } else {
        lbl.innerText = "Macros para";
        txt.innerText = u; 
        inputBase.value = 1;
        contPeso.classList.remove('hidden');
        txtNombre.innerText = u;
    }
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

// NUEVA FUNCIÓN: Calcula la meta para un día específico
function obtenerMetaDelDia(fechaIso) {
    let base = userData.calculos?.metaBase || 2000;
    let extra = 0;
    let actividades = userData.actividadExtra[fechaIso] || [];
    
    actividades.forEach(act => {
        // Corrección clínica: Usamos METs netos (met - 1) para no sumar el metabolismo basal dos veces
        extra += (Math.max(0, act.met - 1) * userData.pesoKg * (act.min / 60));
    });
    
    return { totalKcal: base + extra, extraKcal: extra, baseKcal: base };
}

function calcularMetabolismo() {
    let bmr = (10 * userData.pesoKg) + (6.25 * userData.alturaCm) - (5 * userData.edad);
    bmr = userData.genero === 'm' ? bmr + 5 : bmr - 161;
    
    let neatKcal = 0;
    if(userData.movimiento.cant > 0) {
        if(userData.movimiento.unidad === 'pasos') neatKcal = (userData.movimiento.cant / 1000) * 0.04 * userData.pesoKg * 10; 
        else if(userData.movimiento.unidad === 'km') neatKcal = userData.movimiento.cant * userData.pesoKg * 0.75;
        else if(userData.movimiento.unidad === 'mi') neatKcal = (userData.movimiento.cant * 1.609) * userData.pesoKg * 0.75;
    }
    
    let teaKcal = 0;
    userData.rutinaDeportes.forEach(dep => { 
        // MET neto para deportes fijos
        teaKcal += (Math.max(0, dep.met - 1) * userData.pesoKg * ((dep.dias * dep.min) / 60 / 7)); 
    });
    
    let mantenimiento = bmr + neatKcal + teaKcal + (bmr * 0.1); // +10% TEF
    let objetivoKcal = mantenimiento;
    if(userData.objetivo === 'deficit') objetivoKcal -= 500;
    if(userData.objetivo === 'volumen') objetivoKcal += 300;
    if(userData.objetivo === 'recomposicion') objetivoKcal -= 200;

    let proT = userData.pesoKg * (userData.objetivo === 'volumen' ? 2.0 : 2.2); 
    let fatT = userData.pesoKg * 0.9;
    let carbT = (objetivoKcal - (proT*4) - (fatT*9)) / 4;
    if(carbT < 0) carbT = 0;

    let aguaMeta = Math.round(userData.pesoKg * 35);
    if(userData.rutinaDeportes.length > 0) aguaMeta += 500;

    // Guardamos las bases fijas
    userData.calculos = { 
        bmr, neatKcal, teaKcal, metaBase: objetivoKcal, aguaMeta, 
        macrosBase: { p: Math.round(proT), c: Math.round(carbT), f: Math.round(fatT) } 
    };
    
    actualizarUIDashboard(); 
    actualizarAguaUI();
    guardarDatosLocales();
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
    actualizarUIDashboard(); 
    guardarDatosLocales();
}

function actualizarUIDashboard() {
    let c = userData.calculos;
    let metaDia = obtenerMetaDelDia(fechaSeleccionada);
    let extraHTML = metaDia.extraKcal > 0 ? `<div class="flex justify-between text-orange-500 font-bold"><span>Extra de este día:</span> <span>+${Math.round(metaDia.extraKcal)} kcal</span></div>` : '';
    
    document.getElementById('tdeeBreakdown').innerHTML = `<div class="flex justify-between"><span>Tasa Basal:</span> <span>${Math.round(c.bmr)} kcal</span></div><div class="flex justify-between"><span>Pasos/Distancia:</span> <span>+${Math.round(c.neatKcal)} kcal</span></div><div class="flex justify-between"><span>Deporte Regular:</span> <span>+${Math.round(c.teaKcal)} kcal/día</span></div>${extraHTML}`;
    
    document.getElementById('dashTDEE').innerText = `${Math.round(metaDia.totalKcal)} kcal`; 
    document.getElementById('ui-goal').innerText = `Objetivo: ${Math.round(metaDia.totalKcal)} kcal`;
    
    // Sumamos la actividad extra a los hidratos (fuente de energía prioritaria del músculo)
    let extraCarbs = Math.round(metaDia.extraKcal / 4);
    
    document.getElementById('ui-prot-t').innerText = c.macrosBase.p + 'g'; 
    document.getElementById('ui-carb-t').innerText = (c.macrosBase.c + extraCarbs) + 'g'; 
    document.getElementById('ui-fat-t').innerText = c.macrosBase.f + 'g';
    
    let caloriasExtraHoyEl = document.getElementById('caloriasExtraHoy');
    if(caloriasExtraHoyEl) caloriasExtraHoyEl.innerText = `+${Math.round(metaDia.extraKcal)} kcal extra ganadas hoy`;
}

function toggleCrearBaseInput() {
    let unidad = document.getElementById('crearUnidad').value;
    document.getElementById('containerCantidadBase').style.display = (unidad === 'g') ? 'block' : 'none';
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
        alimentosPersonalizados.filter(a => a.nombre.toLowerCase().includes(termino.toLowerCase())).forEach(item => { 
            let etiquetaMedida = (item.unidadMedida === 'g') ? `por ${item.cantidadBase}g` : `por 1 ${item.unidadMedida}`;
            htmlResultados += `<div onclick='prepararRegistro(${JSON.stringify(item)})' class="p-2 hover:bg-gray-100 cursor-pointer text-sm border-b bg-indigo-50">⭐ <b>${item.nombre}</b> <span class="text-xs text-gray-500">(${item.kcal} kcal ${etiquetaMedida})</span></div>`; 
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
    // 1. INTERCEPCIÓN BLINDADA PARA RECETAS
    if (modoAgregandoReceta) {
        let defaultCant = item.cantidadPreferida || item.cantidadBase || 100;
        let cant = prompt(`¿Qué cantidad de ${item.nombre} (${item.unidadMedida || 'g'}) vas a usar?`, defaultCant);
        
        if (cant !== null && !isNaN(cant) && parseFloat(cant) > 0) {
            let cantidadUsada = parseFloat(cant);
            let base = item.cantidadBase || (item.unidadMedida === 'g' ? 100 : 1);
            let factor = cantidadUsada / base; // Matemáticamente perfecto para todo (0.5 tazas, 200g, etc.)
            
            let ing = {
                nombre: item.nombre,
                cantidad: cantidadUsada,
                unidadMedida: item.unidadMedida || 'g',
                pesoPorUnidad: item.pesoPorUnidad || null,
                kcal: item.kcal * factor,
                p: (item.p || 0) * factor,
                c: (item.c || 0) * factor,
                f: (item.f || 0) * factor
            };
            ingredientesRecetaTemp.push(ing);
        }
        
        modoAgregandoReceta = false;
        document.getElementById('regTituloSeccion').innerText = tituloOriginalPanel;
        document.getElementById('tab-creaciones').classList.remove('hidden');
        document.getElementById('tab-crear').classList.remove('hidden');
        document.getElementById('buscadorAlimento').placeholder = "🔍 Buscar alimento o código de barras...";
        
        cambiarTabRegistro('crear');
        cambiarModoCreacion('receta');
        actualizarResumenReceta();
        return; // Detenemos la ejecución aquí, no se abre el panel de abajo.
    }

    // 2. FLUJO NORMAL DE REGISTRO
    alimentoSeleccionadoBase = item; 
    document.getElementById('resultadosBusqueda').classList.add('hidden'); 
    
    let divTabs = document.getElementById('contenidoTabsDinamico');
    if(divTabs) divTabs.classList.add('hidden');

    document.getElementById('detalleAlimentoElegido').classList.remove('hidden'); 
    document.getElementById('regNombre').innerText = item.nombre; 
    
    let strUnidad = item.unidadMedida || 'g';
    if (item.pesoPorUnidad && strUnidad !== 'g') strUnidad += ` (${item.pesoPorUnidad}g)`;
    document.getElementById('regUnidad').innerText = strUnidad; 
    
    let cantidadDefault = item.cantidadPreferida ? item.cantidadPreferida : (item.cantidadBase ? item.cantidadBase : (item.unidadMedida === 'g' ? 100 : 1));
    document.getElementById('regCantidad').value = cantidadDefault; 
    
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
    let base = alimentoSeleccionadoBase.cantidadBase || (alimentoSeleccionadoBase.unidadMedida === 'g' ? 100 : 1);
    let factor = cantidad / base; // Soporte perfecto para decimales y fracciones
    
    document.getElementById('prevKcal').innerText = Math.round(alimentoSeleccionadoBase.kcal * factor); 
    document.getElementById('prevP').innerText = Number(((alimentoSeleccionadoBase.p || 0) * factor).toFixed(1)); 
    document.getElementById('prevC').innerText = Number(((alimentoSeleccionadoBase.c || 0) * factor).toFixed(1)); 
    document.getElementById('prevF').innerText = Number(((alimentoSeleccionadoBase.f || 0) * factor).toFixed(1)); 
}

function registrarComidaSeleccionada() { 
    if(!alimentoSeleccionadoBase) return; 
    if (window.lockRegistro) return;
    window.lockRegistro = true; setTimeout(() => { window.lockRegistro = false; }, 400);

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
        micros: alimentoSeleccionadoBase.micros ? {
            fibra: (alimentoSeleccionadoBase.micros.fibra || 0) * factor, azucar: (alimentoSeleccionadoBase.micros.azucar || 0) * factor,
            sodio: (alimentoSeleccionadoBase.micros.sodio || 0) * factor, potasio: (alimentoSeleccionadoBase.micros.potasio || 0) * factor,
            calcio: (alimentoSeleccionadoBase.micros.calcio || 0) * factor, hierro: (alimentoSeleccionadoBase.micros.hierro || 0) * factor,
            magnesio: (alimentoSeleccionadoBase.micros.magnesio || 0) * factor, zinc: (alimentoSeleccionadoBase.micros.zinc || 0) * factor,
            vita: (alimentoSeleccionadoBase.micros.vita || 0) * factor, vitc: (alimentoSeleccionadoBase.micros.vitc || 0) * factor,
            vitd: (alimentoSeleccionadoBase.micros.vitd || 0) * factor, vitb12: (alimentoSeleccionadoBase.micros.vitb12 || 0) * factor,
            folato: (alimentoSeleccionadoBase.micros.folato || 0) * factor
        } : {},
        id: Date.now() 
    }; 

    if(!userData.comidas[fechaSeleccionada]) userData.comidas[fechaSeleccionada] = [];
    userData.comidas[fechaSeleccionada].push(nuevaComida); 
    
    let itemParaBiblioteca = { ...alimentoSeleccionadoBase, cantidadPreferida: cantidad }; 
    registrarEnRecientes(itemParaBiblioteca);
    
    alimentoSeleccionadoBase = null; cerrarPanelRegistro();
    recalcularComidasTotales(); renderizarCalendarioSemanal(); guardarDatosLocales(); 
}

function guardarAlimentoEnBD() { 
    let nombre = document.getElementById('crearName').value.trim(); 
    let unidad = document.getElementById('crearUnidad').value; 
    
    let cantidadIngresada = parseFloat(document.getElementById('crearCantidadBase').value) || (unidad === 'g' ? 100 : 1);
    let pesoPorUnidad = parseFloat(document.getElementById('crearPesoPorUnidad').value) || null;
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

    alimentosPersonalizados.push(alimentoNormalizado); 
    localStorage.setItem('nutrifit_alimentos', JSON.stringify(alimentosPersonalizados)); 
    
    ['crearName','crearKcal','crearProt','crearCarb','crearFat','crearPesoPorUnidad'].forEach(id=>{ let el = document.getElementById(id); if(el) el.value=''; }); 
    document.getElementById('crearCantidadBase').value = '100';
    
    mostrarExitoCreacion(alimentoNormalizado);
}

function borrarComida(id) { 
    if(userData.comidas[fechaSeleccionada]) {
        userData.comidas[fechaSeleccionada] = userData.comidas[fechaSeleccionada].filter(c => c.id !== id);
    }
    recalcularComidasTotales(); 
    renderizarCalendarioSemanal();
    guardarDatosLocales(); 
}

function recalcularComidasTotales() {
    let sumKcal = 0, sumM = { p: 0, c: 0, f: 0 }; 
    let sumMicro = { fibra: 0, azucar: 0, sodio: 0, potasio: 0, calcio: 0, hierro: 0, magnesio: 0, zinc: 0, vita: 0, vitc: 0, vitd: 0, vitb12: 0, folato: 0 };
    
    let htmlListas = { desayuno: '', almuerzo: '', merienda: '', cena: '', snacks: '' };
    let comidasDia = userData.comidas[fechaSeleccionada] || [];

    comidasDia.forEach(c => { 
        sumKcal += c.kcal; 
        sumM.p += c.macros.p; sumM.c += c.macros.c; sumM.f += c.macros.f; 
        let cat = c.categoria || 'snacks'; 

        if(c.micros) {
            Object.keys(sumMicro).forEach(k => { sumMicro[k] += c.micros[k] || 0; });
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

    categoriasComida.forEach(cat => {
        let elem = document.getElementById(`lista-${cat.id}`);
        if(elem) {
            elem.innerHTML = htmlListas[cat.id] || `<p class="text-gray-400 dark:text-slate-500 text-xs italic">Sin alimentos registrados.</p>`;
        }
    });
    
    let metaDia = obtenerMetaDelDia(fechaSeleccionada);
    let metaKcal = metaDia.totalKcal; 
    let pctKcal = (sumKcal / metaKcal) * 100;
    document.getElementById('ui-consumed').innerText = Math.round(sumKcal); 
    document.getElementById('ui-remaining').innerText = Math.round(metaKcal - sumKcal); 
    
    let calBar = document.getElementById('ui-progress');
    calBar.style.width = Math.min(pctKcal, 100) + '%';
    calBar.className = 'h-4 rounded-full transition-all duration-500 ' + obtenerClaseSemaforo(pctKcal);
    
    let metaP = userData.calculos.macrosBase.p;
    let metaC = userData.calculos.macrosBase.c + Math.round(metaDia.extraKcal / 4);
    let metaF = userData.calculos.macrosBase.f;

    document.getElementById('ui-prot-c').innerText = Number(sumM.p.toFixed(1)); 
    let protBar = document.getElementById('ui-prot-bar');
    protBar.style.width = Math.min((sumM.p / metaP) * 100, 100) + '%';
    protBar.className = 'h-1.5 rounded-full transition-all duration-500 ' + obtenerClaseSemaforo((sumM.p / metaP) * 100);

    document.getElementById('ui-carb-c').innerText = Number(sumM.c.toFixed(1)); 
    let carbBar = document.getElementById('ui-carb-bar');
    carbBar.style.width = Math.min((sumM.c / metaC) * 100, 100) + '%';
    carbBar.className = 'h-1.5 rounded-full transition-all duration-500 ' + obtenerClaseSemaforo((sumM.c / metaC) * 100);

    document.getElementById('ui-fat-c').innerText = Number(sumM.f.toFixed(1));
    let fatBar = document.getElementById('ui-fat-bar');
    fatBar.style.width = Math.min((sumM.f / metaF) * 100, 100) + '%';
    fatBar.className = 'h-1.5 rounded-full transition-all duration-500 ' + obtenerClaseSemaforo((sumM.f / metaF) * 100);

    document.getElementById('ui-micro-fibra').innerText = Number(sumMicro.fibra.toFixed(1)) + ' g';
    document.getElementById('ui-micro-azucar').innerText = Number(sumMicro.azucar.toFixed(1)) + ' g';
    document.getElementById('ui-micro-sodio').innerText = Math.round(sumMicro.sodio) + ' mg';
    document.getElementById('ui-micro-potasio').innerText = Math.round(sumMicro.potasio) + ' mg';
    document.getElementById('ui-micro-calcio').innerText = Math.round(sumMicro.calcio) + ' mg';
    document.getElementById('ui-micro-hierro').innerText = Number(sumMicro.hierro.toFixed(1)) + ' mg';
    document.getElementById('ui-micro-magnesio').innerText = Math.round(sumMicro.magnesio) + ' mg';
    document.getElementById('ui-micro-zinc').innerText = Number(sumMicro.zinc.toFixed(1)) + ' mg';
    document.getElementById('ui-micro-vita').innerText = Math.round(sumMicro.vita) + ' mcg';
    document.getElementById('ui-micro-vitc').innerText = Math.round(sumMicro.vitc) + ' mg';
    document.getElementById('ui-micro-vitd').innerText = Math.round(sumMicro.vitd) + ' IU';
    document.getElementById('ui-micro-vitb12').innerText = Number(sumMicro.vitb12.toFixed(2)) + ' mcg';
    document.getElementById('ui-micro-folato').innerText = Math.round(sumMicro.folato) + ' mcg';

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
    userData.pesoKg = parseFloat(document.getElementById('editPeso').value);
    userData.alturaCm = parseFloat(document.getElementById('editAltura').value);
    userData.objetivo = document.getElementById('editObjetivo').value;
    userData.movimiento.cant = parseFloat(document.getElementById('editMovCantidad').value || 0);
    userData.movimiento.unidad = document.getElementById('editMovUnidad').value;
    calcularMetabolismo(); cerrarModalPerfil();
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
    if(!peso) { alert("Ingresa al menos tu peso."); return; }

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

function crearRecetaCompuesta(nombreReceta, listaIngredientes) {
    if (!listaIngredientes || listaIngredientes.length === 0) return;

    let nuevaReceta = {
        id: 'rec_' + Date.now(),
        nombre: nombreReceta,
        tipo: 'compuesta',
        ingredientes: listaIngredientes, // Array de punteros: [{id: "bs_001", cantidad: 200}]
        macrosResumen: calcularTotalesDeReceta(listaIngredientes)
    };

    if(!userData.biblioteca.recetas) userData.biblioteca.recetas = [];
    userData.biblioteca.recetas.push(nuevaReceta);
    guardarDatosLocales();
}

function calcularTotalesDeReceta(ingredientes) {
    let totales = { kcal: 0, p: 0, c: 0, f: 0 };
    
    ingredientes.forEach(ing => {
        let alimentoBase = buscarAlimentoPorId(ing.id); 
        if(alimentoBase) {
            let factor = ing.cantidad / alimentoBase.baseGramos;
            totales.kcal += alimentoBase.kcal * factor;
            totales.p += alimentoBase.p * factor;
            totales.c += alimentoBase.c * factor;
            totales.f += alimentoBase.f * factor;
        }
    });
    return totales;
}

function buscarAlimentoPorId(idStr) {
    // 1. Busca en la Base Semilla (Hardcoded)
    let encontrado = baseSemilla.find(a => a.id === idStr);
    if(encontrado) return encontrado;
    
    // 2. Busca en Creaciones Propias
    if(userData.biblioteca.creaciones) {
        encontrado = userData.biblioteca.creaciones.find(a => a.id === idStr);
        if(encontrado) return encontrado;
    }
    
    // 3. Busca en Recetas Compuestas
    if(userData.biblioteca.recetas) {
        encontrado = userData.biblioteca.recetas.find(a => a.id === idStr);
        if(encontrado) {
            // Adaptamos el formato de retorno para que coincida con los alimentos simples
            return {
                id: encontrado.id,
                nombre: encontrado.nombre,
                kcal: encontrado.macrosResumen.kcal,
                p: encontrado.macrosResumen.p,
                c: encontrado.macrosResumen.c,
                f: encontrado.macrosResumen.f,
                baseGramos: 1 // Para las recetas, el factor se calcula por unidad/porción
            };
        }
    }
    
    return null;
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
        tempListaTab = alimentosPersonalizados || [];
        if(tempListaTab.length === 0) html = `<p class="text-xs text-center text-slate-400 mt-6 font-medium">No has creado alimentos propios aún.</p>`;
    }

    tempListaTab.forEach((item, index) => {
        let baseNormalizada = item.cantidadBase || item.baseGramos || 100;
        let unidadMedida = item.unidadMedida || 'g';

        // Lógica Smart Preset: Leer la cantidad preferida si existe
        let cantidadAMostrar = item.cantidadPreferida ? item.cantidadPreferida : baseNormalizada;
        
        // Recalcular kcal visuales según la porción que se va a mostrar
        let factor = (unidadMedida === 'g') ? (cantidadAMostrar / baseNormalizada) : cantidadAMostrar;
        let kcalVisuales = Math.round(item.kcal * factor);

        // Cambiamos la etiqueta para dar un feedback visual de que es una porción memorizada
        let textoPorcion = item.cantidadPreferida ? `Tu porción: ${cantidadAMostrar}${unidadMedida}` : `Base: ${baseNormalizada}${unidadMedida}`;

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
    
    let objNormalizado = {
        id: item.id || null, 
        nombre: item.nombre, 
        unidadMedida: item.unidadMedida || 'g',
        cantidadBase: item.cantidadBase || 100, 
        cantidadPreferida: item.cantidadPreferida || null,
        kcal: item.kcal,
        p: item.p || 0, 
        c: item.c || 0, 
        f: item.f || 0,
        micros: item.micros || { fibra: 0, azucar: 0, sodio: 0, potasio: 0, calcio: 0, hierro: 0, magnesio: 0, zinc: 0, vita: 0, vitc: 0, vitd: 0, vitb12: 0, folato: 0 }
    };

    // Si estamos armando una receta, lo desviamos limpiamente aquí:
    if (manejarSeleccionParaReceta(objNormalizado)) return;

    prepararRegistro(objNormalizado);
}

//=================================
// EVALUACION Y MOTIVACION DIARIA
//================================

function evaluarDia() {
    let metaKal = userData.calculos.metaDiaria;
    let comidasDia = userData.comidas[fechaSeleccionada] || [];
    let sumKal = comidasDia.reduce((acc, c) => acc + c.kal, 0);

    //Si no comio nada aun
    if (sumKal === 0) {
        mostrarMensajeDinamico("<b>¡El día está en blanco!</b> <br><br>Aún no has registrado ninguna comida. Anota tus alimentos para poder prgresar, tu puedes!");
        return;
    }

    let pct = (sumKal / metaKal) * 100;
    let mensaje = "";

    //Logica de gamificacion y motivacion
    if (pct < 85) {
        mensaje = "<b>¡Aún falta un poco!</b> <br><br>Estas por debajo de tu meta diaría, todavía puedes registrar tus alimentos! Recuerda que no comer puede frenar el metabolismo y dificultar la recuperacion muscular. A progresar!";
    } else if (pct >= 85 && pct <=110) {
        mensaje = "<b>¡Día Perfecto!</b> <br><br>Has clavado tus calorías y macros en la zona óptima. Esta es la actitud para lograr nuestros objetivos! !A descansar y continuar mañana!";
    } else {
        mensaje ="<b>¡Hoy hubo energía de más! <br><br>Te pasaste un poco del presupuesto calórico hoy, pero es normal! Esta energía servira para rendir mejor el dia de mañana. ¡A compensar y seguir enfocados con todo!";
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

// NUEVA FUNCIÓN: Reemplaza al "secuestro" de prepararRegistro
function manejarSeleccionParaReceta(itemSeleccionado) {
    if (!modoAgregandoReceta) return false;

    let cant = prompt(`¿Qué cantidad de ${itemSeleccionado.nombre} (${itemSeleccionado.unidadMedida || 'g'}) vas a usar?`, "100");
    
    if (cant !== null && !isNaN(cant) && parseFloat(cant) > 0) {
        let cantidadUsada = parseFloat(cant);
        let base = itemSeleccionado.cantidadBase || 100;
        let factor = (itemSeleccionado.unidadMedida === 'g') ? (cantidadUsada / base) : cantidadUsada;
        
        let ing = {
            nombre: itemSeleccionado.nombre,
            cantidad: cantidadUsada,
            unidadMedida: itemSeleccionado.unidadMedida || 'g',
            kcal: itemSeleccionado.kcal * factor,
            p: (itemSeleccionado.p || 0) * factor,
            c: (itemSeleccionado.c || 0) * factor,
            f: (itemSeleccionado.f || 0) * factor
        };
        ingredientesRecetaTemp.push(ing);
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

    alimentosPersonalizados.push(recetaNormalizada);
    localStorage.setItem('nutrifit_alimentos', JSON.stringify(alimentosPersonalizados));

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

