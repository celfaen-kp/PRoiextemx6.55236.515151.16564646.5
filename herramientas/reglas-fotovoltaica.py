#!/usr/bin/env python3
"""
Sysefen · El presupuesto de fotovoltaica por capítulos (sql/etapa72)

QUÉ HACE:
  Lee dos tarifas de la carpeta de tarifas del Drive y escribe:
    · etapa72_fotovoltaica_capitulos.sql  en subir-a-supabase/ del repo: las dos
                                          tarifas, los coeficientes, las variables
                                          y las reglas, para pegar en el SQL Editor
    · fotovoltaica-reglas.json            en la carpeta de tarifas: lo mismo, para
                                          pruebas/motor-solar.js

  NINGUNO DE LOS DOS VA AL REPO: llevan precios y el repo es público. Aquí
  solo están las reglas y el catálogo de partidas, sin un precio.

LAS DOS TARIFAS:
  · fotovoltaica-2026.csv           el distribuidor: Fronius, Enphase, BYD y
                                    Tesla (124 productos, precio = coste).
  · fotovoltaica-partidas-2026.csv  las partidas de Sysefen con código FV-CC-NNN
                                    (el «Desglose de costes y estructura de
                                    presupuesto FV particulares», 5 oct 2026):
                                    estructura, cables, protecciones, mano de
                                    obra, trámites… Una fila por partida con su
                                    COSTE, proveedor y fecha. Si no existe, este
                                    script la crea como plantilla con los costes
                                    en blanco, para rellenar.
                                    Una partida SIN coste no es gratis: sale en
                                    el presupuesto a 0 €, sin confirmar y con el
                                    aviso «pendiente de confirmar».

EL MODELO DE PRECIOS (confirmado por Sysefen):
  precio de venta = coste × 1,30, una sola vez por línea. El 1,30 está en
  tablas_lookup ('recargo_sobre_coste') y lo aplica el motor; aquí los precios
  se cargan como coste. Los trámites llevan atributos.sin_recargo porque ya
  vienen como precio de venta declarado.

CÓMO SE USA:
  python3 herramientas/reglas-fotovoltaica.py
  (y después pegar subir-a-supabase/etapa72_fotovoltaica_capitulos.sql en el SQL Editor)

PARA CAMBIAR UN PRECIO: se cambia en el CSV y se vuelve a ejecutar esto.
PARA CAMBIAR UN COEFICIENTE (días base, separación de ganchos…): en
  tablas_lookup, categoría 'solar'; no hace falta volver a ejecutar nada.
"""
import csv, json, os, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.environ.get('SYSEFEN_TARIFAS') or os.path.expanduser(
    '~/Library/CloudStorage/GoogleDrive-celfaen@gmail.com/Mi unidad/SYSEFEN DATA/07-Tarifas para app')
HOY = datetime.date.today().isoformat()

q = lambda s: "'" + str(s).replace("'", "''") + "'"

# =============================================================================
# 1 · El catálogo de partidas (sin precios): código, descripción, unidad,
#     familia y atributos. Los precios van en el CSV.
# =============================================================================
CAP = {
    '01': '01 · Generador fotovoltaico',
    '02': '02 · Estructura y fijaciones',
    '03': '03 · Inversor y microinversores',
    '04': '04 · Almacenamiento',
    '05': '05 · Monitorización, medida y control',
    '06': '06 · Cableado y canalizaciones',
    '07': '07 · Protecciones, cuadros y puesta a tierra',
    '08': '08 · Pequeño material y consumibles',
    '09': '09 · Obra civil y trabajos previos',
    '10': '10 · Medios auxiliares y seguridad',
    '11': '11 · Mano de obra de instalación',
    '12': '12 · Transporte, desplazamiento y residuos',
    '13': '13 · Ingeniería, legalización y trámites',
    '14': '14 · Opcionales',
}
FAMILIA = {'01': 'panel', '02': 'estructura', '03': 'inversor_accesorio', '04': 'bateria_accesorio',
           '05': 'monitorizacion', '06': 'cable', '07': 'proteccion', '08': 'consumible', '09': 'obra_civil',
           '10': 'medios', '11': 'mano_obra', '12': 'transporte', '13': 'tramite', '14': 'opcional'}

# (código, descripción, unidad, atributos extra, nota para la plantilla)
PARTIDAS = [
    ('FV-01-001', 'Módulo fotovoltaico (marca y modelo por confirmar)', 'ud', {},
     'Para cada modelo real añade una fila FV-01-001-MODELO con atributos {"wp": 505, "ancho_m": 1.134, "largo_m": 1.762}; el motor elige por los Wp'),
    ('FV-02-001', 'Perfil / raíl de aluminio', 'm', {}, 'Precio por metro; la barra comercial va en tablas_lookup largo_barra_m'),
    ('FV-02-002', 'Unión de raíles', 'ud', {}, ''),
    ('FV-02-003', 'Gancho de teja', 'ud', {}, 'Separación entre ganchos en tablas_lookup separacion_ganchos_m'),
    ('FV-02-004', 'Soporte para chapa / espárrago / minirraíl', 'ud', {}, '4 por panel por defecto (tablas_lookup soportes_chapa_por_panel)'),
    ('FV-02-005', 'Grapa intermedia', 'ud', {}, ''),
    ('FV-02-006', 'Grapa final', 'ud', {}, ''),
    ('FV-02-007', 'Triángulo / estructura inclinada para cubierta plana', 'ud', {}, ''),
    ('FV-02-008', 'Lastre (bloque de hormigón o bandeja)', 'ud', {}, 'Cantidad orientativa: el cálculo de viento del fabricante manda'),
    ('FV-02-009', 'Anclaje químico (varilla roscada, taco químico y malla)', 'ud', {}, 'Un kit por anclaje'),
    ('FV-02-010', 'Tornillería inoxidable', 'lote', {}, ''),
    ('FV-02-011', 'Sellador / impermeabilización de perforaciones', 'ud', {}, 'Cartucho; anclajes por cartucho en tablas_lookup'),
    ('FV-02-012', 'Teja de reposición', 'ud', {}, ''),
    ('FV-02-013', 'Pinza / puente de tierra de estructura', 'ud', {}, ''),
    ('FV-02-014', 'Clips de sujeción de cable al raíl', 'bolsa', {}, 'Una bolsa cada 20 paneles'),
    ('FV-02-015', 'Estructura especial (pérgola, marquesina, elevada)', 'partida', {}, 'Presupuesto aparte: sale a 0 y con aviso'),
    ('FV-03-008', 'Tejadillo de protección para inversor exterior', 'ud', {}, ''),
    ('FV-04-004', 'Soporte, bancada o anclaje a pared de la batería', 'ud', {}, ''),
    ('FV-04-006', 'Cuadro de cargas críticas (backup parcial)', 'ud', {}, ''),
    ('FV-05-005', 'Repetidor WiFi o kit PLC', 'ud', {}, ''),
    ('FV-05-006', 'Cable de red Cat6 exterior', 'm', {}, ''),
    ('FV-06-001', 'Cable solar DC H1Z2Z2-K 6 mm²', 'm', {}, ''),
    ('FV-06-002', 'Conector MC4 (par)', 'par', {}, ''),
    ('FV-06-003', 'Manguera AC inversor → cuadro', 'm', {}, 'Sección por cálculo; precio medio de la manguera habitual'),
    ('FV-06-004', 'Cable bus de microinversores cubierta → cuadro', 'm', {}, ''),
    ('FV-06-005', 'Manguera apantallada de comunicación / vatímetro', 'm', {}, ''),
    ('FV-06-006', 'Cable de tierra verde-amarillo', 'm', {}, ''),
    ('FV-06-007', 'Tubo rígido / corrugado / flexible', 'm', {}, ''),
    ('FV-06-008', 'Bandeja / canaleta', 'm', {}, ''),
    ('FV-06-009', 'Tubo enterrado corrugado doble capa', 'm', {}, ''),
    ('FV-06-010', 'Caja de registro / derivación estanca', 'ud', {}, ''),
    ('FV-06-011', 'Abrazaderas y grapas', 'bolsa', {}, 'Una bolsa cada 10 m de tubo'),
    ('FV-06-012', 'Prensaestopas / pasamuros', 'ud', {}, ''),
    ('FV-07-001', 'Caja de protecciones DC (IP65)', 'ud', {}, ''),
    ('FV-07-002', 'Fusible DC + portafusibles', 'ud', {}, ''),
    ('FV-07-004', 'Protector de sobretensiones DC', 'ud', {}, 'Uno por MPPT (tablas_lookup mppt)'),
    ('FV-07-005', 'Caja / cuadro de protecciones AC', 'ud', {}, ''),
    ('FV-07-006', 'Magnetotérmico AC curva C', 'ud', {}, ''),
    ('FV-07-007', 'Diferencial 30 mA (tipo A o B según fabricante)', 'ud', {}, ''),
    ('FV-07-008', 'Protector de sobretensiones AC', 'ud', {}, ''),
    ('FV-07-010', 'Adecuación del cuadro general existente', 'partida', {}, ''),
    ('FV-07-011', 'Pica de tierra + grapa + arqueta', 'ud', {}, ''),
    ('FV-07-012', 'Kit de etiquetado y señalización FV', 'ud', {}, ''),
    ('FV-08-001', 'Pequeño material y consumibles (bridas UV, terminales, punteras, cinta, regletas, silicona, tacos)', 'lote', {},
     'Lote fijo o % sobre material: por decidir (Ramón)'),
    ('FV-09-001', 'Zanja: apertura, tubo y cierre', 'm', {}, ''),
    ('FV-09-002', 'Perforación de muro / forjado', 'ud', {}, ''),
    ('FV-09-004', 'Reparación / impermeabilización de cubierta', 'partida', {}, 'm² en visita: sale a 0 y con aviso'),
    ('FV-09-005', 'Desmontaje de instalación existente', 'partida', {}, ''),
    ('FV-10-001', 'Andamio (alquiler, montaje y desmontaje)', 'día', {}, ''),
    ('FV-10-002', 'Plataforma elevadora / camión grúa', 'día', {}, ''),
    ('FV-10-003', 'Elevador / montacargas de paneles', 'día', {}, ''),
    ('FV-10-004', 'Línea de vida / anclajes provisionales', 'ud', {}, ''),
    ('FV-10-005', 'Ocupación de vía pública (tasa y vallas)', 'ud', {}, ''),
    ('FV-11-001', 'Jornada de pareja de instaladores', 'día', {}, 'Coste declarado 2026: 330 €/día (confirmar vigencia)'),
    ('FV-11-003', 'Puesta en marcha, configuración y alta en la app del fabricante', 'ud', {}, ''),
    ('FV-12-001', 'Portes de material (palé de módulos, baterías)', 'ud', {}, 'Si el proveedor cobra'),
    ('FV-12-004', 'Gestión de residuos (embalajes, palets)', 'ud', {}, ''),
    ('FV-13-001', 'Memoria técnica de diseño', 'ud', {'sin_recargo': True}, 'Precio de venta declarado; confirmar con Xavi'),
    ('FV-13-002', 'Proyecto técnico', 'ud', {'sin_recargo': True}, 'Declarado 1.800 € venta (sept 2026); confirmar con Xavi'),
    ('FV-13-003', 'Legalización en Industria y certificado de instalación', 'ud', {'sin_recargo': True}, 'Declarado 300 € venta; confirmar con Xavi'),
    ('FV-13-004', 'Permiso de obra / comunicación previa', 'ud', {'sin_recargo': True}, 'Declarado 150 € venta; confirmar con Xavi'),
    ('FV-13-006', 'Tramitación de subvención', 'ud', {'sin_recargo': True}, 'Declarado 300 € venta; confirmar con Xavi'),
    ('FV-13-007', 'Solicitud de bonificación IBI / ICIO', 'ud', {'sin_recargo': True}, 'Precio de venta; confirmar con Xavi'),
    ('FV-13-008', 'Gestión con la distribuidora y compensación de excedentes', 'ud', {'sin_recargo': True}, 'Precio de venta; confirmar con Xavi'),
    ('FV-13-010', 'Certificado energético', 'ud', {'sin_recargo': True}, 'Declarado 300 € venta; confirmar con Xavi'),
    ('FV-14-001', 'Cargador de vehículo eléctrico, con instalación', 'ud', {}, ''),
    ('FV-14-002', 'Derivador de excedentes a termo eléctrico', 'ud', {}, ''),
    ('FV-14-003', 'Integración con aerotermia (SG Ready / gestión energética)', 'ud', {}, ''),
    ('FV-14-004', 'Ampliación de backup a toda la vivienda', 'ud', {}, ''),
]
# Precios que trae el propio documento (venta declarada sept 2026, sin IVA) y
# el coste de jornada. Van a la plantilla; lo demás en blanco.
PRECIOS_DOCUMENTO = {
    'FV-11-001': ('330', 'Sysefen', '2026-01-01'),
    'FV-13-002': ('1800', 'Xavi', '2026-09-01'), 'FV-13-003': ('300', 'Xavi', '2026-09-01'),
    'FV-13-004': ('150', 'Xavi', '2026-09-01'), 'FV-13-006': ('300', 'Xavi', '2026-09-01'),
    'FV-13-010': ('300', 'Xavi', '2026-09-01'),
}

# =============================================================================
# 2 · Las tarifas
# =============================================================================
distribuidor = list(csv.DictReader(open(os.path.join(CARPETA, 'fotovoltaica-2026.csv'), encoding='utf-8')))
R = {x['nombre']: x['referencia'] for x in distribuidor}
P = {x['referencia']: x for x in distribuidor}
def ref(nombre):
    return R[nombre]

RUTA_PARTIDAS = os.path.join(CARPETA, 'fotovoltaica-partidas-2026.csv')
COLUMNAS = ['codigo', 'descripcion', 'unidad', 'coste', 'proveedor', 'fecha', 'atributos', 'notas']
if not os.path.exists(RUTA_PARTIDAS):
    with open(RUTA_PARTIDAS, 'w', encoding='utf-8', newline='') as f:
        wr = csv.DictWriter(f, COLUMNAS)
        wr.writeheader()
        for cod, desc, ud, atr, nota in PARTIDAS:
            coste, prov, fecha = PRECIOS_DOCUMENTO.get(cod, ('', '', ''))
            wr.writerow(dict(codigo=cod, descripcion=desc, unidad=ud, coste=coste, proveedor=prov, fecha=fecha,
                             atributos=json.dumps(atr, ensure_ascii=False) if atr else '', notas=nota))
    print('Creada la plantilla', RUTA_PARTIDAS, '(rellena la columna coste y vuelve a ejecutar)')

precios_csv = {x['codigo']: x for x in csv.DictReader(open(RUTA_PARTIDAS, encoding='utf-8'))}

def num(v):
    s = str(v or '').strip().replace('€', '').replace(' ', '')
    if ',' in s: s = s.replace('.', '').replace(',', '.')
    try: return float(s)
    except ValueError: return 0.0

# Los productos Sysefen: el catálogo + lo que haya de más en el CSV (paneles reales).
sysefen = []   # dicts: referencia, nombre, familia, unidad, precio (coste), atributos, proveedor, fecha
def producto_sysefen(cod, desc, ud, atr, fila):
    cap = cod[3:5]
    a = dict(atr)
    a['capitulo'] = cap
    if fila and (fila.get('atributos') or '').strip():
        a.update(json.loads(fila['atributos']))
    coste = num(fila['coste']) if fila else 0.0
    if not coste: a['pendiente'] = True
    sysefen.append(dict(referencia=cod, nombre=desc, familia=FAMILIA.get(cap, 'otro'), unidad=ud, precio=coste,
                        atributos=a, proveedor=(fila or {}).get('proveedor', ''), fecha=(fila or {}).get('fecha', '')))
for cod, desc, ud, atr, _ in PARTIDAS:
    fila = precios_csv.get(cod)
    producto_sysefen(cod, (fila or {}).get('descripcion') or desc, (fila or {}).get('unidad') or ud, atr, fila)
conocidos = {c for c, *_ in PARTIDAS}
for cod, fila in precios_csv.items():
    if cod in conocidos or not cod.startswith('FV-'): continue
    producto_sysefen(cod, fila['descripcion'], fila['unidad'] or 'ud', {}, fila)
S = {x['referencia']: x for x in sysefen}
paneles = sorted([x for x in sysefen if x['referencia'].startswith('FV-01-001-') and num(x['atributos'].get('wp'))],
                 key=lambda x: num(x['atributos']['wp']))

# =============================================================================
# 3 · Coeficientes (tablas_lookup). «por confirmar» = valor de arranque, se
#     cambia en la tabla sin tocar nada más.
# =============================================================================
LOOKUP = [
    ('recargo_sobre_coste', 'defecto', 1.30, 'Precio de venta = coste × 1,30, una vez por línea. CONFIRMADO (desglose FV, oct 2026).'),
    ('ratio_dc_ac', 'defecto', 1.2, 'kWp de paneles por kW de inversor. Por confirmar según ficha técnica de cada marca.'),
    ('micros_por_rama', 'defecto', 11, 'Microinversores Enphase por rama de Q Cable.'),
    ('bateria_kwh', 'defecto', 5, 'kWh de batería si se pide batería sin decir cuántos ni haber consumo.'),
    ('wp_panel', 'defecto', 510, 'Vatios del panel si no se dicen.'),
    ('paneles_por_fila', 'defecto', 10, 'Paneles por fila si la visita no apunta las filas. POR CONFIRMAR.'),
    ('ancho_panel_m', 'defecto', 1.134, 'Ancho del panel en vertical (m). POR CONFIRMAR con la ficha del panel que se use.'),
    ('largo_barra_m', 'defecto', 4.2, 'Largo de la barra comercial de raíl (m). POR CONFIRMAR con el fabricante de estructura.'),
    ('separacion_ganchos_m', 'defecto', 1.0, 'Separación máxima entre ganchos de teja (m). POR CONFIRMAR según fabricante.'),
    ('soportes_chapa_por_panel', 'defecto', 4, 'Soportes por panel en chapa / sándwich. Habitual 4; POR CONFIRMAR.'),
    ('anclajes_por_triangulo', 'defecto', 2, 'Anclajes químicos por triángulo en plana anclada. POR CONFIRMAR.'),
    ('lastres_por_triangulo', 'defecto', 1, 'Lastres por triángulo en plana sin anclar. ORIENTATIVO: manda el cálculo de viento del fabricante.'),
    ('anclajes_por_cartucho', 'defecto', 10, 'Anclajes o soportes que sella un cartucho. POR CONFIRMAR.'),
    ('paneles_por_bolsa_clips', 'defecto', 20, 'Paneles por bolsa de clips de cable.'),
    ('paneles_por_string', 'defecto', 12, 'Paneles por string. POR CONFIRMAR con Voc/Vmp del panel y tensiones del inversor.'),
    ('mppt', 'defecto', 2, 'MPPT del inversor (un protector DC por cada uno).'),
    ('m_por_caja_registro', 'defecto', 15, 'Metros de recorrido por caja de registro.'),
    ('dias_base', 'hasta_10', 2, 'Días de pareja hasta 10 paneles. POR CONFIRMAR (referencia: FV habitual 2–3 días).'),
    ('dias_base', 'hasta_20', 3, 'Días de pareja de 11 a 20 paneles. POR CONFIRMAR.'),
    ('dias_base', 'por_10_mas', 1, 'Días más por cada 10 paneles por encima de 20. POR CONFIRMAR.'),
    ('dias_extra', 'bateria', 0.5, 'Días más si lleva batería. POR CONFIRMAR.'),
    ('dias_extra', 'backup', 0.5, 'Días más si lleva backup. POR CONFIRMAR.'),
    ('dias_extra', 'lastre', 0.5, 'Días más en plana con lastre. POR CONFIRMAR.'),
    ('dias_extra', 'plantas', 0.5, 'Días más si el edificio tiene 2 plantas o más. POR CONFIRMAR.'),
    ('dias_extra', 'zanja', 1, 'Días más si hay zanja. POR CONFIRMAR.'),
    ('pct_nocturno', 'diurno', 0.30, 'Parte del consumo que es de noche, perfil diurno. SUPUESTO; afina con curva horaria.'),
    ('pct_nocturno', 'nocturno', 0.60, 'Perfil nocturno. SUPUESTO.'),
    ('pct_nocturno', 'mixto', 0.45, 'Perfil mixto. SUPUESTO.'),
    ('pct_nocturno', 'fin_de_semana', 0.45, 'Perfil de fin de semana. SUPUESTO.'),
    ('pct_nocturno', 'defecto', 0.45, 'Si no se dice el perfil.'),
    ('dod', 'defecto', 0.90, 'Profundidad de descarga útil de la batería.'),
    ('produccion_especifica', 'defecto', 1500, 'kWh por kWp y año en Mallorca. POR CONFIRMAR con PVGIS por obra (sur / este-oeste / plana).'),
    ('cobertura_objetivo', 'defecto', 1.0, 'Qué parte del consumo anual se quiere cubrir cuando el nº de paneles sale del consumo (1 = todo). POR CONFIRMAR.'),
]

# =============================================================================
# 4 · Variables derivadas, en orden de cálculo
# =============================================================================
VARIABLES = [
    # (codigo, etiqueta, unidad, formula, orden, descripcion, por_cada)
    ('wp_panel', 'Vatios por panel', 'Wp', "si(wp_manual > 0, wp_manual, lookup('wp_panel', 'defecto'))", 1, 'Los que se digan; si no, los de por defecto.', None),
    ('n_paneles', 'Paneles', 'ud',
     "si(max(modulos_estimados, paneles_manual) > 0, max(modulos_estimados, paneles_manual), "
     "si(consumo_anual_kwh > 0, techo(consumo_anual_kwh * lookup('cobertura_objetivo', 'defecto') / lookup('produccion_especifica', 'defecto') * 1000 / wp_panel), 0))",
     2, 'Los de la ficha o los que se pongan a mano; si no hay, salen del consumo anual.', None),
    ('kwp', 'Potencia pico', 'kWp', 'redondea(n_paneles * wp_panel / 1000, 2)', 3, '', None),
    ('marca_inversor', 'Inversor', '', "si(inversor_marca = 'enphase', 'enphase', 'fronius')", 10, 'Fronius salvo que se diga Enphase.', None),
    ('fases', 'Fases', '', "si(suministro = 'trifasico', 3, 1)", 11, '', None),
    ('con_bateria', 'Lleva batería', '', "si(baterias = 'si', 1, 0)", 12, '', None),
    ('perfil_bat', 'Perfil para la batería', '', "si(perfil_consumo != '', perfil_consumo, 'defecto')", 12, 'El perfil de consumo, o «defecto» si no se dijo (para no avisar en cada presupuesto).', None),
    ('bat_kwh', 'Batería', 'kWh',
     "si(baterias_kwh > 0, baterias_kwh, si(consumo_anual_kwh > 0, "
     "redondea(consumo_anual_kwh * lookup('pct_nocturno', perfil_bat) / (365 * lookup('dod', 'defecto')), 1), lookup('bateria_kwh', 'defecto')))",
     13, 'Los kWh pedidos; si no, consumo nocturno diario entre la profundidad de descarga (desglose FV §4); si tampoco, el de por defecto.', None),
    ('marca_bateria', 'Batería de', '', "si(bateria_marca != '', bateria_marca, si(marca_inversor = 'enphase', 'enphase', 'byd'))", 14, '', None),
    ('con_backup', 'Backup', '', 'si(backup y con_bateria = 1, 1, 0)', 15, 'Solo cuenta si lleva batería.', None),
    ('backup_parcial', 'Backup parcial', '', "si(con_backup = 1 y backup_tipo != 'total', 1, 0)", 16, 'Cuadro de cargas críticas.', None),
    ('backup_total', 'Backup total', '', "si(con_backup = 1 y backup_tipo = 'total', 1, 0)", 17, 'Toda la vivienda.', None),
    ('bateria_dc', 'Batería en continua', '', "si((con_bateria = 1 y marca_bateria != 'tesla') o baterias = 'dejar_preparado', 1, 0)", 18, '', None),
    ('kw_inversor', 'Inversor mínimo', 'kW', "redondea(kwp / lookup('ratio_dc_ac', 'defecto'), 2)", 19, '', None),
    ('ramas_enphase', 'Ramas Enphase', 'ud', "techo(n_paneles / lookup('micros_por_rama', 'defecto'))", 20, '', None),
    # estructura
    ('tipo_estructura', 'Estructura', '',
     "si(tipo_cubierta = 'chapa_sandwich', 'chapa', si(tipo_cubierta = 'plana_transitable' o tipo_cubierta = 'plana_no_transitable' o tipo_cubierta = 'suelo', 'plana', si(tipo_cubierta = 'pergola', 'especial', 'teja')))",
     30, 'teja (ganchos), chapa (soportes), plana (triángulos) o especial (pérgola).', None),
    ('n_filas', 'Filas', 'ud', "si(cuenta(filas_paneles) > 0, cuenta(filas_paneles), techo(n_paneles / lookup('paneles_por_fila', 'defecto')))", 31, '', None),
    ('l_fila', 'Largo de la fila', 'm', "paneles * lookup('ancho_panel_m', 'defecto') + 0.05 * (paneles - 1) + 0.10", 32, 'Por cada fila apuntada.', 'filas_paneles'),
    ('ganchos_fila', 'Ganchos de la fila', 'ud', "2 * (techo(l_fila / lookup('separacion_ganchos_m', 'defecto')) + 1)", 33, 'Dos raíles por fila.', 'filas_paneles'),
    ('l_filas', 'Largo total de filas', 'm',
     "si(cuenta(filas_paneles) > 0, suma(filas_paneles, 'l_fila'), n_paneles * lookup('ancho_panel_m', 'defecto') + 0.05 * (n_paneles - n_filas) + 0.10 * n_filas)",
     34, 'Suma de las filas; sin filas apuntadas, la misma cuenta con el reparto por defecto (sale exacta).', None),
    ('n_barras', 'Barras de raíl', 'ud', "techo(2 * l_filas / lookup('largo_barra_m', 'defecto'))", 35, 'Dos raíles por fila, a barras comerciales.', None),
    ('m_rail', 'Raíl', 'm', "n_barras * lookup('largo_barra_m', 'defecto')", 36, '', None),
    ('n_uniones', 'Uniones de raíl', 'ud', 'max(0, n_barras - 2 * n_filas)', 37, 'Una por empalme.', None),
    ('n_ganchos', 'Ganchos', 'ud',
     "si(cuenta(filas_paneles) > 0, suma(filas_paneles, 'ganchos_fila'), 2 * (techo(l_filas / lookup('separacion_ganchos_m', 'defecto')) + n_filas))",
     38, '', None),
    ('n_triangulos', 'Triángulos', 'ud', 'n_paneles + n_filas', 39, 'Paneles de la fila + 1, por fila.', None),
    ('con_lastre', 'Con lastre', '', "si(tipo_estructura = 'plana' y plana_anclaje != 'anclaje_quimico', 1, 0)", 40, '', None),
    ('n_anclajes', 'Anclajes químicos', 'ud', "si(tipo_estructura = 'plana' y plana_anclaje = 'anclaje_quimico', n_triangulos * lookup('anclajes_por_triangulo', 'defecto'), 0)", 41, '', None),
    # cableado
    ('n_strings', 'Strings', 'ud', "si(marca_inversor = 'enphase', 0, max(1, techo(n_paneles / lookup('paneles_por_string', 'defecto'))))", 50, '', None),
    ('dist_dc', 'Paneles → inversor', 'm', 'distancia_cubierta_inversor_m', 51, '', None),
    ('dist_ac', 'Inversor → cuadro', 'm', 'distancia_inversor_cuadro_m', 52, '', None),
    ('dist_meter', 'Cuadro → contador', 'm', 'distancia_cuadro_contador_m', 53, '', None),
    ('m_tubo', 'Tubo', 'm', "si(recorrido_cableado = 'interior', 0, techo(max(0, dist_dc + dist_ac - zanja_m) * 1.10))", 54, 'El recorrido que no va en bandeja ni enterrado, con un 10 %.', None),
    ('m_bandeja', 'Bandeja', 'm', "si(recorrido_cableado = 'interior', techo((dist_dc + dist_ac) * 1.10), 0)", 55, '', None),
    ('con_meter', 'Lleva medidor', '', 'si(n_paneles > 0, 1, 0)', 56, 'Fronius (Smart Meter) y Enphase (Gateway) lo llevan siempre.', None),
    # mano de obra
    ('dias_base', 'Días base', 'día',
     "si(n_paneles <= 10, lookup('dias_base', 'hasta_10'), si(n_paneles <= 20, lookup('dias_base', 'hasta_20'), lookup('dias_base', 'hasta_20') + techo((n_paneles - 20) / 10) * lookup('dias_base', 'por_10_mas')))",
     60, 'Por número de paneles (tablas_lookup dias_base).', None),
    ('dias_extra', 'Días extra', 'día',
     "con_bateria * lookup('dias_extra', 'bateria') + con_backup * lookup('dias_extra', 'backup') + con_lastre * lookup('dias_extra', 'lastre') + si(plantas >= 2, lookup('dias_extra', 'plantas'), 0) + si(zanja_m > 0, lookup('dias_extra', 'zanja'), 0)",
     61, 'Batería, backup, lastre, dos plantas, zanja.', None),
    ('dias_obra', 'Días de obra', 'día', 'si(n_paneles > 0, dias_base + dias_extra, 0)', 62, '', None),
    # trámites
    ('proyecto', 'Lleva proyecto', '', 'si(kwp > 10 o zona_protegida, 1, 0)', 70, 'Proyecto técnico por encima de 10 kWp o en zona protegida; si no, memoria.', None),
]

# =============================================================================
# 5 · Las reglas
# =============================================================================
reglas = []  # (tipo, variable, min, max, condicion, producto, formula, seccion, prioridad, notas)
def pr(cap, sub=5):
    return 200 - int(cap) * 10 + sub
def regla(prod, cond, formula='1', cap='03', prio=None, notas=None, tipo='cantidad', var=None, mn=None, mx=None, sub=5):
    if prod: assert prod in P or prod in S, prod
    reglas.append((tipo, var, mn, mx, cond or {}, prod, formula, CAP[cap] if tipo != 'aviso' else None, prio if prio is not None else pr(cap, sub), notas))
def aviso(cond, notas, var=None, mn=None, mx=None, prio=190):
    reglas.append(('aviso', var, mn, mx, cond or {}, None, '1', None, prio, notas))

HAY = 'si(n_paneles > 0, 1, 0)'
ESTR = ['teja', 'chapa', 'plana']

# --- 01 · Generador: un producto por modelo real (por sus Wp) y el genérico en los huecos
if paneles:
    prev = 0.0
    for p_ in paneles:
        wp = num(p_['atributos']['wp'])
        if wp - 0.5 > prev + 0.001:
            regla('FV-01-001', {}, formula='n_paneles', cap='01', tipo='seleccion', var='wp_panel', mn=round(prev + 0.001, 3), mx=round(wp - 0.5, 3), sub=9,
                  notas='No hay panel en la tarifa con esos Wp: módulo genérico, precio pendiente.')
        regla(p_['referencia'], {}, formula='n_paneles', cap='01', tipo='seleccion', var='wp_panel', mn=round(wp - 0.5, 3), mx=round(wp + 0.5, 3), sub=9,
              notas='Panel de %g Wp.' % wp)
        prev = wp + 0.5
    regla('FV-01-001', {}, formula='n_paneles', cap='01', tipo='seleccion', var='wp_panel', mn=round(prev + 0.001, 3), mx=None, sub=9,
          notas='No hay panel en la tarifa con esos Wp: módulo genérico, precio pendiente.')
else:
    regla('FV-01-001', {}, formula='n_paneles', cap='01', sub=9, notas='Un módulo por panel. Precio por modelo: añade los paneles reales a fotovoltaica-partidas-2026.csv.')

# --- 02 · Estructura (desglose FV §3 y §4)
E = {'tipo_estructura': ESTR}
regla('FV-02-001', E, 'm_rail', '02', sub=9, notas='Dos raíles por fila, redondeados a barras comerciales.')
regla('FV-02-002', E, 'n_uniones', '02', sub=8, notas='Una unión por empalme de barra.')
regla('FV-02-003', {'tipo_estructura': 'teja'}, 'n_ganchos', '02', sub=8, notas='Por raíl: ⌈largo / separación⌉ + 1.')
regla('FV-02-004', {'tipo_estructura': 'chapa'}, "n_paneles * lookup('soportes_chapa_por_panel', 'defecto')", '02', sub=8, notas='Soportes de chapa, 4 por panel por defecto.')
regla('FV-02-005', E, '2 * (n_paneles - n_filas)', '02', sub=7, notas='2 × (paneles de la fila − 1), por fila.')
regla('FV-02-006', E, '4 * n_filas', '02', sub=7, notas='4 por fila.')
regla('FV-02-007', {'tipo_estructura': 'plana'}, 'n_triangulos', '02', sub=8, notas='Paneles de la fila + 1, por fila.')
regla('FV-02-008', {'tipo_estructura': 'plana'}, "con_lastre * n_triangulos * lookup('lastres_por_triangulo', 'defecto')", '02', sub=6, notas='Orientativo: manda el cálculo de viento del fabricante.')
regla('FV-02-009', {'tipo_estructura': 'plana'}, 'n_anclajes', '02', sub=6, notas='Varilla, taco químico y malla por anclaje.')
regla('FV-02-010', E, HAY, '02', sub=4, notas='Un lote.')
regla('FV-02-011', E, "techo((n_anclajes + si(tipo_estructura = 'chapa', n_paneles * lookup('soportes_chapa_por_panel', 'defecto'), 0)) / lookup('anclajes_por_cartucho', 'defecto'))", '02', sub=4,
      notas='Un cartucho cada X perforaciones (anclajes químicos y soportes de chapa).')
regla('FV-02-012', {'tipo_estructura': 'teja'}, 'tejas_reposicion', '02', sub=3, notas='Las que se apuntaron en la visita.')
regla('FV-02-013', E, 'n_filas + n_uniones', '02', sub=3, notas='Una por fila y una por empalme.')
regla('FV-02-014', E, "techo(n_paneles / lookup('paneles_por_bolsa_clips', 'defecto'))", '02', sub=2, notas='Una bolsa cada 20 paneles.')
regla('FV-02-015', {'tipo_estructura': 'especial'}, HAY, '02', sub=9, notas='Pérgola o marquesina: estructura con presupuesto aparte.')
aviso({'tipo_estructura': 'especial'}, 'Pérgola, marquesina o estructura elevada: la estructura va con presupuesto aparte (FV-02-015 sale a 0).')
aviso({'tipo_estructura': 'plana'}, 'Cubierta plana con lastre: la cantidad de lastre es orientativa, hay que comprobarla con el cálculo de viento del fabricante.', var='con_lastre', mn=1, mx=1)

# --- 03 · Inversor: Fronius por potencia, fases y batería en continua
fr = {
 (1,0): [(3.0,'Fronius Primo GEN24 SC 3.0'),(3.6,'Fronius Primo GEN24 SC 3.6'),(4.0,'Fronius Primo GEN24 SC 4.0'),
         (4.6,'Fronius Primo GEN24 SC 4.6'),(5.0,'Fronius Primo GEN24 SC 5.0'),(6.0,'Fronius Primo GEN24 SC 6.0'),
         (8.0,'Fronius Primo GEN24 8.0KW'),(10.0,'Fronius Primo GEN24 10.0KW')],
 (1,1): [(3.0,'Fronius Primo GEN24 SC 3.0 Plus'),(3.6,'Fronius Primo GEN24 SC 3.6 Plus'),(4.0,'Fronius Primo GEN24 SC 4.0 Plus'),
         (4.6,'Fronius Primo GEN24 SC 4.6 Plus'),(5.0,'Fronius Primo GEN24 SC 5.0 Plus'),(6.0,'Fronius Primo GEN24 SC 6.0 Plus'),
         (8.0,'Fronius Primo GEN24 8.0 Plus'),(10.0,'Fronius Primo GEN24 10.0 Plus')],
 (3,0): [(3.0,'FRONIUS Symo GEN24 SC 3.0'),(4.0,'FRONIUS Symo GEN24 SC 4.0'),(5.0,'FRONIUS Symo GEN24 SC 5.0'),
         (6.0,'FRONIUS Symo GEN24 SC 6.0'),(8.0,'FRONIUS Symo GEN24 SC 8.0'),(10.0,'FRONIUS Symo GEN24 SC 10.0'),
         (12.0,'FRONIUS Symo GEN24 SC 12.0')],
 (3,1): [(3.0,'FRONIUS Symo GEN24 SC 3.0 Plus'),(4.0,'FRONIUS Symo GEN24 SC 4.0 Plus'),(5.0,'Fronius Symo GEN24 SC 5.0 Plus'),
         (6.0,'FRONIUS Symo GEN24 SC 6.0 Plus'),(8.0,'FRONIUS Symo GEN24 SC 8.0 Plus'),(10.0,'FRONIUS Symo GEN24 SC 10.0 Plus'),
         (12.0,'Fronius Symo GEN24 SC 12.0 Plus')],
}
for (fases, dc), lista in fr.items():
    prev = 0
    for kw, nombre in lista:
        regla(ref(nombre), {'marca_inversor': 'fronius', 'fases': fases, 'bateria_dc': dc}, tipo='seleccion', var='kw_inversor',
              mn=round(prev + 0.001, 3) if prev else 0.001, mx=kw, cap='03', sub=9,
              notas=f"Fronius {'trifásico' if fases == 3 else 'monofásico'}{' con batería en continua (Plus)' if dc else ''}: hasta {kw} kW de alterna.")
        prev = kw
    aviso({'marca_inversor': 'fronius', 'fases': fases, 'bateria_dc': dc}, var='kw_inversor', mn=round(prev + 0.001, 3), mx=None,
          notas=f"Hace falta un inversor de más de {prev} kW: por encima de eso el inversor Fronius (Verto) se elige a mano.")
# Enphase: un micro por panel, con su cableado por rama
regla(ref('ENPHASE IQ 8HC microinversor con conectores MC4 integrados'), {'marca_inversor': 'enphase'}, tipo='seleccion', var='wp_panel', mn=0.001, mx=540,
      formula='n_paneles', cap='03', sub=9, notas='Un IQ8HC por panel, para paneles de hasta 540 Wp.')
regla(ref('ENPHASE IQ 8P microinversor con conectores MC4'), {'marca_inversor': 'enphase'}, tipo='seleccion', var='wp_panel', mn=540.001, mx=None,
      formula='n_paneles', cap='03', sub=9, notas='Un IQ8P por panel, para paneles de más de 540 Wp.')
for fases, cable, term, con in [(1, 'ENPHASE Q Cable 2.5mm | 1.3m (monofásico)', 'ENPHASE Tapón de terminación para cable 1-phase', 'ENPHASE Conector estanco 1-phase - Macho'),
                                (3, 'ENPHASE Q Cable 2.5mm | 1.3m (trifásico)', 'ENPHASE Tapón de terminación para cable 3-phase', 'ENPHASE Conector de campo 3-phase - M')]:
    c = {'marca_inversor': 'enphase', 'fases': fases}
    regla(ref(cable), c, 'n_paneles', '03', sub=7, notas='Un tramo de Q Cable por microinversor (bus AC).')
    regla(ref(term), c, 'ramas_enphase', '03', sub=6, notas='Un tapón al final de cada rama.')
    regla(ref(con), c, 'ramas_enphase', '03', sub=6, notas='Un conector de campo por rama.')
regla('FV-03-008', {'inversor_exterior': True}, HAY, '03', sub=3, notas='Inversor al exterior: tejadillo.')
aviso({'marca_inversor': 'fronius', 'sombras': ['parcial', 'importante']}, 'Hay sombras: valorar optimizadores o microinversores (FV-03-004). No se ha puesto ninguno.')

# --- 04 · Almacenamiento
regla(ref('ENPHASE IQ Battery 5P'), {'con_bateria': 1, 'marca_bateria': 'enphase', 'marca_inversor': 'enphase'}, 'max(1, techo(bat_kwh / 5))', '04', sub=9,
      notas='IQ Battery 5P de 5 kWh: las que hagan falta para los kWh pedidos.')
regla(ref('TESLA Powerwall 3 | 13.5 kWh/11 kW'), {'con_bateria': 1, 'marca_bateria': 'tesla', 'fases': 1}, cap='04', sub=9, notas='Powerwall 3 (13,5 kWh), monofásico.')
regla(ref('TESLA Powerwall 3P | 13.5 kWh/15.4 kW'), {'con_bateria': 1, 'marca_bateria': 'tesla', 'fases': 3}, cap='04', sub=9, notas='Powerwall 3P (13,5 kWh), trifásico.')
regla(ref('TESLA Expansión Powerwall 3 13.5 kWh'), {'con_bateria': 1, 'marca_bateria': 'tesla'}, 'max(0, techo(bat_kwh / 13.5) - 1)', '04', sub=8,
      notas='Una expansión por cada 13,5 kWh más.')
regla(ref('BYD Premium HVS 2.56'), {'con_bateria': 1, 'marca_bateria': 'byd', 'marca_inversor': 'fronius'}, tipo='seleccion', var='bat_kwh', mn=0.001, mx=12.8,
      formula='max(2, techo(bat_kwh / 2.56))', cap='04', sub=9, notas='BYD HVS: módulos de 2,56 kWh, de 2 a 5 (hasta 12,8 kWh).')
regla(ref('BYD Premium HVM 2.76'), {'con_bateria': 1, 'marca_bateria': 'byd', 'marca_inversor': 'fronius'}, tipo='seleccion', var='bat_kwh', mn=12.801, mx=None,
      formula='max(3, techo(bat_kwh / 2.76))', cap='04', sub=9, notas='BYD HVM: módulos de 2,76 kWh, por encima de 12,8 kWh.')
regla(ref('BYD Battery Box Premium HVS /HVM (BCU+Base)'), {'con_bateria': 1, 'marca_bateria': 'byd', 'marca_inversor': 'fronius'}, cap='04', sub=8, notas='La torre BYD necesita su BCU y base.')
regla(ref('FRONIUS Batería Reserva Modulo 3,15 kWh'), {'con_bateria': 1, 'marca_bateria': 'fronius', 'marca_inversor': 'fronius'}, 'max(2, techo(bat_kwh / 3.15))', '04', sub=9,
      notas='Fronius Reserva: módulos de 3,15 kWh, mínimo 2.')
regla(ref('FRONIUS Batería Reserva BMS y Base'), {'con_bateria': 1, 'marca_bateria': 'fronius', 'marca_inversor': 'fronius'}, cap='04', sub=8, notas='La Reserva necesita su BMS y base.')
regla('FV-04-004', {'con_bateria': 1}, '1', '04', sub=6, notas='Soporte, bancada o anclaje de la batería.')
# backup
regla(ref('TESLA Backup Gateway 2'), {'con_bateria': 1, 'con_backup': 1, 'marca_bateria': 'tesla'}, cap='04', sub=5, notas='Backup con Powerwall: Backup Gateway 2.')
regla(ref('FRONIUS Backup Switch 1PN/3PN-63A'), {'con_bateria': 1, 'con_backup': 1, 'marca_inversor': 'fronius', 'marca_bateria': ['byd', 'fronius']}, cap='04', sub=5,
      notas='Backup con Fronius: Backup Switch (mono y trifásico).')
regla(ref('Enphase IQ System Controller'), {'con_bateria': 1, 'con_backup': 1, 'marca_inversor': 'enphase', 'marca_bateria': 'enphase'}, cap='04', sub=5,
      notas='Backup con Enphase: IQ System Controller.')
regla('FV-04-006', {'backup_parcial': 1}, '1', '04', sub=4, notas='Backup parcial: cuadro de cargas críticas.')
aviso({'con_bateria': 1, 'marca_inversor': 'enphase', 'marca_bateria': ['byd', 'fronius']}, 'Enphase solo va con baterías Enphase o Tesla: la batería elegida no se ha puesto.')
aviso({'con_bateria': 1, 'marca_inversor': 'fronius', 'marca_bateria': 'enphase'}, 'Fronius va con baterías BYD, Tesla o Fronius Reserva: la Enphase no se ha puesto.')
aviso({'con_bateria': 0}, 'El backup necesita batería: no se ha puesto.', var='si(backup, 1, 0)', mn=1, mx=1)

# --- 05 · Monitorización y medida
regla(ref('FRONIUS Smart Meter TS 100A-1'), {'marca_inversor': 'fronius', 'fases': 1}, HAY, '05', sub=9, notas='Fronius necesita su Smart Meter (monofásico).')
regla(ref('FRONIUS Smart Meter TS 65A-3'), {'marca_inversor': 'fronius', 'fases': 3}, HAY, '05', sub=9, notas='Fronius necesita su Smart Meter (trifásico).')
regla(ref('ENPHASE IQ Gateway Metered NUEVA VERSION'), {'marca_inversor': 'enphase'}, HAY, '05', sub=9, notas='El controlador de Enphase, con medida.')
regla(ref('ENPHASE CT Transformador de núcleo partido 200A/80mA'), {'marca_inversor': 'enphase'}, 'si(n_paneles > 0, 2 * fases, 0)', '05', sub=8,
      notas='Toroidales del Gateway: uno de producción y uno de consumo por fase.')
regla('FV-05-005', {'wifi_inversor': 'mala'}, HAY, '05', sub=5, notas='Sin cobertura WiFi: repetidor o PLC.')
regla('FV-05-006', {'wifi_inversor': 'cablear'}, 'techo(distancia_router_m * 1.10)', '05', sub=5, notas='Cable de red del router al inversor, con un 10 %.')
aviso({'excedentes': 'sin_excedentes'}, 'Sin excedentes: configurar límite de inyección 0 en el inversor (Smart Meter / Gateway) y comprobar si la distribuidora exige equipo antivertido homologado (FV-05-007).')

# --- 06 · Cableado y canalizaciones
regla('FV-06-001', {'marca_inversor': 'fronius'}, 'techo(2 * dist_dc * n_strings * 1.10)', '06', sub=9, notas='2 × distancia × strings × 1,10.')
regla('FV-06-002', {'marca_inversor': 'fronius'}, 'si(n_paneles > 0, 2 * n_strings + 2, 0)', '06', sub=8, notas='Dos pares por string y dos de reserva.')
regla('FV-06-003', {}, 'techo(dist_ac * 1.10)', '06', sub=8, notas='Distancia inversor → cuadro × 1,10.')
regla('FV-06-004', {'marca_inversor': 'enphase'}, 'techo(dist_dc * 1.10)', '06', sub=9, notas='Bus de micros de la cubierta al cuadro × 1,10.')
regla('FV-06-005', {}, 'con_meter * techo(dist_meter * 1.10)', '06', sub=7, notas='Del cuadro al contador, para el medidor, × 1,10.')
regla('FV-06-006', {}, 'techo(dist_dc + dist_ac)', '06', sub=7, notas='Tierra: continua + alterna.')
regla('FV-06-007', {}, 'm_tubo', '06', sub=6, notas='Recorrido × 1,10, menos lo enterrado; nada si va todo en bandeja.')
regla('FV-06-008', {'recorrido_cableado': 'interior'}, 'm_bandeja', '06', sub=6, notas='Recorrido interior visto.')
regla('FV-06-009', {}, 'zanja_m', '06', sub=6, notas='Lo que mida la zanja.')
regla('FV-06-010', {}, "si(dist_dc + dist_ac > 0, techo((dist_dc + dist_ac) / lookup('m_por_caja_registro', 'defecto')) + 1, 0)", '06', sub=5, notas='Una caja cada tramo.')
regla('FV-06-011', {}, 'techo(m_tubo / 10)', '06', sub=4, notas='Una bolsa cada 10 m de tubo.')
regla('FV-06-012', {}, 'si(n_paneles > 0, perforaciones + 2, 0)', '06', sub=4, notas='Uno por paso de muro y dos para las cajas.')
aviso({}, 'Faltan los metros de paneles → inversor: sin ellos no hay cable de continua, tubo ni tierra.', var='si(n_paneles > 0 y dist_dc = 0, 1, 0)', mn=1, mx=1)
aviso({}, 'Faltan los metros de inversor → cuadro: sin ellos no hay cable de alterna.', var='si(n_paneles > 0 y dist_ac = 0, 1, 0)', mn=1, mx=1)

# --- 07 · Protecciones, cuadros y tierra
regla('FV-07-001', {'marca_inversor': 'fronius'}, HAY, '07', sub=9, notas='Caja DC para el inversor de string.')
regla('FV-07-002', {'marca_inversor': 'fronius'}, 'si(n_strings > 2, 2 * n_strings, 0)', '07', sub=8, notas='Dos fusibles por string si hay más de dos en paralelo.')
regla('FV-07-004', {'marca_inversor': 'fronius'}, "si(n_paneles > 0, lookup('mppt', 'defecto'), 0)", '07', sub=8, notas='Un protector DC por MPPT.')
regla('FV-07-005', {}, HAY, '07', sub=7, notas='Siempre.')
regla('FV-07-006', {}, HAY, '07', sub=7, notas='Siempre.')
regla('FV-07-007', {}, HAY, '07', sub=7, notas='Siempre.')
regla('FV-07-008', {}, HAY, '07', sub=6, notas='Recomendado.')
regla('FV-07-010', {'estado_cuadro': ['sin_espacio', 'antiguo']}, HAY, '07', sub=5, notas='Cuadro sin espacio o antiguo.')
regla('FV-07-011', {'toma_tierra': ['no_existe', 'valor_alto']}, HAY, '07', sub=5, notas='Sin tierra o con valor alto.')
regla('FV-07-012', {}, HAY, '07', sub=4, notas='Siempre.')
# (FV-07-003 seccionador, FV-07-009 general y FV-07-013 relé de micros: integrados en GEN24 e IQ8, o según esquema; se añaden a mano si hacen falta.)

# --- 08 · Pequeño material
regla('FV-08-001', {}, HAY, '08', sub=5, notas='Lote fijo o % sobre material: por decidir (Ramón). Hasta entonces, precio pendiente.')

# --- 09 · Obra civil
regla('FV-09-001', {}, 'zanja_m', '09', sub=9, notas='Metros de zanja.')
regla('FV-09-002', {}, 'perforaciones', '09', sub=8, notas='Pasos de muro o forjado.')
regla('FV-09-004', {'estado_cubierta': 'malo'}, '1', '09', sub=7, notas='Cubierta en mal estado: reparación a medir (m²).')
aviso({'estado_cubierta': 'malo'}, 'Cubierta en mal estado: la reparación (FV-09-004) sale a 0, hay que medirla y valorarla antes de presupuestar.')
regla('FV-09-005', {'instalacion_existente': True}, '1', '09', sub=6, notas='Desmontaje de lo que hay.')
aviso({'fibrocemento': True}, 'Cubierta de fibrocemento: excluida o subcontratada a empresa autorizada. Escribirlo en exclusiones.')

# --- 10 · Medios auxiliares y seguridad
regla('FV-10-001', {'medio_elevacion': 'andamio'}, 'dias_obra + 1', '10', sub=9, notas='Días de obra más uno de montaje.')
regla('FV-10-002', {'medio_elevacion': ['plataforma', 'grua']}, 'dias_obra', '10', sub=9, notas='Los días de obra.')
regla('FV-10-003', {'medio_elevacion': ['ninguno', 'escalera', '']}, 'si(plantas >= 2, dias_obra, 0)', '10', sub=8, notas='Más de una planta sin otro medio: elevador de paneles.')
regla('FV-10-004', {'tipo_estructura': ['teja', 'chapa']}, HAY, '10', sub=7, notas='Cubierta inclinada: línea de vida.')
regla('FV-10-005', {'via_publica': True}, '1', '10', sub=6, notas='Grúa o andamio en la calle.')

# --- 11 · Mano de obra
regla('FV-11-001', {}, 'dias_obra', '11', sub=9, notas='Días base por nº de paneles + extras (desglose FV §4). Coste de jornada en la tarifa.')
regla('FV-11-003', {}, HAY, '11', sub=8, notas='Siempre.')
aviso({}, 'Más de 24 paneles: valorar una jornada de oficial adicional (FV-11-002).', var='n_paneles', mn=25, mx=None)

# --- 12 · Transporte y residuos
regla('FV-12-001', {}, HAY, '12', sub=9, notas='Portes, si el proveedor los cobra.')
regla('FV-12-004', {}, HAY, '12', sub=8, notas='Siempre.')

# --- 13 · Trámites
regla('FV-13-001', {'proyecto': 0}, HAY, '13', sub=9, notas='Memoria técnica (hasta 10 kWp, fuera de zona protegida).')
regla('FV-13-002', {'proyecto': 1}, HAY, '13', sub=9, notas='Proyecto técnico (más de 10 kWp o zona protegida).')
regla('FV-13-003', {}, HAY, '13', sub=8, notas='Siempre.')
regla('FV-13-004', {}, HAY, '13', sub=8, notas='Siempre.')
regla('FV-13-006', {'subvencion': True}, '1', '13', sub=7, notas='Si pide subvención.')
regla('FV-13-010', {'subvencion': True}, '1', '13', sub=6, notas='Lo pide la ayuda.')
regla('FV-13-007', {'bonificacion_ibi': True}, '1', '13', sub=7, notas='Si pide bonificación.')
regla('FV-13-008', {'excedentes': 'con_excedentes'}, HAY, '13', sub=7, notas='Con excedentes: compensación con la distribuidora.')
aviso({}, 'Las tasas e ICIO municipales las paga el cliente aparte (FV-13-005): escribirlo en exclusiones.', var='n_paneles', mn=1, mx=None, prio=100)

# --- 14 · Opcionales
regla('FV-14-001', {'cargador_ve': True}, '1', '14', sub=9, notas='Cargador de coche con su instalación.')
regla('FV-14-002', {'excedentes_gestion': 'termo'}, '1', '14', sub=8, notas='Derivador de excedentes al termo.')
regla('FV-14-003', {'excedentes_gestion': 'aerotermia'}, '1', '14', sub=8, notas='Integración con la aerotermia.')
regla('FV-14-004', {'backup_total': 1}, '1', '14', sub=7, notas='Backup de toda la vivienda.')
aviso({}, 'Prevé coche eléctrico y no se ha pedido cargador: ofrecerlo como opcional (FV-14-001).',
      var="si(contiene(cargas_previstas, 'vehiculo_electrico') y no cargador_ve, 1, 0)", mn=1, mx=1)

# =============================================================================
# 6 · Escribir el SQL
# =============================================================================
def lit(v, cast=None):
    if v is None: return 'null' + (('::' + cast) if cast else '')
    if isinstance(v, bool): return ('true' if v else 'false')
    if isinstance(v, (int, float)): return str(v) + (('::' + cast) if cast else '')
    return q(v)

out = []
w = out.append
w(f'''-- =============================================================================
-- Sysefen · Etapa 72 · El presupuesto de fotovoltaica por capítulos
--
-- GENERADO por herramientas/reglas-fotovoltaica.py el {HOY}. No se edita a mano:
-- se cambia el CSV o el script y se vuelve a generar.
--
-- QUÉ SE MONTA (desglose de costes FV particulares, 5 oct 2026):
--   · El modelo de precios: venta = coste × 1,30, UNA vez por línea
--     (tablas_lookup recargo_sobre_coste; lo aplica el motor 1.2).
--   · La tarifa «Fotovoltaica 2026» del distribuidor (Fronius, Enphase, BYD,
--     Tesla): precios como coste.
--   · La tarifa «Fotovoltaica partidas 2026» de Sysefen: {len(sysefen)} partidas con
--     código FV-CC-NNN (estructura, cables, protecciones, mano de obra,
--     trámites…). Las que están sin coste salen a 0 y «pendiente de
--     confirmar»; se rellenan en fotovoltaica-partidas-2026.csv.
--   · {len(LOOKUP)} coeficientes (días base, separación de ganchos, paneles por
--     string…), marcados POR CONFIRMAR donde son de arranque.
--   · {len(VARIABLES)} variables (filas, raíles, ganchos, strings, días de obra…).
--   · {len(reglas)} reglas, agrupadas en los 14 capítulos («NN · Nombre» en seccion).
--   · Fuera las partidas antiguas (PANEL 110 €, KIT_BASE, KIT_10, INV_6,
--     INV_10, MANO_OBRA por vatio): sus reglas quedan inactivas, no se borran.
--
-- REQUIERE: la función `presupuestar` 1.2 (precio_coste, recargo, contiene).
-- Idempotente: se puede volver a ejecutar; las reglas FV se rehacen (las que
-- usó algún presupuesto guardado quedan inactivas en vez de borrarse).
-- =============================================================================

begin;

-- 1 · El tipo de regla 'aviso' --------------------------------------------------
alter table public.reglas drop constraint if exists reglas_tipo_check;
alter table public.reglas add constraint reglas_tipo_check
  check (tipo in ('seleccion','cantidad','condicional','aviso'));

-- 2 · La tarifa del distribuidor ---------------------------------------------------
insert into public.proveedores (codigo, nombre)
values ('fotovoltaica', 'Distribuidor fotovoltaica (Fronius, Enphase, BYD, Tesla)')
on conflict (codigo) do nothing;
insert into public.tarifas (proveedor_id, nombre, vigente_desde)
select id, 'Fotovoltaica 2026', date '2026-09-23' from public.proveedores where codigo = 'fotovoltaica'
on conflict (proveedor_id, nombre) do nothing;

insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, iva, atributos)
select t.id, v.referencia, v.nombre, v.familia, 'ud', v.precio, 21, v.atributos::jsonb
  from public.tarifas t
  join (values
''')
w(",\n".join(f"    ({q(x['referencia'])}, {q(x['nombre'])}, {q(x['familia'])}, {x['precio_tarifa']}, {q(x['atributos'] or '{}')})" for x in distribuidor))
w("""
  ) as v(referencia, nombre, familia, precio, atributos) on true
 where t.nombre = 'Fotovoltaica 2026'
on conflict (tarifa_id, referencia) do update
  set nombre = excluded.nombre, familia = excluded.familia,
      precio_tarifa = excluded.precio_tarifa, atributos = excluded.atributos;

-- 3 · Las partidas de Sysefen -------------------------------------------------------
insert into public.proveedores (codigo, nombre) values ('sysefen', 'Sysefen (partidas propias)')
on conflict (codigo) do nothing;
insert into public.tarifas (proveedor_id, nombre, vigente_desde)
select id, 'Fotovoltaica partidas 2026', date '""" + HOY + """' from public.proveedores where codigo = 'sysefen'
on conflict (proveedor_id, nombre) do nothing;

insert into public.productos (tarifa_id, referencia, nombre, familia, unidad, precio_tarifa, iva, atributos)
select t.id, v.referencia, v.nombre, v.familia, v.unidad, v.precio, 21, v.atributos::jsonb
  from public.tarifas t
  join (values
""")
w(",\n".join(f"    ({q(x['referencia'])}, {q(x['nombre'])}, {q(x['familia'])}, {q(x['unidad'])}, {x['precio']:.2f}, {q(json.dumps(x['atributos'], ensure_ascii=False))})" for x in sysefen))
w("""
  ) as v(referencia, nombre, familia, unidad, precio, atributos) on true
 where t.nombre = 'Fotovoltaica partidas 2026'
on conflict (tarifa_id, referencia) do update
  set nombre = excluded.nombre, familia = excluded.familia, unidad = excluded.unidad,
      precio_tarifa = excluded.precio_tarifa, atributos = excluded.atributos;

-- 4 · Los coeficientes ----------------------------------------------------------------
-- Los que ya existan NO se pisan (se habrán ajustado a mano); solo entran los nuevos.
insert into public.tablas_lookup (categoria, clave, entrada, valor, notas) values
""")
w(",\n".join(f"  ('solar', {q(c)}, {q(e)}, {v}, {q(n)})" for c, e, v, n in LOOKUP))
w("""
on conflict (categoria, clave, entrada) do update set notas = excluded.notas;
-- El recargo sí se fija: es el acuerdo.
update public.tablas_lookup set valor = 1.30 where categoria = 'solar' and clave = 'recargo_sobre_coste' and entrada = 'defecto';

-- 5 · Las variables ---------------------------------------------------------------------
insert into public.variables_derivadas (categoria, codigo, etiqueta, unidad, formula, orden, descripcion, por_cada) values
""")
w(",\n".join(f"  ('solar', {q(c)}, {q(e)}, {q(u)}, {q(f)}, {o}, {q(d)}, {lit(pc, 'text')})" for c, e, u, f, o, d, pc in VARIABLES))
w("""
on conflict (categoria, codigo) do update
  set formula = excluded.formula, orden = excluded.orden, por_cada = excluded.por_cada,
      etiqueta = excluded.etiqueta, unidad = excluded.unidad, descripcion = excluded.descripcion;

-- 6 · Fuera las partidas antiguas -----------------------------------------------------
update public.reglas r set activa = false
  from public.partidas p, public.conjuntos_reglas c
 where r.partida_id = p.id and r.conjunto_id = c.id
   and c.categoria = 'solar' and p.categoria = 'solar'
   and p.codigo in ('PANEL', 'KIT_BASE', 'KIT_10', 'INV_6', 'INV_10', 'MANO_OBRA');

-- 7 · Las reglas ---------------------------------------------------------------------------
-- Se rehacen enteras: las de producto FV-… y los avisos de fotovoltaica. Las que
-- ya usó algún presupuesto guardado (presupuesto_lineas.origen_regla_id) no se
-- pueden borrar, y tampoco conviene: explican de dónde salió cada línea. Esas
-- se desactivan; las que nadie usó se borran.
update public.reglas r set activa = false
  from public.conjuntos_reglas c
 where r.conjunto_id = c.id and c.categoria = 'solar'
   and (r.producto_ref like 'FV-%' or r.tipo = 'aviso')
   and exists (select 1 from public.presupuesto_lineas l where l.origen_regla_id = r.id);
delete from public.reglas r using public.conjuntos_reglas c
 where r.conjunto_id = c.id and c.categoria = 'solar'
   and (r.producto_ref like 'FV-%' or r.tipo = 'aviso')
   and not exists (select 1 from public.presupuesto_lineas l where l.origen_regla_id = r.id);

insert into public.reglas (conjunto_id, tipo, variable, minimo, maximo, condicion, producto_ref, formula_cantidad, seccion, prioridad, notas)
select c.id, v.tipo, v.variable, v.minimo, v.maximo, v.condicion::jsonb, v.producto_ref, v.formula, v.seccion, v.prioridad, v.notas
  from public.conjuntos_reglas c
  join (values
""")
vals = []
for (tipo, var, mn, mx, cond, prod, formula, seccion, prio, notas) in reglas:
    vals.append(f"    ({q(tipo)}, {lit(var, 'text')}, {lit(mn, 'numeric')}, {lit(mx, 'numeric')}, {q(json.dumps(cond, ensure_ascii=False))}, {lit(prod, 'text')}, {q(formula)}, {lit(seccion, 'text')}, {prio}, {lit(notas, 'text')})")
w(",\n".join(vals))
w("""
  ) as v(tipo, variable, minimo, maximo, condicion, producto_ref, formula, seccion, prioridad, notas) on true
 where c.categoria = 'solar' and c.vigente_hasta is null;

commit;

-- =============================================================================
-- COMPROBACIONES
--   Partidas sin precio (saldrán «pendiente de confirmar»):
--   select p.referencia, p.nombre from public.productos p join public.tarifas t on t.id = p.tarifa_id
--    where t.nombre = 'Fotovoltaica partidas 2026' and p.precio_tarifa = 0 order by 1;
--
--   Las reglas activas por capítulo:
--   select r.seccion, count(*) from public.reglas r join public.conjuntos_reglas c on c.id = r.conjunto_id
--    where c.categoria = 'solar' and r.activa group by 1 order by 1;
--
--   Los coeficientes por confirmar:
--   select clave, entrada, valor, notas from public.tablas_lookup where categoria = 'solar' and notas ilike '%confirmar%' order by 1, 2;
-- =============================================================================
""")
os.makedirs(os.path.join(RAIZ, 'subir-a-supabase'), exist_ok=True)
open(os.path.join(RAIZ, 'subir-a-supabase', 'etapa72_fotovoltaica_capitulos.sql'), 'w', encoding='utf-8').write(''.join(out))

# =============================================================================
# 7 · El JSON para las pruebas (misma configuración)
# =============================================================================
productos = {}
for x in distribuidor:
    productos[x['referencia']] = dict(referencia=x['referencia'], nombre=x['nombre'], familia=x['familia'], unidad='ud',
                                      precio_tarifa=float(x['precio_tarifa']), descuento_proveedor=0, iva=21,
                                      atributos=json.loads(x['atributos'] or '{}'))
for x in sysefen:
    productos[x['referencia']] = dict(referencia=x['referencia'], nombre=x['nombre'], familia=x['familia'], unidad=x['unidad'],
                                      precio_tarifa=x['precio'], descuento_proveedor=0, iva=21, atributos=x['atributos'])
json.dump({
    'productos': productos,
    'lookup': [dict(clave=c, entrada=e, valor=v) for c, e, v, _ in LOOKUP],
    'variables': [dict(codigo=c, formula=f, orden=o, por_cada=pc) for c, _, _, f, o, _, pc in VARIABLES],
    'reglas': [dict(id='fv%d' % i, tipo=t, variable=v, minimo=a, maximo=b, condicion=c, producto_ref=p, formula_cantidad=f, seccion=s, prioridad=pr_, notas=n)
               for i, (t, v, a, b, c, p, f, s, pr_, n) in enumerate(reglas)],
}, open(os.path.join(CARPETA, 'fotovoltaica-reglas.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

sin_precio = [x['referencia'] for x in sysefen if not x['precio']]
print(len(distribuidor), 'productos del distribuidor ·', len(sysefen), 'partidas Sysefen (', len(sin_precio), 'sin precio ) ·',
      len(LOOKUP), 'coeficientes ·', len(VARIABLES), 'variables ·', len(reglas), 'reglas')
