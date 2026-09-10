# Ficha de App Store — texto listo para pegar

Todo lo que pide App Store Connect en **App Information** y en **iOS App → Version
Information**, escrito y contado. Escrito el **2026-08-24**, revisado contra el
comportamiento real el **2026-09-03**.

> **Cada afirmación de acá sale de `QUE-PROMETE-LA-APP.md`.** Si algo suena mejor pero no
> está respaldado ahí, no se cambia acá: se cambia primero allá. La ficha es el lugar donde
> más tienta prometer de más, y es el único que un revisor lee entero antes de abrir la app.

Los largos están **contados**, no estimados. Apple corta sin avisar.

---

## 1 · Campos cortos

| Campo | Valor | Largo |
|---|---|---|
| **Name** | `Todos Bien` | 10 / 30 |
| **Subtitle** | `Prepárate antes, avisa después` | 30 / 30 |
| **Primary category** | Utilidades (*Utilities*) | — |
| **Secondary category** | Estilo de vida (*Lifestyle*) | — |
| **Idioma principal** | Español (México) — el neutro latino que usa la app (ESTADO §1.10) | — |
| **Copyright** | `2026 Renzo Arroyo` | — |

> **Por qué Utilidades y no Salud y forma física.** *Medical* y *Health & Fitness* activan
> criterios de revisión más estrictos y llevan a preguntas que esta app no puede contestar
> bien, porque no diagnostica ni monitorea nada. Tampoco es *Navigation*: la ubicación es un
> medio, no el producto.

### Keywords (100 caracteres, separadas por coma, sin espacios)

```
sismo,terremoto,temblor,IGP,familia,emergencia,mochila,ubicacion,simulacro,Peru,prevencion,grupos
```

97 / 100. Cinco decisiones detrás:

- **`circulo` salió el 2026-09-03.** Describía las etiquetas privadas de la migración 0031, que
  dejaron de existir con la 0034: hoy el objeto es un **grupo** compartido. Una keyword que
  nombra algo que la app ya no tiene es un slot de los 100 gastado en atraer a nadie.

- **No aparece «alerta sísmica».** Es la keyword más buscada del rubro y es exactamente la
  que no podemos usar: en Perú significa SASPe, o sea alerta temprana. Usarla trae
  instalaciones de gente que quiere otra cosa, y devoluciones y reseñas de una estrella
  cuando descubre que no lo es. `QUE-PROMETE-LA-APP.md` §8 lo prohíbe.
- **Sin tildes ni «Todos Bien».** Apple ya indexa el nombre y el subtítulo; repetirlos
  desperdicia caracteres, y el buscador normaliza los acentos.
- **`IGP` está a propósito.** Es una búsqueda real en Perú y nos describe con exactitud.
- **`mochila` y `prevencion` entraron el 2026-09-10**, con el Centro de Preparación, y
  desplazaron a `contactos` y `aviso`. Los dos que salieron eran genéricos y no traían
  intención de descarga; **«mochila de emergencia» es una búsqueda con intención clarísima** en
  Perú, sobre todo alrededor del simulacro nacional. `preparacion` se descartó frente a
  `prevencion` porque Apple ya indexa «Preparación» desde el nombre de la pestaña en las
  capturas y el texto promocional.

### Promotional text (170, se puede cambiar sin enviar versión nueva)

```
Arma la mochila y el punto de encuentro de tu casa antes de que tiemble. Y cuando tiemble, un toque le dice a tu familia que estás bien. El aviso llega minutos después, no antes.
```

178 / 170. **Cambió el orden el 2026-09-10** y hay que saber por qué: antes iba primero el
descargo, porque el único beneficio que teníamos ocurría *después* del sismo y confundirlo con
alerta temprana era el riesgo grande. Ahora el primer beneficio es **antes**, que no se puede
confundir con nada, así que se puede abrir con él — pero el descargo sigue dentro de los 170,
al final, y no se saca nunca.

---

## 2 · Description

> Pegar tal cual. Los saltos de línea importan: App Store Connect respeta los párrafos.

**3918 / 4000 caracteres.** Contado, no estimado. **Reescrita el 2026-09-10** para el Centro
de Preparación: la app pasó de ser «la app de los minutos después» a cubrir también el antes, y
eso cambia el primer renglón, que es lo único que mucha gente lee.

> 🔴 **Se sacó una frase que quedó falsa: «Tu familia no necesita pagar nada ni enterarse:
> Premium es tuyo».** Con el Centro es al revés — la familia **sí** entra, y para eso tiene que
> estar en el hogar. Dejarla habría sido vender lo contrario de lo que hace el producto.

Para meter el Centro sin pasarse de 4000 se recortaron cuatro párrafos que decían lo mismo con
más palabras. Quedan **82 caracteres de margen**; si se agrega algo, volver a contar.

> **Este mismo texto es la descripción de Google Play**, con una sola sustitución. No se copia a
> otro archivo — ver `FICHA-PLAY-STORE.md` §2, que explica por qué y trae el script que la genera.
> **Si editas esta descripción, corré ese script**: falla solo si quedó una mención a Apple.

```
Todos Bien no es una alarma sísmica. Prepara a tu casa antes del sismo, y coordina a tu gente después.

El aviso llega unos minutos después de que tiembla, cuando el Instituto Geofísico del Perú publica el evento. No te avisa antes de que tiemble: para eso está el SASPe, con sirenas.

ANTES: EL CENTRO DE PREPARACIÓN
Tu casa entera preparándose junta, en una sola pantalla con un porcentaje que sube:

- La mochila de emergencia, con los 16 elementos que recomienda el INDECI. Lo que marca uno lo ven todos.
- Un punto de encuentro y el plan de la casa, escritos una vez y visibles para los que viven ahí.
- Quién hace qué cuando tiemble: cerrar el gas, cargar la mochila, ayudar a los abuelos.
- Un minicurso de 12 consejos, cada uno con su fuente: INDECI, Cruz Roja Peruana e IGP.
- Simulacros, para que la primera vez que uses la app de verdad no sea durante un terremoto.

Paga una persona y entra la casa completa, sin límite de personas.

DESPUÉS: CON UN TOQUE, TU GENTE SABE QUE ESTÁS BIEN
Después de un sismo todos llaman a la vez y la red se cae. Un toque en la app pesa unos bytes y pasa cuando una llamada no pasa. Eliges entre estoy bien, necesito ayuda o estoy en camino, y tu red lo ve.

VES QUIÉN RESPONDIÓ Y QUIÉN NO
Tu red en una sola pantalla, con el estado de cada persona. Quien no contestó se ve distinto de quien dijo que está bien: es la diferencia entre quedarte tranquilo y saber a quién llamar primero.

Y si a alguien de tu red no van a llegarle los avisos —no dio el permiso, cambió de teléfono— te lo decimos antes, no después.

TU UBICACIÓN, SOLO CUANDO IMPORTA
La app toma tu ubicación una vez al configurarla y otra vez después de cada sismo que te afecta, aunque esté cerrada. Nada más. No registra tu recorrido. La ven únicamente los contactos que aceptaste, y si no la tenemos, lo decimos: nunca mostramos una posición vieja como si fuera de ahora.

AVISOS SEGÚN TU ZONA
Eliges el radio y la magnitud mínima. Seguimos el catálogo del IGP y del USGS todo el día, y te avisamos cuando un temblor entra en tus criterios, con la app cerrada.

CHAT Y GRUPOS: CASA, FAMILIA, TRABAJO
Tu red en subconjuntos con nombre, cada uno con su chat. Cuando tiembla ves «Casa 4/5» y «Familia 8/11» en vez de treinta caras sueltas. Dos gratis, ilimitados con Premium.

Estar en un grupo no conecta a nadie: ves los nombres y se escriben, pero el estado y la ubicación siguen siendo de a dos y necesitan que ambos se acepten. Nadie puede meterte en un grupo y darle tu ubicación a un desconocido.

PREMIUM (opcional)
Cuando el sismo te toca a ti, la app funciona completa sin pagar: tu alerta, tu red, el aviso de que alguien pidió ayuda y el de que alguien no respondió nunca dependen de que pagues.

Premium agrega dos cosas. La primera es el Centro de Preparación para toda tu casa. La segunda es Guardián: te avisa cuando alguien de tu red reporta que está bien, y también si pasan veinte minutos y no reporta, en los sismos que NO te tocan a ti. Cada aviso dice de qué sismo habla, magnitud y lugar.

Incluye además avisos de sismos de todo el mundo, grupos y simulacros ilimitados, y hasta cinco planes de acción con nombre.

LO QUE NO HACE, DICHO ANTES DE QUE LO PREGUNTES
- No avisa antes del sismo. No es alerta temprana.
- No hace nada mientras tiembla: lo que hace es haberte enseñado y hecho practicar para esos segundos.
- No detecta sismos por su cuenta: depende de que el IGP o el USGS los publiquen.
- No controla si algo de tu mochila venció. Te muestra la lista; revisarla es tuyo.
- Sin internet no llega ningún aviso.
- No garantiza la entrega: Apple entrega las notificaciones con el mejor esfuerzo.
- No reemplaza llamar a emergencias. No contacta bomberos, PNP ni INDECI.
- No comparte tu ubicación con nadie fuera de tu red, ni la usa para publicidad.

Privacidad: https://todosbien.app/privacidad
Términos: https://todosbien.app/terminos
Soporte: https://todosbien.app/soporte
```

---

## 3 · URLs y datos de contacto

| Campo | Valor |
|---|---|
| **Support URL** | `https://todosbien.app/soporte` |
| **Marketing URL** | `https://todosbien.app` |
| **Privacy Policy URL** | `https://todosbien.app/privacidad` |
| **Correo de contacto** | `todosbienapp@gmail.com` |

Las cuatro están verificadas en producción el 2026-08-24: responden 200.

---

## 4 · Clasificación por edad

La app **no** tiene contenido violento, sexual, de juego ni de drogas. Las dos preguntas que
hay que contestar con cuidado y que no son obvias:

| Pregunta del cuestionario | Respuesta | Por qué |
|---|---|---|
| *Unrestricted Web Access* | **No** | La app abre enlaces externos concretos (mapas, páginas legales), no un navegador dentro de la app |
| *User Generated Content* | **Sí** | El chat y el mensaje del estado son texto que escribe una persona y que otra ve |

Decir «sí» en contenido generado por el usuario **obliga a tener moderación**: método para
denunciar contenido ofensivo, forma de bloquear al que lo manda, y compromiso de actuar en
24 horas. Es una causal de rechazo frecuente.

> ✅ **Cerrado el 2026-08-24** (migraciones 0020 y 0021). Los cuatro requisitos existen y se
> pueden demostrar en pantalla, que es lo que pide la guía 1.2:
>
> | Requisito | Dónde está |
> |---|---|
> | Denunciar contenido | Mantener apretado un mensaje ajeno en el chat, o desde la ficha del contacto. Guarda **copia del mensaje** como evidencia (`content_reports`) |
> | Bloquear a una persona | Ficha del contacto → «Bloquear». Cierra el chat en **las dos direcciones** —incluido el que ya existía, que era el agujero real— e impide nuevas solicitudes |
> | Deshacer el bloqueo | Ajustes → «Personas bloqueadas». El bloqueado no puede deshacerlo |
> | Actuar en 24 h | Escrito en los términos §5.1 y sostenido por el chequeo diario del `RUNBOOK-OPERACION.md` |
>
> El recorrido para verificarlo en el teléfono es `VERIFICACION-EN-DISPOSITIVO.md` §8.b, y el
> texto que se le explica al revisor está en `REVISION-APPLE.md` §2.

Clasificación esperada: **4+**.

---

## 5 · Capturas de pantalla

Apple exige, como mínimo, el juego del iPhone más grande; los tamaños menores se derivan de
ese si no se suben aparte. **Confirmar los tamaños vigentes en App Store Connect al subir**,
que cambian con cada generación de iPhone.

> 🔴 **Rehechas el 2026-09-10, y el cambio de orden es la decisión importante.** Hasta esa
> fecha la captura 1 era la Home en modo alerta: rojo, urgencia, «tembló». Servía cuando la app
> era solo el después. **Ahora la primera es el Centro de Preparación**, y no por estética:
>
> 1. Es la única captura que se entiende **sin haber sentido un sismo**. Un limeño que ve
>    urgencia en la primera imagen la asocia con SASPe y sigue de largo; un porcentaje que sube
>    y seis tarjetas de colores se entienden en un segundo.
> 2. Es lo que **se cobra**, y una tienda donde no se ve lo que se paga convierte mal.
> 3. La alerta pasa a la 2, que sigue siendo temprano. No se pierde: se deja de abrir con ella.

Las ocho, en orden, y qué tiene que verse en cada una:

| # | Pantalla | Qué demuestra | Texto sugerido encima |
|---|---|---|---|
| 1 | **Centro de Preparación** con el porcentaje arriba y las seis tarjetas de colores | Lo que la app hace **antes**, y lo que se cobra. Con la cuenta demo sale en 51 %, que es lo que se quiere: a medio camino, no vacío ni perfecto | «Tu casa, lista antes de que tiemble» |
| 2 | Home en modo alerta, con el sismo arriba y la red debajo | El producto en el momento para el que existe | «Tembló. ¿Están todos bien?» |
| 3 | **Mochila de emergencia**, con el dibujo lleno a media asta y la lista del INDECI debajo | Que el contenido es de una fuente seria y que se marca entre todos. Es la captura más «demostrable» de las ocho | «La lista del INDECI, marcada entre todos» |
| 4 | Red con estados mezclados: dos en verde, uno en ámbar, uno sin confirmar | El valor real: ver quién falta | «Ves quién respondió y quién no» |
| 5 | **Grupos**, con el desglose «Casa 4/5 · Familia 8/11» y el chat del grupo debajo | Que la red no es una bolsa plana. Contesta *«¿y si tengo treinta contactos?»* | «Faltan dos de tu casa, no doce conocidos» |
| 6 | Los cuatro estados / «Estoy bien» | Lo que hace el usuario | «Un toque, y tu gente lo sabe» |
| 7 | Detalle de contacto con el mini mapa | La ubicación, con su límite | «Su ubicación después del sismo. No antes, no siempre» |
| 8 | Simulacro, **con la franja amarilla visible** | Que se puede probar sin un terremoto, y que no se confunde con uno | «Practica antes de necesitarlo» |

**Lo que salió, y por qué se puede prescindir.** Los **ajustes de radio y magnitud** y la lista
de **Noticias** se cayeron del juego de ocho. La primera era control del usuario, que la
descripción ya afirma y nadie compra por una captura de un formulario. La segunda era la razón
de «no desinstalar», y **ese trabajo ahora lo hace mejor el Centro**: un porcentaje incompleto
es una razón para volver mucho más fuerte que una lista de sismos que también publica el IGP.

> ⚠️ **La captura 1 no puede llevar el Centro bloqueado.** Es tentador —muestra el candado y el
> «tus datos siguen aquí»— y sería un error: la primera imagen de una tienda no puede ser una
> pared de pago. Fotografiar el Centro **abierto**, con la cuenta demo, que ya está en Premium.

**Por qué los grupos entran como captura y no como línea de la descripción.** No se entienden
leyéndolos: «subconjuntos con nombre de tu red» suena a organización de contactos, que es
aburrido y además no es el punto. El punto es el desglose durante un sismo, y eso se ve en un
segundo y no se explica en un párrafo. Lo mismo vale ahora para la mochila: «lista de
preparación» suena a checklist genérica, y el dibujo llenándose se entiende sin leer.

> ⚠️ **La franja amarilla del simulacro tiene que salir en la captura 8.** Es la prueba en imagen
> de que la app no puede hacerle creer a nadie que tembló de verdad — el §4 de los términos lo
> prohíbe y App Review lo mira. Una captura de simulacro sin la franja parece una alerta falsa.

> **Por qué la lista de sismos ya no está en el juego, aunque el argumento viejo sigue siendo
> bueno.** Era la pantalla que contestaba «¿y qué hago con esta app un martes cualquiera?»,
> puesta al final como razón para no desinstalar. Nunca fue la promesa —un catálogo de sismos
> lo tienen el IGP y una docena de apps gratis— y ponerla arriba invitaba a la comparación que
> perdemos. **El Centro hace ese trabajo mejor**, así que la lista cedió su lugar. Si alguna vez
> vuelve, va última y con el texto «los sismos del IGP», nunca «alerta de sismos»: nombrar la
> fuente es exacto y «alerta» a secas está prohibida en la ficha (`QUE-PROMETE-LA-APP.md` §8).

**Tres reglas para no tener que rehacerlas:**

- Ningún dato real de nadie. Nombres inventados y números de teléfono falsos: una captura con
  el teléfono de una persona real es un problema de privacidad publicado en una tienda.
- Nada de rojo urgente en la primera captura si no hay una alerta real en ella. El rojo de
  esta app significa «necesito ayuda» (ESTADO §1.4.1).
- Ninguna palabra del texto encima puede decir «alerta» a secas ni prometer lo que §5 de
  `QUE-PROMETE-LA-APP.md` niega. Las capturas también son afirmación pública.

---

## 6 · Versión en inglés

Va con el resto del trabajo de `ALCANCE-Y-IDIOMAS.md`, cuando se amplíe la disponibilidad
más allá de Perú. Lo que ya está decidido para cuando toque:

| Campo | Valor | Largo |
|---|---|---|
| Subtitle | `Tell your family you're OK` | 26 / 30 |
| Keywords | `earthquake,quake,tremor,family,safety,check in,emergency,location,drill,USGS,alert,groups` | 89 / 100 |

> `alert` sí puede ir en inglés: no arrastra el significado de alerta temprana que «alerta
> sísmica» tiene en Perú. Lo que **no** puede aparecer en ningún idioma es *early warning*.

---

## 7 · Antes de dar «Submit»

- [ ] La descripción no dice «durante el sismo» en ninguna parte
- [ ] La descripción no dice «alerta sísmica» ni «alerta temprana» como algo que la app haga
- [x] Los precios que se ven en el sitio coinciden con los productos de App Store Connect —
      **9,90 · 59,90 · 79,90**, cerrado el 2026-08-28
- [ ] Las capturas no muestran datos de personas reales
- [x] Está resuelto el punto de moderación de §4 — denunciar y bloquear existen desde el
      2026-08-24
- [x] La descripción de Premium sigue diciendo la verdad sobre lo que es gratis. **Es lo que
      más se desactualiza**: el corte cambió el 2026-08-27 y estaba mal escrito en cuatro
      lugares públicos a la vez. La versión buena es la de §2, y su fuente es
      `QUE-PROMETE-LA-APP.md` §7
      — **Revisado el 2026-09-03, y esta casilla se había quedado sin marcar por segunda vez.**
      La descripción vendía «te avisa apenas tiembla cerca de alguien de tu red, con su nombre
      y a cuántos kilómetros le pasó», que es el aviso del minuto 0 que la migración **0030**
      retiró el 2026-08-31. Quien pagara S/ 79,90 por esa frase nunca iba a recibirla.
- [x] La descripción menciona los **grupos** — corregido el 2026-09-03. Faltaban por completo:
      la app tenía grupos compartidos con chat desde las migraciones 0031-0034 y la ficha
      seguía describiendo solo el chat individual
- [ ] La captura del simulacro muestra la **franja amarilla** (ver §5)

> **La lección, porque va a volver a pasar.** Las dos casillas de arriba fallaron por el mismo
> motivo: al retirar o agregar una función se corrige el código, se corrige la tabla de §7 de
> `QUE-PROMETE-LA-APP.md`, y **los textos listos para pegar quedan intactos** porque nadie los
> relee al revisar una migración. Los tres lugares donde vive copia lista para publicar son
> **este archivo (§2), `GUIA-SUSCRIPCIONES.md` §4 y la landing**. Al tocar una función, abrir
> los tres.
