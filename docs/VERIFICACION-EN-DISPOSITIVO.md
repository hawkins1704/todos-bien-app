# Recorrido de verificación en un iPhone real

Escrito el **2026-08-24**. Se corre entero **una vez** antes del envío a revisión, y después
solo las secciones que toque cada cambio.

**Por qué existe.** El estado del proyecto acumuló cuatro deudas distintas que dicen lo
mismo: *«typecheck, lint y bundle en verde, sin verificar en pantalla»*. No son cuatro
problemas, es una sola tarea escrita cuatro veces, y cada una se volvió a anotar porque no
había dónde tacharla. Acá está el dónde.

**Qué no sirve para esto:**

- **El simulador.** El GPS es una posición fija inventada, no entrega tokens de APNs
  (`Device.isDevice` es `false`) y no ejecuta compras. Todo lo importante de esta app es
  justamente eso.
- **`expo start` / dev client para las tareas de fondo.** Necesitan Metro, y las tareas de
  fondo ahí son poco fiables de por sí (ESTADO, bitácora del 2026-08-21).

**Qué sí:** un build de TestFlight o `--profile preview` instalado en un iPhone físico.

---

## 0 · Montar el banco de pruebas

Casi todo lo de abajo necesita **dos teléfonos con dos cuentas conectadas**. Conviene dejar
una en cada plan y no ir cambiando: la mitad de los errores de este tipo aparecen al comparar
las dos pantallas lado a lado, no al mirar una sola.

**Cambiar de plan a mano:**

```sql
-- A Premium. Los DOS campos, siempre: el webhook de RevenueCat escribe los dos
-- juntos (revenuecat-webhook/index.ts), y tocar solo `is_premium` deja un
-- estado que en producción no existe — se prueba algo que nadie va a vivir.
update public.user_settings
   set is_premium = true, alert_worldwide_enabled = true
 where user_id = '<ID>';

-- De vuelta a gratis
update public.user_settings
   set is_premium = false, alert_worldwide_enabled = false
 where user_id = '<ID>';
```

> ⚠️ **Esto NO prueba la compra.** Saltea el paywall, la tienda y el webhook. Sirve para
> probar **qué hace la app según el plan**; que el plan se *active al pagar* es §8 y necesita
> sandbox de verdad.

**Sismo de prueba sin lastimar a nadie.** Un sismo sembrado se reparte **solo, al insertarlo**
(el disparador `quake_ingested_fan_out`), así que apunta a todos los que califiquen —
usuarios reales incluidos. Las tres reglas para que no se escape:

1. **Epicentro lejos de tus usuarios reales.** Si están en Lima, sembralo en Arequipa.
2. **Magnitud por debajo de 6,0.** En 6,0 se activan la regla nacional *y* la noticia mundial
   de Premium, y ahí ya no controlás a quién le llega.
3. **`country_code` en NULL**, que apaga la regla nacional del todo.

```sql
insert into public.quake_events
  (source, source_event_id, magnitude, latitude, longitude, place, country_code, occurred_at)
values ('igp', 'prueba-1', 5.5, -16.40, -71.54, 'Arequipa', null, now())
returning id;
```

> **Y si vas a sembrar varios:** separalos **más de 2 minutos** en `occurred_at` o más de
> 250 km. Si no, el deduplicador los fusiona en un solo evento y los sismos 2 en adelante no
> reparten nada — parece que la app está rota y lo que está mal es la prueba. `now()` dentro
> de un mismo bloque devuelve siempre la misma hora, así que hay que restar a mano:
> `now() - interval '30 minutes'`.

> 🔴 **No falsees coordenadas de un teléfono encendido: la app te las pisa.** Aprendido a los
> golpes el 2026-08-27. Se le puso a la cuenta B una posición en Arequipa, se sembró el sismo
> ahí, y a **un segundo** de recibir el push su app despertó, capturó su ubicación real (Lima)
> y sobrescribió la falsa. A partir de ahí `get_active_alert` hacía la cuenta correcta —sismo
> a 756 km, radio 150— y la Home decía «sin alertas activas». Parecía un bug de la app y era
> la **captura automática del §7.2 funcionando**.
>
> **La forma que sí funciona con dos teléfonos en la misma ciudad:** no tocar ninguna
> ubicación y **subirle el radio a la cuenta B** a 300 km —opción real del menú—, sembrando el
> sismo a ~265 km. Alcanza a B y a nadie más, las posiciones son verdaderas y la app de B
> muestra la alerta de verdad, que es lo que hace falta para probar el cierre (7b.5).

> 🔴 **Blindar a los usuarios reales por umbral de magnitud NO alcanza. Aprendido el
> 2026-08-28 mandándole una alerta falsa a dos personas de verdad.**
>
> Se les subió `alert_min_magnitude` y `alert_countrywide_magnitude` a dos usuarios ajenos a
> la prueba, y quedaron efectivamente fuera de todos los sismos sembrados. Después, al
> reportar «necesito ayuda» desde una cuenta de prueba, **les llegó igual**: `contact_needs_help`
> sale al **red entera sin mirar radio, magnitud ni plan** — es la señal que la app promete
> no cobrar nunca, y por eso no pasa por ninguno de esos filtros. Los umbrales protegen del
> **sismo**; no protegen de nada de lo que pase después.
>
> **El blindaje que sirve son las preferencias**, y hay que ponerlo antes del primer sismo:
>
> ```sql
> -- Guardá los valores originales ANTES. Nacen todos en `true`.
> update public.notification_preferences
>    set contact_needs_help = false, contact_not_responding = false, contact_message = false,
>        guardian_alerts = false, quake_national = false, quake_worldwide = false,
>        contact_reported = false
>  where user_id in ('<ajeno-1>', '<ajeno-2>');
> ```
>
> Y una trampa de segundo orden: si durante la sesión se aplica una migración que **agrega una
> columna de preferencia**, esa nace en `true` y abre un agujero nuevo en un blindaje que ya
> creías puesto. Pasó el mismo día con `contact_reported` (migración 0027).

**Verificar a quién le llegó, antes de mirar el teléfono:**

```sql
select p.display_name, nd.kind, nd.title, nd.body
from public.notification_deliveries nd
join public.profiles p on p.id = nd.user_id
where nd.created_at > now() - interval '10 minutes'
order by nd.created_at desc;
```

---

## 1 · Acceso (5 pantallas nuevas desde el 2026-08-20, nunca recorridas a mano)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 1.1 | Crear cuenta con un correo nuevo | Llega el código de 8 dígitos y la cuenta queda creada |
| 1.2 | Crear cuenta con un correo **que ya tiene cuenta** | Mensaje claro, no un «listo» falso. Es el tercer resultado que Supabase no delata (ESTADO §1.1.1) |
| 1.3 | Cerrar sesión y entrar | Entra |
| 1.4 | Entrar con contraseña incorrecta | Error entendible, traducido por `code` |
| 1.5 | **Recuperar contraseña** | 🔴 Llega un **código**, no un link. Si llega un link, la plantilla *Reset Password* quedó con el `{{ .ConfirmationURL }}` de fábrica y la recuperación está rota sin dar error (`GUIA-CORREO-RESEND.md`) |
| 1.6 | Poner la contraseña nueva y entrar con ella | Entra, y la vieja ya no sirve |
| 1.7 | Cambiar la contraseña desde Mi cuenta | Pide la actual; con una incorrecta rechaza |

---

## 2 · Ubicación — el callejón sin salida (ESTADO §1.6.3.1)

El más importante de la lista: es el que dejó a un usuario real sin alerta en un sismo real.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 2.1 | Onboarding **negando** la ubicación | La Home muestra el recordatorio y Ajustes dice qué se pierde |
| 2.2 | Conceder el permiso desde los Ajustes del sistema y volver a la app | El estado se relee **solo**, sin reinstalar |
| 2.3 | Confirmar en la base | `select latitude, longitude from public.user_status where user_id = '<ID>'` deja de ser NULL |
| 2.4 | Los dos avisos | Desaparecen de la Home y de Ajustes |
| 2.5 | Con el permiso ya en «Siempre» | Ajustes muestra los tres permisos en verde |

> El punto que hay que tener presente al leer: **conceder el permiso no guarda ninguna
> coordenada.** La advertencia se dispara por falta de posición, no por falta de permiso. Es
> el error conceptual que generó el hueco original.

---

## 3 · Textos de permiso (nuevos el 2026-08-24)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 3.1 | Borrar la app, instalar y llegar a la pantalla de permisos | El diálogo del sistema dice «**una vez ahora, al dar el permiso**, y después solo cuando hay un sismo…» |
| 3.2 | Comparar con la pantalla de la app | Dicen lo mismo. Si no, uno de los dos miente y el que se declara en el Nutrition Label es el del sistema |

Se verifica sobre un build **posterior** al cambio: esos textos viajan en el `Info.plist`.

---

## 4 · Contactos y red (cambió el 2026-08-24 al quitar los códigos de invitación)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 4.1 | Revisar la agenda con una agenda **real**, de cientos de contactos | Encuentra coincidencias. Con 5 contactos de simulador esto no prueba nada: el bug de los lotes sobrevivió justamente por eso (ESTADO §1.6.6) |
| 4.2 | «Compartir Todos Bien» | Abre la hoja de compartir con un mensaje **sin código** y con `https://todosbien.app` |
| 4.3 | Enviar solicitud y aceptarla desde el otro teléfono | Quedan conectados, y le llega el aviso a quien la recibió |
| 4.4 | Negar el permiso de contactos | La tarjeta explica que igual pueden encontrarte a ti |
| 4.5 | Buscar la pantalla vieja de invitación | **No existe.** Ninguna ruta lleva a ella |

---

## 5 · Mapas (módulo nativo nuevo, nunca visto en pantalla)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 5.1 | Detalle de un sismo | El mini mapa dibuja, con encuadre de ~300 km |
| 5.2 | Detalle de un contacto con ubicación | Encuadre de ~3 km, el pin donde debe |
| 5.3 | Tocar el mapa | Abre **Apple Maps** con la etiqueta correcta, no una búsqueda ni el navegador |
| 5.4 | Cambiar el tema del sistema a oscuro | El mapa cambia también (`userInterfaceStyle`) |
| 5.5 | Desplazar la pantalla con el dedo sobre el mapa | La pantalla se desplaza; el mapa no se arrastra |

---

## 6 · «Mi ubicación» en modo alerta (ESTADO §1.2.3)

Necesita una alerta activa. Si no hay sismo, sirve un simulacro.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 6.1 | Con la alerta activa, mirar la Home | La red entra **completo** sin desplazar. La tarjeta de ubicación asoma **debajo** |
| 6.2 | Caminar unos metros y tocar «Actualizar mi ubicación» | El pin se mueve y `user_status` queda con las coordenadas nuevas |
| 6.3 | Mirar el estado reportado | **No cambia.** Actualizar dónde estás no es decir cómo estás |
| 6.4 | Sin permiso concedido | Ofrece ir a Ajustes; no falla en silencio |
| 6.5 | Fuera de una alerta | La tarjeta **no se monta**. Un botón de refrescar posición fuera de una alerta sería el seguimiento que prometemos no hacer |

---

## 7 · Push y captura en segundo plano

La parte que sostiene la promesa central. Se prueba con un sismo sembrado dirigido a **una
sola cuenta** (así se hizo el 2026-08-21, ESTADO §3.8.1).

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 7.1 | Con la app en segundo plano, disparar el sismo de prueba | Llega el aviso visible |
| 7.2 | Sin tocar nada, esperar y mirar `user_status` | La ubicación se escribió sola. La firma que **solo** puede dejar la tarea de fondo es `status = 'unconfirmed'` sin jitter |
| 7.3 | Mirar `background_traces` | La cadena de migajas completa |
| 7.4 | **Con la app cerrada a mano** desde el multitarea | El aviso visible **llega igual**; la captura automática no ocurre. Es la limitación conocida, no un bug |
| 7.5 | Tocar el aviso | Se abre la app, captura la ubicación, y el sistema le devuelve el permiso de despertarse sola |
| 7.6 | Con la app **terminada por el sistema** | 🟡 No se puede forzar. Lo contesta el próximo sismo real leyendo las migajas (ESTADO §3.8.2) |

---

## 8 · Compras

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 8.1 | Con una cuenta de sandbox, abrir el paywall | Se ve la Offering, no un paywall vacío |
| 8.2 | Comprar | La pantalla pasa a Premium sola en segundos: es el webhook |
| 8.3 | Mirar el pie del paywall | 🔴 Están **Términos y Privacidad**. Sin eso el rechazo es casi automático |
| 8.4 | «Restaurar compras» | Recupera el derecho |
| 8.5 | Con Premium activo, la pestaña Global de Sismos | Se ve. Sin Premium, ofuscada con candado |

---

## 7.b · Guardián y país detectado (nuevo el 2026-08-25)

Guardián es lo único que sostiene el precio de Premium (`MONETIZACION.md` §3), así que si
algo de acá falla, no hay nada que vender.

**Necesita dos cuentas y un sismo sembrado.** El truco para no viajar a Madrid: sembrar el
sismo lejos de **tu** posición y cerca de la del contacto, editándole las coordenadas a mano.

> ✅ **7b.4 y 7b.5 verificados el 2026-08-27** con dos teléfonos (iPhone premium + Android
> gratis). Apertura enviada a los 0,7 s del insert; cierre enviado al reportar. La corrida
> destapó además los tres huecos de abajo, todos ya cerrados.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 7b.1 | Instalación nueva, conceder ubicación, y mirar `select country_code from user_settings where user_id = '<ID>'` | Dice el país **real**. Hasta el 2026-08-25 todos decían `PE` sin excepción, porque nadie lo escribía nunca |
| 7b.2 | Repetir con el teléfono en **modo avión** al conceder el permiso | Queda en `PE` y **no** se marca como resuelto: el geocodificador necesita red. Al volver la señal y refrescar la app, se corrige solo |
| 7b.3 | Ponerle `is_premium = true` a la cuenta A, y a la cuenta B una ubicación en Lima | — |
| 7b.4 | Sembrar un sismo M6,5 **a 20 km de B** y lejos de A | 🔴 A recibe **«Tembló cerca de \<B\>»** con la distancia en el cuerpo. Es la función entera |
| 7b.5 | Desde B, marcar «estoy bien» | 🔴 A recibe **«\<B\> está bien»**. Sin este, Guardián solo fabrica ansiedad |
| 7b.6 | Tocar el aviso de 7b.4 | Abre la ficha de B, con su ubicación |
| 7b.7 | Quitarle Premium a A y repetir 7b.4 | A **no** recibe nada |
| 7b.8 | Con A premium, pero con la ubicación de B **borrada** (`latitude = null`) | A **no** recibe nada. Es la regla de honestidad: sin coordenadas no se sabe si le tocó cerca |
| 7b.9 | Con B a 900 km del epicentro, sismo M6,5 en su país | A **no** recibe nada, aunque B sí reciba su alerta nacional. «Cerca» tiene que ser cierto |
| 7b.10 | Con **A también dentro del radio** del sismo | A recibe su alerta normal y **no** el aviso de Guardián: ya está en modo emergencia y su red muestra lo mismo |
| 7b.11 | Con 3 contactos de A en la zona | Un **solo** aviso: «Tembló cerca de 3 de tus contactos», y al tocarlo abre la red |
| 7b.12 | Correr el reparto del mismo sismo dos veces | No se duplica (`dedupe_key`) |
| 7b.13 | Ajustes → GUARDIÁN, apagar el interruptor y repetir | No llega ninguno de los dos avisos |
| 7b.14 | Con A y B **bloqueados** entre sí (0021) | No llega nada: `accepted_circle_of` deja fuera a los bloqueados |

---

## 7.c · Lo que destapó la corrida de Guardián (2026-08-27)

Tres huecos que solo aparecen con dos teléfonos y un sismo real de por medio. Los tres están
arreglados; esto es para que no vuelvan.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 7c.1 | Con alerta activa, mirar la red de la cuenta **que sí recibió** el sismo | 🔴 Un contacto al que la alerta **no** le llegó sale **apagado**, no «sin confirmar». Y el contador dice `confirmados/los-de-la-zona`, no sobre la red entera. Antes marcaba como callado a cualquiera que viviera en otra ciudad — el perfil exacto al que se le vende Guardián (migración 0025) |
| 7c.2 | Sin alerta propia, con un contacto dentro de un sismo vivo | 🔴 Ese contacto sale **con su aro de estado** en la Home. Antes llegaba el push de Guardián, abrías la app y no había nada distinto que mirar |
| 7c.3 | Que ese contacto marque «necesito ayuda» y **después** «estoy bien» | 🔴 Llegan **los dos** avisos, y el segundo dice «**ya está bien**». La clave de dedup era una por sismo, así que el alivio posterior a una alarma se descartaba en silencio: te avisaba 4 veces que necesitaba ayuda y 0 que ya estaba bien (migración 0026) |
| 7c.4 | Que cambie de «estoy bien» a «ayudando» | **No** llega nada. Es el mismo grupo: repetirlo a las 3 AM es el ruido que hace que se apaguen las notificaciones |
| 7c.5 | Abrir la ficha de un contacto y, desde el otro teléfono, cambiarle el estado | Tirar de la ficha hacia abajo la actualiza. Antes leía la caché **una sola vez al montar** y se quedaba congelada aunque la app sincronizara por detrás |
| 7c.6 | Abrir la ficha de alguien cuyo último reporte es de hace días | **No** muestra estado ni ubicación: dice que la última es de hace N y que solo se guarda durante un sismo. Una coordenada de hace tres días es lo contrario de lo que promete la app |

---

## 7.d · Lo que destapó la corrida del 2026-08-28

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 7d.1 | Con la app **abierta y a la vista**, disparar el sismo de prueba | 🔴 La pantalla se actualiza **sola** al llegar el aviso, sin tirar de la lista. Era el agujero: los cuatro disparadores de refresco —montar, recuperar red, volver al primer plano, pull— **ninguno ocurre si la persona ya está mirando la app**, que es exactamente lo que pasa en un sismo. Se veía como un bug del servidor: la Home decía «Nadie de tu red en la zona» con el dato correcto en la base |
| 7d.2 | Lo mismo, pero con un **reporte de estado** del otro teléfono | Igual: la red se mueve solo. El fallo era el mismo y más silencioso, porque nadie espera un push visible de eso |
| 7d.3 | Home con alerta activa y **un contacto en zona de tres** | El título dice «**Tu gente en la zona**» y la grilla muestra **solo a ese**, con el contador `N/1`. Los otros dos no están «faltando»: no tenían nada que reportar |
| 7d.4 | Home con alerta activa y **nadie** de la red en zona | Título «Tu red», la explicación de que a nadie le llegó, y **la red completa apagado**. Una tarjeta vacía en mitad de un sismo se lee como «no tengo a nadie» |
| 7d.5 | Pestaña Red **con** alerta activa | Selector triple arriba con los conteos: **En la zona · Fuera · Todos** |
| 7d.6 | Pestaña Red **sin** alerta activa | El selector **no está**. Fuera de una alerta no hay «zona» de la que hablar |
| 7d.7 | Filtrar por «En la zona» sin nadie adentro | Dice que a nadie le llegó la alerta, no una lista vacía |

---

## 8.c · El teclado en Android (nuevo el 2026-08-28)

Se corre **en Android**, en las nueve pantallas con campos de texto. En iOS nunca
falló y no cambió nada, pero conviene mirar el chat de todas formas: es la única
que usa `iosOffset`.

> **Por qué es una sección y no una línea.** El fallo no era de una pantalla: era
> del patrón que usaban las nueve. Con `edgeToEdgeEnabled=true` la ventana no se
> encoge y `KeyboardAvoidingView` no acierta. La corrección vive en
> `KeyboardAvoider` y se calcula con **el alto del teclado más el inset
> inferior**, los dos informados por el sistema. Si alguien alguna vez sustituye
> eso por una constante, esto vuelve — y vuelve solo en algunos teléfonos.

| # | Pantalla | Qué tiene que pasar |
|---|---|---|
| 8c.1 | **Iniciar sesión / registrarse** | 🔴 El campo y el botón quedan **por encima** del teclado. Es lo primero que ve un usuario nuevo de Android |
| 8c.2 | **Denunciar** | 🔴 Igual. Es el recorrido que mira App Review por la guía 1.2 |
| 8c.3 | Chat | El compositor queda pegado al teclado, sin franja muerta ni recorte |
| 8c.4 | Onboarding: perfil y plan de acción | Se puede escribir y llegar al botón |
| 8c.5 | Mi cuenta · cambiar contraseña · borrar cuenta · editar plan | Igual |
| 8c.6 | Cualquiera de ellas, con **navegación por gestos** en vez de tres botones | Igual de bien. El inset baja de ~47 a ~16 y la fórmula tiene que absorberlo sola |

---

## 8.d · Lo que el bloqueo tiene que impedir de verdad

Sale de un bug real encontrado el 2026-08-28: el bloqueo **posponía** el mensaje
en vez de descartarlo.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 8d.1 | Con A bloqueando a B, que **B escriba** en el chat | Falla, y B ve «Ya no están conectados, así que esta conversación está cerrada» |
| 8d.2 | El texto del aviso | 🔴 **No dice «te bloquearon».** Quitar de la red y bloquear dejan el mismo estado, y nombrarlo sería avisarle a quien no debe enterarse |
| 8d.3 | La fila del chat en la lista de B | Desaparece sola tras el intento, sin tener que tirar de la lista |
| 8d.4 | **A desbloquea, y vuelven a conectarse** | 🔴 El mensaje que B escribió estando bloqueado **NO llega**. Antes se quedaba en el outbox reintentándose y entraba al levantar el bloqueo: el bloqueo no impedía nada, solo posponía |
| 8d.5 | B → agregar contactos, estando bloqueado | Ve a A en «ya conectados o con solicitud enviada», **sin ninguna pista** del bloqueo |
| 8d.6 | A → agregar contactos, habiendo bloqueado | Ve a B con **«Lo bloqueaste»**, ícono de bloqueo y avatar apagado |
| 8d.7 | Aceptar una solicitud **tocando dos veces rápido** | Se acepta y la lista se actualiza. No aparece ningún error en consola: el `42501` de la segunda llamada significa «ya no está pendiente» y se trata como benigno |

---

## 8.b · Denunciar y bloquear (nuevo el 2026-08-24)

Es lo que mira App Review por la guía 1.2, así que conviene recorrerlo entero.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 8b.1 | En el chat, mantener apretado un mensaje **de la otra persona** | Aparece el diálogo de denuncia |
| 8b.2 | Mantener apretado un mensaje **propio** | **No** pasa nada: denunciarse a uno mismo no significa nada |
| 8b.3 | Denunciar: elegir motivo y enviar | Confirma, y ofrece quitar de la red en el mismo diálogo |
| 8b.4 | Elegir «Solo denunciar» | Vuelve al chat y la conexión sigue |
| 8b.5 | Denunciar el **mismo** mensaje otra vez | No falla ni se duplica en la base |
| 8b.6 | Contacto → «Denunciar a esta persona» | Igual, pero sin mensaje citado |
| 8b.7 | En la base | `select reason, message_body from content_reports order by created_at desc` — el texto denunciado está copiado |
| 8b.7b | Denunciar a la **misma persona** dos veces desde su ficha | No se duplica la fila (migración 0029). El índice viejo solo cubría el caso del mensaje |
| 8b.8 | Sin red | Muestra el error y no pierde lo escrito |
| 8b.9 | Elegir «Bloquear» al terminar la denuncia | Desaparece de la red |
| 8b.10 | **Desde el otro teléfono**, escribir en ese chat | **Falla.** Es el agujero que cerró 0021: quitar el vínculo no cerraba la conversación que ya existía |
| 8b.11 | Desde el otro teléfono, volver a mandar solicitud | No se puede |
| 8b.12 | Ajustes → Personas bloqueadas | Aparece, con cuándo se bloqueó |
| 8b.13 | Desbloquear | Vuelve a «sin relación»: no se reconectan solos, hay que mandar solicitud de nuevo |
| 8b.14 | Contacto → «Quitar de mi red» (el camino amable) | Sigue funcionando como antes, y **sí** deja volver a agregarse |

---

## 9 · Borrar la cuenta

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9.1 | Ajustes → perfil → SEGURIDAD → Borrar mi cuenta | Existe y se llega en tres toques. Es la ruta que se le declara a Apple |
| 9.2 | Con la contraseña incorrecta | Rechaza, y **la cuenta sigue viva** |
| 9.3 | Con la correcta | Borra, cierra sesión y no se puede volver a entrar |
| 9.4 | La pantalla lo advierte | Dice que se pierde el Premium y que se recupera con «Restaurar compras» |

---

## 9.b · La matriz gratis vs Premium

Se corre con **las dos cuentas abiertas al mismo tiempo**, comparando pantalla contra
pantalla. Es el recorrido que decide si lo que cobramos coincide con lo que publicamos en
`QUE-PROMETE-LA-APP.md` §7 — y sobre todo si lo que **no** cobramos sigue intacto.

### La mitad que tiene que ser IDÉNTICA

Esta es la que importa más, y la que es fácil romper sin querer al agregar una función
Premium. Si algo de acá difiere entre las dos cuentas, **es un bug**, no una función.

> ✅ **9b.1, 9b.2 y 9b.7 verificados el 2026-08-28** con el iPhone premium y el Android gratis.
> Junto con **7b.10**, que salió de regalo en la misma corrida: la cuenta premium **no** recibió
> aviso de Guardián por un contacto que estaba en su mismo sismo.

| # | Con las dos cuentas | Tiene que pasar |
|---|---|---|
| 9b.1 | Sembrar un sismo que alcance a las dos | 🔴 Las dos reciben la alerta, **al mismo tiempo y con el mismo texto**. «Al mismo tiempo» es **hasta 30 s de diferencia**: `fan_out_quake` reparte con `now() + random() * interval '30 seconds'` a propósito, para no golpear APNs de golpe. Una llegando medio minuto después de la otra es la prueba pasando, no fallando |
| 9b.2 | Las dos pantallas en modo alerta | Iguales: los 4 estados, la red, el contador |
| 9b.2b | Que uno de los dos reporte **«estoy bien»** | 🔴 Al otro le llega **«\<nombre\> está bien»**, en las dos cuentas por igual. Antes de la migración 0027 no llegaba **nunca** estando dentro del mismo sismo, ni pagando: el aviso colgaba de haber recibido la apertura de Guardián, que solo reciben los que están **fuera** de la zona |
| 9b.2c | Que reporte «necesita ayuda» y **después** «estoy bien» | Llegan los dos, y el segundo dice «**ya** está bien». Ese «ya» distingue el cierre de una alarma de un reporte limpio (0026 + 0027) |
| 9b.3 | Captura automática de ubicación | Ocurre en las dos |
| 9b.4 | Que un contacto marque «necesito ayuda» | Las dos reciben el aviso |
| 9b.5 | Que un contacto se quede callado 20 min, **con el sismo alcanzando a las dos cuentas** | 🔴 Las dos reciben **«X no responde»**. Este es el corte que hace legítimo cobrar Guardián: entre quienes compartieron el sismo, la señal de que algo salió mal nunca se cobra |
| 9b.5b | Lo mismo, pero con **la cuenta observadora fuera** del alcance del sismo | **No recibe nada**, ni gratis ni premium, porque `notify_silent_contacts` solo escribe a quien tiene entrega de ESE sismo (0020). No es un bug: es lo que hace que Guardián sea el **único** canal para un sismo que no te tocó. Lo que sí sería un bug es prometer lo contrario en la landing — ver `QUE-PROMETE-LA-APP.md` §7 |
| 9b.6 | Chat, red ilimitada, plan de acción, tips | Iguales |
| 9b.7 | Noticias → pestaña **Perú** | Igual en las dos |

### La mitad que tiene que DIFERIR

| # | Dónde | Gratis | Premium |
|---|---|---|---|
| 9b.8 | Noticias → pestaña **Global** | Se ve, con candado; al tocar abre el paywall | Muestra el feed |
| 9b.9 | Ajustes → NOTICIAS → «Sismos en el mundo» | «Disponible con Premium», apagado y sin poder tocarlo | Se puede encender y apagar |
| 9b.10 | Ajustes → **GUARDIÁN** | «Disponible con Premium», apagado | Se puede encender y apagar |
| 9b.11 | Ajustes → PRÁCTICA | «0 de 3» | «0 de ilimitados» |
| 9b.11b | Ajustes → Planes de acción | 1 plan, sin botón de agregar | Hasta 5, con botón |
| 9b.12 | Cuarto simulacro | Bloqueado, con la oferta de Premium | Arranca |
| 9b.13 | Ajustes → tarjeta de perfil | «Plan gratuito» | «Premium» |
| 9b.14 | Mi cuenta | «Plan gratuito» | «Todos Bien Premium» |
| 9b.15 | **Guardián**: sismo cerca de un contacto, lejos de vos | No llega nada | «Tembló cerca de \<nombre\>» |
| 9b.16 | Ese contacto marca «estoy bien» | No llega nada | «\<nombre\> está bien» |

### El cambio de plan en vivo

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9b.17 | Con la app **abierta**, pasar la cuenta a Premium por SQL y refrescar | La pantalla se actualiza sin reinstalar |
| 9b.18 | La pestaña Global, recién comprada | Trae el feed. No se queda con la vista bloqueada cacheada |
| 9b.19 | Volver la cuenta a gratis y refrescar | Se vuelve a bloquear, sin dejar restos del feed global visibles |
| 9b.20 | Borrar la cuenta con Premium activo | Avisa que se pierde y que se recupera con «Restaurar compras» |

---

## 9.c · Planes de acción múltiples (nuevo el 2026-08-25)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9c.1 | Cuenta **gratis** → Ajustes → Planes de acción | Se ve el plan que ya tenías, con el nombre «Mi plan» — el que puso la migración al traer la columna vieja |
| 9c.2 | Gratis, tocar «Agregar un plan» | **No aparece el botón.** En su lugar, la tarjeta que explica para qué sirven varios y ofrece Premium |
| 9c.3 | Editar el plan que ya existe, estando en gratis | Se puede. El tope es para **agregar**, no para editar |
| 9c.4 | Cuenta **Premium** → «Agregar un plan» | Pide nombre y texto, con las sugerencias («En el trabajo», «Con los chicos»…) |
| 9c.4b | Guardar y volver a la lista | 🔴 El plan nuevo **aparece de inmediato**, sin cerrar y reabrir la pantalla. Fue un bug real: la lista se cargaba una sola vez al montarse |
| 9c.4c | Volver a la Home después de escribir el **primero** | El aviso «Todavía no escribiste tu plan de acción» desaparece. Sale del espejo en el perfil, que hay que releer aparte |
| 9c.5 | Llegar a **5** planes | Al quinto desaparece el botón y dice que llegaste al máximo |
| 9c.6 | **Desde el otro teléfono**, abrir tu ficha | 🔴 Se ven **todos** tus planes, cada uno con su nombre, en el orden en que los creaste |
| 9c.7 | Con un solo plan | El nombre **no** se muestra: con uno solo es ruido |
| 9c.8 | Poner el teléfono en **modo avión** y abrir la ficha del contacto | 🔴 Los planes **siguen ahí**. Salen de la caché local, que es lo que se lee después de un sismo cuando no hay red |
| 9c.9 | Borrar un plan | Desaparece de tu lista y de la ficha del otro teléfono |
| 9c.10 | Borrar **todos** | La ficha del otro dice «Todavía no escribió su plan» |
| 9c.11 | Volver la cuenta a **gratis** teniendo 5 planes | 🔴 **Los 5 siguen visibles** para vos y para tu red. Solo desaparece el botón de agregar |
| 9c.12 | Una solicitud **pendiente**, sin aceptar | **No** ve ningún plan. Es más estricto que antes a propósito: quien no aceptaste no tiene por qué saber adónde vas |
| 9c.13 | Alta nueva: onboarding paso 4, escribir el plan | Queda guardado y aparece en la lista como «Mi plan» |
| 9c.14 | Alta nueva **saltando** el paso | La lista queda vacía, con el texto que invita a escribir uno |

---

## 9.d · Grupos (reescrita el 2026-09-01 · migración 0034)

> **Lo que cambió respecto de la corrida anterior:** el «círculo» privado y la «conversación
> grupal» se fusionaron en un solo objeto. Un grupo es **gente + un chat**, se comparte con todos
> los que están adentro, y es de quien lo creó. Los pasos de la versión vieja ya no aplican.

**Hacen falta dos teléfonos** para casi todo lo importante de esta sección: lo que hay que
verificar es justamente que el otro lado vea lo mismo.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9d.1 | Mi red → conmutador **Toda mi red / Mis grupos** | Está **siempre**, con o sin alerta. El de «En la zona / Fuera / Todos» sigue apareciendo solo durante una alerta, y **debajo** |
| 9d.2 | Sin contactos aceptados → «Mis grupos» | Dice «Primero, tu red» y no ofrece crear |
| 9d.3 | Crear un grupo «Casa» | Al guardar entra directo a su detalle. 🔴 Antes de crear, el campo avisa que **el nombre lo van a ver todos** |
| 9d.4 | Crear otro con el mismo nombre | Lo rechaza. ⚠️ iOS capitaliza sola la primera letra: para probarlo de verdad hay que borrar la mayúscula a mano |
| 9d.5 | Cuenta **gratis**, crear un **tercero** | El botón «Nuevo grupo» sigue a la vista y abre el **paywall**. Si la compra sale bien, el formulario se abre solo |
| 9d.6 | Detalle → «AGREGAR DE TU RED», tocar a alguien | Pasa arriba en el acto, con reloj de carga y sin botón de guardar |
| 9d.7 | 🔴 **Desde el otro teléfono**, Mi red → Mis grupos | **El grupo APARECE**, con su nombre y la lista completa. Dice «lo creó otra persona». Es lo contrario de lo que pasaba con los círculos, y es el corazón de la 0034 |
| 9d.8 | Desde el otro teléfono, abrir ese grupo | 🔴 **No hay lápiz en el nombre, no hay ⊖ en nadie, no hay «AGREGAR DE TU RED»**. Abajo dice «Salir del grupo», no «Borrar». Si aparece cualquier cosa de esas, la RLS de la 0034 está mal |
| 9d.9 | Chats → Grupales, en los dos teléfonos | 🔴 **El chat del grupo ya existe en los dos**, con el nombre del grupo. Nadie tuvo que crearlo |
| 9d.10 | Escribir en ese chat desde el otro teléfono | Llega el mensaje y el aviso |
| 9d.11 | El dueño renombra el grupo | 🔴 **Desde el otro teléfono cambian el nombre del grupo Y el del chat.** Son el mismo nombre |
| 9d.12 | El dueño saca a alguien (⊖) | 🔴 **En el teléfono del sacado, el grupo desaparece de Mi red, el chat desaparece de Chats, y sus mensajes se borran del teléfono** |
| 9d.13 | El sacado vuelve a ser sumado | Vuelve a ver el grupo y el chat, **con todo el historial** — incluido lo que se habló mientras no estaba. Es la decisión documentada en QUE-PROMETE §7, y la pantalla lo avisa antes de sumar |
| 9d.14 | Un integrante toca «Salir del grupo» | Sale de la lista para todos. El dueño lo ve al refrescar |
| 9d.15 | El dueño toca «Borrar grupo» | 🔴 **Desaparece para todos, con su chat y sus mensajes.** El diálogo lo dice antes. Nadie sale de la red de nadie |
| 9d.16 | Volver la cuenta a **gratis** teniendo 5 grupos | 🔴 **Los 5 siguen ahí.** Solo el botón de crear abre el paywall |
| 9d.17 | **Modo avión** → Mi red → Mis grupos | 🔴 Siguen ahí con sus integrantes: salen de la caché (KV local) |

### 9.d.bis · 🔴 El atajo, que es la mitad del valor del cambio

Esto necesita **tres cuentas**: A (dueño), B y C, donde **B y C no están conectados entre sí**.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9d.18 | A arma un grupo con B y C | — |
| 9d.19 | En el teléfono de **B**, abrir el grupo | 🔴 Junto a **C** dice **«No está en tu red · no vas a ver cómo está»**, con un botón **Agregar** |
| 9d.20 | Mi red → Mis grupos, desde B | La fila del grupo avisa «1 persona no está en tu red» **sin entrar** |
| 9d.21 | B toca «Agregar» sobre C | Sale «Le mandamos la solicitud a C». El botón queda en «Enviada» |
| 9d.22 | C acepta la solicitud | Ahora se ven entre sí. 🔴 En el grupo, el aviso de B sobre C **desaparece** |
| 9d.23 | Con una **alerta activa** | La Home cuenta **solo a los integrantes que están en tu red**. Antes de que C aceptara, B veía a C fuera de la cuenta — y el detalle del grupo lo explicaba abajo |
| 9d.24 | A quita a B de su red (Mi red → ficha → Quitar) | 🔴 **B sale del grupo de A y de su chat**, en los dos teléfonos. Ya no se filtra al leer como en la 0031: la fila se borra, porque un estado compartido no puede depender de quién mira |

## 9.e · Chats (actualizada el 2026-09-01)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9e.1 | Chats, sin haberle escrito a nadie | «Todavía no has hablado con nadie». **No** lista tu red entera |
| 9e.2 | Botón **+** en «Individuales» | Abre la lista de tu red. 🔴 **Ya no hay fila de «nueva conversación grupal»**; en su lugar, un pie que dice dónde se arma un grupo |
| 9e.3 | Botón **+** en «Grupales» | 🔴 Cambia de ícono y **lleva a Mi red**. Es la única forma de armar un grupo |
| 9e.4 | Tocar a alguien en el selector | Abre el chat directo. Al cerrarlo se vuelve a **Chats**, no al selector |
| 9e.5 | Escribirle y volver a Chats | Ahora sí aparece en «Individuales» |
| 9e.6 | Grupales sin ningún grupo | «Todavía no tienes grupos», con un botón que lleva a armarlo |
| 9e.7 | Recién creado el grupo | 🔴 Su chat aparece **arriba** en Grupales aunque no tenga mensajes |
| 9e.8 | Abrir el chat del grupo | El encabezado muestra **el nombre del grupo**, no «Chat» |
| 9e.9 | Mantener presionada una **individual** con varios mensajes | Ofrece **«Eliminar chat»**. El aviso dice las dos mitades: se borran los mensajes **de este teléfono**, y en el del otro siguen ahí |
| 9e.10 | Eliminarla y **tirar de la lista** | 🔴 **Sigue eliminada y los mensajes no vuelven.** Dos mecanismos distintos: el UPSERT impide que la conversación resucite, y el corte de `hidden_at` impide que los mensajes se vuelvan a bajar |
| 9e.11 | Volver a abrir ese chat desde la ficha del contacto | 🔴 Se abre **vacío**. Todavía no aparece en la lista — como WhatsApp, vuelve cuando hay un mensaje |
| 9e.12 | **Desde el otro teléfono**, escribirle a esa conversación eliminada | 🔴 Llega el aviso **y la conversación reaparece sola**, con el mensaje nuevo y **solo** ese |
| 9e.13 | Mantener presionado el chat de un **grupo** | 🔴 Ofrece **«Ver el grupo»** y «Eliminar chat». **No** ofrece cambiar el nombre ni salir: eso se hace en el grupo, y tener dos lugares para lo mismo era el problema que la 0034 resolvió |
| 9e.14 | «Ver el grupo» | Abre el detalle del grupo. Volver regresa a Chats |
| 9e.15 | Eliminar el chat de un grupo | El aviso aclara que **no es lo mismo que salir**: sigues en el grupo y el chat vuelve si alguien escribe |
| 9e.16 | Una conversación grupal **vieja**, creada con la build anterior | Si existe alguna: mantener presionado ofrece «Eliminar chat» **y «Salir de la conversación»**, porque no hay grupo al que ir. Sin eso serían inabandonables |

> **Lo que NO tiene que existir por ningún lado: «salir» de un chat individual.** Está prohibido
> en la base a propósito (política `conversation_members_leave_group`, migración 0032). Sin fila
> de miembro, `on_message_sent` deja de incluirte y `get_or_create_direct_conversation` **no te
> vuelve a agregar** — quedarías en silencio permanente con ese contacto, sin saberlo y sin forma
> de volver.

---

## 10 · Antes de dar por cerrado el recorrido

- [ ] Se corrió sobre un build de TestFlight, no en el simulador ni con Metro
- [ ] La agenda usada era real, no de simulador
- [ ] Lo que falló quedó anotado en `ESTADO-DEL-PROYECTO.md` → Deudas conocidas
- [ ] Las deudas que se verificaron se **tacharon** ahí. Una deuda verificada que sigue
      escrita como pendiente hace perder el tiempo dos veces
