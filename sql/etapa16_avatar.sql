begin;

alter table public.empleados add column if not exists avatar_emoji text;
alter table public.empleados add column if not exists avatar_foto  text;

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', false)
on conflict (id) do nothing;

drop policy if exists avatares_select on storage.objects;
create policy avatares_select on storage.objects
  for select to authenticated using (bucket_id = 'avatares');

drop policy if exists avatares_insert on storage.objects;
create policy avatares_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = public.empleado_id_actual()::text or public.es_admin())
  );

drop policy if exists avatares_update on storage.objects;
create policy avatares_update on storage.objects
  for update to authenticated using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = public.empleado_id_actual()::text or public.es_admin())
  );

drop policy if exists avatares_delete on storage.objects;
create policy avatares_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = public.empleado_id_actual()::text or public.es_admin())
  );

-- Cada uno cambia SU avatar. Va por función y no relajando la política de
-- empleados: si se abriera el update de la tabla, alguien podría tocarse el rol.
-- Aquí solo se escriben esas dos columnas y solo en la fila propia.
create or replace function public.guardar_mi_avatar(p_emoji text, p_foto text)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  if public.empleado_id_actual() is null then
    raise exception 'No hay sesión.';
  end if;
  if p_emoji is not null and length(p_emoji) > 8 then
    raise exception 'Ese emoji no vale.';
  end if;
  update public.empleados
     set avatar_emoji = p_emoji,
         avatar_foto  = p_foto
   where id = public.empleado_id_actual();
end $func$;

revoke all on function public.guardar_mi_avatar(text, text) from public, anon;
grant execute on function public.guardar_mi_avatar(text, text) to authenticated;

commit;
