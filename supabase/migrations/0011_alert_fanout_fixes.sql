-- ============================================================================
-- 0011 · Correcciones sobre el fan-out (0010), encontradas al verificar
--
-- Ya están incorporadas en 0010, que es la versión buena para un despliegue
-- desde cero. Esta migración existe para que el historial del proyecto remoto
-- refleje lo que realmente pasó, en vez de dar a entender que 0010 salió bien
-- de una. Ambas sentencias son idempotentes.
--
-- 1) El barrido filtraba por `fanned_out_at < updated_at`. Nunca se cumple:
--    `now()` devuelve el instante de la TRANSACCIÓN, no del reloj, así que el
--    `fanned_out_at` que escribe el fan-out y el `updated_at` que escribe
--    moddatetime quedan idénticos. Consecuencia real: un sismo corregido de 4.2
--    a 4.8 no se reevaluaba y quien tuviera umbral 4.5 nunca recibía el aviso.
--
-- 2) `alert_deliveries` heredaba todos los grants de `anon`/`authenticated` por
--    el default de Supabase sobre el schema `public`. RLS sin políticas ya los
--    bloquea, pero se revocan igual: misma línea de defensa en profundidad que
--    la migración 0006.
-- ============================================================================

create or replace function private.fan_out_pending_quakes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila record;
  total integer := 0;
begin
  for fila in
    select id
    from public.quake_events
    where canonical_id is null
      and occurred_at > now() - interval '30 minutes'
    order by occurred_at asc
  loop
    total := total + private.fan_out_quake(fila.id);
  end loop;

  return total;
end;
$$;

revoke execute on function private.fan_out_pending_quakes() from public, anon, authenticated;

revoke all on table public.alert_deliveries from anon, authenticated;
