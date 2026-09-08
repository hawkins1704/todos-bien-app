-- 0046 · Marcar en la base lo que la base ya no lee.
--
-- **Esta migración no cambia comportamiento. Solo escribe comentarios.** No hay
-- un `create`, un `alter` ni un `grant` en todo el archivo: `comment on` no
-- afecta a ningún plan de ejecución. Se puede aplicar con la app en producción y
-- con un build en revisión sin ningún riesgo.
--
-- ## Qué problema resuelve, que es de confusión y no de código
--
-- El 2026-09-08, auditando qué notificaciones agrega Premium, dos artefactos de
-- la base afirmaron algo que la base **no hace**:
--
--   1. El comentario de `user_settings.alert_worldwide_enabled` decía
--      «Alertas de sismos fuera del país (spec §12: premium)». Suena a que esa
--      columna gobierna el aviso mundial. **No gobierna nada**: ninguna función
--      la lee.
--   2. La firma de `private.quake_applies` recibe `p_is_premium` y
--      `p_worldwide_enabled`. Quien la lea va a concluir que **Premium cambia
--      qué sismos te alertan** — que es exactamente lo que la app promete que
--      NO pasa (`docs/QUE-PROMETE-LA-APP.md` §7).
--
-- Las dos cosas juntas hicieron que en la misma sesión se concluyera mal dos
-- veces sobre el corte de Premium. El comentario es el sitio correcto donde
-- arreglarlo: quien se confunda va a inspeccionar la tabla, no a leer `docs/`.
--
-- ## Dónde vive DE VERDAD el corte del aviso mundial
--
-- En dos llaves en serie, y ninguna es esta columna:
--
--   · `is_premium`, exigido dentro de `private.notify_quake_news` en la rama
--     que encola `quake_worldwide` (M >= 6,0 y país distinto al del usuario);
--   · `notification_preferences.quake_worldwide`, el interruptor «Sismos en el
--     mundo» de Ajustes, que aplica `private.enqueue_notifications`.
--
-- Las dos existen, las dos funcionan y **el aviso mundial sí es de Premium**.
--
-- ## Por qué se comenta en vez de limpiarse
--
-- Sacar los dos parámetros muertos obliga a recrear `quake_applies` y a
-- reescribir a sus **dos** llamadores: `private.fan_out_quake` (el reparto de
-- alertas) y `public.get_active_alert`. Son las dos funciones más críticas del
-- proyecto, y el cambio no le da nada a ningún usuario. Se hace después de
-- publicar en las dos tiendas, con tiempo para volver a probar el reparto.
-- Anotado como deuda **1.17** en `docs/QUE-FALTA.md`.

-- ---------------------------------------------------------------------------
-- 1 · La columna huérfana
-- ---------------------------------------------------------------------------

comment on column public.user_settings.alert_worldwide_enabled is
  'HUÉRFANA desde alguna reescritura posterior a la 0008 — NO la lee ninguna función. '
  'Se usaba para decidir la alerta mundial; hoy viaja hasta private.quake_applies como '
  'p_worldwide_enabled y esa función la ignora. El aviso mundial NO depende de acá: lo '
  'gobiernan is_premium dentro de private.notify_quake_news y el interruptor '
  'notification_preferences.quake_worldwide. Sigue con el UPDATE revocado a authenticated '
  '(0009). No construir nada sobre esta columna; ver deuda 1.17 de docs/QUE-FALTA.md.';

-- ---------------------------------------------------------------------------
-- 2 · Los dos parámetros que la función recibe y no mira
-- ---------------------------------------------------------------------------
--
-- La firma se deja intacta a propósito (ver la cabecera). Lo que se agrega es el
-- cartel para que nadie deduzca el corte de Premium leyéndola.

comment on function private.quake_applies(
  boolean, boolean, text, integer, numeric, numeric,
  double precision, double precision, numeric, text,
  double precision, double precision
) is
  '¿A esta persona le corresponde la ALERTA de este sismo? Solo dos condiciones, en OR: '
  'mismo país y magnitud >= su umbral nacional, o dentro de su radio y magnitud >= su mínima. '
  '⚠️ p_is_premium y p_worldwide_enabled SE RECIBEN Y NO SE USAN. Que el primero se ignore es '
  'CORRECTO y deliberado: la alerta de sismo es idéntica en gratis y en Premium, que es la '
  'promesa central de la app (docs/QUE-PROMETE-LA-APP.md §7). El segundo quedó muerto tras la '
  '0008. NO deducir de esta firma que Premium cambia qué sismos alertan — no los cambia. '
  'Lo que Premium agrega son avisos SOBRE OTRO (Guardián) y la noticia mundial; ver '
  'docs/MONETIZACION.md §3. Deuda 1.17 de docs/QUE-FALTA.md: sacar los dos parámetros después '
  'de publicar, junto con sus dos llamadores.';
