-- =============================================================================
-- Sysefen · etapa 116 · precio del diferencial tipo F (Enzo, 19-11-2026)
--
-- Enzo: «Falta precio del diferencial tipo F; agrega el precio, lo compramos en
-- Amazon por 45 €…» y, al ver que un margen propio pedía tocar el motor:
-- «déjalo al 50».
--
-- El diferencial tipo F solo sale en los presupuestos fotovoltaicos con
-- Enphase y su precio estaba pendiente en el modelo (coste null, proveedor
-- «PENDIENTE»): la partida iba a 0 € y el presupuesto avisaba.
--
--   · coste 45 € (se toma tal como lo dio Enzo, como coste sin IVA).
--   · sin margen propio: va al margen objetivo del modelo (50 % sobre la venta),
--     como el resto del material. Pesa unos 90 € en el precio.
--   · se compra a Amazon: proveedor nuevo, para que la lista de compra de la
--     obra no lo mande a pedir a Electromat.
--
-- El cambio queda en precios_cambios: se puede deshacer o cambiar desde
-- Ajustes → Precios. No se toca el modelo_fv.json del Drive (los 23 casos de
-- Ramón se comprueban con el precio pendiente).
--
-- Idempotente: si el coste ya está puesto, no hace nada.
-- =============================================================================

do $$
declare
  m record;
  v_emp uuid;
begin
  select id, datos into m from public.motor_modelos
   where categoria = 'solar' and vigente_hasta is null order by vigente_desde desc limit 1;
  if not found then raise exception 'No hay modelo fotovoltaico vigente.'; end if;
  if m.datos #> '{precios,diferencial_tipo_f}' is null then raise exception 'El modelo no trae diferencial_tipo_f.'; end if;

  insert into public.proveedores (codigo, nombre) values ('amazon', 'Amazon') on conflict (codigo) do nothing;
  update public.proveedor_articulos set proveedor_codigo = 'amazon' where articulo = 'Diferencial tipo F (Enphase)';

  if jsonb_typeof(m.datos #> '{precios,diferencial_tipo_f,coste}') = 'number' then
    raise notice 'El diferencial tipo F ya tiene coste: no se toca.';
    return;
  end if;

  update public.motor_modelos
     set datos = jsonb_set(datos, '{precios,diferencial_tipo_f}',
                   (datos #> '{precios,diferencial_tipo_f}') || '{"coste": 45, "proveedor": "Amazon"}'::jsonb)
   where id = m.id;

  select id into v_emp from public.empleados where nombre = 'Fabrizio' and activo limit 1;
  insert into public.precios_cambios (empleado_id, nombre, origen, clave, descripcion, antes, despues, desde) values
    (v_emp, 'Fabrizio (lo puso Claude)', 'modelo_fv', 'precios/diferencial_tipo_f/coste', 'Diferencial tipo F (Enphase)',
     '{"ruta": ["precios", "diferencial_tipo_f", "coste"], "valor": null}'::jsonb,
     '{"ruta": ["precios", "diferencial_tipo_f", "coste"], "valor": 45}'::jsonb, 'configuracion');
end $$;

-- =============================================================================
-- COMPROBACIÓN
--   select datos #> '{precios,diferencial_tipo_f}' from public.motor_modelos where categoria = 'solar' and vigente_hasta is null;
--   select creado_en, nombre, clave, antes, despues from public.precios_cambios where clave like 'precios/diferencial_tipo_f/%';
-- =============================================================================
