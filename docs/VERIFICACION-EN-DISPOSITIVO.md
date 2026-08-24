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

## 4 · Contactos y círculo (cambió el 2026-08-24 al quitar los códigos de invitación)

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
| 6.1 | Con la alerta activa, mirar la Home | El círculo entra **completo** sin desplazar. La tarjeta de ubicación asoma **debajo** |
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

## 8.b · Denunciar y bloquear (nuevo el 2026-08-24)

Es lo que mira App Review por la guía 1.2, así que conviene recorrerlo entero.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 8b.1 | En el chat, mantener apretado un mensaje **de la otra persona** | Aparece el diálogo de denuncia |
| 8b.2 | Mantener apretado un mensaje **propio** | **No** pasa nada: denunciarse a uno mismo no significa nada |
| 8b.3 | Denunciar: elegir motivo y enviar | Confirma, y ofrece quitar del círculo en el mismo diálogo |
| 8b.4 | Elegir «Solo denunciar» | Vuelve al chat y la conexión sigue |
| 8b.5 | Denunciar el **mismo** mensaje otra vez | No falla ni se duplica en la base |
| 8b.6 | Contacto → «Denunciar a esta persona» | Igual, pero sin mensaje citado |
| 8b.7 | En la base | `select reason, message_body from content_reports order by created_at desc` — el texto denunciado está copiado |
| 8b.8 | Sin red | Muestra el error y no pierde lo escrito |
| 8b.9 | Elegir «Bloquear» al terminar la denuncia | Desaparece del círculo |
| 8b.10 | **Desde el otro teléfono**, escribir en ese chat | **Falla.** Es el agujero que cerró 0021: quitar el vínculo no cerraba la conversación que ya existía |
| 8b.11 | Desde el otro teléfono, volver a mandar solicitud | No se puede |
| 8b.12 | Ajustes → Personas bloqueadas | Aparece, con cuándo se bloqueó |
| 8b.13 | Desbloquear | Vuelve a «sin relación»: no se reconectan solos, hay que mandar solicitud de nuevo |
| 8b.14 | Contacto → «Quitar de mi círculo» (el camino amable) | Sigue funcionando como antes, y **sí** deja volver a agregarse |

---

## 9 · Borrar la cuenta

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9.1 | Ajustes → perfil → SEGURIDAD → Borrar mi cuenta | Existe y se llega en tres toques. Es la ruta que se le declara a Apple |
| 9.2 | Con la contraseña incorrecta | Rechaza, y **la cuenta sigue viva** |
| 9.3 | Con la correcta | Borra, cierra sesión y no se puede volver a entrar |
| 9.4 | La pantalla lo advierte | Dice que se pierde el Premium y que se recupera con «Restaurar compras» |

---

## 10 · Antes de dar por cerrado el recorrido

- [ ] Se corrió sobre un build de TestFlight, no en el simulador ni con Metro
- [ ] La agenda usada era real, no de simulador
- [ ] Lo que falló quedó anotado en `ESTADO-DEL-PROYECTO.md` → Deudas conocidas
- [ ] Las deudas que se verificaron se **tacharon** ahí. Una deuda verificada que sigue
      escrita como pendiente hace perder el tiempo dos veces
