-- Sysefen · Etapa 87 · Los dos VR 32/3 (direccionador eBUS, pared y cascada) a 140 € de venta (Enzo, 26 oct 2026).
-- El coste sigue siendo PVP × 0,57 (43 % de Vaillant). Idempotente.
update public.productos set precio_tarifa = 140.00 where referencia in ('0020235465', '0020139895');
select referencia, nombre, precio_tarifa, round(precio_tarifa * (1 - descuento_proveedor / 100), 2) as coste from public.productos where referencia in ('0020235465', '0020139895');
