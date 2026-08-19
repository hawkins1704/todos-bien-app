# App de seguridad familiar ante sismos — Especificación de producto (v1 / MVP)

## 1. Concepto

App móvil (React Native / Expo, iOS + Android) que permite a una persona mantener un
círculo de familiares/amigos y, ante un sismo, reportar su estado, ver el estado y
última ubicación de su círculo, y comunicarse por chat sin depender de canales
saturados (llamadas, WhatsApp). Incluye preparación previa (plan de acción, perfil) y
un modo simulacro para practicar antes de que ocurra un evento real.

Público inicial: Perú. Arquitectura pensada para poder extenderse a otros países sin
rediseño (fuente de datos sísmicos ya es global, ver sección 6).

## 2. Modelo de conexiones ("salas")

- Las conexiones son **bidireccionales por par, no transitivas**.
- Si A agrega a B, se crea el vínculo A↔B. Esto hace que A aparezca automáticamente en
  la sala/círculo de B, pero no implica que los demás contactos de A (ej. C, D)
  aparezcan en la sala de B. Cada usuario arma su propio círculo de forma independiente.
- Modelo de datos: una tabla de conexiones par a par (`user_id_a`, `user_id_b`,
  estado de la conexión: pendiente/aceptada), no una jerarquía de "familia" o "grupo".

## 3. Modelo de invitación y aceptación de contactos

**Modelo de aceptación: tipo Facebook, no tipo Instagram.** A manda solicitud a B, B
acepta, y con esa única aceptación se crea la conexión bidireccional completa de forma
inmediata (A ve a B y B ve a A). No se requiere una segunda solicitud en sentido
contrario — no aplica el modelo de "seguir" asimétrico de Instagram, porque en esta app
no existe un caso de uso donde alguien quiera ver a otro sin que ese otro también quiera
verlo a él.

**Detectar contactos que ya tienen la app** (usar en onboarding y también desde la
pantalla principal, mismo flujo en ambos casos):
1. Se solicita permiso para leer la lista de contactos del teléfono (`expo-contacts`),
   con contexto explicado antes del popup nativo.
2. Cada número se normaliza (formato E.164) y se convierte a hash (SHA-256)
   **en el dispositivo**, antes de salir del teléfono — nunca se sube la agenda en
   texto plano.
3. Una Supabase Edge Function compara esos hashes contra los hashes de números ya
   registrados y devuelve solo los matches.
4. El usuario elige a quién mandar solicitud de conexión entre los matches encontrados.

**Invitar a alguien que no tiene la app todavía:**
- Se genera una conexión "pendiente" en la base de datos, vinculada al número/correo
  de esa persona, que se activa automáticamente en cuanto se registre con ese mismo
  número.
- Se puede compartir un link de invitación por el selector nativo de compartir de
  Expo (Share API) — la persona elige mandarlo por WhatsApp, SMS, correo, etc., usando
  su propia app instalada.
- El link lleva a una **landing page propia** (fuera de la app) con botones de
  descarga a App Store/Play Store y un código de invitación corto visible en la URL.
- Al abrir la app por primera vez, se pregunta "¿tienes un código de invitación?",
  intentando auto-detectar el código leyendo el portapapeles para evitar que la
  persona lo escriba a mano.
- No usar Firebase Dynamic Links (el servicio fue cerrado por Google en agosto de
  2025 y ya no funciona). No se justifica todavía un SDK de deep linking de pago
  (Branch, AppsFlyer) para el volumen inicial — evaluar como fase futura si se
  necesita atribución de campañas más sofisticada.

## 4. Estados de usuario

4 estados posibles, mostrados como borde de color en el dashboard:

| Estado | Color | Cuándo se asigna |
|---|---|---|
| Sin confirmar | Gris | Default tras una alerta sísmica, hasta que el usuario actualice |
| En casa y todos bien | Verde | Selección manual del usuario |
| Necesito ayuda | Rojo | Selección manual del usuario |
| Ayudando a otros | Amarillo | Selección manual del usuario |

Al tocar el ícono de un contacto se muestra: última ubicación registrada al momento
del sismo (o ubicación actualizada si el usuario la refrescó), mensaje personalizado
si lo escribió, y acceso directo al chat con esa persona.

Cada estado debe representarse con color **y** con un ícono distintivo propio (no
depender solo del color, por accesibilidad ante daltonismo rojo-verde).

## 5. Pantalla principal (Home)

### 5.1 Con alerta sísmica activa
- Banner superior con magnitud, ciudad/zona y tiempo transcurrido desde el sismo.
- Selector rápido del propio estado ("Mi estado"), con los 3 estados manuales.
- Grilla del círculo de contactos, cada uno como avatar circular con anillo de color
  según su estado (estilo "historias" de Instagram), y contador de "X/Y confirmados".
- Banner de tip del día.
- Chip/indicador de estado de conexión (ver sección 16.1), visible también en este
  estado.

### 5.2 Sin alerta activa (la mayoría del tiempo)
No repetir la lógica de "confirmar estado" cuando no hay nada que confirmar. En su
lugar:
- Barra de estado tranquila en vez de banner de alerta: p. ej. "Sin alertas activas ·
  Última verificada hace X días" — genera confianza de que la app sigue monitoreando.
- Sección "Estado de preparación" tipo checklist (no gamificación con puntos/rachas/
  insignias — el público es adulto y preventivo, y ese lenguaje de juego no encaja):
  p. ej. "Plan de acción: actualizado ✓ · Círculo: 6 personas ✓ · Simulacros
  completados: 1 de 3", usando los mismos íconos ya establecidos para los estados.
- Recordatorio puntual y discreto (no insistente) si el plan de acción lleva mucho
  tiempo sin revisarse, o si nunca se hizo un simulacro.
- Contenido de tips diarios con más espacio/desarrollo que en modo alerta (mini
  artículo o infografía corta, no solo una línea), aprovechando que no hay banner de
  alerta ocupando la pantalla.
- El círculo de contactos se mantiene visible en modo neutral, como referencia rápida
  (último plan, última ubicación conocida), sin urgencia de "confirmar" nada.
- Chip/indicador de estado de conexión (ver sección 16.1).

## 6. Fuente y disparo de alertas sísmicas

**Fuentes de datos** (consultar ambas, disparar si cualquiera reporta el evento):
- IGP Perú — servicio ArcGIS `Sismos Reportados`
  (`ide.igp.gob.pe/arcgis/rest/services/monitoreocensis/SismosReportados/MapServer/0`),
  soporta consultas JSON/GeoJSON. No es una API pública documentada oficialmente para
  terceros — implementar con manejo de errores robusto y sin exceder frecuencia de
  consulta razonable.
- USGS Earthquake API (feed GeoJSON) — fuente global, pública, bien documentada y
  estable. Sirve como respaldo cruzado para Perú y como fuente única para las alertas
  internacionales de la versión premium.

**Regla de disparo por defecto** (dos condiciones independientes, se dispara si se
cumple cualquiera de las dos — editable por el usuario en ajustes):
1. Magnitud ≥ 4.5 dentro de un radio de 150 km de la última ubicación del usuario.
2. Magnitud ≥ 6.0 en cualquier punto del Perú, sin importar el radio (cubre sismos
   grandes sentidos lejos del epicentro).

Mostrar en la notificación, cuando esté disponible, el campo de intensidad (escala de
Mercalli) que reporta el IGP para dar contexto adicional además de la magnitud.

**Mitigación de carga en el momento del disparo**: aplicar un jitter aleatorio (pocos
segundos) al disparo de escritura del estado por usuario para evitar que 200k+
usuarios escriban en el mismo instante exacto.

## 7. Notificaciones push

**Únicamente estos casos generan notificación** (no se notifica por "sismo ocurrió" en
sí ni por cambios a estado "todos bien"):

- Un contacto marcó "necesito ayuda".
- Un contacto envió un mensaje de chat.
- Un contacto aceptó tu solicitud de conexión (prioridad baja).
- Un contacto no ha actualizado su estado X minutos después de una alerta sísmica
  relevante (prioridad baja/informativa).

Todas activadas por defecto al aceptar permisos de notificaciones. Debe existir una
vista de ajustes donde el usuario pueda activar/desactivar cada tipo de forma
independiente.

Además, ajustable en onboarding/ajustes: radio (km) y magnitud mínima para considerar
un sismo "en tu zona" (ver defaults en sección 6).

## 8. Plan de acción

- Campo de texto libre (ej. "ir al parque de la vuelta de mi casa") en v1.
- Se muestra junto con la última ubicación registrada del contacto al tocar su ícono.
- Fase futura (no en MVP): punto de encuentro marcable en mapa, plan alterno, contacto
  de referencia fuera de la zona.

**Nota técnica sobre ubicación**: obtener las coordenadas GPS del teléfono (para
"última ubicación registrada") se hace directamente con `expo-location`, sin ningún
API externo ni costo. En el MVP, no renderizar un mapa embebido para esto — mostrar
las coordenadas o un botón "Abrir en Google Maps" (deep link a la app de mapas del
teléfono, sin API key). Un SDK de mapas (`react-native-maps`, que en Android requiere
API key de Google Maps con tier gratuito amplio) solo es necesario para la función
premium de plan de acción con punto de encuentro marcado en mapa — no antes.

## 9. Modo simulacro

- Permite practicar el flujo completo (alerta → actualizar estado → ver dashboard) sin
  que ocurra un sismo real.
- Todo el UI durante el simulacro debe llevar marca visual persistente e inequívoca
  (banner/ícono/texto "SIMULACRO") en cada pantalla relevante.
- Las notificaciones push durante un simulacro deben decir explícitamente que es un
  simulacro (ej. "Simulacro — Juan está practicando"), nunca el mismo texto que una
  alerta real.
- Preguntar antes de notificar a los contactos si el usuario quiere modo silencioso
  (practicar solo, sin generar ruido a otros) o notificar a su círculo.
- Sirve también como entorno de QA interno para probar el flujo completo sin depender
  de un sismo real.

## 10. Onboarding

Dos partes:
1. Explicación de valor (pantallas cortas): qué hace la app, cómo se ve el dashboard
   durante un sismo (puede incluir una vista previa estática del modo simulacro).
2. Setup guiado obligatorio: solicitar permisos de ubicación, notificaciones, y
   contactos (ver sección 3) con contexto explicado antes del popup del sistema
   operativo; agregar al menos un contacto (vía match de contactos o invitación por
   link, mismo flujo descrito en la sección 3); escribir un plan de acción básico;
   terminar invitando a probar el primer simulacro guiado.

Decisión pendiente de definir en implementación: si la ubicación se captura solo con
la app en primer plano o si se requiere ubicación en background (impacta el flujo de
permisos y la revisión de las tiendas de apps).

## 11. Tips diarios

- Sección tipo banner/slider con tips de qué hacer en caso de sismo.
- Contenido parafraseado (no copiado textualmente) de fuentes oficiales: IGP, INDECI,
  Cruz Roja Peruana. Incluir el enlace a la fuente original en cada tip.
- Rotar los tips y evitar repetir el mismo tip de forma consecutiva.
- Disponible tanto en free como en premium, sin diferenciación.
- En la pantalla principal sin alerta activa, se les da más espacio/desarrollo (ver
  sección 5.2).

## 12. División free / premium

### Free (núcleo de seguridad — sin límites)
- Perfil y onboarding completos.
- Círculo de contactos ilimitado.
- Plan de acción (texto libre).
- Los 4 estados y dashboard con colores.
- Última ubicación registrada al momento del sismo.
- Alertas automáticas de sismo en tu zona (según radio/magnitud configurados).
- Notificaciones (según reglas de la sección 7).
- Chat individual y grupal.
- 3 simulacros guiados.
- Tips diarios con fuente.

### Premium
- Alertas de sismos en otras ciudades del Perú y, si es técnicamente viable, de otras
  partes del mundo (misma fuente USGS, sin filtro geográfico).
- Simulacros ilimitados.
- Múltiples planes de acción con punto de encuentro marcado en mapa (casa, trabajo,
  colegio).

### Explícitamente fuera de alcance del MVP (documentado para fase futura)
- Respaldo por SMS (buen valor potencial, pero implica sumar un proveedor de SMS y
  costo variable por mensaje — no justificado aún sin usuarios reales).
- Historial extendido de ubicaciones/simulacros pasados.
- Exportar reporte de preparación familiar en PDF.
- Tier B2B para organizaciones (colegios, empresas, condominios) — evaluar solo si
  surgen conversaciones comerciales concretas.

## 13. Planes familiares

Pensados para dos perfiles de comprador: padres que quieren monitorear hijos en
colegio/universidad, y adultos que quieren monitorear a sus padres mayores. El dueño
del plan es quien paga y administra los cupos; los demás miembros solo usan la app.

**Modelo de datos**: tabla `family_plans` (dueño, tipo de plan, cupos totales, cupos
usados) y `family_plan_members` (plan, usuario, fecha de ingreso) — un usuario ocupa
un cupo de un plan a la vez.

**Flujo de asignación de cupos**:
- Si el miembro ya está conectado en el círculo del dueño del plan (caso típico:
  hijo configurando el teléfono de sus padres en persona), se asigna el cupo
  directamente desde la app del dueño, sin código ni pasos adicionales para el padre/
  madre.
- Si el miembro no está conectado todavía, se usa el mismo mecanismo de invitación
  por link/código de la sección 3 — al aceptar la invitación, entra con el cupo
  premium ya asignado.

**Precios propuestos** (manteniendo la misma proporción mensual→lifetime que el plan
individual: el lifetime equivale a ~6 meses de mensual):

| Plan | Mensual | Por persona/mes | De por vida | Por persona (lifetime) |
|---|---|---|---|---|
| Individual (1) | S/5 | S/5 | S/29 | S/29 |
| Familiar 4 (tú + 3) | S/12 | S/3 | S/69 | S/17.25 |
| Familiar 6 (tú + 5) | S/15 | S/2.50 | S/89 | S/14.83 |

El costo por persona baja mientras más grande el plan (misma lógica que Spotify
Family), empujando naturalmente hacia el plan de 6 frente al de 4.

## 14. Monetización

- Sin límite de contactos en ningún tier (ver razón en sección 12 — un muro de pago
  sobre el círculo de seguridad va contra el propósito de la app).
- Momento del paywall: no inmediatamente tras el onboarding ni tras un trial de 7 días.
  Mostrar la oferta premium justo después de que el usuario complete su primer
  simulacro exitoso — es el punto de mayor percepción de valor real.
- Donaciones: no implementar en el lanzamiento inicial junto con la suscripción (genera
  canibalización y confusión de modelo). Evaluar como adición posterior una vez exista
  comunidad de usuarios establecida.

## 15. Suscripciones: RevenueCat

- Se usará **RevenueCat** para manejar las suscripciones de Apple y Android (compra,
  validación de recibos, estado de entitlements).
- RevenueCat no soporta de forma nativa un sistema de "cupos" cross-platform como el
  de la sección 13 (su función de Apple Family Sharing es solo iOS y comparte con el
  grupo familiar de Apple ID, no con cuentas elegidas a mano de la app). El sistema de
  cupos se construye por encima de RevenueCat:
  1. El dueño del plan compra el producto (Familiar 4 / Familiar 6, mensual o
     lifetime) como una compra individual normal — esto sí lo maneja RevenueCat.
  2. Supabase mantiene la tabla de cupos/miembros (sección 13).
  3. Al asignar un cupo, el backend llama a la API de RevenueCat para otorgar una
     entitlement promocional al App User ID del miembro (sin que esa persona compre
     nada).
  4. Al quitar a alguien de un plan, el backend revoca esa entitlement por API.
  5. Si el dueño cancela su suscripción, el webhook de RevenueCat debe disparar la
     revocación en cascada de todos los cupos dependientes.
- Se necesitarán productos separados en App Store Connect y Google Play Console por
  cada combinación de plan × modalidad (Individual/Familiar 4/Familiar 6 ×
  mensual/lifetime), todos mapeados a la misma entitlement ("premium") en RevenueCat.

## 16. Stack técnico y consideraciones de estabilidad

### 16.1 Arquitectura offline-first (caché local + sincronización)

- Toda la información del círculo (contactos, último estado y ubicación reportados,
  plan de acción) se guarda en una base de datos local en el dispositivo (SQLite vía
  `expo-sqlite`, o almacenamiento clave-valor liviano como MMKV/AsyncStorage para
  datos simples) cada vez que se sincroniza exitosamente con el servidor.
- **Ver información del círculo nunca depende de una llamada de red en el momento**:
  la pantalla siempre lee primero de la caché local; si hay conexión, se refresca en
  segundo plano.
- Al recibir la notificación push de una alerta sísmica (las push suelen llegar aun
  con conectividad degradada, por su bajo peso), la app debe intentar de inmediato un
  refresco rápido del estado de todo el círculo, para que la caché quede lo más
  actualizada posible justo antes de que la red empeore.
- **Actualizar el propio estado sin conexión** se guarda localmente en una cola de
  pendientes ("outbox") y se sincroniza automáticamente en cuanto se detecte
  cualquier conectividad (incluso parcial o intermitente), sin acción adicional del
  usuario.
- **Indicador de estado de conexión**: un chip visible en la pantalla principal (en
  ambos estados, con y sin alerta) que muestre claramente "Con conexión" o
  "Sin conexión · mostrando datos guardados", para que el usuario sepa si lo que ve
  es información en vivo o la última copia disponible localmente.

### 16.2 Cliente, backend y carga

- Cliente: React Native + Expo (iOS y Android).
- Backend: Supabase (Postgres + Auth + Realtime + Edge Functions).
- Conexión a base de datos siempre vía pooler en modo transacción (Supavisor, puerto
  6543), nunca conexión directa, para soportar picos de escritura masivos y
  concurrentes.
- Evaluar no depender de canales Realtime para el pico de lectura post-sismo (fan-out
  masivo); considerar polling con caché corto o refresco manual como alternativa más
  predecible bajo carga extrema.
- Plan de pruebas de carga con k6 o Artillery, simulando el patrón real en dos fases:
  ráfaga de escrituras (actualización de estado/ubicación) seguida de ráfaga de
  lecturas (apertura del dashboard por parte de los contactos).
- Monitoreo en producción: métricas de Supabase + Sentry para errores de cliente.

## 17. Diseño y mockups: Figma Make

- Se usará Figma Make para generar algunos mockups de referencia visual de las
  pantallas principales (ver prompt de diseño ya elaborado por separado).
- Esos mockups son **solo referencia visual** (colores, layout, componentes) — la
  base funcional y de producto para la construcción debe ser este documento, no los
  mockups. Ante cualquier discrepancia entre un mockup y lo especificado aquí, este
  documento tiene prioridad.

## 18. Legal (pendiente de revisión con abogado)

- Términos de servicio con cláusula de limitación de responsabilidad ("la app se
  ofrece 'tal cual', sin garantía de disponibilidad continua; no reemplaza los canales
  oficiales de emergencia: bomberos, PNP, INDECI").
- Cuidar el lenguaje de marketing y dentro de la app para no prometer ni insinuar que
  la app "garantiza" la seguridad o localización de alguien.

## 19. Marketing (referencia, no parte del alcance técnico)

- Contenido "build in public" del proceso de creación en TikTok/Instagram.
- Aprovechar fechas de simulacros nacionales multipeligro como ventana de atención.
- ASO con términos de búsqueda relevantes en español peruano.
- El loop de crecimiento principal es el propio producto: cada usuario necesita que
  sus contactos también instalen la app para que el círculo funcione.

## 20. Notas operativas para Claude Code

- **No crear el proyecto Expo desde cero.** El proyecto ya lo crea el usuario con los
  comandos estándar de Expo, pero sin ninguna configuración ni limpieza inicial —
  Claude Code debe encargarse de la configuración inicial y limpieza del proyecto
  (estructura de carpetas, dependencias base, configuración de Supabase, etc.) sobre
  el proyecto ya creado, no generar uno nuevo.
- **Guía paso a paso requerida más adelante** para: integración de notificaciones push,
  integración de suscripciones con RevenueCat, y creación de productos tanto en App
  Store Connect como en Google Play Console. Cuando se llegue a esa etapa del
  desarrollo, Claude Code debe guiar al usuario explícitamente en cada paso, ya que
  no tiene experiencia previa configurando estos servicios.
- Los mockups de Figma Make (sección 17) son solo referencia visual — la
  implementación funcional debe basarse en este documento.
