// Plantillas de documentos migradas de InnovaGestión: contrato, perfil de cargo, IRL, ficha de datos, entrega de EPP,
// registros de entrega de PTS, registro de capacitación y evaluación, PTS completos (editables), matriz e instructivo
// IPER, programa preventivo, protocolo Ley Karin, procedimiento de emergencias y accidentes, matriz de EPP y
// capacitaciones. Texto y formato iguales a InnovaGestión; los datos de la empresa (razón social, RUT, dirección,
// ciudad, región, representante, prevencionista, Ley Karin, organismo administrador, logo, firmas) vienen en D
// desde la configuración del módulo (gen_config). ARCHIVO GENERADO por el script de migración: para cambiar un
// texto, editarlo aquí directamente.
// Seguridad: todo dato que viene de la base pasa por esc() o ce() (escapan HTML); el resto es texto fijo.
/* eslint-disable */
export function crearPlantillas(D) {
  var FIRMA_SIG = D.firma || '', FIRMA_TIM = D.timbre || '', FIRMA_PREV = D.firmaPrev || '';
  var PTS_EDIT = D.ptsEdit || {}, PTS_F2026 = 'oct. 2026', EMP_D = D.versiones || [];
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function enc(s){ return esc(s); }
  function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function fFaena(f){ if(!f)return'—'; var d=new Date(String(f).slice(0,10)+'T00:00:00'); return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear(); }
  function fechaCorta(f){ if(!f)return''; var d=new Date(String(f).slice(0,10)+'T00:00:00'); return d.getDate()+' '+MES[d.getMonth()]+' '+d.getFullYear(); }
  function firmaPrevHtml(){ return FIRMA_PREV?'<img class="rs-prev" src="'+esc(FIRMA_PREV)+'" alt="">':''; }
  function firmaRepHtml(){ return (FIRMA_SIG?'<img class="rs-sig" src="'+esc(FIRMA_SIG)+'" alt="">':'')+(FIRMA_TIM?'<img class="rs-tim" src="'+esc(FIRMA_TIM)+'" alt="">':''); }
  // ---- EMP_CARPETAS (ISgestión, líneas 8046–8051)
  var EMP_CARPETAS=[
    {k:'prev', n:'Reglamento y gestión preventiva', tipos:[['riohs','Reglamento Interno de Orden, Higiene y Seguridad (RIOHS)',false],['programa','Programa de trabajo preventivo (PRG-PREV-01)',false],['iper','Matriz de riesgos (IPER)',false],['proc_iper','Procedimiento IPER',false],['proc_acc','Procedimiento de emergencia y/o accidentes',false],['matriz_epp','Matriz general de elementos de protección personal (EPP)',false],['karin','Protocolo de prevención del acoso sexual, laboral y violencia en el trabajo (Ley Karin)',false]]},
    {k:'pts', n:'Procedimientos de trabajo seguro (PTS)', tipos:[['pts_quimicos','PTS uso y manejo de químicos',false],['pts_extintores','PTS uso y manejo de extintores',false],['pts_altura','PTS trabajos en altura',false],['pts_confinados','PTS espacios confinados',false],['pts_alzahombre','PTS alza hombre / grúa Genie',false],['pts_herramientas','PTS uso de herramientas · limpieza de estanques',false],['pts_frigorifico','PTS limpieza de cámaras frigoríficas',false],['pts_funciones','PTS acorde a sus funciones',false]]},
    {k:'cap', n:'Capacitaciones', tipos:[['cap_herr','Capacitación: uso seguro de herramientas manuales y equipos de apoyo',false],['cap_primeros','Capacitación: primeros auxilios',false],['cap_altura','Capacitación: trabajos en altura y plan de rescate',false],['cap_alzahombre','Capacitación: operación segura de alza hombre',false],['cap_frigorifico','Capacitación: limpieza segura de cámaras frigoríficas',false]]},
    {k:'legal', n:'Legal y previsional', tipos:[['erut','e-RUT de la empresa',false],['escritura','Escritura / estatutos',false],['vigencia','Certificado de vigencia',true],['mutual','Certificado de adhesión a la mutual',false],['tasa','Certificado de tasa de cotización',true]]}
  ];
  // ---- porPersona (ISgestión, líneas 8173–8174)
  function porPersona(PER, f){ if(!PER||!PER.length) return f({nombre:'',rut:'',cargo:''});
    return PER.map(function(t){ return '<div class="dg-una">'+f(t)+'</div>'; }).join(''); }
  // ---- registro, asistencia y PTS acorde a funciones (ISgestión, líneas 8233–8307)
  function opcionesRegistro(){
    var L=Object.keys(CAP_DOC).map(function(k){ return {v:'cap:'+k, n:'Capacitación · '+CAP_DOC[k].n}; });
    var vis={}; (EMP_D||[]).forEach(function(d){ if(d.carpeta==='cap' && !CAP_DOC[d.tipo] && !vis[d.tipo]){ vis[d.tipo]=1; L.push({v:'emp:'+d.tipo, n:'Capacitación · '+(d.nombre||d.tipo)}); } });
    Object.keys(PTS_INFO).forEach(function(s){ L.push({v:'pts:'+s, n:'Entrega de PTS · '+PTS_INFO[s].n}); });
    L.push({v:'libre', n:'Charla o tema libre'});
    return L; }
  function docAsistencia(sel, PER){ PER=PER||[];
    sel=sel||'libre'; var p=String(sel).split(':'), tipo=p[0], id=p[1], I=null, C=null, tema='', sub='Capacitación · charla · instrucción', dur='';
    if(tipo==='pts' || PTS_INFO[sel]){ I=PTS_INFO[id||sel]; tema='PTS '+I.n; sub='Procedimiento de trabajo seguro · '+I.n; }
    else if(tipo==='cap'){ C=CAP_DOC[id]; tema=C.n; sub='Capacitación · '+C.n; dur=C.dur||''; }
    else if(tipo==='emp'){ var d=(EMP_D||[]).filter(function(x){ return x.tipo===id; })[0]; tema=d?(d.nombre||''):''; sub='Capacitación · '+tema; }
    var temario=I?I.t:(C?C.t:null), rows='';
    for(var i=1;i<=Math.max(10,PER.length);i++){ var w=PER[i-1]||{}; rows+='<tr><td class="n">'+i+'</td><td>'+esc(w.nombre||'')+'</td><td>'+esc(w.rut||'')+'</td><td>'+esc(w.cargo||'')+'</td><td></td></tr>'; }
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    function rel(k,def){ return '<span contenteditable data-ls="'+k+'">'+esc(lsGet(k)||def||'')+'</span>'; }
    var relNom=lsGet('dg_rel_nom')||EMP_PREV.nombre;
    return dgHead(I?'REGISTRO DE ENTREGA E INSTRUCCIÓN':'REGISTRO DE CAPACITACIÓN','01','10-10-2026')+   // fecha de la versión del formato
      '<p style="text-align:center;margin-top:-6px;color:#667;font-weight:700">'+esc(sub)+'</p>'+
      '<table class="dg-tbl pts-ctl asis-info"><tbody>'+
        '<tr><td colspan="3"><span class="sl">Tema</span>'+(tema?'<b>'+esc(tema)+'</b>':ce(''))+'</td></tr>'+
        '<tr><td><span class="sl">Fecha</span>'+ce(fLarga(todayISO()))+'</td><td><span class="sl">Horario</span>'+ce('')+' a '+ce('')+' hrs.</td><td><span class="sl">'+(C||tipo==='emp'?'Duración':'Lugar / faena')+'</span>'+(C||tipo==='emp'?ce(dur):ce(''))+'</td></tr>'+
        '<tr><td><span class="sl">Relator</span>'+rel('dg_rel_nom',EMP_PREV.nombre)+'</td><td><span class="sl">Cargo del relator</span>'+rel('dg_rel_cargo',EMP_PREV.cargo)+'</td><td>'+(C||tipo==='emp'?'<span class="sl">Lugar / faena</span>'+ce(''):'')+'</td></tr>'+
      '</tbody></table>'+
      '<h4 class="dg-h4">Temario</h4>'+(temario?(temario.length>3?'<div class="dg-cols asis-tem">'+ulDg(temario.slice(0,Math.ceil(temario.length/2)))+ulDg(temario.slice(Math.ceil(temario.length/2)))+'</div>':'<div class="asis-tem">'+ulDg(temario)+'</div>'):'<div class="dg-box" style="min-height:70px" contenteditable></div>')+
      '<p class="asis-decl">Los trabajadores individualizados declaran haber recibido la '+(I?'instrucción y una copia del procedimiento indicado':'capacitación')+', haber comprendido su contenido y se comprometen a cumplirlo.</p>'+
      '<table class="dg-tbl asis-tb"><thead><tr><th class="n">N°</th><th style="width:34%">Nombre completo</th><th style="width:15%">RUT</th><th style="width:18%">Cargo</th><th>Firma</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="dg-firmas asis-fir"><div>'+(relNom===EMP_PREV.nombre?firmaPrevHtml():'')+'Firma del relator<br>'+esc(relNom)+'</div><div>V°B° jefatura</div></div>';
  }

  // PTS acorde a sus funciones, según el cargo (usa las funciones del contrato / perfil de cargo).
  function docPTSFunciones(v){
    v=v||'oper';
    var oper=(v==='oper'), adm=(v==='prevadm');
    var cargo=oper?'Operario de servicios':(adm?'Técnico en prevención de riesgos y asistente administrativo(a)':'Técnico en prevención de riesgos');
    var fun=oper?OPER_FUN:PREV_FUN.concat(adm?ADM_FUN:[]);
    var R=oper?[
      ['Pisos húmedos o con residuos','Caída al mismo nivel','Calzado de seguridad antideslizante; señalizar el área en limpieza; mantener orden y retirar residuos.'],
      ['Productos químicos de limpieza','Quemaduras, irritación, intoxicación','Aplicar el PTS de químicos; leer la HDS; usar guantes de nitrilo, antiparras y mascarilla; diluir solo si está autorizado.'],
      ['Agua a presión y equipos eléctricos','Contacto eléctrico','No proyectar agua sobre tableros, motores ni cableado; informar equipos en mal estado.'],
      ['Cámaras frigoríficas, hielo y nieve','Hipotermia, caídas','Ropa térmica completa; pausas de recuperación; no trabajar solo; aplicar el procedimiento de cámaras.'],
      ['Trabajo en altura (fachadas, cámaras, alza hombre)','Caída de distinto nivel','Solo con examen ocupacional vigente y capacitación; arnés con línea de vida; aplicar el PTS de altura y de alza hombre.'],
      ['Estanques, tolvas y cámaras de RIL','Atmósfera peligrosa, atrapamiento','Tratar como espacio confinado: permiso de entrada, medición de gases, vigía; aplicar el PTS de espacios confinados.'],
      ['Manejo manual de carga (cajas, cintas, estructuras)','Lesiones musculoesqueléticas','Técnica de levante; pedir ayuda o usar apoyo mecánico; respetar el peso máximo legal.'],
      ['Barcos y trabajo cerca del agua','Caída al agua, golpes','Chaleco salvavidas; no trabajar solo; seguir las instrucciones de la nave.'],
      ['Ruido de maquinaria y equipos','Pérdida auditiva','Protector auditivo en áreas señalizadas.']
    ]:[
      ['Traslados y conducción a faenas','Accidente de tránsito','Licencia vigente; respetar velocidades; cinturón de seguridad; no usar el celular al conducir.'],
      ['Visitas a plantas, frigoríficos y centros','Caídas, golpes, exposición a frío, ruido y químicos','Usar los EPP exigidos por cada faena; respetar señalización y las normas del cliente.'],
      ['Inspecciones en altura o espacios confinados','Caídas, atmósfera peligrosa','No ingresar ni subir sin los permisos y equipos; observar desde zona segura.'],
      ['Trabajo con computador','Trastornos musculoesqueléticos, fatiga visual','Puesto ajustado; pausas activas; iluminación adecuada.'],
      ['Carga de trabajo y atención de público','Riesgo psicosocial','Planificación de tareas; pausas; aplicar el protocolo de la Ley Karin ante conductas de acoso o violencia.']
    ];
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    return dgHead('PROCEDIMIENTO DE TRABAJO SEGURO')+
      '<p style="text-align:center;margin-top:-6px;color:#667;font-weight:700">Acorde a sus funciones · '+esc(cargo)+'</p>'+
      '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>PTS-FUN-'+(oper?'01':(adm?'03':'02'))+'</b></td><td><span class="sl">Versión</span><b>02</b></td><td><span class="sl">Fecha</span>'+ce(fFaena(todayISO()))+'</td><td><span class="sl">Cargo</span><b>'+esc(cargo)+'</b></td></tr></tbody></table>'+dgFirmasPTS()+
      '<h4 class="dg-h4">1. Objetivo</h4><p>Establecer la forma segura de ejecutar las funciones propias del cargo de '+esc(cargo.toLowerCase())+', identificando sus riesgos y las medidas de control, para prevenir accidentes del trabajo y enfermedades profesionales.</p>'+
      '<h4 class="dg-h4">2. Alcance</h4><p>Aplica a todo trabajador de '+EMP.rz+' que se desempeñe en el cargo de '+esc(cargo.toLowerCase())+', en las dependencias de la empresa y en las plantas, faenas y centros de los clientes.</p>'+
      '<h4 class="dg-h4">3. Responsabilidades</h4>'+ulDg([
        '<b>Gerencia:</b> proporcionar los recursos para aplicar este procedimiento y fiscalizar su cumplimiento.',
        '<b>Jefatura directa / supervisor:</b> instruir a los trabajadores, asignar tareas solo a personal capacitado y exigir el uso de los elementos de protección personal.',
        '<b>Prevención de riesgos:</b> mantener actualizado este procedimiento, capacitar y registrar la entrega a cada trabajador.',
        '<b>Trabajador:</b> cumplir este procedimiento, usar correctamente sus EPP e informar de inmediato condiciones inseguras, incidentes y accidentes.']) +
      '<h4 class="dg-h4">4. Funciones del cargo</h4>'+ulDg(fun)+
      '<h4 class="dg-h4">5. Riesgos y medidas de control</h4>'+
      '<table class="dg-tbl"><thead><tr><th style="width:28%">Actividad / peligro</th><th style="width:22%">Riesgo</th><th>Medidas de control</th></tr></thead><tbody>'+R.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td></tr>'; }).join('')+'</tbody></table>'+
      '<h4 class="dg-h4">6. Elementos de protección personal</h4><p>'+(oper?'Calzado de seguridad antideslizante, guantes (nitrilo, engomados o térmicos según la tarea), antiparras, protector auditivo, ropa térmica e impermeable, mascarilla o respirador según el químico, y arnés con línea de vida para trabajos en altura.':'Calzado de seguridad, casco, chaleco reflectante, antiparras, protector auditivo y ropa térmica / impermeable, según lo exija cada faena.')+'</p>'+
      '<h4 class="dg-h4">7. Normas generales</h4>'+ulDg([
        'No realizar tareas para las que no se ha sido instruido o autorizado.',
        'Respetar los procedimientos y normas del cliente en cada faena.',
        'Informar de inmediato todo accidente o incidente a la jefatura, aunque parezca leve.',
        'Prohibido trabajar bajo la influencia del alcohol o drogas.',
        'Mantener el orden y la limpieza del lugar de trabajo.']) +
      '';
  }
  // ---- plantillas y datos (ISgestión, líneas 9222–10318)
  // Plantilla: Entrega de EPP (fiel al formato del Drive).
  function docEPP(t){
    var izq=['BOTAS / ZAPATOS DE SEGURIDAD','ANTIPARRAS','CHALECO REFLECTANTE','PROTECTOR AUDITIVO','GUANTES DE NITRILO','CASCO CON BARBIQUEJO','OVEROL','ROPA TÉRMICA','MÁSCARA DE POLVO','MÁSCARA DE GASES'];
    var der=['ROPA DE ALTA VISIBILIDAD','ARNÉS DE SEGURIDAD / CUERDA DE VIDA','GUANTES DE CABRETILLA','GUANTES ENGOMADOS','GUANTES ENGOMADOS LARGOS','','','','',''];
    var rows=''; for(var i=0;i<10;i++){ rows+='<tr><td class="n">'+(i+1)+'</td><td>'+izq[i]+'</td><td class="f"></td><td>'+der[i]+'</td><td class="f"></td></tr>'; }
    return dgHead('ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL','02')+
      '<p>Por el presente yo, <span contenteditable>'+esc(t.nombre||'—')+'</span>, R.U.T. <span contenteditable>'+esc(t.rut||'')+'</span>, declaro haber sido informado(a) que en el lugar donde desempeño mi trabajo me encuentro expuesto al riesgo de sufrir un accidente del trabajo y/o enfermedades profesionales producto de mi labor. Por esta razón mi empleador <b>'+EMP.rz+'</b>, en conformidad a los artículos 53° y 54° del Decreto Supremo N° 594, me proporciona y enseña el correcto uso de los siguientes elementos de protección personal:</p>'+
      '<table class="dg-tbl"><thead><tr><th class="n">N°</th><th>Elemento de protección personal</th><th class="f">Firma</th><th>Elemento de protección personal</th><th class="f">Firma</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<p>Cabe señalar que estoy obligado(a) a utilizar mis elementos de protección personal en beneficio de mi vida y salud durante mis jornadas laborales.</p>'+
      '<p style="margin-top:16px">Fecha entrega EPP: <span contenteditable>'+fFaena(todayISO())+'</span></p>'+
      '<div class="dg-firmas"><div>Firma trabajador</div><div>Huella</div></div>';
  }
  // Datos de la empresa (una sola fuente; si cambia la razón social, se edita aquí).
  var EMP=D.EMP;
  function dgHead(titulo, ver, fecha){ return '<div class="dg-h"><div class="lg"><img src="'+(EMP.logo||'')+'" onerror="this.style.display=\'none\'"></div><div class="t"><b>'+titulo+'</b><span>'+EMP.rz+' · RUT '+EMP.rut+'</span></div><div class="ver"><span>Versión <b>'+(ver||'01')+'</b></span><span>Fecha <b>'+(fecha||fFaena(todayISO()))+'</b></span></div></div><div class="dg-band"></div>'; }
  function dgFoot(){ return '<div class="dg-foot"><span>'+EMP.rz+' · RUT '+EMP.rut+' · '+EMP.direccion+', '+EMP.ciudad+'</span><span>Documento generado con ISgestión</span></div>'; }
  function dgSet(html){ $('dg-doc').classList.remove('fa-mode'); $('dg-doc').innerHTML=html+dgFoot(); }
  function ce(v){ return '<span contenteditable>'+(v?esc(v):'')+'</span>'; }

  // Plantilla: Contrato de trabajo por obra o faena (Operario de Servicios) — fiel al formato del Drive.
  function docContratoOper(t){
    var duties=OPER_FUN;
    return docContratoOperHtml(t, duties);
  }
  var OPER_FUN=['Aseo general de la planta: barrido seco y húmedo; aplicaciones de detergente; acción mecánica; enjuague y sanitizado de líneas de proceso, máquinas, mesones, canaletas, rejillas, piso, etc. Montar y desmontar cintas y estructuras; secado de estructuras y pisos.','Aseo general de exteriores: limpieza con hidrolavado, acción mecánica, barrido y recolección de desechos generados producto de la limpieza.','Limpieza de estanques de agua dulce, agua salada y estanques de flow ice.','Aseo en pasillos, andenes de carga, cámaras de frigorífico, baños, etc.','Limpieza de bodegas y armado de cajas, limpieza de pisos con máquina, retiro de polvo y secado de pisos.','Limpieza de tolvas de vísceras, plantas de riles, y cámaras de canalizado agua RIL.','Limpieza de fachadas en piso y altura, considerar apoyo de limpieza en altura siempre que cuente con el examen ocupacional y EPP correspondiente.','Limpieza y retiro de hielo y nieve de cámaras frigoríficas, trabajo bajo condiciones extremas de frío y en altura siempre que cuente con examen ocupacional y equipo necesario para dicha maniobra.','Servicios generales de exterior, obras menores y servicios de jardinería y podado de árboles.','Limpieza de barcos en general, bodegas, corteza externa y cubiertas, según amerite el trabajo.','Manejar químicos siempre y cuando haya recibido la capacitación pertinente. Para ello deberá ser capacitado y firmar planilla de registro.','Por ningún motivo limpiar con agua directa equipos electrónicos que posea la planta.'];
  function docContratoOperHtml(t, duties){
    var li=duties.map(function(d){ return '<li>'+d+'</li>'; }).join('');
    return dgHead('CONTRATO DE TRABAJO')+
      '<p style="text-align:center;margin-top:-6px;color:#667;font-weight:700">Por obra o faena · '+esc(t.cargo||'Operario de Servicios')+'</p>'+
      '<p>En '+EMP.ciudad+' a '+ce(fLarga(todayISO()))+', entre <b>'+EMP.rz+'</b>, R.U.T: '+EMP.rut+', '+EMP.dir+', representado(a) legalmente por <b>'+EMP.rep+'</b>, RUT: '+EMP.repRut+', con domicilio en '+EMP.direccion+', comuna de '+EMP.ciudad+', en adelante el Empleador; y DON(A) '+ce(t.nombre)+', RUT: '+ce(t.rut)+', de Nacionalidad '+ce(String(t.nacionalidad||'chilena').toUpperCase())+', estado civil '+ce(t.estado_civil)+', nacido el '+ce(fLarga(t.nacimiento))+', domiciliado en '+ce([t.direccion, t.numero?('N° '+t.numero):'', t.poblacion].filter(Boolean).join(', '))+', en la comuna de '+ce(t.comuna)+', en adelante el Trabajador. Se ha convenido el siguiente Contrato Individual de Trabajo:</p>'+
      '<p><b>PRIMERO — Funciones.</b> El trabajador desempeñará la función de: <b>'+esc((t.cargo||'OPERARIO DE SERVICIOS')).toUpperCase()+'</b>. En virtud de lo anterior, deberá dar estricto cumplimiento a las obligaciones que se indican, cuya enumeración es a modo ejemplar:</p>'+
      '<ul style="margin:0 0 12px 18px;line-height:1.5;font-size:12px">'+li+'</ul>'+
      '<p><b>SEGUNDO — Lugar de trabajo.</b> El trabajador cumplirá sus labores en primera instancia en las diversas plantas de procesos de la Décima Región, y prestará servicios en las áreas de planta de procesos, frigorífico, pisciculturas y centros de cultivo con base en tierra; las partes acuerdan que podrá ser trasladado a otras secciones según la naturaleza del trabajo de la cláusula primera.</p>'+
      '<p><b>TERCERO — Jornada.</b> 45 horas semanales distribuidas de lunes a viernes y/o de lunes a sábado, en turnos según necesidades de las Plantas de Proceso, rigiéndose en el artículo 5° del Reglamento Interno vigente. Horarios preferenciales: Lun–Sáb 08:00 a 16:00, 16:00 a 00:00 y 00:00 a 08:00 hrs, u otro similar, considerando 30 min de colación.</p>'+
      '<p><b>CUARTO — Obligaciones.</b> El dependiente deberá cumplir fielmente las políticas, instrucciones, reglamentos y órdenes impartidas por su empleador o sus representantes (Supervisor). La inobservancia de estos deberes es considerada incumplimiento grave de las obligaciones del contrato, en los términos del N° 7 del artículo 160 del Código del Trabajo, sin perjuicio de las responsabilidades civiles y penales que correspondan.</p>'+
      '<p><b>QUINTO — Remuneración.</b> Sueldo base diario: $ '+ce('25.000')+' por día trabajado, por las labores de la cláusula primera. Gratificación: 25% según ley (art. 50 del Código del Trabajo), con tope de 4,75 IMM, entendiéndose cumplida con este pago la obligación legal. Las remuneraciones se pagan por períodos vencidos, cada viernes de la semana siguiente, en efectivo o depósito en cuenta RUT/Vista del trabajador.</p>'+
      '<p><b>SEXTO — Ingreso.</b> Se deja constancia que don(a) '+ce(t.nombre)+' ingresó a prestar servicios el '+ce(t.fecha_ingreso?fLarga(t.fecha_ingreso):'')+'.</p>'+
      '<p><b>SÉPTIMO — Vigencia.</b> El contrato tiene una vigencia de carácter indefinido y el trabajador prestará servicios con intervenciones mínimas de 1 día al mes.</p>'+
      '<p><b>OCTAVO — Domicilio.</b> Las partes fijan domicilio en '+EMP.ciudad+' y se someten a la jurisdicción de sus Tribunales de Justicia.</p>'+
      '<p><b>NOVENO — Ejemplares.</b> El presente contrato se suscribe en dos ejemplares, quedando uno en poder del trabajador.</p>'+
      '<div class="dg-firmas'+((FIRMA_SIG||FIRMA_TIM)?' con-rep':'')+'"><div>Firma del Trabajador<br>RUT '+esc(t.rut||'____')+'</div><div class="dg-rep">'+firmaRepHtml()+'Firma del Empleador<br>'+EMP.rz+'</div></div>';
  }

  // ---- Variantes por cargo (contrato y perfil): Operario · Técnico en prevención · Prevención y administración ----
  var DG_VARS=[{v:'oper',n:'Operario de servicios'},{v:'prev',n:'Técnico en prevención de riesgos'},{v:'prevadm',n:'Prevención y administración'}];
  function varDefault(t){ var c=(t.cargo||'').toLowerCase(); if(/prevenc/.test(c)) return /admin/.test(c)?'prevadm':'prev'; return 'oper'; }
  function fLarga(iso){ if(!iso) return ''; var p=String(iso).slice(0,10).split('-'); if(p.length<3) return String(iso);
    var M=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']; return (+p[2])+' de '+M[+p[1]-1]+' de '+p[0]; }
  // Bloque opcional: en pantalla lleva una "×" para quitarlo; la "×" no sale en el PDF.
  function dgOpt(etq, html){ return '<div class="dg-opt"><span class="dg-bar" data-html2canvas-ignore></span><button type="button" class="dg-x" data-html2canvas-ignore title="Quitar este bloque">×</button><div class="dg-opt-l" data-html2canvas-ignore>'+etq+' · quitar si no aplica</div>'+html+'</div>'; }
  function ulDg(L){ return '<ul class="dg-ul">'+L.map(function(d){ return '<li>'+d+'</li>'; }).join('')+'</ul>'; }

  var PREV_OBJ='Velar por el cumplimiento de la normativa legal y reglamentaria en materia de seguridad y salud en el trabajo, resguardar la integridad de los trabajadores de la empresa y mantener al día su documentación laboral y preventiva, así como la acreditación de la empresa y su personal en las plataformas de los clientes.';
  var PREV_FUN=[
    'Velar por el cumplimiento de la normativa de seguridad y salud en el trabajo aplicable a la empresa —Ley N° 16.744 y sus reglamentos, en especial el D.S. N° 44 del Ministerio del Trabajo y Previsión Social (gestión preventiva de los riesgos laborales) y el D.S. N° 594 del Ministerio de Salud, la Ley N° 21.643 (Ley Karin) y el Reglamento Interno de Orden, Higiene y Seguridad—, informando oportunamente a la Gerencia las desviaciones detectadas.',
    'Elaborar, implementar y mantener actualizados la matriz de identificación de peligros y evaluación de riesgos, el programa de trabajo preventivo y los procedimientos de trabajo seguro de los servicios que presta la empresa.',
    'Realizar inspecciones y observaciones de seguridad en las plantas, faenas y centros de los clientes, verificando las condiciones de trabajo, el uso correcto de los elementos de protección personal y el cumplimiento de los procedimientos, y hacer seguimiento a las medidas correctivas.',
    'Informar a los trabajadores los riesgos laborales propios de sus funciones y las medidas preventivas, realizar inducciones de ingreso, charlas y capacitaciones, y mantener sus registros.',
    'Mantener al día la documentación laboral y preventiva de cada trabajador —contrato y anexos, recepción del Reglamento Interno, información de riesgos, entrega de EPP, exámenes ocupacionales, capacitaciones y demás registros exigidos—, controlando sus vencimientos.',
    'Gestionar la acreditación de la empresa, sus trabajadores y vehículos en las plataformas de los clientes, cargando y renovando oportunamente la documentación exigida y respondiendo a sus observaciones.',
    'Registrar, notificar e investigar los accidentes del trabajo y enfermedades profesionales, coordinar con el organismo administrador del seguro de la Ley N° 16.744, y elaborar el informe mensual de accidentabilidad y las estadísticas requeridas por la empresa y sus clientes.',
    'Controlar la entrega, stock y reposición de los elementos de protección personal, proponiendo su adquisición.',
    'Asesorar al Comité Paritario de Higiene y Seguridad cuando corresponda, y atender los requerimientos del organismo administrador y de los organismos fiscalizadores (Dirección del Trabajo, SEREMI de Salud, entre otros).',
    'Apoyar la difusión y aplicación del protocolo de prevención del acoso sexual, laboral y la violencia en el trabajo.',
    'Registrar la gestión en los sistemas de la empresa e informar mensualmente a la Gerencia el estado de cumplimiento documental y de seguridad.'
  ];
  var ADM_FUN=[
    'Preparar y administrar la documentación de personal: borradores de contratos, anexos y comunicaciones, y mantener ordenadas y actualizadas las carpetas de los trabajadores.',
    'Recopilar y controlar la asistencia y los reportes de horas del personal, y preparar los antecedentes para el cálculo de remuneraciones y cotizaciones previsionales.',
    'Apoyar la emisión y seguimiento de cotizaciones, órdenes de compra, estados de pago y facturación a clientes, así como el control de pagos a proveedores.',
    'Coordinar la compra de insumos, materiales y EPP, y controlar la documentación y vencimientos de los vehículos de la empresa.',
    'Atender los requerimientos administrativos de clientes, proveedores y trabajadores, y la correspondencia de la empresa.'
  ];
  var CIERRE_FUN='Toda otra labor afín o complementaria a las anteriores que le encomiende su jefatura directa.';

  function docContrato(t, v){ return (v||varDefault(t))==='oper' ? docContratoOper(t) : docContratoPrev(t, v==='prevadm'); }
  function docContratoPrev(t, adm){
    var cargo=adm?'TÉCNICO EN PREVENCIÓN DE RIESGOS Y ASISTENTE ADMINISTRATIVO(A)':'TÉCNICO EN PREVENCIÓN DE RIESGOS';
    var dom=[t.direccion, t.numero?('N° '+t.numero):'', t.poblacion].filter(Boolean).join(', ');
    var n=0, ORD=['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO','SEXTO','SÉPTIMO','OCTAVO','NOVENO','DÉCIMO','UNDÉCIMO','DUODÉCIMO'];
    function cl(tit){ return '<b>'+ORD[n++]+' — '+tit+'.</b> '; }
    return dgHead('CONTRATO INDIVIDUAL DE TRABAJO')+
      '<p style="text-align:center;margin-top:-6px;color:#667;font-weight:700">'+esc(cargo)+'</p>'+
      '<p>En '+EMP.ciudad+', a '+ce(fLarga(todayISO()))+', entre <b>'+EMP.rz+'</b>, R.U.T. '+EMP.rut+', representada legalmente por don <b>'+EMP.rep+'</b>, R.U.T. '+EMP.repRut+', ambos con domicilio en '+EMP.direccion+', comuna de '+EMP.ciudad+', en adelante «el Empleador»; y don(ña) '+ce(t.nombre)+', R.U.T. '+ce(t.rut)+', de nacionalidad '+ce(t.nacionalidad||'chilena')+', estado civil '+ce(t.estado_civil)+', nacido(a) el '+ce(fLarga(t.nacimiento))+', domiciliado(a) en '+ce(dom)+', comuna de '+ce(t.comuna||''+EMP.ciudad+'')+', en adelante «el Trabajador», se ha convenido el siguiente Contrato Individual de Trabajo:</p>'+
      '<p>'+cl('Cargo y funciones')+'El Trabajador desempeñará el cargo de <b>'+cargo+'</b>, cuyo objetivo es '+PREV_OBJ.charAt(0).toLowerCase()+PREV_OBJ.slice(1)+' Para ello deberá dar estricto cumplimiento a las siguientes funciones, cuya enumeración es a modo ejemplar:</p>'+
      (adm?'<p style="margin:0 0 4px"><b>a) Prevención de riesgos</b></p>':'')+ulDg(PREV_FUN)+
      (adm?'<p style="margin:0 0 4px"><b>b) Administración</b></p>'+ulDg(ADM_FUN.concat([CIERRE_FUN])):ulDg([CIERRE_FUN]))+
      dgOpt('Registro SEREMI','<p>Se deja constancia de que el Trabajador se encuentra inscrito en el registro de la SEREMI de Salud de la Región de '+ce(EMP.region)+', con el N° '+ce('')+', como Experto en Prevención de Riesgos, categoría Técnico.</p>')+
      '<p>'+cl('Lugar de trabajo')+'El Trabajador prestará sus servicios en las dependencias de la empresa ubicadas en '+EMP.direccion+', '+EMP.ciudad+', y en las plantas de proceso, frigoríficos, pisciculturas y centros de los clientes en que la empresa preste servicios en la Región de '+EMP.region+', debiendo trasladarse a ellos según las necesidades del servicio, sin que ello importe menoscabo para el Trabajador.</p>'+
      '<p>'+cl('Jornada de trabajo')+'El Trabajador cumplirá una jornada ordinaria de '+ce('42')+' horas semanales, distribuidas de '+ce('lunes a jueves de 08:30 a 18:00 horas y viernes de 08:30 a 17:30 horas')+', con '+ce('60')+' minutos de colación no imputables a la jornada. Por la naturaleza de sus funciones, y previo aviso, la distribución podrá ajustarse a los turnos de las faenas de los clientes dentro de los límites legales. Las horas extraordinarias solo se trabajarán cuando sean pactadas por escrito y se pagarán con el recargo legal.</p>'+
      '<p>'+cl('Obligaciones')+'El Trabajador deberá cumplir fielmente las políticas, instrucciones, reglamentos y órdenes impartidas por el Empleador o sus representantes, realizando todas aquellas labores que directa o indirectamente digan relación con su cargo y que sean necesarias para cumplirlo en forma adecuada, eficiente y oportuna. Las partes consideran esenciales estas obligaciones, por lo que su inobservancia constituirá incumplimiento grave de las obligaciones que impone el contrato, en los términos del N° 7 del artículo 160 del Código del Trabajo, sin perjuicio de las responsabilidades civiles y penales que correspondan.</p>'+
      '<p>'+cl('Remuneración')+'El Empleador pagará al Trabajador un sueldo base mensual de $ '+ce(t.sueldo_base?Number(t.sueldo_base).toLocaleString('es-CL'):'')+' ('+ce('')+' pesos). Adicionalmente se pagará una gratificación legal equivalente al 25% de lo devengado por concepto de remuneraciones mensuales, con tope de 4,75 ingresos mínimos mensuales anuales, conforme al artículo 50 del Código del Trabajo, entendiéndose con ello cumplida la obligación legal de gratificar. Las remuneraciones se pagarán por mes vencido, a más tardar el último día hábil de cada mes, mediante depósito o transferencia a la cuenta bancaria del Trabajador, previa deducción de los impuestos, cotizaciones de seguridad social y demás descuentos legales.</p>'+
      dgOpt('Asignaciones','<p>Asimismo, el Empleador pagará mensualmente una asignación de colación de $ '+ce('')+' y una asignación de movilización de $ '+ce('')+', ambas de carácter no imponible y proporcionales a los días efectivamente trabajados.</p>')+
      '<p>'+cl('Confidencialidad y datos personales')+'Con motivo de su cargo, el Trabajador tendrá acceso a datos personales y sensibles de los trabajadores —incluidos antecedentes de salud y exámenes ocupacionales—, a información de los clientes y a las credenciales de acceso de las plataformas de acreditación. El Trabajador se obliga a guardar estricta reserva de dicha información, a utilizarla únicamente para fines propios de su cargo y conforme a la legislación sobre protección de datos personales, a no compartir ni ceder las credenciales que se le asignen, y a restituir toda información y accesos al término de la relación laboral. Esta obligación subsistirá aun terminado el contrato.</p>'+
      '<p>'+cl('Reglamento Interno y Ley Karin')+'El Trabajador declara recibir en este acto un ejemplar del Reglamento Interno de Orden, Higiene y Seguridad de la empresa, que incluye el protocolo de prevención del acoso sexual, laboral y la violencia en el trabajo y el procedimiento de investigación y sanción establecido por la Ley N° 21.643, obligándose a conocerlo y cumplirlo.</p>'+
      '<p>'+cl('Fecha de ingreso')+'Se deja constancia de que el Trabajador ingresó a prestar servicios el '+ce(t.fecha_ingreso?fLarga(t.fecha_ingreso):'')+'.</p>'+
      '<p>'+cl('Duración')+'</p>'+
      dgOpt('Opción A','<p>El presente contrato es a plazo fijo y durará hasta el '+ce('')+'. Si el Trabajador continúa prestando servicios con conocimiento del Empleador después de expirado dicho plazo, el contrato se transformará en indefinido, conforme al artículo 159 N° 4 del Código del Trabajo.</p>')+
      dgOpt('Opción B','<p>El presente contrato es de duración indefinida.</p>')+
      '<p>'+cl('Correo y firma electrónica')+'El Trabajador autoriza expresamente que la documentación derivada de la relación laboral, así como las comunicaciones internas de la empresa, sean confeccionadas, firmadas y remitidas en forma electrónica a su correo personal '+ce(t.email)+', y que pueda suscribirlas mediante firma electrónica simple conforme a la Ley N° 19.799, siendo de su responsabilidad resguardar sus accesos.</p>'+
      '<p>'+cl('Domicilio y ejemplares')+'Para todos los efectos derivados del presente contrato, las partes fijan domicilio en la ciudad de '+EMP.ciudad+' y se someten a la jurisdicción de sus Tribunales de Justicia. El contrato se firma en dos ejemplares, quedando uno en poder de cada parte.</p>'+
      '<div class="dg-firmas'+((FIRMA_SIG||FIRMA_TIM)?' con-rep':'')+'"><div>Firma del Trabajador<br>'+esc(t.nombre||'')+'<br>RUT '+esc(t.rut||'____')+'</div><div class="dg-rep">'+firmaRepHtml()+'Firma del Empleador<br>'+EMP.rep+'<br>p.p. '+EMP.rz+'</div></div>';
  }

  // Plantilla: Perfil de cargo (según la variante).
  function docPerfil(t, v){
    v=v||varDefault(t);
    var P;
    if(v==='oper') P={ cargo:t.cargo||'Operario de Servicios', area:'Operaciones', rep:'Supervisor de faena', sup:'No aplica',
      obj:'Ejecutar los servicios de limpieza, sanitización y servicios generales en las plantas, frigoríficos y centros de los clientes, cumpliendo los procedimientos de trabajo seguro y los estándares de calidad e inocuidad exigidos.',
      fun:OPER_FUN.concat([CIERRE_FUN]),
      req:[['Formación','Enseñanza media (deseable).'],['Experiencia','Deseable en limpieza industrial, plantas de proceso o industria acuícola.'],['Requisitos específicos','Examen ocupacional vigente para trabajos en altura o frío, cuando la faena lo exija. Capacitación en manejo de químicos.']],
      comp:['Responsabilidad y puntualidad','Trabajo en equipo','Apego a los procedimientos y al uso de EPP','Orden y prolijidad'],
      rie:'Caídas al mismo y distinto nivel, contacto con productos químicos, exposición a frío y humedad, manejo manual de carga, ruido, trabajo cerca del agua.',
      epp:'Calzado de seguridad, guantes (nitrilo / engomados), antiparras, protector auditivo, ropa térmica e impermeable, mascarilla según químico, arnés para trabajos en altura.',
      kpi:['Cumplimiento del programa de limpieza de la faena','Observaciones de calidad del cliente','Cumplimiento de uso de EPP y procedimientos'] };
    else { var adm=(v==='prevadm'); P={ cargo:adm?'Técnico en Prevención de Riesgos y Asistente Administrativo(a)':'Técnico en Prevención de Riesgos', area:adm?'Prevención de Riesgos y Administración':'Prevención de Riesgos', rep:'Gerencia General', sup:'Relación funcional con supervisores y trabajadores en materias de seguridad y documentación',
      obj:PREV_OBJ+(adm?' Además, apoyar la gestión administrativa y de personal de la empresa.':''),
      fun:PREV_FUN, fun2:adm?ADM_FUN:null,
      req:[['Formación','Título de Técnico de Nivel Superior en Prevención de Riesgos, otorgado por un CFT o IP reconocido por el Estado.'+(adm?' Deseable formación o experiencia en administración.':'')],
        ['Registro','Deseable inscripción en la SEREMI de Salud como Experto en Prevención de Riesgos, categoría Técnico.'],
        ['Experiencia','Deseable 1 año en prevención de riesgos, idealmente en industria acuícola, alimentaria o empresas de servicios.'],
        ['Conocimientos','Ley N° 16.744, D.S. N° 44 (MINTRAB), D.S. N° 594 (MINSAL), Ley N° 21.643 (Ley Karin); matriz de riesgos y procedimientos de trabajo seguro; investigación de accidentes; plataformas de acreditación de contratistas; Excel y herramientas ofimáticas'+(adm?'; nociones de remuneraciones, facturación y gestión documental':'')+'.'],
        ['Otros','Licencia de conducir clase B (deseable). Disponibilidad para desplazarse a las faenas de la región.']],
      comp:['Rigurosidad y orden documental','Orientación al cumplimiento normativo','Comunicación efectiva y liderazgo en terreno','Planificación y seguimiento de plazos','Confidencialidad y criterio en el manejo de información','Proactividad y trabajo en equipo'],
      rie:'Tránsito y conducción de vehículos, caídas al mismo nivel en plantas y centros, exposición a frío, humedad, ruido y productos químicos durante visitas a faenas, trabajo con pantallas de visualización, riesgos psicosociales.',
      epp:'Calzado de seguridad, casco, chaleco reflectante, antiparras, protector auditivo y ropa térmica / impermeable, según las exigencias de cada faena.',
      kpi:['Porcentaje de trabajadores con documentación al día','Porcentaje de acreditación vigente en plataformas de clientes','Informe mensual de accidentabilidad entregado en plazo','Inspecciones realizadas versus programadas','Tasa de accidentabilidad y seguimiento de medidas correctivas'].concat(adm?['Reportes de asistencia y antecedentes de remuneraciones entregados en plazo']:[]) }; }
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    function h4(x){ return '<h4 class="dg-h4">'+x+'</h4>'; }
    return dgHead('PERFIL DE CARGO')+
      h4('1. Identificación del cargo')+
      '<table class="dg-tbl">'+tr('Cargo','<b>'+esc(P.cargo)+'</b>')+tr('Área',P.area)+tr('Reporta a',P.rep)+tr('Supervisa a',P.sup)+tr('Lugar de trabajo','Dependencias de la empresa ('+EMP.ciudad+') y faenas de clientes en la Región de '+EMP.region+'')+tr('Ocupante',ce(t.nombre)+' · RUT '+ce(t.rut))+'</table>'+
      h4('2. Objetivo del cargo')+'<p>'+P.obj+'</p>'+
      h4('3. Funciones y responsabilidades')+
      (P.fun2?'<p style="margin:0 0 4px"><b>a) Prevención de riesgos</b></p>'+ulDg(P.fun)+'<p style="margin:0 0 4px"><b>b) Administración</b></p>'+ulDg(P.fun2.concat([CIERRE_FUN])):ulDg(v==='oper'?P.fun:P.fun.concat([CIERRE_FUN])))+
      h4('4. Requisitos')+'<table class="dg-tbl">'+P.req.map(function(r){ return tr(r[0],r[1]); }).join('')+'</table>'+
      h4('5. Competencias')+ulDg(P.comp)+
      h4('6. Riesgos del cargo y elementos de protección')+'<table class="dg-tbl">'+tr('Riesgos principales',P.rie)+tr('EPP',P.epp)+'</table>'+
      h4('7. Indicadores de desempeño')+ulDg(P.kpi)+
      '<p style="margin-top:14px">Declaro haber recibido y tomado conocimiento del presente perfil de cargo.</p>'+
      '<div class="dg-firmas'+((FIRMA_SIG||FIRMA_TIM)?' con-rep':'')+'"><div>Toma de conocimiento<br>'+esc(t.nombre||'')+'</div><div class="dg-rep">'+firmaRepHtml()+'Aprobado por<br>Gerencia · '+EMP.rz+'</div></div>';
  }

  // Plantilla: IRL — Información de Riesgos Laborales (D.S. N° 44, reemplaza a la ODI del D.S. N° 40).
  // El slug interno sigue siendo 'odi' para no perder los registros existentes.
  // Versión 02: tareas reales del puesto (lugar y equipos), condiciones del puesto, peligros por tarea tomados de la
  // Matriz IPER (MAT-PREV-02), procedimientos de trabajo seguro, productos químicos según HDS y EPP por tarea.
  // Tarea: n (nombre), d (qué se hace), l (lugar), eq (equipos), iper (inicio de la "tarea" en IPER_FILAS),
  // pts (procedimientos), met (método de trabajo seguro), epp
  var IRL_OPER=[
    { n:'Limpieza y sanitización de plantas de proceso', d:'Barrido seco y húmedo, aplicación de detergente, acción mecánica, enjuague y sanitizado de líneas de proceso, máquinas, mesones, canaletas, rejillas y pisos; montaje y desmontaje de cintas y estructuras; secado.',
      l:'Salas de proceso de plantas de clientes (frío y humedad).', eq:'Espumador, rociadores, escobillones, escobillas, palas, baldes, mangueras, barre agua, máquina de piso.',
      iper:['Limpieza de pisos y superficies','Uso de productos químicos de limpieza','Dilución y trasvasije','Uso de abrillantadora','Uso de equipos ruidosos','Traslado de bidones','Limpieza de superficies con movimientos'],
      pts:['PTS-PREV-03 Uso y manipulación de productos químicos','PTS-FUN-01 Acorde a sus funciones (operario)'],
      met:'Secuencia de limpieza de arriba hacia abajo; usar solo químicos ya diluidos y entregados por el supervisor; nunca mezclar productos; no proyectar agua sobre tableros ni motores; señalizar el área mojada.',
      epp:'Botas de goma con punta de acero, traje impermeable, guantes de nitrilo, antiparras o careta facial, protector auditivo, mascarilla o respirador según la HDS.' },
    { n:'Limpieza de exteriores e hidrolavado', d:'Hidrolavado, acción mecánica, barrido y recolección de los desechos de la limpieza en patios, andenes y fachadas a nivel de piso.',
      l:'Exteriores de plantas y centros: patios, andenes de carga, fachadas.', eq:'Hidrolavadora, escobillones, palas, carros de basura.',
      iper:['Hidrolavado','Uso de equipos ruidosos','Tareas en exteriores','Tareas en días de calor','Desplazamiento en instalaciones'],
      pts:['PTS-FUN-01 Acorde a sus funciones (operario)','Instrucciones del fabricante de la hidrolavadora'],
      met:'Revisar mangueras y conexiones antes de usar; no apuntar el chorro a personas ni a equipos eléctricos; seguro del gatillo al detenerse; usar vías peatonales y respetar el tránsito de grúas horquilla.',
      epp:'Careta facial o antiparras, traje impermeable, botas de goma con punta de acero, guantes, protector auditivo, chaleco reflectante, bloqueador solar y legionario en exteriores.' },
    { n:'Limpieza de cámaras frigoríficas y retiro de hielo y nieve', d:'Limpieza semi húmeda de pisos, paredes, cielos, puertas, racks y equipos de frío; retiro de hielo y nieve acumulados.',
      l:'Cámaras frigoríficas y de congelado, túneles de frío.', eq:'Máquina abrillantadora, palas, escobillones, mangos telescópicos, paños, baldes.',
      iper:['Limpieza de cámaras frigoríficas','Tránsito dentro de la cámara','Permanencia dentro de la cámara','Uso de abrillantadora','Traslado de bidones','Limpieza de superficies con movimientos'],
      pts:['PTS-PREV-07 Limpieza de cámaras frigoríficas'],
      met:'Verificar antes de entrar que la puerta abre desde el interior; trabajar en pareja; pausas de recuperación en zona temperada; limpieza sin agua directa; cables secos y fuera del piso; secar el piso al terminar.',
      epp:'Ropa térmica (chaqueta y pantalón), guantes térmicos o de nitrilo, gorro térmico, botas de goma con punta de acero, casco con barbiquejo.' },
    { n:'Limpieza de estanques, tolvas y cámaras de RIL', d:'Limpieza interior de estanques de agua dulce, salada y flow ice, tolvas de vísceras, plantas de RIL y cámaras de canalizado.',
      l:'Estanques, tolvas y cámaras (espacios confinados).', eq:'Medidor de gases portátil, ventilador o extractor, hidrolavadora, herramientas manuales (llaves, dados, taladro, esmeril), escalas.',
      iper:['Ingreso al estanque','Acceso y trabajo dentro del estanque','Uso de herramientas manuales y eléctricas','Trabajo en caliente'],
      pts:['PTS-PREV-05 Trabajo seguro en espacios confinados','PTS-PREV-06 Uso de herramientas en limpieza de estanques'],
      met:'Ingresar solo con permiso de entrada, medición de gases desde el exterior y monitoreo continuo, ventilación y vigía permanente; salir ante cualquier alarma; inspeccionar las herramientas antes de usarlas.',
      epp:'Casco con barbiquejo, arnés con línea de vida, respirador con filtro o equipo autónomo según la medición, antiparras o careta, guantes, botas de goma con punta de acero, traje impermeable.' },
    { n:'Trabajos en altura', d:'Limpieza de fachadas, estructuras y cámaras a más de 1,8 m, desde alza hombre, andamios o escaleras (solo con examen ocupacional vigente).',
      l:'Fachadas, estructuras, cielos y cámaras de plantas de clientes.', eq:'Alza hombre o grúa Genie, andamios, escalera tijera, arnés de cuerpo completo con cola y absorbedor.',
      iper:['Uso de andamios','Trabajo en altura con herramientas','Operación de alza hombre'],
      pts:['PTS-PREV-01 Trabajos en altura (incluye plan de rescate)','PTS-PREV-02 Alza hombre / grúa Genie'],
      met:'Inspeccionar el arnés y el equipo antes de usarlo; anclarse siempre a un punto resistente; nunca trabajar solo; delimitar el área inferior; suspender con viento sobre 35 km/h; operar el alza hombre solo si está autorizado.',
      epp:'Arnés de cuerpo completo con cola y absorbedor, casco con barbiquejo, antiparras, guantes, calzado de seguridad, chaleco reflectante.' },
    { n:'Limpieza de bodegas, pasillos, andenes y baños', d:'Aseo de bodegas, pasillos, andenes de carga y baños; limpieza de pisos con máquina, retiro de polvo, secado; armado de cajas.',
      l:'Bodegas, pasillos, andenes y servicios higiénicos de las plantas.', eq:'Máquina de piso, aspiradora, mopas, carros, baldes.',
      iper:['Limpieza de pisos y superficies','Uso de abrillantadora','Traslado de bidones','Desplazamiento en instalaciones'],
      pts:['PTS-FUN-01 Acorde a sus funciones (operario)'],
      met:'Señalizar el piso mojado; revisar cables y enchufes de las máquinas; respetar el peso máximo de carga; usar vías peatonales en andenes con tránsito de grúas.',
      epp:'Calzado de seguridad o botas antideslizantes, guantes de nitrilo, chaleco reflectante en andenes.' },
    { n:'Limpieza de barcos', d:'Limpieza de bodegas, cubiertas y corteza externa de embarcaciones, según lo requiera el trabajo.',
      l:'Embarcaciones en muelle o centro de cultivo.', eq:'Hidrolavadora, escobillones, escalas, baldes.',
      iper:['Limpieza de bodegas, cubiertas','Ingreso a bodegas de la embarcación','Hidrolavado'],
      pts:['PTS-PREV-05 Espacios confinados (bodegas de la nave)','Instrucciones de la nave y del centro'],
      met:'Chaleco salvavidas en todo momento junto al agua; no trabajar solo; seguir las instrucciones de la tripulación; tratar las bodegas como espacio confinado.',
      epp:'Chaleco salvavidas, botas antideslizantes, traje impermeable, guantes, casco, careta al hidrolavar.' },
    { n:'Servicios generales, jardinería y obras menores', d:'Servicios generales en exteriores, obras menores, jardinería y podado de árboles.',
      l:'Exteriores de plantas, centros y dependencias de la empresa.', eq:'Herramientas manuales y de corte (tijeras de podar, serrucho), carretilla, escalas.',
      iper:['Jardinería','Uso de herramientas manuales y eléctricas','Tareas en exteriores'],
      pts:['PTS-FUN-01 Acorde a sus funciones (operario)','PTS-PREV-01 Trabajos en altura (si se poda en altura)'],
      met:'Revisar las herramientas antes de usarlas; delimitar el área de caída de ramas; no podar en altura sin cumplir el PTS de altura.',
      epp:'Casco, lentes o careta facial, guantes de cabritilla, calzado de seguridad, bloqueador solar y legionario.' }];
  var IRL_PREV=[
    { n:'Gestión preventiva y documental en oficina', d:'Elaboración de matrices, procedimientos y registros; acreditación de trabajadores; informes y estadísticas.',
      l:'Oficina de la empresa ('+EMP.ciudad+').', eq:'Computador, impresora, teléfono.', iper:['Trabajo de oficina','Desplazamiento en oficinas'],
      pts:['PTS-FUN-02 Acorde a sus funciones (prevención)'], met:'Puesto de trabajo ajustado; pausas activas; cables canalizados y orden.', epp:'No requiere EPP específico en oficina.' },
    { n:'Visitas, inspecciones y capacitaciones en faenas', d:'Inspecciones en terreno, charlas y capacitaciones, entrega de PTS e investigación de accidentes en plantas, frigoríficos y centros.',
      l:'Plantas de proceso, frigoríficos, pisciculturas y centros de clientes.', eq:'Celular, tablet, cámara, EPP de visita.',
      iper:['Desplazamiento en instalaciones','Limpieza de pisos y superficies','Limpieza de cámaras frigoríficas','Tareas en exteriores'],
      pts:['PTS-FUN-02 Acorde a sus funciones (prevención)','Normas de seguridad de cada mandante'],
      met:'Usar los EPP exigidos por cada faena; no ingresar a espacios confinados ni subir a altura sin los permisos y equipos; observar desde una zona segura; usar vías peatonales.',
      epp:'Calzado de seguridad, casco, chaleco reflectante, antiparras, protector auditivo y ropa térmica o impermeable según la faena.' },
    { n:'Traslados a faenas', d:'Conducción o traslado a las faenas de la región.', l:'Rutas y caminos de la Región de '+EMP.region+'.', eq:'Vehículo de la empresa o particular.',
      iper:['Traslado de personal'], pts:['Ley de Tránsito y normas de conducción segura de la empresa'], met:'Licencia y documentos al día; cinturón de seguridad; respetar velocidades; no usar el celular al conducir; descansos en viajes largos.', epp:'Chaleco reflectante en ruta.' }];
  var IRL_TRANS=['Organización del trabajo','Relaciones laborales','Atención y contacto','Emergencias en la faena','Conducta en el trabajo'];
  // Productos químicos de uso habitual en el aseo industrial (por tipo). El nombre comercial se completa según la faena.
  var IRL_QUIM=[['Detergente alcalino clorado (espumante)','Limpieza de líneas, equipos y pisos','Corrosivo: quemaduras en piel y ojos. Libera gas cloro si se mezcla con ácidos.','Guantes de nitrilo, antiparras o careta, traje impermeable, botas. No mezclar.'],
    ['Detergente alcalino / desengrasante','Retiro de grasa y materia orgánica','Irritante o corrosivo para la piel y los ojos.','Guantes de nitrilo, antiparras, traje impermeable.'],
    ['Desincrustante ácido','Retiro de sarro y sales','Corrosivo; libera gases tóxicos si se mezcla con productos clorados.','Guantes de nitrilo, careta facial, respirador según HDS. No mezclar.'],
    ['Sanitizante de amonio cuaternario','Sanitizado de superficies y equipos','Irritante para la piel y los ojos; nocivo si se ingiere.','Guantes de nitrilo, antiparras.'],
    ['Hipoclorito de sodio (cloro)','Desinfección','Corrosivo; desprende gas tóxico al mezclarse con ácidos o amoníaco.','Guantes de nitrilo, antiparras, mascarilla en lugares cerrados. No mezclar.']];
  function docODI(t){
    var v=varDefault(t), oper=(v==='oper'), T=oper?IRL_OPER:IRL_PREV.slice();
    if(v==='prevadm') T.splice(1,0,{ n:'Gestión administrativa y de personal', d:'Apoyo en remuneraciones, contratos, asistencia, facturación y gestión documental.', l:'Oficina de la empresa.', eq:'Computador, impresora, teléfono.', iper:['Trabajo de oficina'], pts:['PTS-FUN-03 Acorde a sus funciones (prevención y administración)'], met:'Pausas activas; puesto de trabajo ajustado; planificación de plazos.', epp:'No requiere EPP específico en oficina.' });
    function filas(L){ var out=[]; L.forEach(function(k){ IPER_FILAS.forEach(function(f){ if(f[1].indexOf(k)===0 && out.indexOf(f)<0) out.push(f); }); }); return out; }
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    var H=seccionador();
    function fila4(f){ return '<tr><td>'+f[3]+'</td><td>'+f[4]+'</td><td style="white-space:nowrap">'+mrChip(f[5]*f[6])+'</td><td>'+f[7]+'</td></tr>'; }
    var cond=oper?[
      ['Lugares de trabajo','Plantas de proceso, frigoríficos, pisciculturas y centros de cultivo con base en tierra, embarcaciones en muelle y dependencias de la empresa, en la Región de '+EMP.region+', según la faena asignada.'],
      ['Condiciones ambientales','Frío y humedad permanentes en salas de proceso y cámaras (bajo 0 °C en cámaras de congelado); pisos mojados, con espuma o hielo; ruido de equipos de proceso y de limpieza; trabajo a la intemperie con lluvia, viento y radiación UV; iluminación artificial en estanques y cámaras.'],
      ['Jornada y organización','45 horas semanales en turnos de mañana, tarde o noche según la faena; trabajo de pie, con desplazamientos y esfuerzo físico permanentes; trabajo en cuadrilla bajo la dirección del supervisor de faena.'],
      ['Equipos y herramientas','Hidrolavadora, espumador, máquina abrillantadora y de piso, aspiradora, herramientas manuales (escobillones, palas, llaves, dados, taladro, esmeril), medidor de gases, alza hombre, andamios y escaleras (tareas específicas), productos químicos de limpieza.'],
      ['Factores de riesgo relevantes','<b>Seguridad:</b> caídas al mismo y distinto nivel, contacto eléctrico, cortes, golpes, atrapamiento. <b>Higiene:</b> agentes químicos, frío, ruido, radiación UV. <b>Ergonómicos:</b> manejo manual de carga, trabajo repetitivo y posturas forzadas. <b>Psicosociales:</b> turnos y carga de trabajo. <b>Tareas críticas:</b> espacios confinados y trabajo en altura.']]:[
      ['Lugares de trabajo','Oficina de la empresa en '+EMP.ciudad+' y faenas de los clientes en la Región de '+EMP.region+'.'],
      ['Condiciones ambientales','En oficina: trabajo sedentario con computador. En faenas: frío, humedad, ruido, pisos mojados y tránsito de grúas horquilla durante las visitas.'],
      ['Jornada y organización','Jornada de oficina con salidas frecuentes a terreno; conducción a las faenas.'],
      ['Equipos y herramientas','Computador, teléfono, vehículo y EPP de visita a faenas.'],
      ['Factores de riesgo relevantes','Tránsito y conducción, caídas en plantas y centros, exposición ocasional a frío, ruido y químicos, trastornos musculoesqueléticos por trabajo con pantallas, riesgos psicosociales.']];
    var trans=filas(IRL_TRANS);
    return dgHead('INFORMACIÓN DE RIESGOS LABORALES (IRL)','02')+
      '<p style="text-align:center;margin-top:-6px;color:#667;font-weight:700">D.S. N° 44 del Ministerio del Trabajo y Previsión Social · Ley N° 16.744</p>'+
      H('Datos del trabajador')+
      '<table class="dg-tbl">'+tr('Nombre',ce(t.nombre))+tr('RUT',ce(t.rut))+'</table>'+
      '<p>En cumplimiento del D.S. N° 44, que reemplazó la "obligación de informar" (ODI) del D.S. N° 40, '+EMP.rz+' informa al trabajador, antes de iniciar sus labores, las tareas de su puesto, sus condiciones, los peligros y riesgos a los que estará expuesto según la Matriz IPER (MAT-PREV-02), sus consecuencias, las medidas preventivas, los métodos de trabajo correctos y los elementos de protección personal que debe usar.</p>'+
      H('Tareas del puesto de trabajo')+
      '<table class="dg-tbl"><thead><tr><th style="width:4%">N°</th><th style="width:30%">Tarea</th><th style="width:30%">Lugar de trabajo</th><th>Equipos y herramientas</th></tr></thead><tbody>'+
        T.map(function(x,i){ return '<tr><td class="n">'+(i+1)+'</td><td><b>'+x.n+'</b><br><span style="font-size:11px;color:#55607a">'+x.d+'</span></td><td>'+x.l+'</td><td>'+x.eq+'</td></tr>'; }).join('')+'</tbody></table>'+
      (oper?'<p style="font-size:11.5px;margin-top:-6px">Las tareas de altura, espacios confinados, uso de alza hombre y manejo de químicos solo se realizan con la capacitación, autorización y examen ocupacional que correspondan.</p>':'')+
      H('Condiciones del puesto de trabajo')+'<table class="dg-tbl">'+cond.map(function(c){ return tr(c[0],c[1]); }).join('')+'</table>'+
      H('Peligros, riesgos y medidas preventivas por tarea')+
      '<p style="font-size:11.5px;margin:0 0 6px">Según la Matriz IPER (MAT-PREV-02). Nivel = magnitud del riesgo (probabilidad × consecuencia) con los controles existentes.</p>'+
      '<table class="dg-tbl irl-tb"><thead><tr><th style="width:22%">Peligro</th><th style="width:22%">Riesgo / consecuencia</th><th style="width:13%">Nivel</th><th>Medidas preventivas</th></tr></thead><tbody>'+
        T.map(function(x,i){ return '<tr class="irl-g"><td colspan="4">'+(i+1)+'. '+x.n+'</td></tr>'+filas(x.iper).map(fila4).join(''); }).join('')+
        '<tr class="irl-g"><td colspan="4">Todas las tareas</td></tr>'+trans.map(fila4).join('')+
      '</tbody></table>'+
      H('Métodos de trabajo seguro')+
      '<table class="dg-tbl"><thead><tr><th style="width:24%">Tarea</th><th style="width:28%">Procedimiento o instrucción</th><th>Método de trabajo correcto</th></tr></thead><tbody>'+
        T.map(function(x){ return '<tr><td><b>'+x.n+'</b></td><td>'+x.pts.join('<br>')+'</td><td>'+x.met+'</td></tr>'; }).join('')+
        '<tr><td><b>Todas las tareas</b></td><td>Reglamento Interno (RIOHS)<br>PR-PREV-03 Emergencia y/o accidentes<br>PTS-PREV-04 Uso de extintores</td><td>Cumplir el reglamento y las normas del mandante; informar condiciones inseguras; ante una emergencia, seguir el plan de la faena.</td></tr>'+
      '</tbody></table>'+
      (oper?H('Productos químicos')+
        '<p style="font-size:11.5px;margin:0 0 6px">Solo se usan productos autorizados, rotulados y con su hoja de datos de seguridad (HDS) disponible en la faena. Antes de usar un producto nuevo se debe leer su HDS y recibir instrucción. El nombre comercial se completa con los productos de la faena.</p>'+
        '<table class="dg-tbl"><thead><tr><th style="width:27%">Producto (tipo · nombre comercial)</th><th style="width:18%">Uso</th><th style="width:27%">Peligros (según HDS)</th><th>Medidas y EPP</th></tr></thead><tbody>'+
          IRL_QUIM.map(function(q){ return '<tr><td><b>'+q[0]+'</b><br>'+ce('')+'</td><td>'+q[1]+'</td><td>'+q[2]+'</td><td>'+q[3]+'</td></tr>'; }).join('')+
          '<tr><td>'+ce('')+'</td><td>'+ce('')+'</td><td>'+ce('')+'</td><td>'+ce('')+'</td></tr></tbody></table>'+
        '<p style="font-size:11.5px"><b>Primeros auxilios:</b> ojos o piel, lavar con abundante agua durante 15 minutos y retirar la ropa contaminada; inhalación, llevar a un lugar ventilado; ingestión, no provocar el vómito. En todos los casos avisar a la jefatura y acudir a la Mutual con la HDS del producto.</p>':
        H('Productos químicos')+'<p>El cargo no manipula productos químicos. En las visitas a faenas puede estar expuesto a ellos de forma ocasional: respetar la señalización y usar los EPP exigidos en el área.</p>')+
      H('Elementos de protección personal por tarea')+
      '<table class="dg-tbl"><thead><tr><th style="width:32%">Tarea</th><th>EPP obligatorios</th></tr></thead><tbody>'+
        T.map(function(x){ return '<tr><td><b>'+x.n+'</b></td><td>'+x.epp+'</td></tr>'; }).join('')+'</tbody></table>'+
      '<p style="font-size:11.5px;margin-top:-6px">Los EPP se entregan sin costo y quedan en el registro de entrega de EPP. El trabajador debe usarlos, cuidarlos y pedir su reposición cuando estén dañados.</p>'+
      H('En caso de accidente o emergencia')+
      ulDg(['Avisar de inmediato a la jefatura directa, aunque la lesión parezca leve.','Atención en la '+EMP.mutual+' (Rescate Mutual 1407 · Ambulancia 131). La empresa emite la DIAT según el procedimiento PR-PREV-03.','Seguir el plan de emergencia y las vías de evacuación de cada faena.'])+
      H('Declaración')+
      '<p>Declaro haber recibido por escrito y comprendido la información sobre las tareas de mi puesto, sus condiciones, los riesgos laborales a los que estoy expuesto, sus consecuencias, las medidas preventivas, los métodos de trabajo correctos y los elementos de protección que debo usar. Me comprometo a cumplirlos y a consultar a mi jefatura ante cualquier duda. Esta información se actualizará cuando cambien mis funciones, el lugar de trabajo, los procesos o la matriz de riesgos.</p>'+
      '<div class="dg-firmas"><div>Firma del trabajador<br>'+esc(t.nombre||'')+(t.rut?'<br>RUT '+esc(t.rut):'')+'</div><div>'+firmaPrevHtml()+'Informado por<br>'+EMP_PREV.nombre+'<br>'+EMP_PREV.cargo+'</div></div>';
  }

  // Plantilla: Ficha de datos del trabajador.
  function docDatos(t){
    var f=[['Nombre completo',t.nombre],['R.U.T',t.rut],['Cargo',t.cargo||'Operario de Servicios'],['Fecha de nacimiento',''],['Nacionalidad','Chilena'],['Estado civil',''],['Dirección',''],['Comuna',''],['Teléfono',''],['Correo',''],['AFP',''],['Salud (Fonasa / Isapre)',''],['N° de cargas',''],['Contacto de emergencia',''],['Teléfono de emergencia',''],['Banco',''],['Tipo y N° de cuenta',''],['Talla de ropa',''],['Talla de calzado',''],['Fecha de ingreso',t.fecha_ingreso||'']];
    var rows=f.map(function(r){ return '<tr><td style="width:38%;font-weight:700;background:#f7f8fc">'+r[0]+'</td><td>'+ce(r[1])+'</td></tr>'; }).join('');
    return dgHead('FICHA DE DATOS DEL TRABAJADOR')+
      '<table class="dg-tbl">'+rows+'</table>'+
      '<div class="dg-firmas"><div>Firma trabajador</div><div>Recibido por · '+EMP.rz+'</div></div>';
  }

  // ====== PTS completos (documento maestro de la empresa), actualizados 2026 y con formato corporativo ======
  // Base: PTS originales de la carpeta de prevención (Drive). Firman: prevencionista (Elaboró) y Gerente General (Aprobó).
  var EMP_PREV=D.EMP_PREV;
  // Tabla de firmas de 3 columnas (Elaboró/Aprobó · Cargo · Firma), igual a la de los PTS originales.
  function dgFirmasPTS(){
    return '<table class="dg-tbl dg-sig"><tbody>'+
      '<tr><td><span class="sl">Elaboró</span>'+ce(lsGet('pts_elab_nom')||EMP_PREV.nombre).replace('<span contenteditable','<span contenteditable data-ls="pts_elab_nom"')+'</td><td><span class="sl">Cargo</span>'+ce(lsGet('pts_elab_cargo')||EMP_PREV.cargo).replace('<span contenteditable','<span contenteditable data-ls="pts_elab_cargo"')+'</td><td class="fx"><span class="sl">Firma</span>'+((!lsGet('pts_elab_nom')||lsGet('pts_elab_nom')===EMP_PREV.nombre)?firmaPrevHtml():'')+'</td></tr>'+
      '<tr><td><span class="sl">Aprobó</span><b>'+EMP.rep+'</b></td><td><span class="sl">Cargo</span><b>Gerente General</b></td><td class="fx"><span class="sl">Firma</span>'+firmaRepHtml()+'</td></tr>'+
      '</tbody></table>';
  }
  var NORM_BASE=['Ley N° 16.744, sobre accidentes del trabajo y enfermedades profesionales.','D.S. N° 44 del Ministerio del Trabajo y Previsión Social, reglamento sobre gestión preventiva de los riesgos laborales (reemplaza al D.S. N° 40).','D.S. N° 594 de 1999 del Ministerio de Salud, condiciones sanitarias y ambientales básicas en los lugares de trabajo.','Reglamento Interno de Orden, Higiene y Seguridad de '+''+EMP.rz+''+'.'];
  var PTS_DOC={
    pts_altura:{ cod:'PTS-PREV-01', titulo:'Trabajos en altura', orig:'14-11-2022',
      obj:'Establecer los estándares y medidas de control para el uso seguro de alza hombre, andamios y escaleras en las faenas de limpieza y desinfección en altura, evitando accidentes y daños a los equipos.',
      alc:'Aplica a todo trabajador de '+EMP.rz+' que ejecute trabajos a más de 1,8 metros de altura, utilizando alza hombre, andamios o escaleras, en las instalaciones de la empresa y de sus clientes.',
      norm:NORM_BASE.concat(['NCh 1258, equipos de protección personal para trabajos con riesgo de caída.','NCh 351, escalas portátiles.','Instrucciones del fabricante y normas de la empresa mandante.']),
      resp:[['Gerencia','Proporcionar los recursos necesarios para aplicar este procedimiento y fiscalizar su cumplimiento.'],['Supervisor','Instruir al personal, verificar que los equipos entregados por la empresa o el mandante estén en perfectas condiciones de uso y hacer cumplir este procedimiento.'],['Prevención de riesgos','Capacitar al personal, mantener actualizado este procedimiento y registrar su entrega.'],['Trabajador','Cumplir este procedimiento, contar con examen ocupacional de altura vigente, usar el arnés y sus EPP, e informar cualquier condición insegura.']],
      des:[
        ['Requisitos previos',['Solo podrá trabajar en altura el personal con examen ocupacional de altura vigente y capacitación en este procedimiento.','Revisar el estado del arnés, la cola de seguridad y los puntos de anclaje antes de cada uso.','Delimitar y señalizar el área bajo el trabajo con conos o cintas para evitar el paso de personas.','No trabajar en altura con lluvia intensa, viento sobre 35 km/h o tormenta eléctrica.']],
        ['Alza hombre',['La operación del alza hombre solo está permitida a operadores capacitados y autorizados, y debe mantenerse el manual del equipo a su alcance.','No exceder la capacidad de carga indicada por el fabricante y distribuir la carga de forma uniforme.','No operar cerca de líneas eléctricas energizadas.','Todo el personal en la plataforma debe usar arnés anclado al punto designado y mantener la puerta cerrada.','Subir y bajar solo por la puerta con la plataforma completamente abajo; nunca caminar por la pluma.','No colocar escaleras, cajones u objetos sobre la plataforma para alcanzar mayor altura.']],
        ['Andamios',['Montar sobre una base firme y nivelada, con todas sus piezas, crucetas y barandas.','Asegurar el andamio a una estructura estable cuando su altura lo requiera.','Acceder por la escala del andamio, nunca trepando por los marcos.','Inspeccionar el andamio antes de cada jornada.']],
        ['Escaleras',['Usar solo escaleras tipo tijera en buen estado, inspeccionadas antes de su uso.','Apoyarlas sobre superficie firme, abiertas completamente y con el seguro puesto.','Mantener tres puntos de apoyo al subir y bajar; no usar los dos últimos peldaños.','No trasladar la escalera con una persona sobre ella.']]],
      ries:[['Trabajo sobre plataforma, andamio o escalera a más de 1,8 m','Caída de altura (distinto nivel)','Examen de altura vigente; arnés de cuerpo completo con absorbedor de energía anclado a un punto resistente; barandas completas; inspección previa de equipos.'],['Subida y bajada de andamios, escaleras y plataformas','Caída de distinto nivel','Tres puntos de apoyo; acceder solo por la escala del andamio o la puerta de la plataforma; manos libres al subir; no trepar por los marcos.'],['Uso de escalera tijera','Caída de distinto nivel y al mismo nivel','Escalera abierta, con seguro y sobre superficie firme; no usar los dos últimos peldaños; no trasladarla con una persona encima.'],['Anclaje inadecuado o falla del arnés','Caída de altura','Anclar solo a puntos aprobados y resistentes; revisar arnés, cola y mosquetones antes de cada uso; retirar todo equipo dañado o que haya detenido una caída.'],['Trabajador suspendido del arnés tras una caída','Trauma por suspensión','Plan de rescate en altura; nunca trabajar solo; rescate en el menor tiempo posible.'],['Andamio mal montado, sin base firme o sin arriostrar','Colapso del andamio, caída de altura, aplastamiento','Montaje por personal competente; base firme y nivelada; crucetas y barandas completas; inspección antes de cada jornada.'],['Herramientas y materiales en altura','Golpeado por objetos que caen','Amarrar las herramientas; rodapiés; delimitar y señalizar el área inferior; casco con barbiquejo.'],['Operación del alza hombre','Volcamiento, atrapamiento, aplastamiento','Superficie firme y nivelada; respetar la carga máxima; operador capacitado y autorizado (PTS-PREV-02).'],['Cercanía a líneas eléctricas','Contacto eléctrico','Mantener la distancia de seguridad; trabajar solo con circuitos desenergizados; revisar el área antes de elevar.'],['Viento, lluvia o superficies húmedas','Caída de distinto y mismo nivel, pérdida de estabilidad','Suspender el trabajo con viento sobre 35 km/h o lluvia intensa; calzado antideslizante; mantener seca la superficie de trabajo.'],['Traslado y montaje de escaleras y piezas de andamio','Sobreesfuerzo','Técnica de levantamiento; trabajo entre dos personas; respetar los límites de la Ley N° 20.949.'],['Trabajo en exteriores','Exposición a radiación UV','Bloqueador solar, lentes con filtro UV e hidratación.']],
      rescateTit:'Plan de rescate en altura', rescate:[['Antes de iniciar el trabajo',['Ningún trabajo en altura se inicia sin un plan de rescate definido para esa faena: cómo se llegará al trabajador, con qué equipos y quién lo hará.','Nunca trabajar solo en altura: al menos una persona capacitada permanece en el nivel inferior, atenta y con comunicación (radio o teléfono).','Tener disponible el equipo de rescate: alza hombre, plataforma o escalera para alcanzar al trabajador, kit de rescate y descenso cuando corresponda, y botiquín.','Conocer los números de emergencia (Ambulancia 131 · Rescate Mutual 1407) y el procedimiento de emergencia del mandante.']],['Si un trabajador queda suspendido del arnés',['Dar la alarma de inmediato, detener los trabajos y avisar al supervisor, al mandante y a los servicios de emergencia.','No dejar a la persona suspendida: el rescate se hace lo antes posible (idealmente en menos de 15 minutos) por el riesgo de trauma por suspensión.','Mientras llega la ayuda, hablarle, mantenerlo tranquilo y pedirle que mueva las piernas o se apoye en una estructura si puede.','Llegar al trabajador desde una posición segura (alza hombre, plataforma o escalera), con el rescatista siempre anclado: nadie se expone a una caída para rescatar.']],['Rescate y atención',['Bajar al trabajador de forma controlada hasta el suelo o una superficie segura.','Mantenerlo en reposo, vigilar su conciencia y respiración, prestar primeros auxilios y trasladarlo a evaluación médica aunque se vea bien.','Si no responde o no respira normalmente: llamar al 131 e iniciar RCP (capacitación de primeros auxilios CAP-PREV-02).']],['Después del rescate',['Retirar de uso el arnés y la cola que detuvieron la caída.','Informar el accidente, emitir la DIAT y realizar la investigación según el procedimiento PR-PREV-03.','Practicar este plan con un simulacro de rescate en altura al menos una vez al año.']]], cambios:[['03','14-10-2026','Observaciones del mandante: se amplía la evaluación de riesgos (caída de altura y de distinto nivel en cada situación, anclajes, trauma por suspensión, andamios, viento y sobreesfuerzo) y se agrega el plan de rescate en altura.']], f02:'oct. 2026',
      epp:['Casco con barbiquejo','Arnés de seguridad de cuerpo completo con cola y absorbedor de energía','Antiparras o lentes de seguridad','Guantes','Calzado de seguridad','Protección auditiva','Chaleco reflectante'] },
    pts_alzahombre:{ cod:'PTS-PREV-02', titulo:'Alza hombre / grúa Genie', orig:'2022',
      obj:'Establecer la metodología para la operación segura del alza hombre (grúa Genie) en las tareas de limpieza en altura, manteniendo controlados los riesgos para las personas y los equipos.',
      alc:'Aplica a todos los trabajos realizados por personal de '+EMP.rz+' que utilicen alza hombre para la ejecución de faenas de limpieza y desinfección.',
      norm:NORM_BASE.concat(['NCh 1258, equipos de protección personal para trabajos con riesgo de caída.','Manual de operación del fabricante del equipo.']),
      resp:[['Gerencia','Proporcionar los recursos necesarios y fiscalizar el cumplimiento de este procedimiento.'],['Supervisor','Instruir al personal, autorizar a los operadores y exigir que el equipo entregado por el mandante esté en perfectas condiciones.'],['Prevención de riesgos','Capacitar, registrar la entrega de este procedimiento y verificar su cumplimiento en terreno.'],['Operador y ayudantes','Cumplir este procedimiento en todos los trabajos con alza hombre.']],
      des:[
        ['Antes de la operación',['Operar solo si está capacitado y autorizado; mantener el manual del equipo al alcance.','Inspeccionar controles, frenos, bocina, baterías o combustible, neumáticos y fugas hidráulicas.','No operar con viento sobre 35 km/h ni cerca de líneas eléctricas energizadas.','No exceder los límites de carga del fabricante.']],
        ['Conducción',['Estar atento a obstáculos alrededor y sobre la máquina.','Usar velocidad baja en pendientes, lugares estrechos y marcha atrás, y antes de detenerse.','Hacer sonar la bocina en zonas de visión obstruida.','Mantener a las personas ajenas a la operación a un mínimo de 2 metros de la máquina.','No conducir cerca de excavaciones, andenes de carga o desniveles, ni sobre superficies blandas o irregulares.']],
        ['Operación en la plataforma',['Usar arnés anclado a la plataforma y mantener la puerta cerrada en todo momento.','Subir y bajar solo por la puerta, con la plataforma completamente abajo.','No colocar escaleras ni objetos para lograr mayor alcance; ambos pies sobre el piso de la plataforma.','No fijar letreros u objetos que aumenten la superficie expuesta al viento.','Nunca usar la pluma como grúa ni empujar o tirar objetos con ella.','Si la máquina queda trabada, todo el personal debe bajar antes de intentar liberarla.','Delimitar el área de trabajo con vallas o conos.','La operación temeraria o imprudente está prohibida.']]],
      ries:[['Trabajo en la plataforma elevada','Caída de altura (distinto nivel)','Arnés de cuerpo completo anclado al punto de la plataforma; puerta cerrada; ambos pies en el piso de la plataforma; no inclinarse sobre las barandas.'],['Subida y bajada de la plataforma','Caída de distinto nivel','Subir y bajar solo con la plataforma completamente abajo y por la puerta; tres puntos de apoyo.'],['Uso de escaleras u objetos sobre la plataforma','Caída de altura','Prohibido; si no se alcanza el punto de trabajo, reposicionar el equipo.'],['Desplazamiento y posicionamiento del equipo','Volcamiento, golpes, atropello','Terreno firme y nivelado, sin pendientes ni zanjas; velocidad baja; estabilizadores cuando corresponda; personas a 2 m de la máquina.'],['Movimiento de la pluma y elevación','Atrapamiento o aplastamiento contra estructuras','Verificar el espacio libre arriba, abajo y a los costados; movimientos lentos; atención a vigas y techos.'],['Cercanía a instalaciones eléctricas','Contacto eléctrico','Mantener la distancia de seguridad; trabajar solo con circuitos desenergizados.'],['Viento','Volcamiento, pérdida de estabilidad','No elevar con viento sobre 35 km/h; no fijar letreros u objetos que aumenten la superficie expuesta al viento.'],['Falla mecánica o hidráulica en altura','Trabajador atrapado en altura','Inspección previa; conocer los mandos de descenso de emergencia; Plan de rescate en altura.'],['Herramientas y materiales en la plataforma','Caída de objetos sobre personas','Amarrar las herramientas; delimitar el área bajo la plataforma; casco con barbiquejo.'],['Carga de baterías o combustible','Incendio, contacto con químicos','Cargar en un lugar ventilado y lejos de chispas; guantes y lentes de seguridad.']],
      rescateTit:'Plan de rescate en altura', rescate:[['Antes de iniciar el trabajo',['Ningún trabajo en altura se inicia sin un plan de rescate definido para esa faena: cómo se llegará al trabajador, con qué equipos y quién lo hará.','Nunca trabajar solo en altura: al menos una persona capacitada permanece en el nivel inferior, atenta y con comunicación (radio o teléfono).','Tener disponible el equipo de rescate: alza hombre, plataforma o escalera para alcanzar al trabajador, kit de rescate y descenso cuando corresponda, y botiquín.','Conocer los números de emergencia (Ambulancia 131 · Rescate Mutual 1407) y el procedimiento de emergencia del mandante.','Conocer la ubicación y el uso de los mandos de descenso de emergencia en la base del equipo: si la plataforma falla en altura, se baja con esos mandos o con el mando auxiliar del fabricante.']],['Si un trabajador queda suspendido del arnés',['Dar la alarma de inmediato, detener los trabajos y avisar al supervisor, al mandante y a los servicios de emergencia.','No dejar a la persona suspendida: el rescate se hace lo antes posible (idealmente en menos de 15 minutos) por el riesgo de trauma por suspensión.','Mientras llega la ayuda, hablarle, mantenerlo tranquilo y pedirle que mueva las piernas o se apoye en una estructura si puede.','Llegar al trabajador desde una posición segura (alza hombre, plataforma o escalera), con el rescatista siempre anclado: nadie se expone a una caída para rescatar.','Si el equipo queda detenido en altura, el operador permanece en la plataforma, anclado, y espera el descenso de emergencia: nunca descolgarse ni trepar por la pluma.']],['Rescate y atención',['Bajar al trabajador de forma controlada hasta el suelo o una superficie segura.','Mantenerlo en reposo, vigilar su conciencia y respiración, prestar primeros auxilios y trasladarlo a evaluación médica aunque se vea bien.','Si no responde o no respira normalmente: llamar al 131 e iniciar RCP (capacitación de primeros auxilios CAP-PREV-02).']],['Después del rescate',['Retirar de uso el arnés y la cola que detuvieron la caída.','Informar el accidente, emitir la DIAT y realizar la investigación según el procedimiento PR-PREV-03.','Practicar este plan con un simulacro de rescate en altura al menos una vez al año.']]], cambios:[['03','14-10-2026','Observaciones del mandante: se amplía la evaluación de riesgos (caída de altura y de distinto nivel, aplastamiento contra estructuras, viento, falla del equipo en altura) y se agrega el plan de rescate en altura con el descenso de emergencia.']], f02:'oct. 2026',
      epp:['Casco con barbiquejo','Arnés de seguridad de cuerpo completo','Antiparras o lentes de seguridad','Guantes','Calzado de seguridad','Protección auditiva','Chaleco reflectante'] },
    pts_quimicos:{ cod:'PTS-PREV-03', titulo:'Uso y manipulación de productos químicos en aseo industrial', orig:'17-10-2022',
      obj:'Asegurar que todo el personal de '+EMP.rz+' que utiliza productos químicos industriales conozca sus obligaciones, los riesgos, las medidas preventivas y las buenas prácticas para su uso correcto.',
      alc:'Aplica a todo el personal que utiliza o manipula productos químicos en las faenas de limpieza y sanitización, en las instalaciones de la empresa y de sus clientes.',
      norm:NORM_BASE.concat(['D.S. N° 43 de 2015 del Ministerio de Salud, almacenamiento de sustancias peligrosas.','NCh 2245, hoja de datos de seguridad de productos químicos.','NFPA 704, sistema de identificación de riesgos (rombo).']),
      resp:[['Gerencia','Proporcionar los recursos necesarios y fiscalizar el cumplimiento de este procedimiento.'],['Jefe de higiene / supervisor','Instruir al personal; controlar bodegas y stock; exigir el uso de EPP; está autorizado para dosificar y diluir químicos.'],['Capataz','Controlar la bodega interna, supervisar el uso de EPP e instruir a los operarios; está autorizado para dosificar y diluir.'],['Encargado / responsable de químicos','Dosificar y diluir los productos, mantener el orden de la bodega y entregar los químicos diluidos a los operarios.'],['Trabajador','Cumplir este procedimiento. Prohibido manipular químicos puros o sin diluir: debe solicitarlos al supervisor, capataz o responsable de químicos.']],
      des:[
        ['Recomendaciones generales',['Usar en todo momento los EPP indicados en la hoja de datos de seguridad (HDS).','La bodega de químicos debe estar ventilada, con piso no poroso, cerrada con candado y señalizada (solo personal autorizado, no fumar, peligro sustancias químicas).','Mantener las HDS y fichas técnicas disponibles en la bodega y en el lugar de trabajo.','Todo envase debe estar rotulado, en buen estado, sin filtraciones y con su tapa. Informar de inmediato un envase sin rótulo.','Almacenar los productos segregados por compatibilidad; los envases sobre 25 litros se trasvasijan con bomba, nunca volteándolos.','Prohibido fumar, comer o beber en áreas de almacenamiento o uso de químicos.','No usar productos puros sin diluir y nunca mezclar productos químicos.']],
        ['Antes de utilizar un producto',['Solicitar el producto al supervisor, quien entrega los químicos diluidos o designa a una persona capacitada.','Si no conoce el producto, leer su HDS y pedir capacitación a su jefatura.']],
        ['Trasvasije (solo personal autorizado)',['Leer la etiqueta del producto.','Lavar el embudo, jarra o balde antes de usarlo.','Trasvasijar con embudo a un envase limpio y rotulado con el nombre del producto.','Respetar la dosificación indicada por la jefatura o publicada en la bodega.','Tapar el envase original y devolverlo a su lugar.']],
        ['Uso del producto en el aseo',['Usar solo la cantidad necesaria; no introducir la mano en el balde, solo la esponja.','No dejar rociadores o envases con producto al alcance de terceros.','Secuencia de limpieza de estructuras y líneas: 1) barrido húmedo de arriba hacia abajo; 2) aplicación de detergente con espumadora; 3) acción mecánica con esponja abrasiva; 4) enjuague total; 5) aplicación de sanitizante.','No proyectar agua sobre tableros, motores o cableado eléctrico.']],
        ['Actuación en caso de derrame',['Eliminar fuentes de ignición y ventilar la zona.','Si siente malestar, evacuar e informar a la jefatura.','El personal capacitado contiene el derrame con material absorbente (arena, aserrín, paños).','Descontaminar con agua y jabón; disponer el material en un recipiente con tapa, rotulado como residuo peligroso.']],
        ['Primeros auxilios',['Inhalación: llevar a la persona a un lugar ventilado, mantenerla en reposo y pedir asistencia médica.','Contacto con la piel: enjuagar con abundante agua, lavar con agua y jabón y retirar la ropa contaminada.','Contacto con los ojos: lavar con abundante agua durante 15 minutos; si persiste la molestia, acudir al centro asistencial.','Ingestión: no inducir el vómito; seguir la HDS del producto y acudir al centro asistencial.']],
        ['Hojas de datos de seguridad y rombo NFPA 704',['La HDS indica la identificación del producto, sus peligros, primeros auxilios, manejo, almacenamiento, EPP y actuación ante derrames e incendios.','Rombo NFPA 704: azul = salud, rojo = inflamabilidad, amarillo = reactividad (escala de 0 a 4), blanco = riesgos especiales (oxidante, corrosivo, etc.).']]],
      ries:[['Manipulación y aplicación de químicos','Contacto, quemadura química, proyección a los ojos','Guantes de nitrilo, antiparras o careta facial, pechera PVC; HDS disponible.'],['Vapores en lugares cerrados','Intoxicación por inhalación','Ventilación; mascarilla con filtro según HDS.'],['Mezcla de productos','Reacción química','Prohibido mezclar; usar solo diluciones autorizadas.'],['Pisos con espuma o agua','Caída al mismo nivel','Calzado antideslizante; señalizar el área.'],['Traslado de bidones','Golpes, sobreesfuerzo','Uso de bomba y carro; técnica de levante.']],
      epp:['Guantes de nitrilo','Antiparras, lentes de seguridad o careta facial, según el caso','Mascarilla o respirador con filtro según HDS','Pechera o traje de PVC','Botas o calzado de seguridad'] },
    pts_extintores:{ cod:'PTS-PREV-04', titulo:'Uso y manejo de extintores', orig:'2022',
      obj:'Establecer los estándares y medidas de control para el uso adecuado de los extintores ante un amago de incendio, evitando accidentes y daños.',
      alc:'Aplica a todo el personal de '+EMP.rz+', en sus tareas internas y en la prestación de servicios a clientes.',
      norm:NORM_BASE.concat(['NCh 934, clasificación de fuegos.','NCh 1433, ubicación y señalización de extintores.','D.S. N° 594, artículos sobre prevención y protección contra incendios.']),
      resp:[['Gerencia','Proporcionar los recursos y mantener los extintores con su mantención al día.'],['Supervisor','Verificar la ubicación y el estado de los extintores en la faena e instruir al personal.'],['Prevención de riesgos','Capacitar al personal y registrar la entrega de este procedimiento.'],['Trabajador','Conocer la ubicación de los extintores, usarlos correctamente e informar todo amago de incendio.']],
      des:[
        ['El fuego y sus clases (NCh 934)',['El fuego requiere combustible, oxígeno y calor; al eliminar uno de ellos se extingue.','Clase A (triángulo verde): sólidos comunes como madera, papel, género o plástico.','Clase B (cuadrado rojo): líquidos y gases inflamables como bencina, pinturas o gas.','Clase C (círculo azul): equipos eléctricos energizados. No usar agua.','Clase D (estrella amarilla): metales combustibles como magnesio o sodio.','Clase K: aceites y grasas de cocina.']],
        ['Tipos de extintor',['Polvo químico seco (PQS): fuegos A, B y C; deja residuo, no se recomienda en áreas de alimentos o equipos delicados.','Dióxido de carbono (CO₂): fuegos B y C; elimina el oxígeno; poco efectivo a la intemperie.','Agua y espuma: fuegos clase A; nunca en fuegos clase C.']],
        ['Ubicación (NCh 1433)',['Colgados en muros o columnas, en lugares de fácil acceso, señalizados y libres de obstáculos.','A una altura máxima de 1,30 m medida desde el suelo hasta la base del extintor.','A una distancia máxima de 23 metros del lugar habitual de trabajo.']],
        ['Uso del extintor',['Dar la alarma y avisar a la jefatura.','Descolgar el extintor más cercano y verificar en el manómetro que esté cargado.','Retirar el seguro, sostener la manguera y ubicarse a unos 3 metros, con el viento a la espalda.','Presionar la manilla y dirigir el chorro a la base del fuego con un movimiento de barrido.','No dar la espalda a la zona extinguida por posibles reigniciones.']],
        ['Recomendaciones',['El extintor sirve para fuegos incipientes; ante un incendio declarado, evacuar.','Identificar la clase de fuego antes de actuar.','No golpear el extintor: es un recipiente a presión.','Informar todo extintor usado, descargado o con la mantención vencida.']]],
      ries:[['Combate de un amago de incendio','Quemaduras','Actuar solo en fuegos incipientes; distancia de 3 m; viento a la espalda.'],['Uso de agente inadecuado','Electrocución, propagación del fuego','Identificar la clase de fuego; no usar agua en fuegos eléctricos.'],['Humo y gases','Intoxicación','Evacuar si el fuego no se controla; no ingresar a recintos con humo.']],
      epp:['Calzado de seguridad','Guantes','Antiparras o lentes de seguridad'] },
    pts_confinados:{ cod:'PTS-PREV-05', titulo:'Trabajo seguro en espacios confinados', orig:'03-05-2023',
      obj:'Definir los requerimientos de seguridad y permisos para ingresar y trabajar en espacios confinados, minimizando la exposición de los trabajadores a sus peligros.',
      alc:'Aplica a todo trabajador de '+EMP.rz+' que ingrese o apoye trabajos en espacios confinados, como estanques, tolvas, cámaras de RIL, silos, ductos o fosas, en las instalaciones de la empresa y de sus clientes.',
      norm:NORM_BASE.concat(['Guía técnica para trabajos en espacios confinados del Instituto de Salud Pública (ISP).','Procedimientos de permiso de trabajo y bloqueo de la empresa mandante.']),
      resp:[['Gerencia','Asegurar que este procedimiento se cumpla y que el personal esté capacitado.'],['Persona competente (supervisor)','Evaluar el espacio, determinar las medidas de seguridad, emitir o rechazar el permiso de entrada y detener el trabajo ante cualquier riesgo.'],['Analista de atmósfera','Medir oxígeno, gases tóxicos e inflamables antes y durante el trabajo, con equipo calibrado.'],['Vigía','Permanecer en el acceso, controlar entradas y salidas, mantener la comunicación y activar el rescate. No ingresa al espacio.'],['Trabajador entrante','Conocer los peligros, cumplir el permiso, usar sus EPP y salir de inmediato ante una alarma.']],
      des:[
        ['Definición',['Espacio confinado: lugar no diseñado para ocupación continua, con entrada o salida restringida, que puede tener atmósfera peligrosa, riesgo de inmersión, atrapamiento o elementos móviles.','Ejemplos: estanques, tolvas, cámaras y canaletas de RIL, silos, ductos, alcantarillas y espacios sobre cielo raso.','Se considera que una persona ingresó cuando cualquier parte de su cuerpo traspasa la abertura.']],
        ['Permiso de entrada',['Ningún trabajo en un espacio confinado puede iniciar sin el permiso correspondiente, firmado por la persona competente.','El permiso registra las entradas y salidas, es válido por una jornada y debe permanecer en el lugar.','Aplicar bloqueo con candado y tarjeta personal por cada persona que ingrese (control de energías peligrosas).','El acceso debe señalizarse: “Peligro – Espacio confinado – No entrar – Permiso requerido”.']],
        ['Preparación para la entrada',['Aislar líneas, cañerías y energías; bloquear válvulas.','Limpiar, descontaminar y ventilar el espacio.','Medir la atmósfera: oxígeno entre 19,5% y 23,5%, inflamables bajo el 10% del límite inferior de explosividad y tóxicos bajo los límites permitidos.','Repetir la medición al inicio de cada turno y monitorear en forma continua cuando la tarea pueda generar gases.','Definir los medios de acceso, salida y rescate antes de ingresar.']],
        ['Durante el trabajo',['El vigía permanece en el acceso durante todo el trabajo.','Usar arnés y línea de vida cuando exista riesgo de caída o para un eventual rescate.','Equipos eléctricos con protección diferencial, cables sin daños y, de preferencia, herramientas con doble aislamiento.','Trabajos en caliente requieren un permiso adicional.']],
        ['Rescate y emergencias',['El vigía activa el rescate y presta primeros auxilios desde el exterior; nunca ingresa sin ayuda y sin equipo.','No mover a la persona afectada hasta que llegue personal capacitado, salvo peligro inminente.','Al terminar, la persona competente verifica que no quede nadie dentro antes de cerrar el espacio.']]],
      ries:[['Atmósfera con poco oxígeno o gases','Asfixia, intoxicación, explosión','Medición de gases, ventilación, permiso de entrada y vigía.'],['Energías no controladas','Atrapamiento, electrocución','Bloqueo con candado y tarjeta personal.'],['Acceso y salida restringidos','Caídas, golpes','Arnés y línea de vida; escalas seguras.'],['Equipos y herramientas','Contacto eléctrico, proyección de partículas','Protección diferencial; EPP; herramientas en buen estado.'],['Condiciones del espacio','Estrés térmico, inmersión','Pausas; control de líquidos; vigía permanente.']],
      epp:['Casco con barbiquejo','Arnés de cuerpo completo con línea de vida','Respirador con filtro o equipo de aire según la medición','Antiparras o careta facial','Guantes según la tarea','Calzado de seguridad','Detector de gases personal cuando se requiera'] },
    pts_herramientas:{ cod:'PTS-PREV-06', titulo:'Uso de herramientas en faena de limpieza de estanques', orig:null, aplica:'Limpieza de estanques',
      obj:'Establecer la forma segura de inspeccionar, usar, mantener y guardar las herramientas manuales, eléctricas, de alta presión y de medición empleadas en la limpieza de estanques, para prevenir lesiones a los trabajadores y daños a los equipos.',
      alc:'Aplica a todo trabajador de '+EMP.rz+' que participe en faenas de limpieza de estanques (agua dulce, agua salada, flow ice, RIL y similares) en las instalaciones de los clientes. Como un estanque es un espacio confinado, este procedimiento se aplica junto con el PTS de espacios confinados (PTS-PREV-05).',
      norm:NORM_BASE.concat(['PTS espacios confinados de la empresa (PTS-PREV-05) y guía técnica del ISP para trabajos en espacios confinados.','Ley N° 20.949, sobre manejo manual de carga.','Instrucciones del fabricante de cada herramienta y equipo, y normas de la empresa mandante.']),
      resp:[['Gerencia','Proporcionar herramientas en buen estado, su mantención y reposición, y fiscalizar el cumplimiento de este procedimiento.'],
        ['Supervisor','Verificar la inspección diaria de herramientas, autorizar el uso del esmeril, el taladro y la hidrolavadora solo a personal capacitado, y retirar del uso toda herramienta defectuosa.'],
        ['Prevención de riesgos','Capacitar al personal, revisar el cumplimiento en terreno y controlar la calibración del medidor de gases.'],
        ['Trabajador','Usar cada herramienta solo para su fin, inspeccionarla antes de usarla, informar cualquier daño y devolverla limpia a su caja al terminar.']],
      des:[
        ['Antes de iniciar',['Realizar la charla de inicio y el análisis de riesgos de la tarea con todo el equipo.','Contar con el permiso de trabajo del mandante y el permiso de entrada a espacio confinado; el estanque debe estar vaciado, aislado y bloqueado.','Medir la atmósfera con el medidor de gases antes de ingresar, desde el exterior y a distintas alturas (arriba, medio y fondo).','Inspeccionar cada herramienta con la tabla de la sección 6 y retirar las que estén en mal estado.','Ubicar las herramientas en su caja o bolso, fuera del paso, y bajarlas al estanque con cuerda o balde, nunca lanzándolas.']],
        ['Herramientas manuales (llaves, dados, llave de torque, palas, cuchillo)',['Usar la herramienta adecuada a cada tarea y a la medida del perno o tubería; no usar llaves como martillo ni palas como palanca.','No alargar el mango de las llaves con tubos; si un perno no cede, aplicar desoxidante o pedir apoyo.','Tirar de la llave en vez de empujarla, con el cuerpo en posición estable y las manos fuera de la trayectoria.','La llave de torque se usa solo para el apriete final al valor indicado; después de usarla se deja en su valor mínimo.','Con las palas, cargar poco material por vez, doblar las rodillas, no girar el tronco con carga y alternar la tarea.','El cuchillo se usa con corte alejado del cuerpo y de las manos, con guantes anticorte, y se guarda siempre en su funda.']],
        ['Herramientas eléctricas y a batería (taladro de impacto, esmeril)',['Solo personal capacitado y autorizado; dentro del estanque se usan de preferencia herramientas a batería.','Verificar carcasa, batería, interruptor y brocas o discos antes de usar; el esmeril debe tener su guarda puesta.','El disco de corte debe ser el adecuado al material y a las revoluciones del esmeril, sin fisuras; esperar la detención total antes de dejarlo.','El esmeril genera chispas: dentro del estanque requiere permiso de trabajo en caliente, medición de gases continua y ventilación; nunca en presencia de gases o vapores inflamables.','Retirar la batería antes de cambiar brocas o discos, y no tirar del equipo por el cable.']],
        ['Hidrolavadora',['La opera solo personal capacitado; revisar mangueras, acoples, gatillo y seguro antes de encender.','Conectar a una red con protección diferencial y mantener el equipo y las conexiones lejos del agua.','Nunca apuntar el chorro a personas, al propio cuerpo ni a tableros, motores o cableado eléctrico.','Sujetar la lanza con ambas manos y en posición firme; poner el seguro del gatillo en cada pausa.','Apagar y liberar la presión antes de desconectar o cambiar boquillas.']],
        ['Medidor de gases',['Hacer la prueba de funcionamiento (bump test) al inicio de cada jornada y verificar que la calibración esté vigente.','Valores para ingresar: oxígeno entre 19,5% y 23,5%, gases inflamables bajo el 10% del límite inferior de explosividad, y H₂S y CO bajo los límites permitidos.','Mantener el monitoreo durante todo el trabajo; ante una alarma, todo el personal sale de inmediato y no se reingresa hasta una nueva medición segura.','Registrar las mediciones y guardar el equipo en su bolso, protegido del agua y los golpes.']],
        ['Al terminar',['Contar las herramientas al salir del estanque para no dejar ninguna dentro.','Limpiar, secar y guardar cada herramienta en su caja; cargar las baterías.','Informar al supervisor toda herramienta dañada o faltante.']]],
      herr:[
        ['Llave de cadena','1','Desarmar y ajustar tuberías y uniones de gran diámetro.','Cadena sin eslabones dañados ni estirados; mango sin fisuras.'],
        ['Juego de dados','1','Apernar y desapernar tapas, bridas y soportes.','Dados sin fisuras ni bordes redondeados; chicharra con el trinquete funcionando.'],
        ['Llave de torque','1','Apriete final de pernos al valor indicado.','Escala legible, calibración vigente; guardada en su valor mínimo.'],
        ['Taladro de impacto','1','Perforar y apernar en estructuras.','Carcasa sin daños, batería cargada, broca firme, interruptor funcionando.'],
        ['Esmeril a batería con 2 discos de corte','1','Cortar pernos oxidados y amarras metálicas.','Guarda puesta, disco correcto sin fisuras, mango lateral, batería en buen estado.'],
        ['Caja de hidrolavadora','1','Lavado a presión de paredes y fondo del estanque.','Mangueras y acoples sin fugas, gatillo con seguro, boquillas completas.'],
        ['Pala blanca grande','1','Retiro de lodos y sólidos blandos.','Hoja sin trizaduras, mango firme.'],
        ['Pala de metal','','Retiro de sedimentos compactos.','Hoja sin filos dañados, mango sin astillas.'],
        ['Pala carbonera','','Carga de material suelto a baldes o contenedores.','Hoja firme al mango, sin deformaciones.'],
        ['Palas olleras','2','Retiro de sólidos desde el fondo y las esquinas.','Hoja y mango firmes, sin fisuras.'],
        ['Cuchillo grande amarillo','1','Cortar amarras, mallas y plásticos.','Hoja firme al mango, con su funda.'],
        ['Llave regulable (caimán)','1','Ajuste de pernos y tuercas de distintas medidas.','Mandíbula sin juego, tornillo de ajuste funcionando.'],
        ['Llave Stilson grande','','Sujetar y girar tubos y fittings.','Dientes sin desgaste, mandíbula sin juego.'],
        ['Medidor de gases con su bolso','1','Medir oxígeno, gases inflamables, H₂S y CO antes y durante el trabajo.','Prueba de funcionamiento del día, calibración vigente, batería cargada, alarmas funcionando.']],
      ries:[['Uso de llaves, dados y llave de cadena','Golpes, atrapamiento de dedos, sobreesfuerzo','Herramienta adecuada, sin alargadores; tirar en vez de empujar; guantes.'],
        ['Uso de palas y retiro de lodos','Lesiones musculoesqueléticas, caídas al mismo nivel','Cargas pequeñas, técnica de levante, pausas y rotación; calzado antideslizante.'],
        ['Uso del cuchillo','Cortes','Corte alejado del cuerpo, guantes anticorte, funda.'],
        ['Uso del esmeril','Proyección de partículas, cortes, incendio o explosión por chispas','Guarda puesta, careta facial y antiparras, permiso de trabajo en caliente y medición continua de gases.'],
        ['Uso del taladro de impacto','Atrapamiento, proyección de partículas, contacto eléctrico','Preferir batería; ropa sin partes sueltas; antiparras; no usar con agua.'],
        ['Uso de la hidrolavadora','Inyección de agua en la piel, proyección, contacto eléctrico','No apuntar a personas ni equipos eléctricos; seguro en el gatillo; protección diferencial.'],
        ['Atmósfera dentro del estanque','Asfixia, intoxicación, explosión','Medición de gases antes y durante, ventilación, vigía y permiso de entrada (PTS-PREV-05).'],
        ['Superficies húmedas y con lodo','Caídas al mismo y distinto nivel','Calzado de seguridad antideslizante; acceso por escala segura; arnés cuando corresponda.']],
      epp:['Casco de seguridad','Antiparras; careta facial al usar el esmeril o la hidrolavadora','Guantes según la tarea: anticorte para el cuchillo, de goma o nitrilo para lodos y agua','Botas de seguridad de goma','Traje impermeable','Protección auditiva','Respirador con filtro según la medición de gases','Arnés de cuerpo completo y línea de vida para ingreso y rescate'],
      registros:['Inspección diaria de herramientas (tabla de la sección 6).','Permiso de entrada al espacio confinado y registro de mediciones de gases.','Permiso de trabajo en caliente cuando se use el esmeril.'] },
    pts_frigorifico:{ cod:'PTS-PREV-07', titulo:'Limpieza de cámaras frigoríficas', orig:'P-09 · 17-07-2024',
      obj:'Realizar la limpieza profunda de las cámaras frigoríficas de forma segura, definiendo el método de trabajo y las medidas de control de los riesgos de la tarea.',
      alc:'Todas las superficies disponibles para su limpieza dentro de la cámara: pisos, paredes, cielo, puertas y estructuras. Aplica al personal de '+EMP.rz+' que realiza esta tarea en las faenas de los clientes.',
      norm:NORM_BASE,
      resp:[['Encargado de faena','Es el responsable de ejecutar este procedimiento y de que se cumpla en terreno.'],
        ['Supervisor','Autorizar al personal capacitado, mantener los equipos con conexión eléctrica seca y sin cables en el piso, y revisar que los sistemas de seguridad estén activados.'],
        ['Operador de limpieza','Revisar que todo esté desconectado, mover y despejar la zona de trabajo, verificar el espacio de trabajo y usar los EPP requeridos.'],
        ['Prevención de riesgos','Instruir al personal en este procedimiento y registrar su entrega. Si la empresa mandante lo requiere, previo acuerdo, se considera un experto en prevención de riesgos de tiempo completo.']],
      des:[
        ['Descripción del proceso',['La limpieza de las cámaras se realiza en semi húmedo, sin aplicación directa de agua, para evitar que el agua se congele por las bajas temperaturas.','Limpieza de pisos con máquina abrillantadora, siempre que la temperatura ambiente sea favorable para este proceso.','Limpieza de paredes con telescópicas para las zonas bajas.','Limpieza de racks y retiro de óxido.','Limpieza de puertas.']],
        ['Antes de comenzar',['El aseo y la mantención deben ser ejecutados por personal capacitado y autorizado por la supervisión.','Verificar que los espacios estén ordenados, las superficies despejadas y los equipos de limpieza asegurados.','Si aplica, la máquina debe quedar con el sistema de bloqueo habilitado y señalizado.']],
        ['Verificación del supervisor',['Mantener los equipos con conexión eléctrica seca y sin cables en el piso.','Revisar que los sistemas de seguridad estén activados.']],
        ['Verificación del operador de limpieza',['Revisar que todo esté desconectado.','Mover y despejar la zona de trabajo.','Verificar el espacio de trabajo.']],
        ['Método de trabajo',['Aplicar acción mecánica en las superficies y estructuras disponibles dentro de la cámara.','Limpiar la plataforma y los equipos de frío.','Limpiar los pisos con máquina abrillantadora y pad de piso.','Para zócalos y pisos, usar paños de piso con ojal con aplicación de detergente.','Limpiar las puertas.','Para finalizar, eliminar toda el agua con barre agua hacia el exterior.','Pasar paños húmedos para el secado final.']]],
      ries:[['Limpieza de racks, estructuras y retiro de óxido','Contacto con objetos cortantes','Uso de guantes; revisar bordes y piezas oxidadas antes de limpiar; trabajar sin apuro.'],
        ['Uso de máquina abrillantadora y equipos eléctricos','Contacto con electricidad','Conexión eléctrica seca y sin cables en el piso; equipos desconectados al intervenirlos; bloqueo habilitado y señalizado cuando aplique.'],
        ['Permanencia en la cámara','Exposición a bajas temperaturas','Chaqueta térmica cuando se requiera; limpieza semi húmeda, sin aplicación directa de agua.'],
        ['Pisos húmedos durante y al final de la limpieza','Caída al mismo nivel','Zona de trabajo despejada; retirar el agua con barre agua y secar con paños; botas de goma.'],
        ['Traslado de la máquina abrillantadora, baldes y equipos','Sobreesfuerzo','Técnica de levantamiento; carros o ayudas mecánicas; trabajo entre dos personas; respetar los límites de la Ley N° 20.949.'],['Fregado de pisos y paredes y uso de telescópicas','Trabajo repetitivo, trastornos musculoesqueléticos de extremidades superiores (TMERT)','Pausas activas; rotación de tareas; mangos de largo adecuado; alternar las manos.'],['Limpieza de zócalos, zonas bajas y cielos','Posturas forzadas','Herramientas con mango extensible; alternar posturas; escala segura para las zonas altas.'],['Uso de detergentes y productos de limpieza','Contacto con químicos (irritación de piel y ojos)','Guantes de nitrilo; lentes de seguridad; hoja de datos de seguridad disponible (PTS-PREV-03).'],['Tránsito entre racks y estructuras','Golpes contra objetos','Iluminación adecuada; zona de trabajo despejada; casco.'],['Limpieza de racks con productos almacenados','Caída de objetos','Retirar o asegurar los productos antes de limpiar; no subir a los racks.']],
      cambios:[['03','14-10-2026','Observaciones del mandante: se agregan los riesgos de sobreesfuerzo, trabajo repetitivo, posturas forzadas, contacto con químicos, golpes y caída de objetos.']], f02:'oct. 2026',
      epp:['Casco con barbiquejo','Guantes de nitrilo','Chaqueta térmica, si se requiere','Botas de goma con punta de acero'] }
  };
  // Ilustraciones de referencia de los PTS (SVG propio, colores corporativos; nítidas en el PDF).
  var FIG_N='#1d2a5c', FIG_O='#f26b1d';
  function svgF(vb,body){ return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+vb+'" font-family="Arial,Helvetica,sans-serif">'+body+'</svg>'; }
  var FIG={
    alza: svgF('0 0 160 200',
      '<line x1="28" y1="28" x2="132" y2="28" stroke="'+FIG_N+'" stroke-width="4"/><line x1="30" y1="28" x2="30" y2="52" stroke="'+FIG_N+'" stroke-width="4"/><line x1="130" y1="28" x2="130" y2="52" stroke="'+FIG_N+'" stroke-width="4"/><line x1="80" y1="28" x2="80" y2="52" stroke="'+FIG_N+'" stroke-width="3"/><line x1="30" y1="40" x2="130" y2="40" stroke="'+FIG_N+'" stroke-width="2"/>'+
      '<circle cx="62" cy="13" r="6" fill="'+FIG_O+'"/><line x1="62" y1="19" x2="62" y2="40" stroke="'+FIG_O+'" stroke-width="5" stroke-linecap="round"/><path d="M62 24 Q74 22 80 28" fill="none" stroke="'+FIG_O+'" stroke-width="2"/>'+
      '<rect x="24" y="52" width="112" height="9" rx="2" fill="'+FIG_N+'"/>'+
      '<g stroke="'+FIG_N+'" stroke-width="6" stroke-linecap="round"><line x1="38" y1="62" x2="122" y2="100"/><line x1="122" y1="62" x2="38" y2="100"/><line x1="38" y1="100" x2="122" y2="138"/><line x1="122" y1="100" x2="38" y2="138"/></g>'+
      '<rect x="18" y="138" width="124" height="22" rx="3" fill="'+FIG_N+'"/><circle cx="40" cy="168" r="11" fill="'+FIG_N+'"/><circle cx="120" cy="168" r="11" fill="'+FIG_N+'"/><circle cx="40" cy="168" r="4" fill="#fff"/><circle cx="120" cy="168" r="4" fill="#fff"/>'+
      '<line x1="6" y1="190" x2="154" y2="190" stroke="#c9ccd8" stroke-width="2"/>'),
    andamio: svgF('0 0 160 200',
      '<g stroke="'+FIG_N+'" stroke-width="5" stroke-linecap="round"><line x1="25" y1="18" x2="25" y2="185"/><line x1="135" y1="18" x2="135" y2="185"/><line x1="25" y1="18" x2="135" y2="18"/><line x1="25" y1="34" x2="135" y2="34"/></g>'+
      '<rect x="20" y="48" width="120" height="8" fill="'+FIG_N+'"/><rect x="20" y="116" width="120" height="8" fill="'+FIG_N+'"/>'+
      '<g stroke="'+FIG_O+'" stroke-width="4" stroke-linecap="round"><line x1="25" y1="56" x2="135" y2="116"/><line x1="135" y1="56" x2="25" y2="116"/><line x1="25" y1="124" x2="135" y2="182"/><line x1="135" y1="124" x2="25" y2="182"/></g>'+
      '<rect x="12" y="185" width="26" height="6" fill="'+FIG_N+'"/><rect x="122" y="185" width="26" height="6" fill="'+FIG_N+'"/>'),
    escala: svgF('0 0 140 200',
      '<g stroke="'+FIG_N+'" stroke-width="6" stroke-linecap="round"><line x1="30" y1="188" x2="62" y2="14"/><line x1="108" y1="188" x2="74" y2="14"/><line x1="58" y1="14" x2="78" y2="14"/></g>'+
      '<g stroke="'+FIG_N+'" stroke-width="5" stroke-linecap="round"><line x1="56" y1="46" x2="66" y2="46"/><line x1="50" y1="80" x2="62" y2="80"/><line x1="44" y1="114" x2="56" y2="114"/><line x1="38" y1="148" x2="50" y2="148"/></g>'+
      '<line x1="46" y1="120" x2="94" y2="120" stroke="'+FIG_O+'" stroke-width="4"/><text x="70" y="114" text-anchor="middle" font-size="10" font-weight="bold" fill="'+FIG_O+'">seguro</text>'+
      '<line x1="6" y1="190" x2="134" y2="190" stroke="#c9ccd8" stroke-width="2"/>'),
    arnes: svgF('0 0 140 200',
      '<rect x="50" y="6" width="40" height="10" rx="2" fill="'+FIG_N+'"/><circle cx="70" cy="22" r="6" fill="none" stroke="'+FIG_N+'" stroke-width="3"/>'+
      '<path d="M70 28 q10 8 0 14 q-10 6 0 12 q8 5 0 10" fill="none" stroke="'+FIG_O+'" stroke-width="3"/>'+
      '<circle cx="70" cy="76" r="11" fill="'+FIG_N+'"/>'+
      '<g stroke="'+FIG_N+'" stroke-width="7" stroke-linecap="round"><line x1="70" y1="90" x2="70" y2="140"/><line x1="70" y1="100" x2="46" y2="128"/><line x1="70" y1="100" x2="94" y2="128"/><line x1="70" y1="140" x2="54" y2="190"/><line x1="70" y1="140" x2="86" y2="190"/></g>'+
      '<g stroke="'+FIG_O+'" stroke-width="4" stroke-linecap="round" fill="none"><line x1="60" y1="92" x2="80" y2="136"/><line x1="80" y1="92" x2="60" y2="136"/><line x1="58" y1="138" x2="82" y2="138"/><circle cx="62" cy="150" r="7"/><circle cx="78" cy="150" r="7"/></g>'),
    nfpa: svgF('0 0 160 160',
      '<polygon points="80,8 116,44 80,80 44,44" fill="#d7262e" stroke="#222" stroke-width="2"/><polygon points="44,44 80,80 44,116 8,80" fill="#1f5fbf" stroke="#222" stroke-width="2"/><polygon points="116,44 152,80 116,116 80,80" fill="#f5d000" stroke="#222" stroke-width="2"/><polygon points="80,80 116,116 80,152 44,116" fill="#fff" stroke="#222" stroke-width="2"/>'+
      '<g font-size="9" font-weight="bold" text-anchor="middle"><text x="80" y="47" fill="#fff">Inflamable</text><text x="44" y="83" fill="#fff">Salud</text><text x="116" y="83" fill="#222">Reactivo</text><text x="80" y="119" fill="#222">Especial</text></g>'),
    secuencia: svgF('0 0 520 96', (function(){ var L=[['Barrido','húmedo'],['Detergente','(espuma)'],['Acción','mecánica'],['Enjuague','total'],['Sanitizado','']], s='';
      L.forEach(function(t,i){ var x=52+i*104; s+='<circle cx="'+x+'" cy="30" r="22" fill="'+(i===4?FIG_O:FIG_N)+'"/><text x="'+x+'" y="37" text-anchor="middle" font-size="20" font-weight="bold" fill="#fff">'+(i+1)+'</text><text x="'+x+'" y="72" text-anchor="middle" font-size="12" font-weight="bold" fill="'+FIG_N+'">'+t[0]+'</text><text x="'+x+'" y="87" text-anchor="middle" font-size="11" fill="#55607a">'+t[1]+'</text>'+(i<4?'<path d="M'+(x+28)+' 30 h42" stroke="#c9ccd8" stroke-width="3"/><path d="M'+(x+70)+' 24 l8 6 l-8 6z" fill="#c9ccd8"/>':''); }); return s; })()),
    clases: svgF('0 0 520 112',
      '<polygon points="50,14 84,74 16,74" fill="#1e9a4a"/><text x="50" y="64" text-anchor="middle" font-size="26" font-weight="bold" fill="#fff">A</text>'+
      '<rect x="122" y="16" width="56" height="56" fill="#d7262e"/><text x="150" y="54" text-anchor="middle" font-size="26" font-weight="bold" fill="#fff">B</text>'+
      '<circle cx="250" cy="44" r="30" fill="#1f5fbf"/><text x="250" y="53" text-anchor="middle" font-size="26" font-weight="bold" fill="#fff">C</text>'+
      '<polygon points="350.0,13.0 357.6,34.5 380.4,35.1 362.4,49.0 368.8,70.9 350.0,58.0 331.2,70.9 337.6,49.0 319.6,35.1 342.4,34.5" fill="#f5d000"/><text x="350" y="52" text-anchor="middle" font-size="18" font-weight="bold" fill="#222">D</text>'+
      '<polygon points="477.7,61.0 450.0,77.0 422.3,61.0 422.3,29.0 450.0,13.0 477.7,29.0" fill="#222"/><text x="450" y="54" text-anchor="middle" font-size="24" font-weight="bold" fill="#fff">K</text>'+
      '<g font-size="11" text-anchor="middle" fill="'+FIG_N+'" font-weight="bold"><text x="50" y="96">Sólidos</text><text x="150" y="96">Líquidos inflamables</text><text x="250" y="96">Eléctricos</text><text x="350" y="96">Metales</text><text x="450" y="96">Aceites de cocina</text></g>'),
    pass: svgF('0 0 520 70', (function(){ var L=['Retire el seguro','Apunte a la base','Presione la manilla','Barra de lado a lado'], s='';
      L.forEach(function(t,i){ var x=6+i*128; s+='<rect x="'+x+'" y="8" width="120" height="54" rx="10" fill="'+(i%2?'#fff4ec':'#eef1f9')+'" stroke="'+(i%2?FIG_O:FIG_N)+'" stroke-width="2"/><text x="'+(x+60)+'" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="'+(i%2?FIG_O:FIG_N)+'">'+(i+1)+'</text><text x="'+(x+60)+'" y="49" text-anchor="middle" font-size="11.5" fill="#222">'+t+'</text>'; }); return s; })()),
    senal: svgF('0 0 220 130',
      '<rect x="3" y="3" width="214" height="124" rx="6" fill="#fff" stroke="#222" stroke-width="4"/><rect x="9" y="9" width="202" height="34" rx="3" fill="#d7262e"/><text x="110" y="34" text-anchor="middle" font-size="22" font-weight="bold" fill="#fff">PELIGRO</text>'+
      '<g text-anchor="middle" font-weight="bold" fill="#222"><text x="110" y="66" font-size="15">ESPACIO CONFINADO</text><text x="110" y="88" font-size="15" fill="#d7262e">NO ENTRAR</text><text x="110" y="110" font-size="13">PERMISO REQUERIDO</text></g>'),
    atmosfera: svgF('0 0 360 120',
      '<text x="10" y="16" font-size="12" font-weight="bold" fill="'+FIG_N+'">Oxígeno (%)</text><rect x="10" y="24" width="340" height="16" rx="3" fill="#f2c4c4"/><rect x="'+(10+340*19.5/30)+'" y="24" width="'+(340*4/30)+'" height="16" fill="#1e9a4a"/>'+
      '<g font-size="10" fill="#55607a" text-anchor="middle"><text x="10" y="54">0</text><text x="'+(10+340*19.5/30)+'" y="54">19,5</text><text x="'+(10+340*23.5/30)+'" y="54">23,5</text><text x="350" y="54">30</text></g>'+
      '<text x="10" y="78" font-size="12" font-weight="bold" fill="'+FIG_N+'">Gases inflamables (% del LIE)</text><rect x="10" y="86" width="340" height="16" rx="3" fill="#f2c4c4"/><rect x="10" y="86" width="34" height="16" rx="3" fill="#1e9a4a"/>'+
      '<g font-size="10" fill="#55607a" text-anchor="middle"><text x="12" y="116">0</text><text x="44" y="116">10</text><text x="346" y="116">100</text></g>'),
    // Señales de advertencia (triángulo amarillo, ISO 7010) para los riesgos de la tarea
    riesgosFrigo: svgF('0 0 520 118', (function(){
      var tri=function(x){ return '<polygon points="'+x+',8 '+(x+38)+',72 '+(x-38)+',72" fill="#f5c400" stroke="#1b1b1b" stroke-width="4" stroke-linejoin="round"/>'; };
      var sym=[
        '<path d="M51 60 L77 30 L82 34 L58 62 Z" fill="#1b1b1b"/><rect x="45" y="58" width="16" height="6" rx="2" transform="rotate(-48 53 61)" fill="#1b1b1b"/><circle cx="74" cy="58" r="2.6" fill="#d7262e"/><circle cx="80" cy="64" r="2" fill="#d7262e"/>',
        '<polygon points="200,28 186,52 196,52 189,68 206,43 196,43 203,28" fill="#1b1b1b"/>',
        '<g stroke="#1b1b1b" stroke-width="3" stroke-linecap="round"><line x1="325" y1="30" x2="325" y2="66"/><line x1="309.4" y1="39" x2="340.6" y2="57"/><line x1="309.4" y1="57" x2="340.6" y2="39"/><path d="M319 33 l6 5 l6 -5 M319 63 l6 -5 l6 5" fill="none" stroke-width="2.4"/></g>',
        '<circle cx="452" cy="34" r="5" fill="#1b1b1b"/><g stroke="#1b1b1b" stroke-width="4" stroke-linecap="round" fill="none"><path d="M450 40 L458 54"/><path d="M458 54 L470 58"/><path d="M458 54 L448 63"/><path d="M452 45 L440 42"/><path d="M453 46 L466 40"/></g><line x1="430" y1="66" x2="484" y2="66" stroke="#1b1b1b" stroke-width="3"/><path d="M466 64 q6 -4 12 0" stroke="#1f5fbf" stroke-width="2.5" fill="none"/>'];
      var lbl=[['Contacto con','objetos cortantes'],['Contacto con','electricidad'],['Exposición a','bajas temperaturas'],['Caída al','mismo nivel']], s='';
      [65,195,325,455].forEach(function(x,i){ s+=tri(x)+sym[i]+'<text x="'+x+'" y="92" text-anchor="middle" font-size="12" font-weight="bold" fill="'+FIG_N+'">'+lbl[i][0]+'</text><text x="'+x+'" y="107" text-anchor="middle" font-size="12" font-weight="bold" fill="'+FIG_N+'">'+lbl[i][1]+'</text>'; });
      return s; })()),
    // Señales de uso obligatorio (círculo azul) para los EPP
    eppFrigo: svgF('0 0 520 112', (function(){
      var c=function(x){ return '<circle cx="'+x+'" cy="40" r="32" fill="#1f5fbf"/>'; };
      var sym=[
        '<path d="M47 50 Q47 22 65 22 Q83 22 83 50 Z" fill="#fff"/><rect x="41" y="49" width="48" height="6" rx="3" fill="#fff"/><path d="M65 22 v8" stroke="#1f5fbf" stroke-width="3"/>',
        '<path d="M184 62 V40 q0-4 3.5-4 q3.5 0 3.5 4 V30 q0-4 3.5-4 q3.5 0 3.5 4 V28 q0-4 3.5-4 q3.5 0 3.5 4 V32 q0-4 3.5-4 q3.5 0 3.5 4 V48 l5-6 q3-3 5 0 q1.5 2 0 5 L205 62 Z" fill="#fff"/>',
        '<path d="M311 22 L319 18 Q325 24 331 18 L339 22 L349 32 L343 40 L339 36 V62 H311 V36 L307 40 L301 32 Z" fill="#fff"/><line x1="325" y1="24" x2="325" y2="62" stroke="#1f5fbf" stroke-width="2.5"/><g stroke="#1f5fbf" stroke-width="2" stroke-linecap="round"><line x1="314" y1="44" x2="321" y2="44"/><line x1="314" y1="51" x2="321" y2="51"/></g>',
        '<path d="M446 20 H462 V48 L478 54 Q482 56 482 60 V64 H440 V58 Z" fill="#fff"/><rect x="440" y="60" width="42" height="5" rx="2" fill="#f26b1d"/>'];
      var lbl=['Casco con barbiquejo','Guantes de nitrilo','Chaqueta térmica','Botas de goma'], s='';
      [65,195,325,455].forEach(function(x,i){ s+=c(x)+sym[i]+'<text x="'+x+'" y="94" text-anchor="middle" font-size="12" font-weight="bold" fill="'+FIG_N+'">'+lbl[i]+'</text>'+(i===3?'<text x="'+x+'" y="108" text-anchor="middle" font-size="11" fill="#55607a">(con punta de acero)</text>':(i===2?'<text x="'+x+'" y="108" text-anchor="middle" font-size="11" fill="#55607a">(si se requiere)</text>':'')); });
      return s; })()),
    // Método de trabajo en 7 pasos
    metodoFrigo: svgF('0 0 700 104', (function(){ var L=[['Acción','mecánica'],['Plataforma y','equipos de frío'],['Pisos con','abrillantadora'],['Zócalos con','paño y detergente'],['Limpieza','de puertas'],['Retiro de agua','con barre agua'],['Secado final','con paños']], s='';
      L.forEach(function(t,i){ var x=50+i*100; s+='<circle cx="'+x+'" cy="30" r="22" fill="'+(i===6?FIG_O:FIG_N)+'"/><text x="'+x+'" y="37" text-anchor="middle" font-size="20" font-weight="bold" fill="#fff">'+(i+1)+'</text><text x="'+x+'" y="72" text-anchor="middle" font-size="11.5" font-weight="bold" fill="'+FIG_N+'">'+t[0]+'</text><text x="'+x+'" y="87" text-anchor="middle" font-size="11" fill="#55607a">'+t[1]+'</text>'+(i<6?'<path d="M'+(x+26)+' 30 h40" stroke="#c9ccd8" stroke-width="3"/><path d="M'+(x+66)+' 24 l8 6 l-8 6z" fill="#c9ccd8"/>':''); }); return s; })())
  };
  var PTS_FIG={
    pts_altura:[['alza','Alza hombre tipo tijera: arnés anclado y puerta cerrada'],['andamio','Andamio completo, con barandas, crucetas y base firme'],['escala','Escalera tijera abierta, con seguro y apoyo firme'],['arnes','Arnés de cuerpo completo con línea de vida anclada']],
    pts_alzahombre:[['alza','Plataforma de trabajo en altura (alza hombre / Genie)'],['arnes','Arnés anclado a la plataforma en todo momento']],
    pts_quimicos:[['nfpa','Rombo NFPA 704: identificación de riesgos (salud, inflamabilidad, reactividad y riesgos especiales, escala 0 a 4)',true],['secuencia','Secuencia de limpieza de estructuras y líneas',true]],
    pts_extintores:[['clases','Clases de fuego (NCh 934)',true],['pass','Uso del extintor, paso a paso',true]],
    pts_confinados:[['senal','Señalización obligatoria en el acceso'],['atmosfera','Rangos seguros de la atmósfera para ingresar (verde)']],
    pts_herramientas:[['senal','El estanque es un espacio confinado: acceso señalizado'],['atmosfera','Valores del medidor de gases para ingresar (verde)']],
    pts_frigorifico:[['metodoFrigo','Método de trabajo, paso a paso',true],['riesgosFrigo','Riesgos de la tarea',true],['eppFrigo','Elementos de protección personal obligatorios',true]]
  };
  function figurasPTS(slug){ var L=PTS_FIG[slug]; if(!L) return '';
    return '<div class="pts-figs">'+L.map(function(f){ return '<figure class="pts-fig'+(f[2]?' ancha':'')+'">'+FIG[f[0]]+'<figcaption>'+esc(f[1])+'</figcaption></figure>'; }).join('')+'</div>'; }
  // ====== Documentos de empresa generados (procedimientos y capacitaciones con formato corporativo) ======
  function tablaCtl(cod, aplica, fecha){ return '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>'+cod+'</b></td><td><span class="sl">Versión</span><b>01</b></td><td><span class="sl">Fecha</span>'+(fecha?'<b>'+fecha+'</b>':ce(fFaena(todayISO())))+'</td><td><span class="sl">Aplica a</span><b>'+esc(aplica)+'</b></td></tr></tbody></table>'; }
  function seccionador(){ var n=0; return function(t){ n++; return '<h4 class="dg-h4">'+n+'. '+t+'</h4>'; }; }
  // Organigrama de emergencia (SVG propio)
  function orgEmergencia(){
    function caja(x,y,w,t1,t2,fuerte){ return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="46" rx="8" fill="'+(fuerte?FIG_N:'#fff')+'" stroke="'+(fuerte?FIG_N:FIG_O)+'" stroke-width="2"/>'+
      '<text x="'+(x+w/2)+'" y="'+(y+20)+'" text-anchor="middle" font-size="12" font-weight="bold" fill="'+(fuerte?'#fff':FIG_N)+'">'+t1+'</text>'+
      '<text x="'+(x+w/2)+'" y="'+(y+36)+'" text-anchor="middle" font-size="10" fill="'+(fuerte?'#dfe3f3':'#55607a')+'">'+t2+'</text>'; }
    var L='stroke="#9aa2bd" stroke-width="2" fill="none"';
    return '<figure class="pts-fig ancha org" style="margin:0 0 12px">'+svgF('0 0 640 230',
      caja(230,8,180,'Gerencia','Recursos y apoyo',false)+
      '<path d="M320 54 V76" '+L+'/>'+
      caja(210,76,220,'Supervisor de faena','Activa y dirige la emergencia',true)+
      caja(470,76,160,'Prevencionista','Asesoría técnica',false)+'<path d="M430 99 H470" '+L+' stroke-dasharray="5 4"/>'+
      '<path d="M320 122 V146 M90 146 H550 M90 146 V166 M250 146 V166 M410 146 V166 M550 146 V166" '+L+'/>'+
      caja(10,166,160,'Vigía externo','Da la alarma, no ingresa',false)+
      caja(178,166,144,'Rescatistas (2)','Rescate con/sin ingreso',false)+
      caja(330,166,160,'Primeros auxilios','Atención y traslado',false)+
      caja(498,166,132,'Apoyo exterior','Comunicación y equipos',false)
    )+'<figcaption>Organigrama de emergencia en la faena</figcaption></figure>'; }
  // ====== Matriz de elementos de protección personal (EPP): formato para revisar y entregar EPP en faena ======
  // Ilustraciones propias de cada EPP (SVG, colores corporativos); reemplazan las fotos referenciales del formato original.
  var EPP_ICO=null;   // se arma al usarse: FIG_N y FIG_O se definen más abajo en el archivo
  function eppIco(){ if(EPP_ICO) return EPP_ICO; EPP_ICO={
    casco: svgF('0 0 80 64','<path d="M14 40 Q14 12 40 12 Q66 12 66 40 Z" fill="#f2f3f7" stroke="'+FIG_N+'" stroke-width="3"/><path d="M40 12 V40" stroke="'+FIG_N+'" stroke-width="2.5"/><rect x="8" y="38" width="64" height="7" rx="3.5" fill="'+FIG_N+'"/><path d="M20 45 Q24 60 40 58 Q56 60 60 45" fill="none" stroke="'+FIG_O+'" stroke-width="3"/>'),
    lentes: svgF('0 0 80 64','<path d="M8 26 H72 V36 Q72 46 60 46 H48 Q42 46 40 38 Q38 46 32 46 H20 Q8 46 8 36 Z" fill="#dfe8f7" stroke="'+FIG_N+'" stroke-width="3" stroke-linejoin="round"/><path d="M8 26 L2 22 M72 26 L78 22" stroke="'+FIG_N+'" stroke-width="3" stroke-linecap="round"/><path d="M16 31 L22 37 M52 31 L58 37" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>'),
    auditivo: svgF('0 0 80 64','<path d="M18 36 Q18 8 40 8 Q62 8 62 36" fill="none" stroke="'+FIG_N+'" stroke-width="5" stroke-linecap="round"/><rect x="8" y="30" width="18" height="26" rx="8" fill="'+FIG_O+'" stroke="'+FIG_N+'" stroke-width="2.5"/><rect x="54" y="30" width="18" height="26" rx="8" fill="'+FIG_O+'" stroke="'+FIG_N+'" stroke-width="2.5"/>'),
    respirador: svgF('0 0 80 64','<path d="M18 22 Q40 4 62 22 L58 46 Q40 58 22 46 Z" fill="#f2f3f7" stroke="'+FIG_N+'" stroke-width="3"/><circle cx="20" cy="44" r="11" fill="'+FIG_O+'" stroke="'+FIG_N+'" stroke-width="2.5"/><circle cx="60" cy="44" r="11" fill="'+FIG_O+'" stroke="'+FIG_N+'" stroke-width="2.5"/><g stroke="#fff" stroke-width="2"><line x1="15" y1="44" x2="25" y2="44"/><line x1="55" y1="44" x2="65" y2="44"/></g><circle cx="40" cy="44" r="5" fill="'+FIG_N+'"/>'),
    overol: svgF('0 0 80 64','<circle cx="40" cy="8" r="6" fill="#f2f3f7" stroke="'+FIG_N+'" stroke-width="2.5"/><path d="M30 14 H50 L62 30 L56 34 L52 28 V40 L54 62 H44 L40 42 L36 62 H26 L28 40 V28 L24 34 L18 30 Z" fill="#2c3a7a" stroke="'+FIG_N+'" stroke-width="2.5" stroke-linejoin="round"/><line x1="40" y1="15" x2="40" y2="40" stroke="#f2f3f7" stroke-width="2"/><rect x="31" y="22" width="6" height="5" fill="'+FIG_O+'"/><path d="M28 38 H52" stroke="'+FIG_O+'" stroke-width="2.5"/>'),
    pechera: svgF('0 0 80 64','<path d="M30 4 Q40 12 50 4" fill="none" stroke="'+FIG_N+'" stroke-width="2.5"/><path d="M30 6 H50 V16 L60 20 V58 Q40 62 20 58 V20 L30 16 Z" fill="#dff1fb" stroke="'+FIG_N+'" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 26 L8 22 M60 26 L72 22" stroke="'+FIG_N+'" stroke-width="2.5" stroke-linecap="round"/><g fill="#4a90e2"><circle cx="33" cy="34" r="2.2"/><circle cx="46" cy="42" r="2.2"/><circle cx="38" cy="50" r="2.2"/></g>'),
    guante0: svgF('0 0 80 64','<path d="M26 60 V30 q0-5 4-5 q4 0 4 5 V18 q0-5 4-5 q4 0 4 5 V16 q0-5 4-5 q4 0 4 5 V20 q0-5 4-5 q4 0 4 5 V40 l6-7 q4-4 7 0 q2 3 0 6 L54 60 Z" fill="#e9dcc3" stroke="'+FIG_N+'" stroke-width="2.5" stroke-linejoin="round"/><g stroke="#b8a37f" stroke-width="1.6"><line x1="28" y1="50" x2="52" y2="50"/><line x1="28" y1="55" x2="52" y2="55"/></g>'),
    guante2: svgF('0 0 80 64','<path d="M28 62 V32 q0-5 4-5 q4 0 4 5 V20 q0-5 4-5 q4 0 4 5 V18 q0-5 4-5 q4 0 4 5 V22 q0-5 4-5 q4 0 4 5 V40 l5-6 q4-4 7 0 q2 3 0 6 L54 52 V62 Z" fill="#2bb39a" stroke="'+FIG_N+'" stroke-width="2.5" stroke-linejoin="round"/><line x1="28" y1="54" x2="54" y2="54" stroke="'+FIG_N+'" stroke-width="2"/>'),
    guante1: svgF('0 0 80 64','<path d="M26 60 V30 q0-5 4-5 q4 0 4 5 V18 q0-5 4-5 q4 0 4 5 V16 q0-5 4-5 q4 0 4 5 V20 q0-5 4-5 q4 0 4 5 V40 l6-7 q4-4 7 0 q2 3 0 6 L54 60 Z" fill="#4a90e2" stroke="'+FIG_N+'" stroke-width="2.5" stroke-linejoin="round"/>'),
    zapato: svgF('0 0 80 64','<path d="M10 18 H34 V34 L58 40 Q72 43 72 52 V54 H10 Z" fill="#8a5a3c" stroke="'+FIG_N+'" stroke-width="3" stroke-linejoin="round"/><rect x="8" y="52" width="66" height="6" rx="2" fill="'+FIG_N+'"/><path d="M56 41 Q68 44 70 52 H56 Z" fill="'+FIG_O+'"/><g stroke="#f2f3f7" stroke-width="2" stroke-linecap="round"><line x1="20" y1="24" x2="30" y2="24"/><line x1="20" y1="30" x2="30" y2="30"/></g>'),
    botas: svgF('0 0 80 64','<path d="M18 2 H40 V40 L60 44 Q72 47 72 54 V56 H18 Z" fill="#f5c400" stroke="'+FIG_N+'" stroke-width="3" stroke-linejoin="round"/><rect x="16" y="54" width="58" height="7" rx="2" fill="#1b1b1b"/><rect x="18" y="2" width="22" height="6" fill="#1b1b1b"/><path d="M58 45 Q69 48 70 54 H58 Z" fill="'+FIG_O+'"/>'),
    arnes: svgF('0 0 80 64','<circle cx="30" cy="8" r="5" fill="'+FIG_N+'"/><g stroke="'+FIG_O+'" stroke-width="4" stroke-linecap="round" fill="none"><path d="M22 14 L36 40 M38 14 L24 40"/><path d="M20 40 H40"/><circle cx="24" cy="50" r="7"/><circle cx="36" cy="50" r="7"/></g><path d="M42 18 q10 6 4 14 q-6 8 4 14 q8 5 2 12" fill="none" stroke="'+FIG_N+'" stroke-width="3"/><path d="M50 58 q6 2 6 -4 v-8" fill="none" stroke="'+FIG_N+'" stroke-width="3" stroke-linecap="round"/>')
  }; return EPP_ICO; }
  // Matriz general (base) de EPP de la empresa: qué EPP se usa y si aplica a trabajos en seco, húmedos o ambos.
  function docMatrizEPP(){
    // [zona, ícono, elemento, riesgo / uso principal, seco, húmedo]
    var L=[['Cabeza','casco','Casco de seguridad con barbiquejo','Protección de la cabeza ante golpes y caída de objetos; barbiquejo ajustado para evitar que el casco se caiga.',1,1],
      ['Ojos','lentes','Lentes de seguridad','Protección ocular contra partículas, polvo y salpicaduras.',1,1],
      ['Oídos','auditivo','Protección auditiva','Tapones u orejeras ante el ruido de equipos como hidrolavadoras, abrillantadoras o aspiradoras industriales.',1,1],
      ['Vías respiratorias','respirador','Protección respiratoria','Respirador reutilizable de media cara o rostro completo, con cartuchos o filtros específicos según la sustancia o el polvo.',1,1],
      ['Cuerpo','overol','Overol de trabajo','Ropa de trabajo base: protege el cuerpo de suciedad y roces. Se usa limpio y sin partes sueltas.',1,1],
      ['Cuerpo','pechera','Pechera desechable','Protege el torso de salpicaduras de agua, lodos o químicos; se desecha después de usarla.',0,1],
      ['Manos','guante0','Guantes de lana o tela','Protección ante roces, golpes leves y frío en trabajos en seco. No protegen de químicos ni del agua.',1,0],
      ['Manos','guante2','Guantes de nitrilo','Protección de manos frente al agua y químicos compatibles; verificar la hoja de datos de seguridad.',0,1],
      ['Manos','guante1','Guantes de nitrilo desechables','Protección de manos en tareas breves con químicos compatibles; se desechan después de usarlos.',1,1],
      ['Pies','zapato','Zapatos de seguridad','Calzado con punta de protección y suela antideslizante para trabajos en seco.',1,0],
      ['Pies','botas','Botas de agua','Botas de goma con punta de acero y suela antideslizante para trabajos húmedos.',0,1],
      ['Trabajo en altura','arnes','Arnés de seguridad con cabo de vida','Sistema anticaídas para trabajos en altura; usar solo con anclaje compatible y capacitación.',1,1]];
    var si='<span class="mepp-si"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>', no='<span class="mepp-no">—</span>';
    return dgHead('MATRIZ DE EPP','01')+
      '<div class="pts-tit">Matriz general de elementos de protección personal</div>'+
      '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>MAT-PREV-01</b></td><td><span class="sl">Versión</span><b>01</b></td><td><span class="sl">Fecha de publicación</span>'+ce(fFaena(todayISO()))+'</td><td><span class="sl">Aplica a</span><b>Todo el personal</b></td></tr></tbody></table>'+
      '<p style="font-size:12px;margin:0 0 10px">Matriz base de los elementos de protección personal que utiliza '+EMP.rz+'. Indica el uso principal de cada EPP y si aplica a <b>trabajos en seco</b>, a <b>trabajos húmedos</b> o a ambos. El EPP específico de cada tarea se define en su procedimiento de trabajo seguro (PTS).</p>'+
      '<table class="dg-tbl mepp"><thead><tr><th style="width:80px;text-align:center">Imagen</th><th style="width:23%">Elemento de protección personal</th><th>Riesgo / uso principal</th><th style="width:66px;text-align:center">Trabajo en seco</th><th style="width:66px;text-align:center">Trabajo húmedo</th></tr></thead><tbody>'+
        L.map(function(e){ return '<tr><td class="mepp-i">'+eppIco()[e[1]]+'</td><td><span class="mepp-z">'+e[0]+'</span><b>'+e[2]+'</b></td><td>'+e[3]+'</td><td class="mepp-c">'+(e[4]?si:no)+'</td><td class="mepp-c">'+(e[5]?si:no)+'</td></tr>'; }).join('')+
      '</tbody></table>'+
      '<p style="font-size:11px;color:#55607a;margin:0">Las imágenes son referenciales. El EPP se selecciona según la evaluación de riesgos, las instrucciones del fabricante y las hojas de datos de seguridad; se inspecciona antes de cada uso y se reemplaza cuando está dañado. Su entrega a cada trabajador se registra en el formato <b>Entrega de elementos de protección personal</b>.</p>';
  }

  // ====== Capacitación: primeros auxilios (material de la capacitación) ======
  function figsAux(){ if(FIG.pas) return;   // figuras de primeros auxilios (FIG se define más abajo en el archivo)
  FIG.pas=svgF('0 0 520 100',(function(){ var L=[['P','Proteger','Asegure la escena'],['A','Avisar','131 · Rescate Mutual 1407'],['S','Socorrer','Primeros auxilios']], s='';
    L.forEach(function(t,i){ var x=90+i*170; s+='<circle cx="'+x+'" cy="34" r="27" fill="'+(i===1?FIG_O:FIG_N)+'"/><text x="'+x+'" y="44" text-anchor="middle" font-size="28" font-weight="bold" fill="#fff">'+t[0]+'</text><text x="'+x+'" y="78" text-anchor="middle" font-size="13" font-weight="bold" fill="'+FIG_N+'">'+t[1]+'</text><text x="'+x+'" y="94" text-anchor="middle" font-size="11" fill="#55607a">'+t[2]+'</text>'+(i<2?'<path d="M'+(x+34)+' 34 h96" stroke="#c9ccd8" stroke-width="3"/><path d="M'+(x+130)+' 28 l8 6 l-8 6z" fill="#c9ccd8"/>':''); }); return s; })());
  FIG.rcp=svgF('0 0 620 104',(function(){ var L=[['¿Responde?','¿Respira normal?'],['Llamar 131','y pedir un DEA'],['30 compresiones','5 a 6 cm de profundidad'],['2 ventilaciones','solo si está entrenado'],['Seguir sin parar','hasta que llegue ayuda']], s='';
    L.forEach(function(t,i){ var x=62+i*124; s+='<circle cx="'+x+'" cy="30" r="22" fill="'+(i===2?FIG_O:FIG_N)+'"/><text x="'+x+'" y="37" text-anchor="middle" font-size="20" font-weight="bold" fill="#fff">'+(i+1)+'</text><text x="'+x+'" y="72" text-anchor="middle" font-size="11.5" font-weight="bold" fill="'+FIG_N+'">'+t[0]+'</text><text x="'+x+'" y="87" text-anchor="middle" font-size="10.5" fill="#55607a">'+t[1]+'</text>'+(i<4?'<path d="M'+(x+26)+' 30 h64" stroke="#c9ccd8" stroke-width="3"/><path d="M'+(x+90)+' 24 l8 6 l-8 6z" fill="#c9ccd8"/>':''); }); return s; })());
  FIG.fonos=svgF('0 0 520 86',(function(){ var L=[['131','Ambulancia SAMU','#d7262e'],['132','Bomberos','#e8590c'],['133','Carabineros','#2b7a3d'],['1407','Rescate Mutual','#1f5fbf']], s='';
    L.forEach(function(t,i){ var x=8+i*128; s+='<rect x="'+x+'" y="6" width="120" height="74" rx="12" fill="'+t[2]+'"/><text x="'+(x+60)+'" y="46" text-anchor="middle" font-size="30" font-weight="bold" fill="#fff">'+t[0]+'</text><text x="'+(x+60)+'" y="68" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">'+t[1]+'</text>'; }); return s; })());
  }
  function docCapPrimeros(){
    figsAux(); var H=seccionador();
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    function fig(k,cap){ return '<div class="pts-figs"><figure class="pts-fig ancha">'+FIG[k]+'<figcaption>'+cap+'</figcaption></figure></div>'; }
    return dgHead('CAPACITACIÓN','01',CAP_FECHA)+
      '<div class="pts-tit">Primeros auxilios</div>'+
      tablaCtl('CAP-PREV-02','Todo el personal',CAP_FECHA)+
      H('Objetivo')+'<p>Entregar a los trabajadores los conocimientos básicos para actuar ante una emergencia o accidente en la faena, proteger su vida y la de sus compañeros, avisar oportunamente y prestar la primera atención mientras llega la ayuda especializada.</p>'+
      H('Alcance')+'<p>Aplica a todo el personal de '+EMP.rz+', con énfasis en las tareas de mayor riesgo de la empresa: espacios confinados y limpieza de estanques, cámaras frigoríficas, uso de productos químicos y trabajos en altura. Esta capacitación es una instrucción básica y no reemplaza un curso certificado de primeros auxilios.</p>'+
      H('Conducta PAS')+'<p style="margin:0 0 6px">Ante cualquier emergencia, actuar siempre en este orden:</p>'+fig('pas','Proteger · Avisar · Socorrer')+
        ulDg(['<b>Proteger:</b> verificar que el lugar sea seguro para usted y para el lesionado. No se convierta en otra víctima.','<b>Avisar:</b> llamar a emergencias e informar a la jefatura: qué pasó, dónde, cuántos lesionados y su estado.','<b>Socorrer:</b> prestar los primeros auxilios que conozca, sin exponerse a riesgos.'])+
      H('Números de emergencia')+fig('fonos','Teléfonos de emergencia')+
      H('Evaluación inicial del lesionado')+ulDg(['Acercarse solo si la escena es segura.','Comprobar si responde: hablarle fuerte y tocarle los hombros.','Comprobar si respira con normalidad: mirar, escuchar y sentir durante no más de 10 segundos.','Si no responde y no respira normalmente: llamar al 131 o al Rescate Mutual 1407, pedir un desfibrilador (DEA) e iniciar la reanimación.','Si responde: preguntar qué le pasó, buscar lesiones y no moverlo si no es necesario.'])+
      H('Reanimación cardiopulmonar (RCP) en adultos')+fig('rcp','Secuencia de RCP')+
        ulDg(['Persona de espalda sobre una superficie firme.','Talón de una mano al centro del pecho y la otra encima, brazos rectos.','Compresiones fuertes y rápidas: 5 a 6 cm de profundidad y 100 a 120 por minuto, dejando que el pecho vuelva a su posición.','Si está entrenado: 30 compresiones y 2 ventilaciones. Si no lo está: solo compresiones continuas.','Si llega un DEA: encenderlo y seguir sus instrucciones; nadie debe tocar a la persona durante la descarga.','No detenerse hasta que llegue la ayuda especializada o la persona comience a respirar normalmente.'])+
      H('Posición lateral de seguridad')+'<p>Para una persona inconsciente que respira normalmente y sin sospecha de lesión de columna: ponerla de costado, con la cabeza ligeramente hacia atrás para mantener la vía aérea abierta, y vigilar su respiración hasta que llegue la ayuda.</p>'+
      H('Atención según la situación')+'<table class="dg-tbl"><thead><tr><th style="width:24%">Situación</th><th>Qué hacer</th></tr></thead><tbody>'+
        tr('Atragantamiento','Si tose con fuerza, animarlo a seguir tosiendo. Si no puede toser, hablar ni respirar: 5 golpes entre los omóplatos y 5 compresiones abdominales (maniobra de Heimlich), alternando. Si pierde el conocimiento: llamar al 131 e iniciar RCP.')+
        tr('Hemorragia','Presión directa y firme sobre la herida con gasa o paño limpio, sin soltar. Si se empapa, poner otro encima. No retirar objetos incrustados.')+
        tr('Heridas','Lavar con agua limpia o suero, cubrir con gasa limpia y derivar si es profunda o sucia.')+
        tr('Quemaduras','Enfriar con agua corriente a temperatura ambiente por 10 a 20 minutos, retirar anillos y relojes, cubrir con gasa limpia. No reventar ampollas ni aplicar cremas, pasta dental ni otros productos.')+
        tr('Químicos en piel u ojos','Retirar la ropa contaminada y lavar con abundante agua por al menos 15 a 20 minutos. Revisar la hoja de datos de seguridad del producto y llevarla al centro asistencial.')+
        tr('Fracturas y esguinces','Inmovilizar la zona en la posición en que se encuentra; no intentar acomodar el hueso. Ante sospecha de lesión de columna, no mover al lesionado salvo peligro inminente.')+
        tr('Contacto eléctrico','Cortar la energía antes de tocar a la persona; si no es posible, separarla con un elemento seco y no conductor. Evaluar su respiración y llamar al 131.')+
        tr('Intoxicación por gases o espacio confinado','No ingresar a rescatar sin autorización, equipo y vigía (PTS-PREV-05). Una vez fuera, llevar a la persona al aire fresco, mantenerla en reposo y llamar al 131.')+
        tr('Frío e hipotermia','Llevar a la persona a un lugar templado, retirar la ropa húmeda y abrigarla. Si está consciente, darle bebidas tibias. No frotar las zonas congeladas.')+
        tr('Golpe de calor','Llevar a la sombra, aflojar la ropa, enfriar con paños húmedos y dar agua si está consciente. Si está confuso o inconsciente, llamar al 131.')+
        tr('Desmayo','Recostar a la persona con las piernas elevadas, aflojar la ropa y verificar que respire. Si no se recupera rápido, llamar al 131.')+
      '</tbody></table>'+
      H('Botiquín básico de faena')+'<div class="dg-cols">'+ulDg(['Gasas y apósitos estériles.','Vendas de distintos anchos.','Tela adhesiva.','Suero fisiológico.'])+ulDg(['Guantes desechables.','Tijeras.','Manta térmica.','Mascarilla para RCP.'])+'</div>'+
      '<p style="font-size:12px">El botiquín no debe contener medicamentos de uso oral: no se administran remedios a un lesionado.</p>'+
      H('Después de la emergencia')+ulDg(['Informar de inmediato a la jefatura y a prevención de riesgos.','Todo accidente se atiende en la '+EMP.mutual+' y se denuncia (DIAT) dentro de 24 horas, según el Procedimiento de emergencia y/o accidentes (PR-PREV-03).','Reponer los elementos usados del botiquín.'])+
      H('Registro')+'<p>La asistencia se registra en el formato <b>Registro de capacitación</b> y el aprendizaje se verifica con la <b>Evaluación de aprendizaje</b> (ISgestión → Empresa → Formatos para firmar).</p>';
  }
  // ====== Gestión preventiva D.S. N° 44: Procedimiento IPER, Matriz IPER y Programa de trabajo preventivo ======
  // Metodología: Guía Técnica del ISP. Magnitud del riesgo (MR) = Probabilidad (1, 2, 4) × Consecuencia (1, 2, 4).
  var MR_NIV=[[16,'Intolerable','#fdecec','#b91c1c'],[8,'Importante','#ffe8d6','#c2410c'],[4,'Moderado','#fff6cc','#8a6d00'],[1,'Tolerable','#e7f6ee','#16794a']];
  function mrNivel(v){ for(var i=0;i<MR_NIV.length;i++) if(v>=MR_NIV[i][0]) return MR_NIV[i]; return MR_NIV[3]; }
  function mrChip(v){ var n=mrNivel(v); return '<span class="mr-chip" style="background:'+n[2]+';color:'+n[3]+';border-color:'+n[3]+'55">'+v+' · '+n[1]+'</span>'; }
  function figMatrizMR(){ var P=[[4,'Alta'],[2,'Media'],[1,'Baja']], C=[[1,'Ligeramente dañino'],[2,'Dañino'],[4,'Extremadamente dañino']], s='';
    s+='<text x="10" y="112" font-size="11" font-weight="bold" fill="'+FIG_N+'" transform="rotate(-90 10 112)" text-anchor="middle">PROBABILIDAD</text>';
    P.forEach(function(p,i){ var y=14+i*44; s+='<text x="86" y="'+(y+26)+'" font-size="11" text-anchor="end" fill="'+FIG_N+'" font-weight="bold">'+p[1]+' ('+p[0]+')</text>';
      C.forEach(function(c,j){ var v=p[0]*c[0], n=mrNivel(v), x=94+j*132; s+='<rect x="'+x+'" y="'+y+'" width="128" height="40" rx="6" fill="'+n[2]+'" stroke="'+n[3]+'" stroke-width="1.5"/><text x="'+(x+64)+'" y="'+(y+18)+'" text-anchor="middle" font-size="14" font-weight="bold" fill="'+n[3]+'">'+v+'</text><text x="'+(x+64)+'" y="'+(y+33)+'" text-anchor="middle" font-size="10.5" font-weight="bold" fill="'+n[3]+'">'+n[1]+'</text>'; }); });
    C.forEach(function(c,j){ var x=94+j*132+64; s+='<text x="'+x+'" y="156" text-anchor="middle" font-size="10.5" font-weight="bold" fill="'+FIG_N+'">'+c[1]+' ('+c[0]+')</text>'; });
    s+='<text x="292" y="174" text-anchor="middle" font-size="11" font-weight="bold" fill="'+FIG_N+'">CONSECUENCIA</text>';
    return svgF('0 0 500 180', s); }
  // Matriz IPER base de la empresa: [proceso, tarea / puesto, rutinaria, peligro, riesgo, P, C, medidas]
  var IPER_FILAS=[
    ['Limpieza y aseo industrial','Limpieza de pisos y superficies · Operario de servicios',1,'Pisos mojados, con residuos o desniveles','Caída al mismo nivel',2,2,'Orden y aseo; señalizar el área en limpieza; secar al terminar; calzado o botas antideslizantes.'],
    ['Limpieza y aseo industrial','Uso de productos químicos de limpieza · Operario de servicios',1,'Productos químicos (detergentes, desengrasantes, sanitizantes)','Contacto e inhalación: irritación, dermatitis, quemaduras',2,2,'PTS-PREV-03; hoja de datos de seguridad disponible; rotulado; ventilación; guantes de nitrilo, lentes y respirador según HDS; capacitación.'],
    ['Limpieza y aseo industrial','Dilución y trasvasije de químicos · Operario autorizado',1,'Mezcla de productos incompatibles','Intoxicación aguda por gases',1,4,'Prohibido mezclar productos; solo diluye personal autorizado; envases rotulados; lugar ventilado.'],
    ['Limpieza y aseo industrial','Uso de abrillantadora, aspiradora e hidrolavadora',1,'Equipos eléctricos en ambientes húmedos','Contacto eléctrico',1,4,'Inspección de cables y enchufes; protección diferencial; no proyectar agua sobre tableros; equipo desconectado al intervenirlo.'],
    ['Limpieza y aseo industrial','Hidrolavado',1,'Agua a alta presión','Proyección de partículas, inyección de agua en la piel',2,2,'Solo personal capacitado; no apuntar a personas; careta facial o lentes; seguro en el gatillo; revisión de mangueras.'],
    ['Limpieza y aseo industrial','Uso de equipos ruidosos',1,'Ruido de equipos de limpieza','Pérdida auditiva (hipoacusia)',2,2,'Protección auditiva; rotación de tareas; evaluación de ruido (PREXOR) si corresponde.'],
    ['Limpieza y aseo industrial','Traslado de bidones, sacos y materiales',1,'Manejo manual de carga','Sobreesfuerzo, lesiones musculoesqueléticas',2,2,'Ley N° 20.949: no superar 25 kg (20 kg en mujeres y menores); ayudas mecánicas; técnica de levantamiento; trabajo en equipo.'],
    ['Limpieza y aseo industrial','Limpieza de superficies con movimientos repetitivos',1,'Movimientos repetitivos y posturas forzadas','Trastornos musculoesqueléticos de extremidades superiores (TMERT)',2,2,'Pausas activas; rotación de tareas; herramientas con mango adecuado; aplicación del protocolo TMERT.'],
    ['Limpieza de estanques','Ingreso al estanque (espacio confinado) · Operario de servicios',1,'Atmósfera con deficiencia de oxígeno o gases tóxicos o inflamables','Asfixia, intoxicación, explosión',2,4,'PTS-PREV-05 y PTS-PREV-06; permiso de entrada; medición continua con detector multigás; ventilación forzada; vigía permanente; equipo de rescate; capacitación.'],
    ['Limpieza de estanques','Acceso y trabajo dentro del estanque',1,'Escalas, lodo y superficies resbaladizas','Caída a distinto nivel',2,4,'Escala segura y fijada; arnés cuando corresponda; calzado antideslizante; iluminación.'],
    ['Limpieza de estanques','Uso de herramientas manuales y eléctricas',1,'Herramientas cortantes, esmeril y taladro','Cortes, golpes, proyección de partículas',2,2,'PTS-PREV-06; inspección diaria de herramientas; guarda del esmeril; careta y lentes; guantes según tarea.'],
    ['Limpieza de estanques','Trabajo en caliente (esmeril)',0,'Chispas en atmósfera potencialmente inflamable','Incendio o explosión',1,4,'Permiso de trabajo en caliente; medición de inflamables bajo 10% del LIE; extintor en el lugar.'],
    ['Trabajos en altura','Uso de andamios, escaleras y alza hombre',1,'Trabajo sobre 1,8 m de altura','Caída a distinto nivel',2,4,'PTS-PREV-01 y PTS-PREV-02; examen de altura vigente; arnés anclado; inspección previa de equipos; delimitación del área.'],
    ['Trabajos en altura','Trabajo en altura con herramientas',1,'Caída de herramientas y materiales','Golpes a personas bajo el área de trabajo',2,2,'Amarrar herramientas; delimitar y señalizar el área inferior; casco con barbiquejo.'],
    ['Trabajos en altura','Operación de alza hombre',0,'Cercanía a líneas eléctricas','Contacto eléctrico',1,4,'Respetar distancias mínimas; inspección del área antes de elevar; operador capacitado y autorizado.'],
    ['Cámaras frigoríficas','Limpieza de cámaras frigoríficas · Operario de servicios',1,'Bajas temperaturas','Hipotermia, estrés por frío',2,2,'PTS-PREV-07; ropa térmica; pausas de recuperación en zona templada; limpieza semi húmeda.'],
    ['Cámaras frigoríficas','Tránsito dentro de la cámara',1,'Pisos con hielo o húmedos','Caída al mismo nivel',2,2,'Retirar el agua con barre agua; secar con paños; botas antideslizantes.'],
    ['Cámaras frigoríficas','Permanencia dentro de la cámara',0,'Cierre accidental de la puerta','Encierro e hipotermia grave',1,4,'Verificar la apertura interior antes de ingresar; trabajar en pareja; aviso al supervisor al entrar y salir.'],
    ['Limpieza de barcos','Limpieza de bodegas, cubiertas y casco de embarcaciones · Operario de servicios',0,'Trabajo junto al agua y cubiertas resbaladizas','Caída al agua, inmersión, golpes',1,4,'Chaleco salvavidas; no trabajar solo; seguir las instrucciones de la nave; calzado antideslizante.'],
    ['Limpieza de barcos','Ingreso a bodegas de la embarcación',0,'Bodega con ventilación deficiente','Asfixia, intoxicación (espacio confinado)',1,4,'Tratar como espacio confinado (PTS-PREV-05): medición de gases, ventilación y vigía.'],
    ['Servicios generales','Jardinería, podado de árboles y obras menores · Operario de servicios',0,'Herramientas de corte y caída de ramas','Cortes, proyección de partículas, golpes',2,2,'Herramientas en buen estado; lentes o careta, guantes y casco; delimitar el área de caída de ramas; podar en altura solo cumpliendo el PTS-PREV-01.'],
    ['Trabajo al aire libre','Tareas en exteriores · Todos los puestos de terreno',1,'Radiación ultravioleta solar','Quemaduras, daño ocular y de la piel',2,2,'Protocolo de radiación UV (D.S. N° 594); bloqueador solar; legionario; lentes con filtro UV; hidratación.'],
    ['Trabajo al aire libre','Tareas en días de calor extremo',0,'Altas temperaturas','Golpe de calor',1,4,'Hidratación frecuente; pausas a la sombra; reprogramar tareas pesadas en las horas de más calor.'],
    ['Conducción de vehículos','Traslado de personal y materiales · Chofer',1,'Tránsito vehicular, fatiga y distracciones','Choque, colisión, volcamiento',2,4,'Licencia y documentos al día; mantención del vehículo; respeto a la Ley de Tránsito; prohibido usar el celular al conducir; descansos; programa de conducción segura.'],
    ['Trabajo en plantas de clientes','Desplazamiento en instalaciones del mandante · Todos los puestos',1,'Tránsito de grúas horquilla y vehículos','Atropello',1,4,'Usar vías peatonales; chaleco reflectante; cumplir las reglas del mandante.'],
    ['Trabajo administrativo','Trabajo de oficina con computador · Administración y prevención',1,'Uso prolongado de pantallas y posturas sedentarias','Molestias musculoesqueléticas y fatiga visual',2,1,'Puesto de trabajo ajustado; pausas activas; iluminación adecuada.'],
    ['Trabajo administrativo','Desplazamiento en oficinas',1,'Escaleras, cables y objetos en el piso','Caída al mismo o distinto nivel',1,2,'Orden y aseo; cables canalizados; pasamanos.'],
    ['Transversal (todos los puestos)','Organización del trabajo',1,'Factores de riesgo psicosocial (carga de trabajo, turnos)','Estrés y afectación de la salud mental',2,2,'Protocolo de vigilancia de riesgos psicosociales (cuestionario SUSESO); canales de comunicación; distribución de cargas.'],
    ['Transversal (todos los puestos)','Relaciones laborales',1,'Acoso laboral, acoso sexual y violencia en el trabajo','Daño psicológico y físico',1,4,'Protocolo de prevención Ley N° 21.643 (Ley Karin); canal de denuncias; capacitación y difusión.'],
    ['Transversal (todos los puestos)','Atención y contacto con terceros',1,'Violencia externa','Agresiones',1,2,'Instrucciones de actuación; aviso a la jefatura y al mandante; registro de incidentes.'],
    ['Transversal (todos los puestos)','Emergencias en la faena',0,'Sismo, incendio o emergencia en la planta','Lesiones múltiples',1,4,'Procedimiento de emergencia y/o accidentes (PR-PREV-03); extintores; vías de evacuación; simulacros.'],
    ['Transversal (todos los puestos)','Conducta en el trabajo',1,'Consumo de alcohol o drogas','Accidentes por pérdida de capacidades',1,4,'Prohibición en el RIOHS; programa de prevención del consumo de alcohol y drogas; supervisión.']
  ];
  function docProcIPER(){
    var H=seccionador();
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    return dgHead('PROCEDIMIENTO','01')+
      '<div class="pts-tit">Identificación de peligros y evaluación de riesgos (IPER)</div>'+
      '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>PR-PREV-04</b></td><td><span class="sl">Versión</span><b>01</b></td><td><span class="sl">Fecha</span>'+ce(fFaena(todayISO()))+'</td><td><span class="sl">Aplica a</span><b>Todos los procesos</b></td></tr></tbody></table>'+
      dgFirmasPTS()+
      H('Objetivo')+'<p>Establecer la metodología para identificar los peligros y evaluar los riesgos laborales de los procesos, tareas y puestos de trabajo de '+EMP.rz+', y definir las medidas de control, según el artículo 7° del D.S. N° 44.</p>'+
      H('Alcance')+'<p>Aplica a todos los procesos, tareas y puestos de trabajo de la empresa, en sus dependencias y en las faenas de los clientes, incluidas las tareas rutinarias y no rutinarias.</p>'+
      H('Normativa y referencias')+ulDg(['D.S. N° 44 del Ministerio del Trabajo y Previsión Social, artículos 7° (matriz), 8° (programa de trabajo preventivo) y 9° (prelación de las medidas).','Guía Técnica para la identificación y evaluación primaria de riesgos en los ambientes de trabajo, del Instituto de Salud Pública (ISP).','Ley N° 16.744 y Reglamento Interno de Orden, Higiene y Seguridad de la empresa.'])+
      H('Definiciones')+'<table class="dg-tbl"><tbody>'+tr('Peligro','Fuente, situación o condición con potencial de causar lesiones o afectar la salud de las personas.')+tr('Riesgo','Posibilidad de que una persona sufra un daño a causa de un peligro.')+tr('Tarea rutinaria','Tarea que se realiza de forma habitual o programada.')+tr('Tarea no rutinaria','Tarea ocasional, de emergencia o fuera de lo habitual.')+tr('Magnitud del riesgo (MR)','Resultado de multiplicar la probabilidad por la consecuencia.')+tr('Persona trabajadora especialmente sensible','Persona que, por sus características personales o estado biológico, es más vulnerable a un riesgo.')+'</tbody></table>'+
      H('Responsabilidades')+'<table class="dg-tbl"><tbody>'+tr('Gerencia','Aprobar la matriz, proveer los recursos para las medidas de control y aprobar el programa de trabajo preventivo.')+tr('Prevención de riesgos','Elaborar y actualizar la matriz, asesorar en la evaluación, difundirla y elaborar el programa de trabajo preventivo.')+tr('Supervisores','Participar en la identificación de peligros de sus tareas y velar por el cumplimiento de las medidas de control.')+tr('Trabajadores','Informar peligros y condiciones inseguras, participar en la identificación y cumplir las medidas de control.')+tr('Comité Paritario','Conocer la matriz, hacer observaciones y participar en su revisión.')+'</tbody></table>'+
      H('Metodología')+
        '<p style="margin:8px 0 4px"><b>Paso 1 · Identificar procesos, tareas y puestos.</b></p>'+ulDg(['Listar los procesos de la empresa y sus tareas, indicando si son rutinarias o no rutinarias y los puestos de trabajo que las realizan.'])+
        '<p style="margin:8px 0 4px"><b>Paso 2 · Identificar los peligros.</b></p>'+ulDg(['Para cada tarea, identificar los peligros de seguridad, higiene (agentes físicos, químicos y biológicos), ergonómicos y psicosociales, y la violencia y el acoso en el trabajo.','Considerar los accidentes y enfermedades ocurridos, los programas de vigilancia ocupacional, el enfoque de género y a las personas trabajadoras especialmente sensibles.','La identificación se hace en terreno, con participación de los trabajadores y supervisores de la tarea.'])+
        '<p style="margin:8px 0 4px"><b>Paso 3 · Evaluar el riesgo.</b> La magnitud del riesgo es el producto de la probabilidad por la consecuencia, considerando los controles existentes.</p>'+
        '<table class="dg-tbl"><thead><tr><th style="width:24%">Probabilidad</th><th style="width:8%">Valor</th><th>Criterio</th></tr></thead><tbody>'+
          '<tr><td><b>Baja</b></td><td>1</td><td>El daño ocurrirá raras veces.</td></tr><tr><td><b>Media</b></td><td>2</td><td>El daño ocurrirá en algunas ocasiones.</td></tr><tr><td><b>Alta</b></td><td>4</td><td>El daño ocurrirá siempre o casi siempre.</td></tr></tbody></table>'+
        '<table class="dg-tbl"><thead><tr><th style="width:24%">Consecuencia</th><th style="width:8%">Valor</th><th>Criterio</th></tr></thead><tbody>'+
          '<tr><td><b>Ligeramente dañino</b></td><td>1</td><td>Lesiones leves sin incapacidad, molestias o irritaciones.</td></tr><tr><td><b>Dañino</b></td><td>2</td><td>Lesiones con incapacidad temporal, como cortes, quemaduras o esguinces.</td></tr><tr><td><b>Extremadamente dañino</b></td><td>4</td><td>Lesiones graves, incapacidad permanente, enfermedad profesional grave o muerte.</td></tr></tbody></table>'+
        '<div class="pts-figs"><figure class="pts-fig ancha">'+figMatrizMR()+'<figcaption>Magnitud del riesgo = probabilidad × consecuencia</figcaption></figure></div>'+
        '<p style="margin:8px 0 4px"><b>Paso 4 · Definir la acción según el nivel.</b></p>'+
        '<table class="dg-tbl"><thead><tr><th style="width:26%">Nivel</th><th>Acción y plazo</th></tr></thead><tbody>'+
          '<tr><td>'+mrChip(1).replace('1 · ','1–2 · ')+'</td><td>Mantener los controles existentes y verificarlos periódicamente.</td></tr>'+
          '<tr><td>'+mrChip(4)+'</td><td>Reforzar los controles y verificar su eficacia; las mejoras se programan en el programa de trabajo preventivo.</td></tr>'+
          '<tr><td>'+mrChip(8)+'</td><td>No iniciar la tarea sin las medidas de control implementadas; requiere procedimiento de trabajo seguro, supervisión y capacitación específica.</td></tr>'+
          '<tr><td>'+mrChip(16)+'</td><td>No iniciar o detener de inmediato la tarea hasta reducir el riesgo.</td></tr></tbody></table>'+
        '<p style="margin:8px 0 4px"><b>Paso 5 · Definir las medidas de control en orden de prelación</b> (artículo 9°, D.S. N° 44):</p>'+ulDg(['1. Eliminar el riesgo.','2. Controlarlo en su fuente con medidas técnicas o de ingeniería.','3. Reducirlo con medidas administrativas: procedimientos, capacitación, señalización y rotación.','4. Proporcionar elementos de protección personal adecuados, como última medida.'])+
        '<p style="margin:8px 0 4px"><b>Paso 6 · Registrar, difundir y planificar.</b></p>'+ulDg(['Registrar los resultados en la Matriz IPER (MAT-PREV-02).','Mantenerla disponible en los lugares de trabajo e informarla a los trabajadores, al Comité Paritario y a la línea de mando.','Elaborar o actualizar el programa de trabajo preventivo dentro de 30 días corridos desde la confección o actualización de la matriz.'])+
      H('Revisión de la matriz')+ulDg(['Al menos una vez al año.','Cuando cambien las condiciones de trabajo y signifiquen un riesgo adicional.','Cuando ocurra un accidente del trabajo o se diagnostique una enfermedad profesional.','Cuando se genere una situación de riesgo grave e inminente.'])+
      H('Registros')+ulDg(['Matriz IPER (MAT-PREV-02).','Programa de trabajo preventivo (PRG-PREV-01).','Registro de difusión de la matriz a los trabajadores.'])+
      H('Control de cambios')+'<table class="dg-tbl"><thead><tr><th style="width:15%">Versión</th><th style="width:20%">Fecha</th><th>Descripción del cambio</th></tr></thead><tbody><tr><td>01</td><td>'+fFaena(todayISO())+'</td><td>Emisión original.</td></tr></tbody></table>';
  }
  // Matriz IPER v02: medidas separadas por jerarquía de control y riesgo residual (observaciones del mandante).
  // Clave = inicio de la "tarea" de IPER_FILAS. f = eliminación / ingeniería (control en la fuente), a = administrativas,
  // p = EPP, r = [P, C] residual (después de implementar y verificar todas las medidas).
  var IPER_EXT={
    'Limpieza de pisos y superficies':{ f:'Drenaje y barre agua para retirar el agua; secado al terminar.', a:'Orden y aseo; señalizar el área en limpieza; limpiar por sectores.', p:'Calzado o botas antideslizantes.', r:[1,2] },
    'Uso de productos químicos de limpieza':{ f:'Sustituir por productos de menor peligrosidad cuando sea posible; dosificadores; ventilación del área.', a:'PTS-PREV-03; HDS disponible; rotulado; capacitación; uso de químicos ya diluidos.', p:'Guantes de nitrilo, lentes o careta, respirador según HDS, traje impermeable.', r:[1,2] },
    'Dilución y trasvasije':{ f:'Dilución en lugar ventilado con dosificador o envases graduados.', a:'Prohibido mezclar productos; solo diluye personal autorizado; envases rotulados.', p:'Guantes de nitrilo, careta facial, respirador según HDS.', r:[1,4] },
    'Uso de abrillantadora':{ f:'Protección diferencial; equipos con aislamiento y enchufes estancos; cables fuera del piso mojado.', a:'Inspección de cables y enchufes antes de usar; no proyectar agua sobre tableros; desconectar al intervenir.', p:'Botas de goma.', r:[1,4] },
    'Hidrolavado':{ f:'Gatillo con seguro; mangueras y acoples en buen estado y de la presión adecuada.', a:'Solo personal capacitado; no apuntar a personas; revisión de mangueras; delimitar el área.', p:'Careta facial o lentes, traje impermeable, guantes, botas.', r:[1,2] },
    'Uso de equipos ruidosos':{ f:'Preferir equipos de menor emisión de ruido; mantención de equipos.', a:'Rotación de tareas; señalizar áreas ruidosas; evaluación de ruido y protocolo PREXOR según resultado.', p:'Protector auditivo en áreas señalizadas.', r:[2,2] },
    'Traslado de bidones':{ f:'Ayudas mecánicas (carros, transpaletas); envases de menor peso.', a:'Ley N° 20.949: máximo 25 kg (20 kg mujeres y menores de 18 años); técnica de levantamiento; trabajo en equipo; evaluación de MMC.', p:'Guantes y calzado de seguridad.', r:[1,2] },
    'Limpieza de superficies con movimientos':{ f:'Herramientas con mango extensible y ergonómico; espumadores en lugar de aplicación manual.', a:'Pausas activas; rotación de tareas; identificación inicial TMERT.', p:'—', r:[2,2] },
    'Ingreso al estanque':{ f:'Limpiar desde el exterior cuando sea posible (evita el ingreso); ventilación forzada antes y durante el ingreso.', a:'PTS-PREV-05 y PTS-PREV-06; permiso de entrada; medición previa y continua con detector multigás calibrado; vigía permanente; capacitación.', p:'Arnés con línea de vida para extracción; respirador o equipo autónomo según la medición.', r:[1,4],
      ad:['Permiso de entrada firmado por el supervisor solo después de medir O2 entre 19,5 y 23,5 %, inflamables bajo 10 % del LIE y H2S y CO bajo sus límites; equipo de rescate en el lugar (trípode o sistema de extracción); detector con calibración vigente y registro de lecturas; prohibido ingresar sin vigía capacitado.','Supervisor de faena · Prevención de riesgos','Revisión del permiso y del registro de mediciones antes de cada ingreso; inspección mensual del detector y del equipo de rescate; simulacro de rescate semestral (PRG-PREV-01). Sin estas verificaciones la tarea no se autoriza.'] },
    'Acceso y trabajo dentro del estanque':{ f:'Escala fija o escala portátil asegurada; iluminación artificial.', a:'Inspección de la escala; tres puntos de apoyo; retiro del lodo antes de transitar.', p:'Arnés cuando corresponda; calzado antideslizante; casco.', r:[1,4],
      ad:['Inspección y fijación de la escala antes de cada ingreso; iluminación portátil apta para la atmósfera; retiro del lodo desde el exterior antes de entrar; arnés y línea de vida cuando el desnivel supere 1,8 m.','Supervisor de faena','Lista de verificación previa al ingreso firmada; observación de conductas mensual. Sin la lista firmada la tarea no se autoriza.'] },
    'Uso de herramientas manuales y eléctricas':{ f:'Guarda del esmeril; herramientas a batería (sin cables en ambiente húmedo).', a:'PTS-PREV-06; inspección diaria; retiro de herramientas defectuosas.', p:'Careta y lentes; guantes según la tarea.', r:[1,2] },
    'Trabajo en caliente':{ f:'Preferir corte en frío cuando sea posible; ventilación; retiro de material combustible.', a:'Permiso de trabajo en caliente; medición de inflamables bajo 10 % del LIE; vigía con extintor.', p:'Careta, guantes de cuero, ropa ignífuga.', r:[1,4] },
    'Uso de andamios':{ f:'Limpiar desde el piso con mangos extensibles cuando sea posible (evita la altura); preferir alza hombre a escalera; barandas completas; puntos de anclaje resistentes.', a:'PTS-PREV-01 y PTS-PREV-02; examen de altura vigente; inspección previa; plan de rescate; delimitación del área.', p:'Arnés de cuerpo completo con absorbedor; casco con barbiquejo.', r:[1,4],
      ad:['Permiso de trabajo en altura por tarea; solo personal con examen de altura vigente y capacitación CAP-PREV-03 (y CAP-PREV-04 para alza hombre); plan de rescate disponible en la faena; puntos de anclaje identificados; nunca trabajar solo.','Supervisor de faena · Prevención de riesgos','Control de exámenes vigentes antes de asignar la tarea; revisión del permiso; inspección mensual de arneses, andamios y escaleras; simulacro de rescate anual. Sin examen vigente ni permiso la tarea no se autoriza.'] },
    'Trabajo en altura con herramientas':{ f:'Rodapiés; portaherramientas.', a:'Amarrar las herramientas; delimitar y señalizar el área inferior.', p:'Casco con barbiquejo.', r:[1,2] },
    'Operación de alza hombre':{ f:'Mantener las distancias de seguridad; desenergizar cuando sea posible.', a:'Inspección del área antes de elevar; operador capacitado y autorizado.', p:'Casco con barbiquejo.', r:[1,4] },
    'Limpieza de cámaras frigoríficas':{ f:'Limpieza con la cámara detenida o a menor temperatura cuando el proceso lo permita; zona temperada de recuperación.', a:'PTS-PREV-07; pausas de recuperación; limitar el tiempo de permanencia; evaluación de exposición a frío.', p:'Ropa, guantes y gorro térmicos.', r:[2,2] },
    'Tránsito dentro de la cámara':{ f:'Retiro del agua con barre agua; pisos antideslizantes.', a:'Secar con paños; zona despejada.', p:'Botas antideslizantes.', r:[1,2] },
    'Permanencia dentro de la cámara':{ f:'Apertura interior de la puerta operativa y alarma de persona atrapada.', a:'Verificar la apertura interior antes de ingresar; trabajar en pareja; aviso al entrar y salir.', p:'Ropa térmica.', r:[1,4] },
    'Limpieza de bodegas, cubiertas':{ f:'Pasarelas y barandas seguras para el acceso.', a:'No trabajar solo; seguir las instrucciones de la nave.', p:'Chaleco salvavidas; calzado antideslizante.', r:[1,4] },
    'Ingreso a bodegas de la embarcación':{ f:'Ventilación forzada.', a:'Tratar como espacio confinado (PTS-PREV-05): permiso, medición de gases y vigía.', p:'Respirador según la medición; arnés de rescate.', r:[1,4] },
    'Jardinería':{ f:'Podar desde el piso con pértiga cuando sea posible; herramientas con sus protecciones.', a:'Delimitar el área de caída de ramas; podar en altura solo cumpliendo el PTS-PREV-01.', p:'Lentes o careta, guantes, casco.', r:[1,2] },
    'Tareas en exteriores':{ f:'Toldos o sombreaderos en trabajos prolongados al exterior.', a:'Protocolo de radiación UV; programar las tareas al exterior fuera de las horas de mayor radiación cuando sea posible; capacitación.', p:'Bloqueador solar, legionario, lentes con filtro UV, ropa de manga larga.', r:[1,2] },
    'Tareas en días de calor':{ f:'Puntos de hidratación y sombra.', a:'Pausas; reprogramar tareas pesadas.', p:'Ropa liviana; legionario.', r:[1,4] },
    'Traslado de personal':{ f:'Vehículos con mantención al día y equipamiento de seguridad.', a:'Licencia vigente; Ley de Tránsito; prohibido el celular; descansos; programa de conducción segura; planificación de rutas.', p:'Cinturón de seguridad.', r:[1,4],
      ad:['Programa de conducción segura: control de licencias y hoja de vida del conductor; lista de verificación del vehículo antes de cada salida; límites de conducción continua y descansos; prohibición total del celular al conducir; capacitación en manejo defensivo.','Gerencia de operaciones · Prevención de riesgos','Revisión semestral de licencias y documentos; lista de verificación diaria del vehículo; revisión mensual de la mantención. Sin licencia vigente ni lista de verificación no se autoriza la conducción.'] },
    'Desplazamiento en instalaciones':{ f:'Vías peatonales segregadas del mandante.', a:'Cumplir las reglas del mandante; no transitar por zonas de grúas.', p:'Chaleco reflectante.', r:[1,4] },
    'Trabajo de oficina':{ f:'Silla y pantalla regulables.', a:'Pausas activas.', p:'—', r:[1,1] },
    'Desplazamiento en oficinas':{ f:'Cables canalizados; pasamanos.', a:'Orden y aseo.', p:'—', r:[1,2] },
    'Organización del trabajo':{ f:'—', a:'Cuestionario CEAL-SM (SUSESO); distribución de cargas; canales de comunicación.', p:'—', r:[1,2] },
    'Relaciones laborales':{ f:'—', a:'Protocolo Ley N° 21.643 (PROT-PREV-01); canal de denuncias; capacitación y difusión; investigación de denuncias.', p:'—', r:[1,4] },
    'Atención y contacto':{ f:'—', a:'Instrucciones de actuación; aviso a la jefatura y al mandante; registro de incidentes.', p:'—', r:[1,2] },
    'Emergencias en la faena':{ f:'Extintores y vías de evacuación señalizadas.', a:'PR-PREV-03; simulacros; información del plan de emergencia del mandante.', p:'—', r:[1,4] },
    'Conducta en el trabajo':{ f:'—', a:'Prohibición en el RIOHS; programa de prevención del consumo de alcohol y drogas; supervisión.', p:'—', r:[1,4] }
  };
  function iperExt(f){ for(var k in IPER_EXT) if(f[1].indexOf(k)===0) return IPER_EXT[k]; return { f:'—', a:f[7], p:'—', r:[f[5],f[6]] }; }
  // Agentes higiénicos y ergonómicos: [agente, tareas expuestas, normativa, evaluación cualitativa, estado / próxima acción]
  var IPER_HIG=[
    ['Ruido','Hidrolavado, equipos de limpieza y salas de proceso','Protocolo PREXOR (MINSAL); D.S. N° 594','Posible exposición sobre el criterio de acción de PREXOR en salas de proceso y al hidrolavar.','Pendiente: solicitar evaluación cuantitativa (dosimetría) a la Mutual.'],
    ['Sustancias químicas','Uso y dilución de detergentes, desengrasantes y sanitizantes','D.S. N° 594 (límites permisibles); HDS de cada producto; PTS-PREV-03','Exposición dérmica e inhalatoria ocasional, controlada con dilución, ventilación y EPP.','Pendiente: inventario de productos con HDS; evaluación de la Mutual si algún producto tiene límite permisible.'],
    ['Frío','Limpieza de cámaras frigoríficas y salas de proceso','D.S. N° 594; PTS-PREV-07','Exposición intermitente bajo 0 °C en cámaras de congelado.','Pendiente: solicitar evaluación de exposición a frío a la Mutual.'],
    ['Radiación UV y calor','Tareas en exteriores','Ley N° 20.096; D.S. N° 594','Exposición estacional de septiembre a marzo.','Protocolo UV en aplicación; revisión cualitativa anual.'],
    ['TMERT-EESS','Fregado, escobillado, hidrolavado y retiro de hielo','Norma técnica TMERT-EESS (MINSAL)','Movimientos repetitivos y posturas forzadas de extremidades superiores.','Pendiente: identificación inicial con lista de chequeo, con asistencia de la Mutual.'],
    ['Manejo manual de carga','Traslado de bidones, sacos, equipos y materiales','Ley N° 20.949; guía técnica de MMC','Cargas habituales bajo 25 kg, con ayudas mecánicas.','Pendiente: evaluación de MMC con la Mutual.'],
    ['Riesgo psicosocial','Todos los puestos','Protocolo de vigilancia de riesgos psicosociales; cuestionario CEAL-SM (SUSESO)','Turnos, carga de trabajo y trabajo en faenas de terceros.','Pendiente: aplicar el cuestionario CEAL-SM.']];
  function docMatrizIPER(){
    var procs=[]; IPER_FILAS.forEach(function(f){ if(procs.indexOf(f[0])<0) procs.push(f[0]); });
    var cnt={}, cntR={}; IPER_FILAS.forEach(function(f){ var k=mrNivel(f[5]*f[6])[1], e=iperExt(f), kr=mrNivel(e.r[0]*e.r[1])[1]; cnt[k]=(cnt[k]||0)+1; cntR[kr]=(cntR[kr]||0)+1; });
    function chips(c){ return MR_NIV.slice().reverse().map(function(x){ return '<span class="mr-chip" style="background:'+x[2]+';color:'+x[3]+';border-color:'+x[3]+'55">'+x[1]+': '+(c[x[1]]||0)+'</span>'; }).join(''); }
    function mr(p,c){ return '<span class="iper-pc">'+p+'×'+c+'</span>'+mrChip(p*c); }
    var n=0, imp=[], H=seccionador();
    var filas=procs.map(function(p){ return '<tr class="iper-g"><td colspan="8">'+esc(p)+'</td></tr>'+IPER_FILAS.filter(function(f){ return f[0]===p; }).map(function(f){ n++; var e=iperExt(f); if(e.ad) imp.push([n,f,e]);
        return '<tr><td class="n">'+n+'</td><td>'+esc(f[1])+' <span class="iper-r">'+(f[2]?'R':'NR')+'</span></td><td><b>'+esc(f[3])+'</b><br>'+esc(f[4])+'</td><td class="c">'+mr(f[5],f[6])+'</td><td>'+esc(e.f)+'</td><td>'+esc(e.a)+'</td><td>'+esc(e.p)+'</td><td class="c">'+mr(e.r[0],e.r[1])+'</td></tr>'; }).join(''); }).join('');
    return dgHead('MATRIZ IPER','02')+
      '<div class="pts-tit">Matriz de identificación de peligros y evaluación de riesgos</div>'+
      '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>MAT-PREV-02</b></td><td><span class="sl">Versión</span><b>02</b></td><td><span class="sl">Fecha</span>'+ce(fFaena(todayISO()))+'</td><td><span class="sl">Metodología</span><b>Guía Técnica ISP · PR-PREV-04</b></td></tr></tbody></table>'+
      dgFirmasPTS()+
      H('Matriz de riesgos')+
      '<p style="font-size:11.5px;margin:0 0 6px">Procesos, tareas y puestos de trabajo de '+EMP.rz+' (artículo 7°, D.S. N° 44). <b>MR inicial</b> = probabilidad (P) × consecuencia (C) con los controles existentes. <b>MR residual</b> = P × C después de implementar y verificar todas las medidas indicadas. Las medidas se ordenan según la prelación del artículo 9° del D.S. N° 44: primero eliminar o controlar en la fuente, luego medidas administrativas y, como última medida, EPP. R = tarea rutinaria; NR = no rutinaria.</p>'+
      '<div class="mr-res"><b style="font-size:10.5px;margin-right:4px">Inicial</b>'+chips(cnt)+'</div><div class="mr-res"><b style="font-size:10.5px;margin-right:4px">Residual</b>'+chips(cntR)+'</div>'+
      '<table class="dg-tbl iper"><thead><tr><th style="width:20px">N°</th><th style="width:15%">Tarea / puesto</th><th style="width:15%">Peligro / riesgo</th><th style="width:60px">MR inicial</th><th>Eliminación / ingeniería (control en la fuente)</th><th>Medidas administrativas</th><th style="width:13%">EPP</th><th style="width:60px">MR residual</th></tr></thead><tbody>'+filas+'</tbody></table>'+
      H('Riesgos importantes: controles adicionales')+
      '<p style="font-size:11.5px;margin:0 0 6px">Los riesgos con MR inicial 8 (importante) no se autorizan hasta tener implementados los controles adicionales y verificada su eficacia.</p>'+
      '<table class="dg-tbl iper"><thead><tr><th style="width:20px">N°</th><th style="width:17%">Tarea / riesgo</th><th>Controles adicionales específicos</th><th style="width:15%">Responsable</th><th style="width:27%">Verificación de eficacia antes de autorizar</th></tr></thead><tbody>'+
        imp.map(function(x){ return '<tr><td class="n">'+x[0]+'</td><td><b>'+esc(x[1][1])+'</b><br>'+esc(x[1][4])+'<br>'+mr(x[1][5],x[1][6])+' → '+mr(x[2].r[0],x[2].r[1])+'</td><td>'+esc(x[2].ad[0])+'</td><td>'+esc(x[2].ad[1])+'</td><td>'+esc(x[2].ad[2])+'</td></tr>'; }).join('')+'</tbody></table>'+
      H('Evaluación de riesgos higiénicos y ergonómicos')+
      '<p style="font-size:11.5px;margin:0 0 6px">Agentes que requieren una evaluación específica, además de la evaluación de la matriz. El estado se actualiza con los informes de la '+EMP.mutual+'.</p>'+
      '<table class="dg-tbl iper"><thead><tr><th style="width:12%">Agente</th><th style="width:18%">Tareas expuestas</th><th style="width:18%">Normativa / protocolo</th><th>Evaluación cualitativa</th><th style="width:24%">Estado o resultado</th></tr></thead><tbody>'+
        IPER_HIG.map(function(g){ return '<tr><td><b>'+g[0]+'</b></td><td>'+g[1]+'</td><td>'+g[2]+'</td><td>'+g[3]+'</td><td>'+ce(g[4])+'</td></tr>'; }).join('')+'</tbody></table>'+
      '<p style="font-size:11px;color:#55607a;margin:0">Las mejoras y evaluaciones pendientes se programan en el Programa de trabajo preventivo (PRG-PREV-01). Para personas trabajadoras especialmente sensibles se evalúan medidas adicionales caso a caso. La matriz se revisa al menos una vez al año y cada vez que cambien las condiciones, ocurra un accidente o se diagnostique una enfermedad profesional.</p>'+
      H('Control de cambios')+'<table class="dg-tbl"><thead><tr><th style="width:15%">Versión</th><th style="width:20%">Fecha</th><th>Descripción del cambio</th></tr></thead><tbody><tr><td>01</td><td>oct. 2026</td><td>Emisión original.</td></tr><tr><td>02</td><td>'+fFaena(todayISO())+'</td><td>Observaciones del mandante: se agrega el riesgo residual (P, C y MR después de las medidas), se separan las medidas en control en la fuente, administrativas y EPP, se definen controles adicionales, responsables y verificación para los riesgos importantes, y se incorpora la evaluación de riesgos higiénicos y ergonómicos.</td></tr></tbody></table>';
  }
  // ====== Protocolo de prevención del acoso sexual, laboral y violencia en el trabajo (Ley N° 21.643, Ley Karin) ======
  // Base: protocolo de la empresa (20-07-2024, carpeta 05- Ley Karin), anexo del RIOHS 2026 (art. 238) y procedimiento de investigación.
  var KARIN=D.KARIN;
  function docProtKarin(){
    var H=seccionador();
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    function sub(t){ return '<p style="margin:10px 0 4px"><b>'+t+'</b></p>'; }
    return dgHead('PROTOCOLO','02')+
      '<div class="pts-tit">Prevención del acoso sexual, laboral y violencia en el trabajo</div>'+
      '<p style="text-align:center;margin-top:-4px;color:#667;font-weight:700">Ley N° 21.643 (Ley Karin)</p>'+
      '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>PROT-PREV-01</b></td><td><span class="sl">Versión</span><b>02</b></td><td><span class="sl">Fecha</span>'+ce(fFaena(todayISO()))+'</td><td><span class="sl">Aplica a</span><b>Toda la empresa</b></td></tr></tbody></table>'+
      dgFirmasPTS()+
      H('Introducción')+'<p>En cumplimiento de la Ley N° 21.643, '+EMP.rz+' ha elaborado el presente protocolo con las acciones dirigidas a prevenir el acoso sexual, el acoso laboral y la violencia en el trabajo, teniendo presente el artículo 19 N° 1 de la Constitución Política, que garantiza el derecho a la vida y a la integridad física y psíquica de las personas, y el artículo 2° del Código del Trabajo, según el cual las relaciones laborales deben fundarse siempre en un trato libre de violencia, compatible con la dignidad de la persona y con perspectiva de género.</p>'+
      H('Objetivos')+ulDg(['Fortalecer entornos laborales seguros y libres de violencia, promoviendo el buen trato y la igualdad con perspectiva de género.','Prevenir el acoso sexual, el acoso laboral y la violencia en el trabajo, gestionando los riesgos psicosociales y corrigiendo las conductas inadecuadas.','Identificar y gestionar estos riesgos en la matriz de riesgos (MAT-PREV-02), evaluarlos, mitigarlos y corregirlos según los resultados de su seguimiento.'])+
      H('Alcance')+'<p>Aplica a todas las personas trabajadoras de '+EMP.rz+', incluidas jefaturas y gerencia, cualquiera sea su relación contractual, y a contratistas, subcontratistas y proveedores. Cuando corresponda, se aplica también a visitas, usuarios o clientes, y a las situaciones que ocurran en las faenas de las empresas mandantes.</p>'+
      H('Marco normativo')+ulDg(['Ley N° 21.643, que modifica el Código del Trabajo en materia de prevención, investigación y sanción del acoso laboral, sexual o de violencia en el trabajo.','Código del Trabajo, artículos 2° y 211-A a 211-E.','D.S. N° 21 de 2024 del Ministerio del Trabajo y Previsión Social, reglamento de los procedimientos de investigación.','Compendio de Normas del Seguro de la Ley N° 16.744 (SUSESO), en materia de riesgos psicosociales; D.S. N° 2 de 2024, Política Nacional de Seguridad y Salud en el Trabajo; D.S. N° 44.','Reglamento Interno de Orden, Higiene y Seguridad de la empresa (RIOHS 2026).'])+
      H('Definiciones')+
        sub('Acoso sexual')+'<p>Conducta en que una persona realiza, en forma indebida y por cualquier medio, requerimientos de carácter sexual no consentidos por quien los recibe, que amenacen o perjudiquen su situación laboral o sus oportunidades en el empleo. Por ejemplo:</p>'+ulDg(['Enviar mensajes o imágenes sexualmente explícitos o acosar por plataformas digitales sin consentimiento.','Ofrecer beneficios a cambio de favores sexuales o amenazar con consecuencias negativas ante una negativa.','Contacto físico o comportamiento sexual no deseado: roces, pellizcos, besos u otros.'])+
        sub('Acoso laboral')+'<p>Toda conducta de agresión u hostigamiento ejercida por el empleador o por uno o más trabajadores contra otro u otros, por cualquier medio, que se manifieste una sola vez o de manera reiterada, y que tenga como resultado su menoscabo, maltrato o humillación, o que amenace o perjudique su situación laboral o sus oportunidades en el empleo. Incluye el acoso psicológico. Por ejemplo:</p>'+ulDg(['Juzgar el desempeño de manera ofensiva, ridiculizar o usar lenguaje despectivo o insultante.','Aislar a una persona, ignorarla o prohibir a otros que hablen con ella.','Dejar a una persona sin tareas o asignarle tareas degradantes o ajenas a su perfil para menospreciarla.','Enviar mensajes amenazantes, abusivos o despectivos por correo, redes sociales o mensajería.','Comentarios despectivos sobre características personales, como género, etnia, origen, vestimenta o apariencia.'])+
        sub('Violencia en el trabajo ejercida por terceros')+'<p>Conductas que afectan a las personas trabajadoras, con ocasión de la prestación de servicios, por parte de clientes, proveedores, usuarios o visitas: gritos, amenazas, insultos, agresiones físicas, robos o asaltos.</p>'+
        sub('Comportamientos incívicos y sexismo')+'<p>Los comportamientos descorteses o groseros sin clara intención de dañar, y las expresiones basadas en la idea de que algunas personas son inferiores por su sexo o género (chistes sexistas, comentarios denigrantes, interrupciones o silenciamiento por razón de género), pueden escalar hacia el acoso y la violencia, por lo que también se previenen y corrigen.</p>'+
        '<p style="font-size:11.5px">No constituyen acoso, mientras se respeten los derechos fundamentales y no se usen como forma de hostigamiento: las instrucciones y evaluaciones legítimas del trabajo, la asignación y cambio de tareas, la información sobre un desempeño insatisfactorio o una conducta inadecuada, y la aplicación de medidas disciplinarias conforme al RIOHS.</p>'+
      H('Principios')+ulDg(['Perspectiva de género, no discriminación y no revictimización.','Confidencialidad, imparcialidad, celeridad, razonabilidad y debido proceso.','Colaboración de todas las personas en la prevención y en las investigaciones.'])+
      H('Derechos y deberes')+
      '<table class="dg-tbl"><thead><tr><th style="width:50%">Personas trabajadoras</th><th>Empresa</th></tr></thead><tbody>'+
        '<tr><td>Trabajar en un ambiente libre de acoso y violencia.</td><td>Adoptar medidas preventivas, incluida la violencia y el acoso por razón de género, mediante la gestión de los riesgos, la información y la capacitación.</td></tr>'+
        '<tr><td>Tratar a todos con respeto y no cometer actos de acoso o violencia.</td><td>Informar los canales de denuncia y orientar a las personas denunciantes.</td></tr>'+
        '<tr><td>Denunciar las conductas de acoso y violencia ante la persona designada o la Dirección del Trabajo.</td><td>Asegurar la estricta confidencialidad de las denuncias y su investigación.</td></tr>'+
        '<tr><td>Cooperar en las investigaciones y mantener la confidencialidad.</td><td>Proteger a denunciantes, víctimas y testigos contra la revictimización y las represalias.</td></tr>'+
        '<tr><td>Ser informadas del protocolo, de sus evaluaciones y de sus resultados.</td><td>Aplicar las medidas que resulten de las investigaciones y monitorear el cumplimiento del protocolo.</td></tr></tbody></table>'+
      H('Política de prevención')+
      '<div class="dg-box" style="padding:12px 14px"><p style="margin:0 0 6px">'+EMP.rz+' declara que el acoso sexual, el acoso laboral y la violencia en el trabajo son conductas intolerables y no permitidas en la organización. Las relaciones interpersonales deben basarse siempre en el buen trato y el respeto mutuo, sin importar la posición, el género, la orientación sexual, el origen o las creencias de las personas.</p><p style="margin:0">La empresa reconoce que la violencia y el acoso también pueden originarse en comportamientos incívicos y sexistas, y se compromete a abordarlos activamente. Este compromiso es asumido por la gerencia y por las personas trabajadoras, en un esfuerzo colaborativo y participativo, y la política se revisa cada dos años.</p></div>'+
      H('Organización para la gestión del riesgo')+
      '<table class="dg-tbl">'+tr('Responsable de implementar el protocolo',KARIN.resp+', con el apoyo de Prevención de riesgos ('+EMP_PREV.nombre+').')+tr('Recepción de denuncias y orientación',KARIN.receptor+'.')+tr('Canales de denuncia','Correo '+KARIN.canal+' · correo '+KARIN.correo+' · en forma presencial o por escrito ante la Gerencia General · ante la Dirección del Trabajo, en forma presencial o electrónica.')+tr('Dudas y sugerencias sobre el protocolo',KARIN.correo)+tr('Participación','Las personas trabajadoras participan en la identificación de los riesgos y en la definición de las medidas; las organizaciones sindicales pueden formular planteamientos según el artículo 220 N° 8 del Código del Trabajo.')+'</table>'+
      H('Gestión preventiva')+
        sub('Identificación de los factores de riesgo')+'<p>Al menos cada dos años, y con perspectiva de género, se identifican las situaciones que pueden originar acoso o violencia, considerando los resultados del cuestionario CEAL-SM (SUSESO), las licencias médicas y denuncias de enfermedad profesional (DIEP) por acoso o violencia, las solicitudes de intervención en conflictos y las denuncias presentadas en la empresa o ante la Dirección del Trabajo. Los factores se registran en la matriz de riesgos (MAT-PREV-02).</p>'+
        '<div class="dg-cols">'+ulDg(['Carga de trabajo y turnos.','Falta de reconocimiento.','Inequidad en la distribución de tareas.','Liderazgo y comunicación.'])+ulDg(['Comportamientos incívicos.','Conductas sexistas.','Acoso sexual y laboral.','Violencia de terceros en faenas de mandantes.'])+'</div>'+
        sub('Medidas de prevención')+
        '<table class="dg-tbl"><thead><tr><th>Medida</th><th style="width:24%">Responsable</th><th style="width:20%">Frecuencia</th></tr></thead><tbody>'+
          [['Difusión del protocolo y de los canales de denuncia en la inducción, con registro firmado','Prevención de riesgos','Al ingreso y anual'],['Capacitación a jefaturas y trabajadores: conductas de acoso y violencia, formas de presentación, efectos en la salud y situaciones que no constituyen acoso','Prevención de riesgos · Gerencia','Anual'],['Información sobre comportamientos incívicos y sexismo con ejemplos prácticos (charlas, afiches, trípticos, correos)','Prevención de riesgos','Semestral'],['Aplicación del cuestionario CEAL-SM y medidas de intervención según sus resultados','Gerencia General','Según protocolo SUSESO'],['Medidas frente a la violencia de terceros, definidas con la opinión de los trabajadores de la faena afectada y en coordinación con el mandante','Supervisores · Gerencia','Cuando corresponda'],['Actividades que promuevan el respeto, la igualdad de trato y la no discriminación','Gerencia General','Anual']].map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td></tr>'; }).join('')+'</tbody></table>'+
        '<p style="font-size:11.5px">Las medidas se programan en el Programa de trabajo preventivo (PRG-PREV-01), con sus plazos, responsables y fecha de ejecución, y se dan a conocer a las personas trabajadoras.</p>'+
      H('Procedimiento de denuncia e investigación')+
      '<p style="font-size:11.5px;margin:0 0 6px">Resumen del procedimiento de investigación de la empresa, que se rige por el Código del Trabajo y el D.S. N° 21 de 2024.</p>'+
      '<table class="dg-tbl"><thead><tr><th style="width:5%">N°</th><th style="width:24%">Etapa</th><th>Qué se hace</th></tr></thead><tbody>'+
        [['Denuncia','La persona afectada denuncia por escrito o en forma verbal (se levanta un acta que firma) ante la Gerencia General, por los canales indicados, o ante la Dirección del Trabajo. Recibe un comprobante. La denuncia identifica a denunciante y denunciado y relata los hechos.'],['Medidas de resguardo','De inmediato se adoptan medidas de protección, considerando la gravedad de los hechos y las condiciones de trabajo: separación de espacios físicos, redistribución de la jornada o cambio de faena, y derivación a la atención psicológica temprana de la '+EMP.mutual+'.'],['Investigar o derivar','Dentro de 3 días hábiles la empresa informa a la persona denunciante si investigará internamente o si deriva la denuncia a la Dirección del Trabajo. Si los hechos ocurren en la faena de un mandante, se le informa según corresponda.'],['Investigación','La realiza una persona imparcial y capacitada, por escrito, oyendo a ambas partes y recibiendo sus pruebas. Concluye dentro de 30 días.'],['Informe a la Dirección del Trabajo','Dentro de 2 días de terminada, el informe con sus conclusiones se envía a la Dirección del Trabajo, que tiene 30 días para pronunciarse.'],['Medidas y sanciones','Dentro de 15 días corridos desde el pronunciamiento (o desde el vencimiento de su plazo), la empresa aplica las medidas o sanciones que correspondan según el RIOHS y las comunica a las partes.']].map(function(r,i){ return '<tr><td class="n">'+(i+1)+'</td><td><b>'+r[0]+'</b></td><td>'+r[1]+'</td></tr>'; }).join('')+'</tbody></table>'+
      '<p style="font-size:11.5px">Se prohíbe toda represalia contra quienes denuncien o declaren como testigos. Las denuncias falsas hechas de mala fe se sancionan conforme al RIOHS.</p>'+
      H('Resguardo de la privacidad y la honra')+'<p>Se mantiene reserva de los hechos denunciados y de su investigación, y se prohíben las acciones que intimiden a los involucrados (denunciantes, denunciados, víctimas y testigos) o pongan en riesgo su integridad física o psíquica.</p>'+
      H('Seguimiento y evaluación')+'<p>Una vez al año, la Gerencia General, con Prevención de riesgos, evalúa el cumplimiento y la eficacia de las medidas, considerando los resultados del CEAL-SM, las DIEP por acoso o violencia, las solicitudes de intervención y las denuncias del período. Con los resultados se elabora un informe, disponible para las personas trabajadoras, y se actualizan la matriz de riesgos y el programa preventivo.</p>'+
      H('Difusión')+'<p>El protocolo se da a conocer a las personas trabajadoras al ingreso y cada vez que se actualiza, mediante su entrega con registro firmado, capacitaciones, charlas de inducción, afiches, trípticos y correos. Forma parte del Reglamento Interno (RIOHS 2026) y de la información de riesgos laborales (IRL).</p>'+
      H('Control de cambios')+'<table class="dg-tbl"><thead><tr><th style="width:15%">Versión</th><th style="width:20%">Fecha</th><th>Descripción del cambio</th></tr></thead><tbody><tr><td>01</td><td>20-07-2024</td><td>Emisión original.</td></tr><tr><td>02</td><td>'+fFaena(todayISO())+'</td><td>Formato corporativo; responsables y canales de denuncia actualizados según el RIOHS 2026; se agregan el marco normativo, la tabla de medidas con responsables y frecuencia, y el resumen del procedimiento de denuncia e investigación con sus plazos.</td></tr></tbody></table>';
  }
  // Programa de trabajo preventivo (artículo 8°, D.S. N° 44): 12 meses desde el mes siguiente a su emisión.
  // Actividad: [grupo, actividad, responsable, frecuencia, meses (1..12, 'todos' o función por mes calendario), verificación]
  var PRG_ACT=[
    ['Gestión del riesgo','Difundir la matriz IPER a los trabajadores, la línea de mando y el Comité Paritario','Prevención','Al inicio',[1],'Registro de difusión'],
    ['Gestión del riesgo','Revisar y actualizar la matriz IPER (y ante accidentes o cambios)','Prevención','Anual',[12],'Matriz actualizada'],
    ['Gestión del riesgo','Revisar los PTS según la matriz y elaborar los que falten','Prevención','Trimestral',[2,5,8,11],'PTS vigentes'],
    ['Gestión del riesgo','Verificar la eficacia de los controles adicionales de los riesgos importantes (estanques, altura y conducción)','Prevención y supervisores','Mensual','todos','Permisos y listas de verificación'],
    ['Capacitación','Inducción e información de riesgos laborales (IRL) a trabajadores nuevos','Prevención','Al ingreso','todos','IRL firmada'],
    ['Capacitación','Charlas de inicio de jornada (5 minutos)','Supervisores','Semanal','todos','Registro de charlas'],
    ['Capacitación','Entrega e instrucción de los PTS de cada tarea','Prevención','Trimestral',[1,4,7,10],'Registro de entrega de PTS'],
    ['Capacitación','Capacitación en espacios confinados y trabajos en altura','Prevención','Semestral',[2,8],'Registro y evaluación'],
    ['Capacitación','Capacitación en primeros auxilios','Prevención','Semestral',[3,9],'Registro y evaluación'],
    ['Capacitación','Uso y cuidado de EPP · uso de extintores','Prevención','Semestral',[4,10],'Registro de capacitación'],
    ['Inspección y control','Inspección de faenas y observación de conductas','Prevención y supervisores','Mensual','todos','Informe de inspección'],
    ['Inspección y control','Inspección de EPP, herramientas y equipos','Supervisores','Mensual','todos','Lista de verificación'],
    ['Inspección y control','Revisión de botiquines y extintores','Supervisores','Mensual','todos','Lista de verificación'],
    ['Emergencias','Simulacro de evacuación','Prevención','Semestral',[3,9],'Informe de simulacro'],
    ['Emergencias','Simulacro de rescate en espacio confinado','Prevención','Semestral',[4,10],'Informe de simulacro'],
    ['Emergencias','Mantención anual de extintores','Administración','Anual',[6],'Certificado de mantención'],
    ['Salud ocupacional','Control de exámenes ocupacionales (altura y otros) según vencimiento','Prevención','Mensual','todos','Exámenes vigentes'],
    ['Salud ocupacional','Protocolo de radiación UV: charla, bloqueador y protección','Prevención','Temporada (sep. a mar.)',function(m){ return [9,10,11,12,1,2,3].indexOf(m)>=0; },'Registro de entrega'],
    ['Salud ocupacional','Prevención del consumo de alcohol y drogas','Prevención','Semestral',[2,8],'Registro de actividad'],
    ['Salud ocupacional','Promoción de vida y alimentación saludable','Prevención','Trimestral',[3,6,9,12],'Registro de actividad'],
    ['Salud ocupacional','Manejo manual de carga y protocolo TMERT','Prevención','Semestral',[5,11],'Registro de capacitación'],
    ['Salud ocupacional','Evaluación de riesgos psicosociales (cuestionario CEAL-SM, SUSESO)','Gerencia y prevención','Según protocolo',[6],'Informe de resultados'],
    ['Salud ocupacional','Evaluaciones con la Mutual: ruido, frío, químicos, TMERT y manejo manual de carga','Prevención','Según calendario de la Mutual',[2,3,4],'Informes técnicos de la Mutual'],
    ['Conducción','Conducción segura y revisión de licencias y documentos de vehículos','Prevención y administración','Semestral',[1,7],'Registro y documentos al día'],
    ['Conducción','Revisión de mantención de vehículos','Administración','Mensual','todos','Registro de mantención'],
    ['Participación','Comité Paritario: constitución y reuniones mensuales','Gerencia y Comité','Mensual','todos','Actas de reunión'],
    ['Participación','Difusión del protocolo Ley Karin (PROT-PREV-01) y del canal de denuncias','Gerencia y prevención','Al ingreso y anual',[2],'Registro de difusión'],
    ['Participación','Capacitación en prevención del acoso y la violencia (Ley Karin) a jefaturas y trabajadores','Gerencia y prevención','Anual',[5],'Registro de capacitación'],
    ['Seguimiento','Investigación de accidentes e incidentes (dentro de 24 h)','Prevención y jefatura','Cuando ocurra','todos','Informe de investigación'],
    ['Seguimiento','Informe mensual de accidentabilidad','Prevención','Mensual','todos','Informe mensual'],
    ['Seguimiento','Evaluación anual de las medidas del protocolo Ley Karin','Gerencia General','Anual',[12],'Informe de evaluación'],
    ['Seguimiento','Evaluación anual del cumplimiento y eficacia del programa','Gerencia y prevención','Anual',[12],'Informe de evaluación']
  ];
  function docProgramaPrev(){
    var H=seccionador(), hoy=new Date(), M=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'], meses=[];
    for(var i=1;i<=12;i++){ var d=new Date(hoy.getFullYear(), hoy.getMonth()+i, 1); meses.push({cal:d.getMonth()+1, lbl:M[d.getMonth()], an:d.getFullYear()}); }
    var per=M[meses[0].cal-1].toLowerCase()+'. '+meses[0].an+' a '+M[meses[11].cal-1].toLowerCase()+'. '+meses[11].an;
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    function marca(a,k){ var m=a[4], c=meses[k].cal; return m==='todos' || (typeof m==='function'?m(c):m.indexOf(k+1)>=0); }
    var grupos=[], nn=0; PRG_ACT.forEach(function(a){ if(grupos.indexOf(a[0])<0) grupos.push(a[0]); });
    var gantt='<table class="dg-tbl prg"><thead><tr><th style="width:20px">N°</th><th>Actividad</th><th style="width:13%">Responsable</th>'+meses.map(function(m){ return '<th class="m">'+m.lbl+'<br><span>'+String(m.an).slice(2)+'</span></th>'; }).join('')+'</tr></thead><tbody>'+
      grupos.map(function(g){ return '<tr class="iper-g"><td colspan="15">'+esc(g)+'</td></tr>'+PRG_ACT.filter(function(a){ return a[0]===g; }).map(function(a){ nn++;
        return '<tr><td class="n">'+nn+'</td><td>'+esc(a[1])+'<span class="prg-f">'+esc(a[3])+' · '+esc(a[5])+'</span></td><td>'+esc(a[2])+'</td>'+meses.map(function(_,k){ return '<td class="m">'+(marca(a,k)?'<i></i>':'')+'</td>'; }).join('')+'</tr>'; }).join(''); }).join('')+'</tbody></table>';
    return dgHead('PROGRAMA','02')+
      '<div class="pts-tit">Programa de trabajo preventivo</div>'+
      '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>PRG-PREV-01</b></td><td><span class="sl">Versión</span><b>02</b></td><td><span class="sl">Fecha de aprobación</span>'+ce(fFaena(todayISO()))+'</td><td><span class="sl">Período</span><b>'+per+'</b></td></tr></tbody></table>'+
      dgFirmasPTS()+
      H('Objetivo')+'<p>Planificar y ejecutar las medidas preventivas y correctivas que se desprenden de la matriz de identificación de peligros y evaluación de riesgos (MAT-PREV-02), con sus plazos y responsables, para mantener un entorno de trabajo seguro y saludable, según el artículo 8° del D.S. N° 44.</p>'+
      H('Alcance')+'<p>Aplica a todos los trabajadores, procesos y faenas de '+EMP.rz+' durante el período indicado.</p>'+
      H('Normativa')+ulDg(['D.S. N° 44, artículo 8°: el programa se elabora a partir de la matriz dentro de 30 días corridos, consta por escrito, lo aprueba el representante legal, se difunde a los trabajadores y se remite al Comité Paritario.','Ley N° 16.744 y Reglamento Interno de Orden, Higiene y Seguridad de la empresa.'])+
      H('Metas')+'<table class="dg-tbl"><thead><tr><th>Meta</th><th style="width:30%">Indicador</th></tr></thead><tbody>'+
        '<tr><td>Cero accidentes graves o fatales.</td><td>N° de accidentes graves y fatales</td></tr>'+
        '<tr><td>Todo trabajador nuevo recibe inducción e IRL antes de iniciar sus labores.</td><td>Trabajadores con IRL ÷ ingresos × 100 = 100%</td></tr>'+
        '<tr><td>Todo trabajador tiene entregados los PTS de las tareas que realiza.</td><td>PTS entregados ÷ PTS que aplican × 100 = 100%</td></tr>'+
        '<tr><td>Cumplir las actividades programadas.</td><td>Actividades realizadas ÷ programadas × 100 ≥ 90%</td></tr>'+
        '<tr><td>Investigar todos los accidentes e incidentes.</td><td>Investigados ÷ ocurridos × 100 = 100%</td></tr></tbody></table>'+
      H('Responsabilidades')+'<table class="dg-tbl"><tbody>'+tr('Gerencia','Aprobar el programa, asignar los recursos y evaluar su cumplimiento.')+tr('Prevención de riesgos','Coordinar y ejecutar las actividades, registrar su cumplimiento y reportar a Gerencia.')+tr('Supervisores','Realizar las charlas e inspecciones a su cargo y hacer cumplir las medidas en terreno.')+tr('Trabajadores','Participar en las actividades y cumplir las medidas de seguridad.')+tr('Comité Paritario','Recibir el programa, hacer observaciones y colaborar en su ejecución.')+'</tbody></table>'+
      H('Cronograma de actividades')+'<p style="font-size:11px;margin:0 0 6px">Cada punto indica el mes en que se ejecuta la actividad. Bajo cada actividad se indica su frecuencia y el medio de verificación.</p>'+gantt+
      H('Control, seguimiento y evaluación')+ulDg(['El cumplimiento se controla mensualmente con los registros de cada actividad y se informa a Gerencia.','Al término del período se evalúa el cumplimiento y la eficacia de las medidas, considerando las mediciones y evaluaciones de riesgo, los accidentes y enfermedades ocurridos, las observaciones del Comité Paritario, las sugerencias de los trabajadores, los cambios en los procesos y las modificaciones legales.','Los resultados de la evaluación son la base del programa del período siguiente.'])+
      H('Difusión')+ulDg(['Antes de su implementación, el programa se difunde a los trabajadores por avisos visibles en los lugares de trabajo o por correo electrónico.','Se remite un ejemplar al Comité Paritario.'])+
      H('Control de cambios')+'<table class="dg-tbl"><thead><tr><th style="width:15%">Versión</th><th style="width:20%">Fecha</th><th>Descripción del cambio</th></tr></thead><tbody><tr><td>01</td><td>oct. 2026</td><td>Emisión original.</td></tr><tr><td>02</td><td>'+fFaena(todayISO())+'</td><td>Observaciones del mandante: se agregan la verificación mensual de los controles de los riesgos importantes de la matriz IPER v02, las evaluaciones con la Mutual (ruido, frío, químicos, TMERT y manejo manual de carga) y la capacitación y evaluación anual del protocolo Ley Karin (PROT-PREV-01).</td></tr></tbody></table>';
  }
  function docCapHerr(){
    var H=seccionador();
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    var T=[['Llave de cadena','Golpes, atrapamiento, deslizamiento.','Revisar el estado de la cadena; usar la medida adecuada; manos fuera de los puntos de atrapamiento.'],
      ['Juego de dados','Golpes, resbalamiento, daño de pernos.','Usar el dado correcto; no usar extensiones artesanales; mantener limpio el encastre.'],
      ['Llave de torque','Sobreesfuerzo, golpes por liberación brusca.','Verificar la calibración; aplicar el torque especificado; no usarla como palanca.'],
      ['Taladro de impacto','Proyección de partículas, atrapamiento, contacto eléctrico.','Revisar batería y mandril; sujetar firmemente; usar lentes de seguridad.'],
      ['Palas (blanca, metálica, carbonera y olleras)','Sobreesfuerzo, golpes, lesiones musculares.','Postura correcta; evitar sobrecargas; técnica de levantamiento seguro.'],
      ['Caja hidrolavadora','Inyección de agua a presión, resbalones, contacto eléctrico.','Revisar conexiones; mantener orden y limpieza; no dirigir el chorro hacia personas.'],
      ['Cuchillo','Cortes, punciones.','Mantener la funda protectora; cortar alejando el cuerpo; no dejar el filo expuesto.'],
      ['Esmeril angular a batería','Proyección de partículas, rotura de disco, cortes graves.','Revisar el disco; usar la guarda protectora y pantalla facial; esperar la detención completa antes de apoyar.'],
      ['Llave regulable (caimán)','Golpes, deslizamiento.','Ajustar correctamente; aplicar fuerza controlada; no usar extensiones.'],
      ['Llave Stilson','Golpes, atrapamiento.','Revisar las mordazas; usar sobre tuberías adecuadas; mantener la regulación correcta.'],
      ['Medidor de gases portátil','No detectar una atmósfera peligrosa.','Calibración vigente, batería cargada, sensores operativos y prueba funcional; encender antes del ingreso, medir desde el exterior, registrar lecturas, monitoreo continuo y suspender ante cualquier alarma.']];
    // Material de la capacitación (contenido). La asistencia se firma en "Registro de capacitación" y la evaluación es un formato aparte.
    return dgHead('CAPACITACIÓN','01',CAP_FECHA)+
      '<div class="pts-tit">Uso seguro de herramientas manuales y equipos de apoyo</div>'+
      tablaCtl('CAP-PREV-01','Trabajadores que usan herramientas',CAP_FECHA)+
      H('Objetivo')+'<p>Capacitar a los trabajadores en el uso seguro, inspección, manipulación, almacenamiento y control de riesgos de las herramientas manuales y equipos de apoyo utilizados en limpieza industrial, mantenimiento, trabajos mecánicos y espacios confinados.</p>'+
      H('Alcance')+'<p style="margin:0 0 4px">Aplica a todos los trabajadores que utilicen:</p><div class="dg-cols">'+ulDg(['Llave de cadena','Juego de dados','Llave de torque','Taladro de impacto','Pala blanca','Pala metálica','Carbonera'])+ulDg(['Palas olleras','Caja hidrolavadora','Cuchillo grande amarillo','Esmeril angular a batería','Llave regulable (caimán)','Llave Stilson','Medidor de gases portátil'])+'</div>'+
      H('Riesgos asociados')+'<table class="dg-tbl"><tbody>'+tr('Mecánicos','Golpes por manipulación incorrecta, cortes y laceraciones, proyección de partículas, atrapamiento de dedos y manos, caída de herramientas.')+tr('Ergonómicos','Sobreesfuerzo físico, movimientos repetitivos, posturas forzadas.')+tr('Espacios confinados','Deficiencia de oxígeno, gases tóxicos, atmósferas explosivas, ventilación insuficiente.')+'</tbody></table>'+
      H('Elementos de protección personal obligatorios')+'<div class="dg-cols">'+ulDg(['Casco de seguridad.','Lentes de seguridad.','Guantes adecuados a la tarea.','Calzado de seguridad.'])+ulDg(['Protector auditivo.','Respirador cuando corresponda.','Arnés de seguridad para trabajos en altura.'])+'</div>'+
      H('Inspección previa de herramientas')+'<div class="dg-cols">'+ulDg(['Estado general.','Sin grietas ni deformaciones.','Herramienta limpia.','Funcionamiento correcto.'])+ulDg(['Etiqueta de inspección vigente.','Protecciones de fábrica instaladas.','Herramienta adecuada para la tarea.'])+'</div>'+
        '<p style="font-size:12px"><b>Toda herramienta defectuosa se retira de inmediato de servicio y se informa al supervisor.</b></p>'+
      H('Uso seguro por herramienta')+'<table class="dg-tbl"><thead><tr><th style="width:24%">Herramienta</th><th style="width:28%">Riesgos</th><th>Medidas preventivas</th></tr></thead><tbody>'+T.map(function(r){ return '<tr><td><b>'+r[0]+'</b></td><td>'+r[1]+'</td><td>'+r[2]+'</td></tr>'; }).join('')+'</tbody></table>'+
      H('Prohibiciones')+ulDg(['Modificar herramientas.','Utilizar herramientas para funciones distintas a las de su diseño.','Trabajar con herramientas defectuosas.','Exponer partes del cuerpo a herramientas en movimiento.','Transportar cuchillos o elementos cortantes sin protección.','Utilizar accesorios artesanales para aumentar fuerza o palanca.'])+
      H('Almacenamiento y transporte')+ulDg(['Mantener las herramientas limpias y secas.','Guardarlas en cajas, bolsos o áreas designadas.','Transportarlas siempre protegidas.','Mantener orden y aseo en el área de trabajo.'])+
      H('Registro')+'<p>La asistencia se registra en el formato <b>Registro de capacitación</b> y el aprendizaje se verifica con la <b>Evaluación de aprendizaje</b> (ISgestión → Empresa → Formatos para firmar).</p>';
  }
  // Capacitación ligada a un PTS (CAP_DOC con .pts): contenido propio + riesgos, EPP y rescate del PTS vigente.
  function docCapPTS(id){
    if(typeof figsAux==='function') figsAux();
    var C=CAP_DOC[id], P=ptsDatos(C.pts), H=seccionador(), min=Math.ceil(C.vf.length*0.7);
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    return dgHead('CAPACITACIÓN','01',CAP_FECHA)+
      '<div class="pts-tit">'+esc(C.n)+'</div>'+tablaCtl(C.cod,C.aplica,CAP_FECHA)+
      H('Objetivo')+'<p>'+C.obj+'</p>'+
      H('Alcance')+'<p>'+C.alc+'</p>'+
      '<table class="dg-tbl"><tbody>'+tr('Procedimiento asociado',esc(P.cod+' · '+P.titulo))+tr('Duración sugerida',C.dur)+tr('Modalidad','Teórico-práctica, en la faena o en oficina.')+tr('Relator',EMP_PREV.nombre+' · '+EMP_PREV.cargo)+'</tbody></table>'+
      H('Temario')+ulDg(C.t)+
      C.cont.map(function(s){ return H(s[0])+ulDg(s[1]); }).join('')+
      (PTS_FIG[C.pts]?H('Ilustraciones de referencia')+figurasPTS(C.pts):'')+
      H('Riesgos y medidas de control')+'<table class="dg-tbl"><thead><tr><th style="width:30%">Actividad / peligro</th><th style="width:24%">Riesgo</th><th>Medidas de control</th></tr></thead><tbody>'+
        (P.ries||[]).map(function(r){ return '<tr><td>'+r[0]+'</td><td><b>'+r[1]+'</b></td><td>'+r[2]+'</td></tr>'; }).join('')+'</tbody></table>'+
      H('Elementos de protección personal obligatorios')+ulDg(P.epp||[])+
      (P.rescate&&P.rescate.length?H(esc(P.rescateTit||'Plan de rescate'))+P.rescate.map(function(d){ return '<p style="margin:10px 0 4px"><b>'+d[0]+'</b></p>'+ulDg(d[1]); }).join(''):'')+
      H('Actividad práctica')+ulDg(C.prac)+
      H('Evaluación y registro')+ulDg(['La asistencia se firma en el <b>Registro de capacitación</b> (Empresa → Formatos para firmar), eligiendo esta capacitación: el tema y el temario se completan solos.','Cada participante responde la <b>Evaluación de aprendizaje</b> ('+C.vf.length+' preguntas de verdadero o falso); aprueba con '+min+' o más correctas. Quien repruebe repite la capacitación antes de realizar la tarea.','Junto con la capacitación se entrega el '+esc(P.cod)+' y se firma su registro de entrega.','Los registros firmados se guardan en Empresa y en la carpeta de cada trabajador.'])+
      (C.nota?'<p style="font-size:12px;margin-top:8px"><b>Importante:</b> '+C.nota+'</p>':'');
  }
  // Catálogo de capacitaciones: alimenta el Registro de capacitación (tema, temario, duración) y la Evaluación de aprendizaje.
  var CAP_FECHA='10-10-2026';   // fecha de la versión vigente de las capacitaciones (encabezado y tabla de control)
  var CAP_DOC={
    cap_primeros:{ n:'Primeros auxilios', dur:'', t:[
      'Conducta PAS: proteger, avisar y socorrer; números de emergencia.',
      'Evaluación inicial del lesionado: conciencia y respiración.',
      'Reanimación cardiopulmonar (RCP) en adultos y uso del desfibrilador (DEA).',
      'Posición lateral de seguridad.',
      'Atención de atragantamiento, hemorragias, heridas, quemaduras, químicos, fracturas, contacto eléctrico, gases, frío, calor y desmayo.',
      'Botiquín de faena y pasos después de la emergencia.'],
      vf:[['Antes de ayudar a un lesionado se debe verificar que el lugar sea seguro.',true],
        ['Si la persona no responde y no respira normalmente, se llama al 131 y se inician las compresiones.',true],
        ['Las compresiones del pecho se hacen a un ritmo de 100 a 120 por minuto.',true],
        ['A una quemadura se le debe aplicar pasta dental o crema para aliviar el dolor.',false],
        ['Una hemorragia se controla con presión directa y firme sobre la herida.',true],
        ['Ante un contacto eléctrico, se puede tocar a la persona antes de cortar la energía si se actúa rápido.',false],
        ['Hay que ingresar de inmediato a un espacio confinado para rescatar a un compañero desmayado.',false],
        ['La posición lateral de seguridad se usa en una persona inconsciente que respira normalmente.',true],
        ['Una fractura se debe acomodar en el lugar antes de trasladar al lesionado.',false],
        ['A una persona con hipotermia se le frota con fuerza la piel para calentarla.',false]] },
    cap_herr:{ n:'Uso seguro de herramientas manuales y equipos de apoyo', dur:'', t:[
      'Riesgos mecánicos, ergonómicos y de espacios confinados asociados a las herramientas.',
      'Elementos de protección personal obligatorios.',
      'Inspección previa de herramientas y retiro de las defectuosas.',
      'Uso seguro por herramienta: llaves, dados, llave de torque, taladro, palas, hidrolavadora, cuchillo, esmeril, caimán, Stilson y medidor de gases.',
      'Prohibiciones, almacenamiento y transporte de herramientas.'],
      // Evaluación de verdadero o falso: [afirmación, respuesta correcta]
      vf:[['Toda herramienta defectuosa debe retirarse de inmediato de servicio e informarse al supervisor.',true],
        ['Se puede seguir usando una herramienta con daños menores si se trabaja con cuidado.',false],
        ['Está permitido modificar una herramienta para facilitar el trabajo.',false],
        ['Antes de usar cualquier herramienta se debe realizar una inspección previa.',true],
        ['Al usar el esmeril angular se debe utilizar la guarda protectora y pantalla facial.',true],
        ['El esmeril angular se puede apoyar apenas se suelta el gatillo, aunque el disco siga girando.',false],
        ['El medidor de gases debe encenderse y probarse antes del ingreso, midiendo desde el exterior.',true],
        ['Si el detector de gases activa una alarma, se puede continuar si el trabajador se siente bien.',false],
        ['El medidor de gases debe tener calibración vigente, batería cargada y sensores operativos.',true],
        ['Al terminar la jornada, las herramientas pueden dejarse en cualquier lugar del área de trabajo.',false]] },
    // Capacitaciones de los PTS: el contenido propio va aquí; riesgos, EPP y plan de rescate se toman del PTS (también si se edita).
    cap_altura:{'n':'Trabajos en altura y plan de rescate','cod':'CAP-PREV-03','pts':'pts_altura','aplica':'Trabajadores que realizan trabajos en altura','dur':'2 horas','obj':'Capacitar a los trabajadores en la ejecución segura de trabajos en altura con plataformas, andamios y escaleras: requisitos para trabajar en altura, uso e inspección del sistema de detención de caídas, riesgos y medidas de control del PTS-PREV-01 y actuación ante una caída según el plan de rescate en altura.','alc':'Aplica a todo trabajador de '+EMP.rz+' que realice tareas a más de 1,8 metros de altura, antes de ejecutarlas por primera vez y cada vez que se actualice el procedimiento.','t':['Concepto de trabajo en altura y requisitos para realizarlo.','Sistema de detención de caídas: anclaje, cola con absorbedor y arnés de cuerpo completo; inspección y ajuste.','Uso seguro de escaleras, andamios y plataformas.','Riesgos y medidas de control del PTS-PREV-01: caída de altura y de distinto nivel, colapso de andamio, caída de objetos, contacto eléctrico, viento.','Trauma por suspensión.','Plan de rescate en altura: antes de iniciar, ante una caída, rescate, atención y después.','Práctica: inspección y colocación del arnés y ejercicio del plan de rescate.'],'cont':[['Conceptos básicos y requisitos',['Se considera trabajo en altura toda tarea que se realiza a más de 1,8 metros sobre el nivel inferior.','Para trabajar en altura se requiere: examen ocupacional de altura física vigente, esta capacitación, el PTS entregado y firmado, y los EPP en buen estado.','No se trabaja en altura con malestar, mareos, medicamentos que causen somnolencia o bajo la influencia de alcohol o drogas.','El trabajo se suspende con viento sobre 35 km/h, lluvia intensa o tormenta eléctrica.']],['Sistema de detención de caídas',['Sus tres componentes son el punto de anclaje, el conector (cola con absorbedor de energía) y el arnés de cuerpo completo.','El anclaje debe ser resistente y, en lo posible, estar por sobre la cabeza del trabajador, para reducir la distancia de caída y el efecto péndulo.','Antes de cada uso se inspeccionan las cintas, costuras, argollas, hebillas y la etiqueta del arnés, y el absorbedor sin desplegar.','Ajuste correcto: correas de piernas y pecho ajustadas y la argolla dorsal entre los omóplatos.','Todo equipo dañado o que haya detenido una caída se retira de uso.']],['Escaleras, andamios y plataformas',['Escaleras: revisar peldaños y zapatas; escalera tijera abierta y con seguro; no usar los dos últimos peldaños; subir de frente con tres puntos de apoyo.','Andamios: montados por personal competente, sobre base firme y nivelada, con crucetas, plataformas completas, barandas y rodapiés; acceso solo por su escala.','Plataformas (alza hombre): solo operadores capacitados y autorizados (capacitación CAP-PREV-04).']],['Trauma por suspensión',['Una persona que queda colgada del arnés sin moverse puede perder el conocimiento en pocos minutos, porque la sangre se acumula en las piernas.','Por eso el rescate debe ser inmediato, idealmente en menos de 15 minutos, y nunca se trabaja solo en altura.','Una vez rescatada, la persona se mantiene en reposo y siempre recibe evaluación médica, aunque se vea bien.']]],'prac':['Cada participante inspecciona, se coloca y ajusta el arnés, y el relator lo verifica.','Revisión de una escalera y, si está disponible, de un andamio o plataforma.','Ejercicio del plan de rescate: roles, aviso a emergencias y forma de llegar al trabajador.'],'vf':[['Se considera trabajo en altura toda tarea que se realiza a más de 1,8 m del nivel inferior.',true],['Para trabajar en altura basta con usar arnés; el examen ocupacional no es necesario.',false],['El arnés y la cola se inspeccionan antes de cada uso.',true],['Un arnés que detuvo una caída puede seguir usándose si no se ve dañado.',false],['El punto de anclaje debe ser resistente y, en lo posible, estar por sobre la cabeza del trabajador.',true],['En una escalera tijera se pueden usar los dos últimos peldaños si se trabaja con cuidado.',false],['Una persona suspendida del arnés debe ser rescatada lo antes posible por el riesgo de trauma por suspensión.',true],['El trabajo en altura se puede realizar solo, sin nadie en el nivel inferior.',false],['Con viento sobre 35 km/h se suspende el trabajo en altura.',true],['El rescatista puede exponerse a una caída si con eso llega más rápido al compañero.',false]]},
    cap_alzahombre:{'n':'Operación segura de alza hombre','cod':'CAP-PREV-04','pts':'pts_alzahombre','aplica':'Operadores y usuarios de alza hombre','dur':'2 horas','obj':'Capacitar a los trabajadores en la operación segura del alza hombre (plataforma de elevación tipo tijera o brazo, grúa Genie): inspección previa, evaluación del lugar, operación, riesgos y medidas del PTS-PREV-02, descenso de emergencia y plan de rescate en altura.','alc':'Aplica a todo trabajador de '+EMP.rz+' que opere o trabaje sobre un alza hombre, antes de hacerlo por primera vez y cada vez que se actualice el procedimiento.','nota':'Esta capacitación no reemplaza la instrucción del fabricante o del proveedor del equipo cuando el mandante la exige. La autorización para operar se entrega por escrito a quien la aprueba y demuestra la operación en la práctica.','t':['Tipos de equipo y requisitos del operador.','Inspección previa del equipo antes de cada jornada.','Evaluación del lugar de trabajo: terreno, espacio libre, líneas eléctricas y viento.','Operación segura: acceso, arnés anclado, carga máxima y desplazamiento.','Riesgos y medidas de control del PTS-PREV-02: caída de altura, volcamiento, aplastamiento contra estructuras, contacto eléctrico.','Parada y descenso de emergencia; plan de rescate en altura.','Práctica: inspección con lista de chequeo y operación supervisada.'],'cont':[['Tipos de equipo y requisitos del operador',['Plataformas tipo tijera y de brazo articulado o telescópico (grúa Genie u otras).','Solo opera el personal capacitado y autorizado por escrito por la empresa, que conoce el manual del fabricante del equipo que usa.','El operador debe tener el examen ocupacional de altura vigente.']],['Inspección previa (antes de cada jornada)',['Neumáticos, ruedas y estabilizadores en buen estado.','Sin fugas de aceite hidráulico; batería o combustible suficientes.','Barandas, puerta, punto de anclaje y piso de la plataforma completos y firmes.','Mandos de la plataforma y de la base funcionando, incluidos la parada y el descenso de emergencia.','Placas de capacidad y advertencias legibles.','Si algo falla, el equipo no se usa y se informa al supervisor.']],['Evaluación del lugar de trabajo',['Terreno firme y nivelado, sin pendientes, hoyos, zanjas ni desniveles.','Espacio libre por encima y a los costados: vigas, techos, cañerías y líneas eléctricas.','Área bajo la plataforma delimitada y señalizada.','Velocidad del viento: no elevar sobre 35 km/h.']],['Operación segura',['Subir y bajar solo con la plataforma completamente abajo y por la puerta, que se mantiene cerrada.','Arnés de cuerpo completo anclado al punto de anclaje de la plataforma en todo momento.','No superar la carga máxima: personas, herramientas y materiales.','No desplazar el equipo elevado salvo que el fabricante lo permita, y siempre a velocidad baja.','No usar escaleras ni subirse a las barandas; si no se alcanza el punto, se reposiciona el equipo.','Movimientos lentos cerca de estructuras para evitar el aplastamiento contra ellas.']],['Al terminar',['Bajar la plataforma por completo y estacionar el equipo en un lugar seguro.','Retirar la llave y cargar la batería en un lugar ventilado, lejos de chispas.']]],'prac':['Inspección previa del equipo con lista de chequeo.','Demostración de los mandos, la parada de emergencia y el descenso de emergencia desde la base.','Operación supervisada por el relator o un operador autorizado.'],'vf':[['Solo puede operar el alza hombre el personal capacitado y autorizado.',true],['La inspección previa se puede omitir si el equipo se usó el día anterior.',false],['Dentro de la plataforma, el arnés debe estar anclado al punto de anclaje del equipo.',true],['Para alcanzar un punto más alto se puede usar una escalera sobre la plataforma.',false],['Se puede superar la carga máxima si es por poco tiempo.',false],['Antes de elevar se verifica que el terreno esté firme y nivelado.',true],['Con viento sobre 35 km/h no se debe elevar la plataforma.',true],['Si el equipo falla en altura, el operador debe descolgarse por la pluma.',false],['Los mandos de descenso de emergencia de la base permiten bajar la plataforma si el equipo falla.',true],['El área bajo la plataforma no necesita delimitarse si el trabajo es rápido.',false]]},
    cap_frigorifico:{'n':'Limpieza segura de cámaras frigoríficas','cod':'CAP-PREV-05','pts':'pts_frigorifico','aplica':'Personal de limpieza de cámaras frigoríficas','dur':'1,5 horas','obj':'Capacitar a los trabajadores en la limpieza segura de cámaras frigoríficas según el PTS-PREV-07: método de trabajo, trabajo en frío, ergonomía (sobreesfuerzo, trabajo repetitivo y posturas forzadas), productos químicos, electricidad y demás riesgos de la tarea.','alc':'Aplica a todo trabajador de '+EMP.rz+' que realice limpieza en cámaras frigoríficas, antes de hacerlo por primera vez y cada vez que se actualice el procedimiento.','t':['Método de trabajo del PTS-PREV-07: limpieza semi húmeda y secuencia de la tarea.','Trabajo en frío: ropa, pausas, síntomas de hipotermia y no quedar encerrado.','Ergonomía: sobreesfuerzo y manejo manual de carga (Ley N° 20.949), trabajo repetitivo, posturas forzadas y pausas activas.','Productos químicos: etiqueta, hoja de datos de seguridad, EPP y primeros auxilios.','Electricidad: uso seguro de la máquina abrillantadora y equipos.','Riesgos y medidas de control de la tarea y EPP obligatorios.','Práctica: revisión de EPP y equipos, técnica de levantamiento y pausas activas.'],'cont':[['Método de trabajo',['La limpieza se realiza en semi húmedo, sin aplicación directa de agua, para evitar que el agua se congele.','Antes de empezar: área ordenada y despejada, equipos desconectados y supervisor informado.','El método paso a paso está en el PTS-PREV-07, que se entrega junto con esta capacitación.']],['Trabajo en frío',['Usar ropa térmica por capas y mantenerla seca.','Hacer pausas de recuperación en una zona temperada.','Ante temblor intenso, torpeza, confusión o piel blanca o adormecida, avisar y salir de la cámara.','Antes de entrar, verificar que la puerta se pueda abrir desde el interior; nunca trabajar solo dentro de la cámara.']],['Ergonomía: sobreesfuerzo, trabajo repetitivo y posturas forzadas',['Técnica de levantamiento: pies separados, rodillas flectadas, espalda recta y la carga cerca del cuerpo; girar con los pies, no con la cintura.','Límites de la Ley N° 20.949: hasta 25 kg por persona; hasta 20 kg para mujeres y menores de 18 años. Sobre eso, usar carros o trabajar entre dos.','Hacer pausas activas y rotar tareas para prevenir lesiones por trabajo repetitivo (TMERT).','Usar mangos extensibles, alternar las manos y cambiar de postura en zonas bajas o altas.']],['Productos químicos',['Usar solo productos autorizados, con etiqueta y hoja de datos de seguridad (HDS) disponible.','No mezclar productos.','Usar guantes de nitrilo y lentes de seguridad; ante contacto con los ojos, lavar con agua durante 15 minutos y avisar.']],['Electricidad y equipos',['Revisar cables y enchufes de la máquina abrillantadora antes de usarla.','Mantener las conexiones secas y los cables fuera del piso húmedo.','Desconectar el equipo antes de intervenirlo o limpiarlo.']]],'prac':['Revisión de los EPP y de la máquina abrillantadora.','Ejercicio de técnica de levantamiento de carga.','Rutina de pausas activas para manos, brazos, espalda y cuello.'],'vf':[['La limpieza de las cámaras se hace en semi húmedo, sin aplicación directa de agua.',true],['Se pueden mezclar productos de limpieza para que limpien mejor.',false],['Ante temblor intenso, torpeza o piel adormecida por el frío se debe avisar y salir de la cámara.',true],['Las pausas activas ayudan a prevenir lesiones por trabajo repetitivo.',true],['Para levantar una carga se dobla la espalda y se mantienen las piernas rectas.',false],['La máquina abrillantadora puede intervenirse conectada si el interruptor está apagado.',false],['Los cables eléctricos deben mantenerse secos y fuera del piso húmedo.',true],['Se puede subir a los racks para limpiar las partes altas.',false],['Antes de entrar se verifica que la puerta se pueda abrir desde el interior.',true],['Según la ley, un hombre puede levantar manualmente hasta 50 kg.',false]]}
  };
  // Evaluación de aprendizaje individual de una capacitación del catálogo
  function docEvaluacion(id, t){ t=t||{};
    var pauta=/\|pauta$/.test(id||''); id=(id||'').replace(/\|pauta$/,'');
    var C=CAP_DOC[id]||CAP_DOC.cap_herr, N=C.vf.length, min=Math.ceil(N*0.7);
    var caja='<span style="display:inline-block;width:15px;height:15px;border:1.5px solid #6b7390;border-radius:3px;vertical-align:middle"></span>';
    if(pauta) return dgHead('PAUTA DE CORRECCIÓN','01')+
      '<div class="pts-tit">'+esc(C.n)+'</div><p>Uso exclusivo del relator. Aprueba con <b>'+min+' o más</b> respuestas correctas de '+N+'.</p>'+
      '<table class="dg-tbl"><thead><tr><th style="width:30px">N°</th><th>Afirmación</th><th style="width:90px;text-align:center">Respuesta</th></tr></thead><tbody>'+
      C.vf.map(function(q,i){ return '<tr><td class="n">'+(i+1)+'</td><td>'+esc(q[0])+'</td><td style="text-align:center;font-weight:800;color:'+(q[1]?'#16794a':'#c2410c')+'">'+(q[1]?'V':'F')+'</td></tr>'; }).join('')+'</tbody></table>'+
      '<div class="dg-firmas"><div>'+firmaPrevHtml()+'Firma del relator<br>'+EMP_PREV.nombre+'</div></div>';
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    return dgHead('EVALUACIÓN DE APRENDIZAJE','01')+
      '<div class="pts-tit">'+esc(C.n)+'</div>'+
      '<table class="dg-tbl">'+tr('Nombre del trabajador',ce(t.nombre||''))+tr('RUT',ce(t.rut||''))+tr('Cargo',ce(t.cargo||''))+tr('Fecha',ce(fLarga(todayISO())))+tr('Relator',ce(EMP_PREV.nombre))+'</table>'+
      '<h4 class="dg-h4">Verdadero o falso</h4><p style="margin:0 0 8px">Marque con una X la casilla <b>V</b> si la afirmación es verdadera o <b>F</b> si es falsa. Se aprueba con '+min+' o más respuestas correctas de '+N+'.</p>'+
      '<table class="dg-tbl pts-herr"><thead><tr><th style="width:30px">N°</th><th>Afirmación</th><th style="width:44px;text-align:center">V</th><th style="width:44px;text-align:center">F</th></tr></thead><tbody>'+
      C.vf.map(function(q,i){ return '<tr><td class="n">'+(i+1)+'</td><td>'+esc(q[0])+'</td><td class="pts-chk"><span></span></td><td class="pts-chk"><span></span></td></tr>'; }).join('')+'</tbody></table>'+
      '<table class="dg-tbl" style="margin-top:16px">'+tr('Respuestas correctas','____ de '+N)+tr('Resultado',caja+' Aprobado &nbsp;&nbsp; '+caja+' Reprobado')+tr('Observaciones','')+'</table>'+
      '<div class="dg-firmas"><div>Firma del trabajador</div><div>'+firmaPrevHtml()+'Firma del relator<br>'+EMP_PREV.nombre+'</div></div>';
  }
  // ====== Procedimiento en caso de accidente del trabajo o enfermedad profesional (versión 02, formato corporativo) ======
  function flujoAccidente(){
    var N=FIG_N, O=FIG_O, L='stroke="#9aa2bd" stroke-width="2" fill="none" marker-end="url(#fa)"';
    function caja(x,y,w,h,t1,t2,fill,txt){ return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="8" fill="'+fill+'" stroke="'+(fill==='#fff'?N:fill)+'" stroke-width="1.6"/>'+
      '<text x="'+(x+w/2)+'" y="'+(y+(t2?h/2-3:h/2+4))+'" text-anchor="middle" font-size="11.5" font-weight="bold" fill="'+txt+'">'+t1+'</text>'+(t2?'<text x="'+(x+w/2)+'" y="'+(y+h/2+12)+'" text-anchor="middle" font-size="9.5" fill="'+txt+'">'+t2+'</text>':''); }
    return '<figure class="pts-fig ancha org" style="margin:0 0 12px">'+svgF('0 0 640 470',
      '<defs><marker id="fa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#9aa2bd"/></marker></defs>'+
      caja(220,6,200,40,'Ocurre un accidente','o se detecta una enfermedad',N,'#fff')+
      '<path d="M320 46 V66" '+L+'/>'+
      caja(190,68,260,40,'Asegurar la zona y prestar primeros auxilios','Solo personal capacitado',  '#fff',N)+
      '<path d="M320 108 V128" '+L+'/>'+
      '<polygon points="320,130 420,168 320,206 220,168" fill="#fff4ec" stroke="'+O+'" stroke-width="2"/><text x="320" y="165" text-anchor="middle" font-size="11.5" font-weight="bold" fill="'+N+'">¿Grave o fatal?</text><text x="320" y="180" text-anchor="middle" font-size="9.5" fill="#55607a">(ver definiciones)</text>'+
      '<path d="M420 168 H470 V226" '+L+'/><text x="440" y="160" font-size="10" font-weight="bold" fill="#d7262e">SÍ</text>'+
      '<path d="M220 168 H170 V226" '+L+'/><text x="182" y="160" font-size="10" font-weight="bold" fill="#1e9a4a">NO</text>'+
      caja(380,228,250,64,'Suspender la faena y evacuar','Avisar de inmediato a Inspección del','#d7262e','#fff')+
      '<text x="505" y="284" text-anchor="middle" font-size="9.5" fill="#fff">Trabajo y SEREMI de Salud · 131 / 1407</text>'+
      caja(20,228,300,64,'Avisar a la jefatura directa','Traslado a '+EMP.mutual+' o','#fff',N)+
      '<text x="170" y="284" text-anchor="middle" font-size="9.5" fill="'+N+'">centro asistencial según horario</text>'+
      '<path d="M505 292 V320 H330" '+L+'/><path d="M170 292 V320 H310" '+L+'/>'+
      caja(190,322,260,40,'Emitir la DIAT o DIEP','Dentro de 24 horas','#fff',N)+
      '<path d="M320 362 V382" '+L+'/>'+
      caja(190,384,260,40,'Investigar las causas','Jefatura directa + Prevención','#fff',N)+
      '<path d="M320 424 V440" '+L+'/>'+
      caja(190,442,260,26,'Medidas correctivas y seguimiento','',N,'#fff')
    )+'<figcaption>Flujograma de actuación</figcaption></figure>'; }
  // ====== Procedimiento de emergencia y/o accidentes (une el procedimiento de accidentes v01 y el procedimiento de emergencia) ======
  function docEmergAcc(){
    var H=seccionador();
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    function paso(t,L){ return '<p style="margin:8px 0 4px"><b>'+t+'</b></p>'+ulDg(L); }
    return dgHead('PROCEDIMIENTO','02')+
      '<div class="pts-tit">Procedimiento de emergencia y/o accidentes</div>'+
      '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>PR-PREV-03</b></td><td><span class="sl">Versión</span><b>02</b></td><td><span class="sl">Fecha</span>'+ce(fFaena(todayISO()))+'</td><td><span class="sl">Reemplaza a</span><b>Versión 01 (01-11-2025)</b></td></tr></tbody></table>'+
      dgFirmasPTS()+
      H('Objetivo')+'<p>Establecer cómo actuar ante emergencias, accidentes del trabajo, accidentes de trayecto y enfermedades profesionales —incluidas las emergencias en espacios confinados, como la limpieza de estanques—, para proteger la vida y la salud de los trabajadores, asegurar una respuesta organizada en la comunicación, la evacuación, el rescate y la atención médica, cumplir las obligaciones legales e investigar las causas para aplicar medidas correctivas.</p>'+
      H('Alcance')+'<p>Aplica a todo el personal de '+EMP.rz+' —trabajadores, supervisores, prevencionistas, brigadistas y personal de apoyo—, en las dependencias de la empresa y en las plantas, faenas y centros de los clientes, incluidos los trabajos en espacios confinados y los accidentes de trayecto. Se complementa con los PTS de espacios confinados (PTS-PREV-05) y de uso de herramientas en limpieza de estanques (PTS-PREV-06).</p>'+
      H('Normativa y referencias')+ulDg(['Ley N° 16.744, sobre accidentes del trabajo y enfermedades profesionales, y su reglamento (D.S. N° 101).','D.S. N° 44 del Ministerio del Trabajo y Previsión Social, reglamento sobre gestión preventiva de los riesgos laborales (incluye el plan de gestión de emergencias).','Compendio de Normas del Seguro de la Ley N° 16.744 de la Superintendencia de Seguridad Social (SUSESO), en lo relativo a accidentes graves y fatales.','Reglamento Interno de Orden, Higiene y Seguridad de la empresa.'])+
      H('Definiciones')+'<table class="dg-tbl"><tbody>'+
        tr('Emergencia','Situación imprevista que pone en riesgo la vida o la salud de las personas, las instalaciones o el ambiente, y que exige una respuesta inmediata.')+
        tr('Incidente','Evento relacionado con el trabajo que da lugar o puede dar lugar a lesiones o enfermedad. Si no hay lesión se denomina cuasi accidente o evento peligroso, y también debe informarse.')+
        tr('Accidente del trabajo','Toda lesión que una persona sufra a causa o con ocasión del trabajo y que le produzca incapacidad o muerte (art. 5, Ley N° 16.744).')+
        tr('Accidente de trayecto','El ocurrido en el trayecto directo, de ida o regreso, entre la habitación y el lugar de trabajo, o entre dos lugares de trabajo.')+
        tr('Enfermedad profesional','La causada de manera directa por el ejercicio del trabajo o profesión, y que produzca incapacidad o muerte.')+
        tr('Accidente grave','Aquel que: a) provoca en forma inmediata la amputación o pérdida de cualquier parte del cuerpo; b) obliga a realizar maniobras de reanimación; c) obliga a realizar maniobras de rescate; d) ocurre por caída de altura de más de 1,8 metros; e) ocurre en condiciones hiperbáricas; f) se sospecha intoxicación aguda por plaguicidas; g) involucra a un número tal de trabajadores que afecta el desarrollo normal de la faena.')+
        tr('Accidente fatal','Aquel que provoca la muerte del trabajador en forma inmediata o durante su traslado a un centro asistencial.')+
        tr('DIAT / DIEP','Declaración Individual de Accidente del Trabajo / de Enfermedad Profesional, que se presenta ante el organismo administrador ('+EMP.mutual+' CChC).')+
        tr('Punto de encuentro (PEE)','Lugar seguro y señalizado donde se reúne el personal evacuado para su conteo.')+
      '</tbody></table>'+
      H('Responsabilidades')+'<table class="dg-tbl"><tbody>'+
        tr('Gerencia','Proporcionar los recursos humanos y materiales, garantizar la capacitación del personal, cumplir las obligaciones ante accidentes graves y fatales y aprobar las medidas correctivas.')+
        tr('Supervisor de faena','Activar el procedimiento, dirigir la evacuación y el rescate, coordinar el traslado de los afectados, mantener la comunicación con los organismos externos e informar a Gerencia y a Prevención.')+
        tr('Prevención de riesgos','Asesorar técnicamente durante la emergencia, gestionar la DIAT o DIEP, dirigir la investigación, proponer medidas correctivas y registrar la accidentabilidad.')+
        tr('Vigía u observador externo','En espacios confinados: vigilar en forma permanente, dar la alarma de inmediato, impedir el ingreso de personal no autorizado y apoyar el rescate desde el exterior. Nunca ingresa solo.')+
        tr('Trabajadores','Informar de inmediato todo accidente o incidente, cumplir las instrucciones de emergencia, evacuar cuando se requiera y participar en simulacros y capacitaciones.')+
      '</tbody></table>'+
      H('Organigrama de emergencia')+orgEmergencia()+
      H('Situaciones de emergencia y recursos')+
        '<p style="margin:0 0 4px"><b>Se consideran emergencias, entre otras:</b></p><div class="dg-cols">'+ulDg(['Accidentes con lesionados.','Desmayo o pérdida de conciencia (por ejemplo, dentro de un estanque).','Atmósfera deficiente en oxígeno o presencia de gases peligrosos.','Incendio o explosión.','Electrocución.'])+ulDg(['Caída al mismo o distinto nivel.','Derrumbes o atrapamientos.','Derrame de sustancias peligrosas.','Sismos o condiciones climáticas adversas.','Emergencias médicas.'])+'</div>'+
        '<p style="margin:6px 0 4px"><b>Recursos de emergencia disponibles en la faena:</b></p><div class="dg-cols">'+ulDg(['Botiquín de primeros auxilios.','Extintores PQS.','Equipo de comunicación radial o teléfono.','Linternas certificadas.','Señalización y cintas de peligro.'])+ulDg(['En espacios confinados: detector multigases, ventilación forzada, arnés de rescate, línea de vida, trípode de rescate (si aplica) y camilla.'])+'</div>'+
      H('Actuación ante una emergencia o accidente')+
        paso('Paso 1 · Detectar y dar la alarma.',['Quien detecte la emergencia —en espacios confinados, el vigía— suspende de inmediato los trabajos y alerta verbalmente al personal.','Se activa la comunicación radial o telefónica y se informa al supervisor de faena.'])+
        paso('Paso 2 · Asegurar y atender.',['Evaluar si el peligro sigue presente y controlar la zona antes de acercarse.','Verificar si hay más afectados y prestar primeros auxilios solo si se está capacitado (sección 10).'])+
        paso('Paso 3 · Comunicar.',['El supervisor informa a Gerencia, a Prevención y, si corresponde, a los servicios de emergencia, indicando: tipo de emergencia, lugar exacto, cantidad de afectados, estado de los lesionados y recursos requeridos.'])+
        paso('Paso 4 · Evacuar.',['Todo trabajador que pueda hacerlo abandona el área o el espacio confinado y se suspenden todas las actividades.','El personal se dirige al punto de encuentro (PEE) y el supervisor realiza el conteo.'])+
        paso('Paso 5 · Trasladar al centro asistencial.',['<b>Lesiones graves:</b> atención de urgencia por todos los medios: rescate Mutual (1407), ambulancia SAMU (131) o vehículo particular si no hay respuesta.','<b>Lesiones leves:</b> el trabajador puede ser trasladado o acudir por sus propios medios, con su cédula de identidad.','<b>Centros de atención:</b> '+EMP.mutual+' CChC, Urmeneta 895, '+EMP.ciudad+', lunes a viernes de 09:00 a 18:00 h; fuera de ese horario, '+ce('Clínica Andes Salud, Bellavista 123, '+EMP.ciudad+'')+'.'])+
        paso('Paso 6 · Denunciar (DIAT / DIEP).',['La empresa emite la DIAT o DIEP dentro de las 24 horas siguientes, ante la '+EMP.mutual+' o en su plataforma en línea.','Si la empresa no la presenta, puede hacerlo el propio trabajador, sus familiares, el Comité Paritario o el médico tratante.'])+
        paso('Paso 7 · Investigar (sección 13).',['Toda emergencia, incidente o accidente se investiga para evitar que se repita.'])+
      H('Rescate en espacios confinados')+
        paso('Rescate sin ingreso — siempre la primera opción',['Utilizar la línea de vida y el sistema de recuperación para extraer a la víctima sin ingresar al estanque.','Aplicar primeros auxilios una vez rescatada.'])+
        paso('Rescate con ingreso — solo cuando:',['El rescate sin ingreso no sea posible.','Exista autorización del supervisor.','Se verifique atmósfera segura con el multigás.','Los rescatistas cuenten con EPP completo y exista personal de apoyo externo.'])+
        '<p style="margin:4px 0 12px">Equipo mínimo: supervisor, dos rescatistas, apoyo exterior y personal de primeros auxilios.</p>'+
      H('Primeros auxilios')+'<table class="dg-tbl"><thead><tr><th style="width:28%">Situación</th><th>Qué hacer</th></tr></thead><tbody>'+
        '<tr><td><b>Persona inconsciente</b></td><td>Retirar a zona segura, verificar la respiración, aplicar RCP si corresponde y solicitar ambulancia.</td></tr>'+
        '<tr><td><b>Intoxicación por gases</b></td><td>Retirar de inmediato del espacio, mantener en reposo, administrar oxígeno si hay disponible y trasladar de inmediato a un centro asistencial.</td></tr>'+
        '<tr><td><b>Lesiones traumáticas</b></td><td>Inmovilizar al trabajador, controlar hemorragias y esperar asistencia especializada.</td></tr></tbody></table>'+
      H('Accidentes graves o fatales')+ulDg(['Suspender de inmediato las faenas afectadas y, si es necesario, evacuar el lugar.','Informar de inmediato a la Inspección del Trabajo y a la SEREMI de Salud que correspondan al lugar del accidente, y a la '+EMP.mutual+'.','No modificar el lugar del accidente, salvo para rescatar o atender a los afectados o evitar nuevos riesgos.','Las faenas solo se reanudan cuando la autoridad fiscalizadora lo autorice, una vez corregidas las condiciones que causaron el accidente.'])+
      H('Accidentes de trayecto')+ulDg(['Acudir a la '+EMP.mutual+' e informar a la jefatura lo antes posible.','Acreditar el accidente con el parte de Carabineros, la constancia en el centro asistencial, testigos u otros medios.'])+
      H('Investigación')+ulDg(['Todo cuasi accidente, incidente, accidente o emergencia se investiga, sin importar su gravedad, dentro de las 24 horas siguientes y en el lugar de los hechos.','La realizan la jefatura directa y Prevención de riesgos, con participación del Comité Paritario cuando corresponda.','Se determinan las causas inmediatas y básicas, se definen medidas correctivas y preventivas con responsable y plazo, y se hace su seguimiento.'])+
      H('Flujograma')+flujoAccidente()+
      H('Números de emergencia y contactos')+'<table class="dg-tbl"><thead><tr><th style="width:36%">Cargo / institución</th><th>Nombre</th><th style="width:22%">Teléfono</th></tr></thead><tbody>'+
        '<tr><td>Ambulancia SAMU / Bomberos / Carabineros</td><td>—</td><td><b>131 / 132 / 133</b></td></tr>'+
        '<tr><td>Rescate '+EMP.mutual+' CChC</td><td>—</td><td><b>1407</b></td></tr>'+
        '<tr><td>'+EMP.mutual+', '+EMP.ciudad+'</td><td>Urmeneta 895</td><td><b>65 232 8000</b></td></tr>'+
        '<tr><td>Clínica Andes Salud (fuera del horario de la Mutual)</td><td>Bellavista 123</td><td>'+ce('65 2 209149')+'</td></tr>'+
        [['Hospital más cercano a la faena',''],['Gerente General',EMP.rep],['Jefe de Operaciones','Jorge Enrique Castro Vega'],['Prevención de riesgos',EMP_PREV.nombre],['Supervisor de faena',''],['Administración',''],['Contacto del mandante','']].map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+ce(r[1])+'</td><td>'+ce('')+'</td></tr>'; }).join('')+
      '</tbody></table>'+
      H('Punto de encuentro de emergencia (PEE)')+'<p>Ubicación: '+ce('')+'</p>'+ulDg(['Área libre de tránsito, alejada de la emergencia.','De fácil acceso para los organismos de emergencia.','Debidamente señalizada.'])+
      H('Traslado de personal accidentado')+'<p style="text-align:left">Administración o los supervisores coordinan el traslado del personal accidentado. Si el contacto de traslado no está disponible o la emergencia es nocturna, lo coordina el personal administrativo de turno.</p><p style="text-align:left;margin-top:4px">Contacto de traslado: '+ce('Daniela Donoso (Empresa Sey), 9 8308 4282')+'</p>'+
      H('Simulacros')+ulDg(['Como mínimo, 1 simulacro semestral de rescate en espacio confinado.','Como mínimo, 1 simulacro anual de evacuación general.','Los resultados se registran y generan planes de mejora.'])+
      H('Registros')+ulDg(['DIAT / DIEP presentada.','Informe de investigación del accidente o emergencia.','Registro de simulacros.','Informe mensual de accidentabilidad (ISgestión).','Registro de entrega de este procedimiento firmado por cada trabajador.'])+
      H('Control de cambios')+'<table class="dg-tbl"><thead><tr><th style="width:15%">Versión</th><th style="width:20%">Fecha</th><th>Descripción del cambio</th></tr></thead><tbody>'+
        '<tr><td>01</td><td>01-11-2025</td><td>Emisión original (procedimiento en caso de accidente del trabajo o enfermedad profesional).</td></tr>'+
        '<tr><td>02</td><td>'+fFaena(todayISO())+'</td><td>Formato corporativo; se integra el procedimiento de emergencia (organigrama, situaciones, recursos, evacuación, rescate en espacios confinados, primeros auxilios y simulacros); se agregan accidente de trayecto y obligaciones ante accidentes graves y fatales; normativa vigente (D.S. N° 44); se corrige la definición de accidente fatal y se actualizan los contactos.</td></tr></tbody></table>';
  }
  // ---- EMP_GEN (ISgestión, líneas 10319–10319)
  var EMP_GEN={ programa:{ build:docProgramaPrev }, iper:{ build:docMatrizIPER }, proc_iper:{ build:docProcIPER }, matriz_epp:{ build:docMatrizEPP }, karin:{ build:docProtKarin }, cap_herr:{ build:docCapHerr }, cap_primeros:{ build:docCapPrimeros }, cap_altura:{ build:function(){ return docCapPTS('cap_altura'); } }, cap_alzahombre:{ build:function(){ return docCapPTS('cap_alzahombre'); } }, cap_frigorifico:{ build:function(){ return docCapPTS('cap_frigorifico'); } }, proc_acc:{ build:docEmergAcc } };
  // ---- esPTS / nombrePTS (ISgestión, líneas 10320–10321)
  function esPTS(s){ return s==='pts_funciones' || !!(typeof PTS_DOC!=='undefined'&&PTS_DOC[s]); }
  function nombrePTS(s){ var n=s; EMP_CARPETAS.forEach(function(c){ c.tipos.forEach(function(x){ if(x[0]===s) n=x[1]; }); }); return n; }
  // ---- ptsDatos / ptsCambios (ISgestión, líneas 10329–10333)
  function ptsDatos(slug, borrador){ var b=PTS_DOC[slug]||{}, e=borrador||PTS_EDIT[slug]||{}, o={}, k; for(k in b) o[k]=b[k]; for(k in e) o[k]=e[k]; return o; }
  // Historial de versiones: [versión, fecha, descripción]
  function ptsCambios(P){ var L=!P.orig?[['01',P.f01||(P.cambios&&P.cambios.length?PTS_F2026:fFaena(todayISO())),'Emisión original.']]:
      [['01',esc(P.orig),'Emisión original.'],['02',P.f02||(P.cambios&&P.cambios.length?PTS_F2026:fFaena(todayISO())),'Actualización 2026: formato corporativo, normativa vigente (D.S. N° 44 reemplaza al D.S. N° 40), revisión del contenido y de las responsabilidades, tabla de riesgos y sección de emergencias.']];
    return L.concat(P.cambios||[]); }
  // ---- docPTSDoc, PTS_INFO y registro de entrega (ISgestión, líneas 10410–10517)
  function docPTSDoc(slug, borrador){
    var P=ptsDatos(slug,borrador), CAM=ptsCambios(P), n=0, nuevo=!P.orig, ver=CAM[CAM.length-1][0], ant=CAM.length>1?CAM[CAM.length-2]:null;   // versión según el historial (01 nuevo, 02 actualización 2026, 03+ ediciones)
    function H(t){ n++; return '<h4 class="dg-h4">'+n+'. '+t+'</h4>'; }
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    return dgHead('PROCEDIMIENTO DE TRABAJO SEGURO',ver)+
      '<div class="pts-tit">'+esc(P.titulo)+'</div>'+
      '<table class="dg-tbl pts-ctl"><tbody><tr><td><span class="sl">Código</span><b>'+P.cod+'</b></td><td><span class="sl">Versión</span><b>'+ver+'</b></td><td><span class="sl">Fecha</span>'+ce(fFaena(todayISO()))+'</td><td><span class="sl">'+(ant?'Reemplaza a':'Aplica a')+'</span><b>'+(ant?'Versión '+ant[0]+' ('+ant[1]+')':esc(P.aplica||'Documento nuevo'))+'</b></td></tr></tbody></table>'+
      dgFirmasPTS()+
      H('Objetivo')+'<p>'+P.obj+'</p>'+
      H('Alcance')+'<p>'+P.alc+'</p>'+
      H('Normativa y referencias')+ulDg(P.norm)+
      H('Responsabilidades')+'<table class="dg-tbl">'+P.resp.map(function(r){ return tr(r[0],r[1]); }).join('')+'</table>'+
      H('Desarrollo')+P.des.map(function(d,i){ return '<p style="margin:10px 0 4px"><b>'+n+'.'+(i+1)+' '+d[0]+'</b></p>'+ulDg(d[1]); }).join('')+
      (P.herr?H('Herramientas: uso e inspección previa')+'<p style="font-size:12px;margin:0 0 6px">Antes de cada jornada, el trabajador revisa cada herramienta y marca su estado. Toda herramienta en mal estado se retira, se rotula “FUERA DE SERVICIO” y se informa a la jefatura.</p>'+
        '<table class="dg-tbl pts-herr"><thead><tr><th style="width:21%">Herramienta</th><th style="width:6%">Cant.</th><th style="width:25%">Uso en la faena</th><th>Revisar antes de usar</th><th style="width:7%">Bien</th><th style="width:7%">Mal</th></tr></thead><tbody>'+
        P.herr.map(function(x){ return '<tr><td><b>'+esc(x[0])+'</b></td><td style="text-align:center">'+(x[1]?esc(x[1]):ce(''))+'</td><td>'+x[2]+'</td><td>'+x[3]+'</td><td class="pts-chk"><span></span></td><td class="pts-chk"><span></span></td></tr>'; }).join('')+
        '</tbody></table><p style="font-size:12px;margin:0 0 4px">Revisado por: '+ce('')+' &nbsp; Fecha: '+ce('')+' &nbsp; Firma: ______________________</p>':'')+
      (PTS_FIG[slug]?H('Ilustraciones de referencia')+figurasPTS(slug):'')+
      H('Riesgos y medidas de control')+'<table class="dg-tbl"><thead><tr><th style="width:30%">Actividad / peligro</th><th style="width:24%">Riesgo</th><th>Medidas de control</th></tr></thead><tbody>'+P.ries.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td></tr>'; }).join('')+'</tbody></table>'+
      H('Elementos de protección personal')+ulDg(P.epp)+'<p style="font-size:12px">Los EPP deben usarse correctamente puestos, con ropa de trabajo adecuada y sin partes sueltas, colgantes, pulseras ni objetos que puedan quedar atrapados.</p>'+
      (P.rescate&&P.rescate.length?H(esc(P.rescateTit||'Plan de rescate'))+P.rescate.map(function(d,i){ return '<p style="margin:10px 0 4px"><b>'+n+'.'+(i+1)+' '+d[0]+'</b></p>'+ulDg(d[1]); }).join(''):'')+
      H('Emergencias')+ulDg(['Detener el trabajo, dar aviso de inmediato a la jefatura directa y seguir el plan de emergencia de la faena.','Teléfonos: Ambulancia 131 · Bomberos 132 · Carabineros 133 · '+EMP.mutual+' 1407.','Todo accidente, aunque parezca leve, se informa de inmediato para su atención y denuncia ante el organismo administrador de la Ley N° 16.744.'])+
      H('Registros')+ulDg(['Registro de entrega e instrucción de este procedimiento, firmado por cada trabajador (ISgestión → Empresa → Registrar entrega).'].concat(P.registros||(slug==='pts_confinados'?['Permiso de entrada y registro de entradas y salidas del espacio confinado.','Registro de mediciones de atmósfera.']:[])))+
      H('Control de cambios')+'<table class="dg-tbl"><thead><tr><th style="width:15%">Versión</th><th style="width:20%">Fecha</th><th>Descripción del cambio</th></tr></thead><tbody>'+
        CAM.map(function(c){ return '<tr><td>'+c[0]+'</td><td>'+c[1]+'</td><td>'+c[2]+'</td></tr>'; }).join('')+'</tbody></table>';
  }
  // Plantilla: Registro de entrega e instrucción de un PTS (temario según el procedimiento de la empresa).
  var PTS_INFO={
    pts_quimicos:{ n:'Uso y manejo de productos químicos en aseo industrial', t:[
      'Identificación de productos químicos, lectura de hojas de datos de seguridad (HDS) y rombo NFPA 704.',
      'Riesgos más frecuentes y efectos para la salud.',
      'Elementos de protección personal obligatorios: guantes de nitrilo, antiparras, mascarilla o respirador, traje impermeable y botas.',
      'Antes de utilizar un producto, trasvasije y dilución (solo personal autorizado).',
      'Uso del producto en el aseo: barrido, aplicación de detergente, acción mecánica, enjuague y sanitizado.',
      'Actuación en caso de derrame.',
      'Primeros auxilios ante inhalación, contacto con la piel u ojos e ingestión.'] },
    pts_extintores:{ n:'Uso y manejo de extintores', t:[
      'Combustión y triángulo del fuego.',
      'Clases de fuego A, B, C, D y K (NCh 934) y su simbología.',
      'Tipos de extintor según el agente extintor y sus limitaciones.',
      'Partes del extintor y verificación previa (manómetro, sello y vigencia).',
      'Uso del extintor: retirar el seguro, apuntar a la base del fuego, presionar y barrer, con el viento a la espalda.',
      'Ubicación y señalización de extintores (NCh 1433).',
      'Recomendaciones de seguridad y aviso inmediato a la jefatura.'] },
    pts_altura:{ n:'Trabajos en altura (alza hombre, andamios y escaleras)', t:[
      'Riesgos más frecuentes: caídas de distinto nivel, caída de objetos y fallas de equipos.',
      'Requisitos para trabajar en altura: examen ocupacional vigente y capacitación.',
      'Inspección previa de alza hombre, andamios y escaleras.',
      'Operación segura del alza hombre: límites de carga, viento máximo 35 km/h y distancia a líneas eléctricas.',
      'Uso de arnés de cuerpo completo, línea de vida y punto de anclaje.',
      'Delimitación y señalización del área de trabajo.',
      'Plan de rescate en altura y trauma por suspensión.',
      'Elementos de protección personal: casco con barbiquejo, arnés, calzado de seguridad y guantes.'] },
    pts_confinados:{ n:'Trabajo seguro en espacios confinados', t:[
      'Definición e identificación de un espacio confinado.',
      'Peligros: atmósfera deficiente o enriquecida en oxígeno (bajo 19,5% o sobre 23,5%), gases tóxicos o inflamables, atrapamiento e inmersión.',
      'Permiso y registro de entrada al espacio confinado.',
      'Medición de la atmósfera antes y durante el trabajo.',
      'Aislamiento, bloqueo, limpieza y ventilación del espacio.',
      'Roles del vigía, del entrante y del supervisor; comunicación y rescate.',
      'Prohibición de ingresar sin autorización.'] },
    pts_frigorifico:{ n:'Limpieza de cámaras frigoríficas', t:[
      'Limpieza en semi húmedo, sin aplicación directa de agua, por las bajas temperaturas.',
      'Verificaciones antes de comenzar: personal autorizado, zona despejada, equipos desconectados y bloqueo cuando aplique.',
      'Método de trabajo: acción mecánica, plataforma y equipos de frío, pisos con máquina abrillantadora, zócalos, puertas y secado final.',
      'Riesgos: objetos cortantes, electricidad, bajas temperaturas, caídas, sobreesfuerzo, trabajo repetitivo, posturas forzadas, químicos, golpes y caída de objetos.',
      'Elementos de protección personal: casco con barbiquejo, guantes de nitrilo, chaqueta térmica y botas de goma con punta de acero.'] },
    pts_herramientas:{ n:'Uso de herramientas en faena de limpieza de estanques', t:[
      'Inspección diaria de herramientas y retiro de las que están en mal estado.',
      'Uso correcto de llaves, dados, llave de torque, palas y cuchillo.',
      'Uso seguro del taladro de impacto, el esmeril (trabajo en caliente) y la hidrolavadora.',
      'Uso del medidor de gases: prueba diaria, valores para ingresar y actuación ante alarmas.',
      'El estanque como espacio confinado: permiso de entrada, ventilación y vigía.',
      'Elementos de protección personal y orden de las herramientas al terminar.'] },
    pts_alzahombre:{ n:'Alza hombre / grúa Genie', t:[
      'Operación permitida solo a operadores capacitados y autorizados.',
      'Inspección previa del equipo y manual del fabricante al alcance.',
      'Límites de carga, viento máximo de 35 km/h y distancia a líneas eléctricas.',
      'Conducción segura: obstáculos, velocidad baja en pendientes y al detenerse.',
      'Operación de la plataforma: uso de arnés anclado y EPP en todo momento.',
      'Delimitación del área bajo la plataforma.'] },
    pts_funciones:{ n:'Acorde a sus funciones', t:[
      'Funciones propias del cargo y forma segura de ejecutarlas.',
      'Riesgos de cada actividad y sus medidas de control.',
      'Elementos de protección personal requeridos para el cargo.',
      'Normas generales: tareas autorizadas, normas del cliente y aviso inmediato de accidentes e incidentes.'] }
  };
  function lsGet(k){ try{ return localStorage.getItem(k)||''; }catch(_){ return ''; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(_){} }
  function docEntregaPTS(slug){ return function(t){
    var I=PTS_INFO[slug];
    var ver=(typeof EMP_D!=='undefined')?EMP_D.filter(function(d){ return d.tipo===slug; }).sort(function(a,b){ return (b.fecha||'')<(a.fecha||'')?-1:1; })[0]:null;
    function tr(a,b){ return '<tr><td class="dg-k">'+a+'</td><td>'+b+'</td></tr>'; }
    function rel(id,def){ return '<span contenteditable data-ls="'+id+'">'+esc(lsGet(id)||def||'')+'</span>'; }
    return dgHead('REGISTRO DE ENTREGA E INSTRUCCIÓN')+
      '<p style="text-align:center;margin-top:-6px;color:#667;font-weight:700">Procedimiento de trabajo seguro · '+esc(I.n)+'</p>'+
      '<h4 class="dg-h4">1. Datos del trabajador</h4>'+
      '<table class="dg-tbl">'+tr('Nombre',ce(t.nombre))+tr('RUT',ce(t.rut))+tr('Cargo',ce(t.cargo||''))+tr('Fecha',ce(fLarga(todayISO())))+'</table>'+
      '<h4 class="dg-h4">2. Instrucción</h4>'+
      '<table class="dg-tbl">'+tr('Relator',rel('dg_rel_nom',EMP_PREV.nombre))+tr('Cargo del relator',rel('dg_rel_cargo',EMP_PREV.cargo))+
        tr('Horario',rel('dg_rel_hi','08:00')+' a '+rel('dg_rel_hf','09:00')+' hrs.')+tr('Modalidad',rel('dg_rel_mod','Presencial'))+
        tr('Documento entregado','PTS '+esc(I.n)+(ver&&ver.fecha?' · versión del '+esc(fFaena(ver.fecha)):''))+'</table>'+
      '<h4 class="dg-h4">3. Temario</h4>'+ulDg(I.t)+
      '<h4 class="dg-h4">4. Declaración</h4>'+
      '<p>Declaro haber recibido una copia del procedimiento de trabajo seguro indicado y haber sido instruido(a) en su contenido, en los riesgos de la tarea y en sus medidas de control. Me comprometo a cumplirlo, a utilizar correctamente los elementos de protección personal y a consultar a mi jefatura ante cualquier duda.</p>'+
      '<div class="dg-firmas"><div>Firma del trabajador<br>'+esc(t.nombre||'')+'</div><div>'+(((lsGet('dg_rel_nom')||EMP_PREV.nombre)===EMP_PREV.nombre)?firmaPrevHtml():'')+'Firma del relator<br>'+esc(lsGet('dg_rel_nom')||EMP_PREV.nombre)+'</div></div>';
  }; }
  // Lo que se escribe en el relator / horario se recuerda para el siguiente registro (útil al generar en lote).
  // ---- DOC_GEN (ISgestión, líneas 10519–10533)
  var DOC_GEN={
    contrato:{ nombre:'Contrato de trabajo', build:docContrato, variantes:true },
    perfil:{ nombre:'Perfil de cargo', build:docPerfil, variantes:true },
    pts_quimicos:{ nombre:'Registro entrega PTS químicos', build:docEntregaPTS('pts_quimicos') },
    pts_extintores:{ nombre:'Registro entrega PTS extintores', build:docEntregaPTS('pts_extintores') },
    pts_altura:{ nombre:'Registro entrega PTS altura', build:docEntregaPTS('pts_altura') },
    pts_confinados:{ nombre:'Registro entrega PTS confinados', build:docEntregaPTS('pts_confinados') },
    pts_alzahombre:{ nombre:'Registro entrega PTS alza hombre', build:docEntregaPTS('pts_alzahombre') },
    pts_funciones:{ nombre:'Registro entrega PTS acorde a sus funciones', build:docEntregaPTS('pts_funciones') },
    pts_herramientas:{ nombre:'Registro entrega PTS herramientas (estanques)', build:docEntregaPTS('pts_herramientas') },
    pts_frigorifico:{ nombre:'Registro entrega PTS cámaras frigoríficas', build:docEntregaPTS('pts_frigorifico') },
    datos:{ nombre:'Ficha de datos', build:docDatos },
    epp:{ nombre:'Entrega de EPP', build:docEPP },
    odi:{ nombre:'IRL (riesgos laborales)', build:docODI }
  };
  return { DOC_GEN, EMP_GEN, EMP_CARPETAS, PTS_DOC, PTS_INFO, CAP_DOC, DG_VARS, docAsistencia, opcionesRegistro, docEvaluacion,
    docEPP, docODI, docDatos, docContrato, docPerfil, porPersona, docPTSDoc, docPTSFunciones, varDefault, ptsDatos, ptsCambios,
    nombrePTS, esPTS, dgFoot, esc };
}
