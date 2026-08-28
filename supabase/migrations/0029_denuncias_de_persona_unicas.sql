-- 0029 · Una denuncia por persona denunciada, no una por toque.
--
-- `content_reports` ya tenía `content_reports_unique_message`, un índice único
-- parcial sobre `(reporter_id, message_id) where message_id is not null`. Cubría
-- el caso de denunciar el MISMO mensaje dos veces, pero dejaba fuera el de
-- denunciar a la misma PERSONA desde su ficha, que va sin `message_id`. Ahí el
-- `on conflict do nothing` de `submit_report` no tenía con qué chocar y cada
-- toque escribía una fila nueva.
--
-- Encontrado el 2026-08-28 recorriendo §8.b: dos denuncias idénticas separadas
-- por 65 segundos, del mismo denunciante contra la misma persona.
--
-- POR QUÉ IMPORTA, aunque suene menor: la cola de moderación se revisa a mano y
-- se prometen 24 horas en los términos §5.1. Una persona molesta tocando el
-- botón cinco veces multiplica por cinco el trabajo de revisar el mismo hecho, y
-- lo hace justo cuando hay que ser rápido. El límite es por denunciante, así que
-- no impide que **varias** personas denuncien a la misma —que es la señal que sí
-- interesa contar.

-- Los duplicados que ya existen tienen que irse antes: un índice único no se
-- puede crear sobre datos que lo violan. Se conserva el más ANTIGUO, que es el
-- que lleva el motivo elegido con intención; los siguientes son el mismo hecho.
delete from public.content_reports r
where r.message_id is null
  and exists (
    select 1 from public.content_reports otra
    where otra.message_id is null
      and otra.reporter_id = r.reporter_id
      and otra.reported_user_id = r.reported_user_id
      and otra.created_at < r.created_at
  );

create unique index if not exists content_reports_unique_person
  on public.content_reports (reporter_id, reported_user_id)
  where message_id is null;
