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
| **Subtitle** | `Avisa a tu gente tras el sismo` | 30 / 30 |
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
sismo,terremoto,temblor,IGP,familia,emergencia,contactos,ubicacion,simulacro,Peru,aviso,grupos
```

94 / 100. Cuatro decisiones detrás:

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

### Promotional text (170, se puede cambiar sin enviar versión nueva)

```
El aviso llega minutos después del sismo, cuando el IGP lo publica. No es alerta temprana: con un toque le dices a tu familia que estás bien, y ves quién ya respondió.
```

167 / 170. Va primero el descargo, no el beneficio: es el texto que se lee sin desplegar la
descripción.

---

## 2 · Description

> Pegar tal cual. Los saltos de línea importan: App Store Connect respeta los párrafos.

**3963 / 4000 caracteres.** Contado, no estimado: al sumar los grupos y los simulacros se pasó
de 4000 y hubo que recortar. Si se agrega un párrafo, volver a contar.

> **Este mismo texto es la descripción de Google Play**, con una sola sustitución. No se copia a
> otro archivo — ver `FICHA-PLAY-STORE.md` §2, que explica por qué y trae el script que la genera.
> **Si editas esta descripción, corré ese script**: falla solo si quedó una mención a Apple.

```
Todos Bien no es una alarma sísmica. Es la app para los minutos después del sismo.

El aviso llega unos minutos después de que tiembla, cuando el Instituto Geofísico del Perú publica el evento. No te avisa antes de que tiemble: para eso está el SASPe, con sirenas. Lo que hace esta app es lo que hace falta cuando ya tembló y las líneas están saturadas.

CON UN TOQUE, TU GENTE SABE QUE ESTÁS BIEN
Después de un sismo todos llaman a la vez y la red se cae. Un toque en la app pesa unos bytes y pasa cuando una llamada no pasa. Eliges entre estoy bien, necesito ayuda o estoy en camino, y tu red lo ve.

VES QUIÉN RESPONDIÓ Y QUIÉN NO
Tu red aparece en una sola pantalla con el estado de cada persona. Quien todavía no contestó se ve distinto de quien dijo que está bien: es la diferencia entre quedarte tranquilo y saber a quién llamar primero.

Y si a alguien de tu red no le van a llegar los avisos —porque no dio el permiso o cambió de teléfono— te lo decimos antes de que haga falta, no después.

TU UBICACIÓN, SOLO CUANDO IMPORTA
La app toma tu ubicación una vez al configurarla y otra vez después de cada sismo que te afecta, aunque esté cerrada. Nada más. No registra tu recorrido ni te sigue el resto del tiempo. La ven únicamente los contactos que aceptaste, y si no la tenemos, lo decimos: nunca mostramos una posición vieja como si fuera de ahora.

AVISOS SEGÚN TU ZONA
Eliges el radio y la magnitud mínima. Seguimos el catálogo del IGP y del USGS todo el día, y te avisamos cuando un temblor entra en tus criterios, con la app cerrada.

CHAT CON TU RED
Para lo que no cabe en un estado: dónde estás, qué necesitas, dónde se ven. Individual con cualquiera de tu red, y uno en cada grupo.

GRUPOS: CASA, FAMILIA, TRABAJO
Tu red en subconjuntos con nombre, cada uno con su chat. Cuando tiembla ves «Casa 4/5» y «Familia 8/11» en vez de una lista plana de treinta caras: es la diferencia entre «faltan dos de mi casa» y «faltan doce conocidos». Dos grupos gratis, ilimitados con Premium.

Estar en un grupo no conecta a nadie: ves los nombres y se escriben, pero el estado y la ubicación siguen siendo de a dos y necesitan que ambos se acepten. Nadie puede meterte en un grupo y darle tu ubicación a un desconocido.

SIMULACROS
Tres simulacros guiados, gratis, para que la primera vez que uses la app de verdad no sea durante un terremoto. Solo, o con un grupo entero.

Mientras dura hay una franja amarilla que dice SIMULACRO, el aviso que reciben los demás dice que es una práctica, y si tiembla de verdad el simulacro se cierra solo.

TIPS DE PREPARACIÓN
Con la fuente citada en cada uno: INDECI, Cruz Roja Peruana e Instituto Geofísico del Perú.

PREMIUM (opcional)
Cuando el sismo te toca a ti, la app funciona completa sin pagar: tu alerta, tu red, el aviso de que alguien pidió ayuda y el de que alguien no respondió nunca dependen de que pagues.

Premium sirve para lo contrario: los sismos que NO te tocan a ti. Te avisa cuando alguien de tu red reporta que está bien, y también si pasan veinte minutos y no reporta. Cada aviso te dice de qué sismo habla —magnitud y lugar—, para que se entienda solo. Eso es Guardián.

Agrega además avisos de sismos de todo el mundo, grupos y simulacros ilimitados, y hasta cinco planes de acción con nombre: casa, trabajo, colegio.

Tu familia no necesita pagar nada ni enterarse: Premium es tuyo, y sirve para saber de ellos.

LO QUE NO HACE, DICHO ANTES DE QUE LO PREGUNTES
- No avisa antes del sismo. No es alerta temprana.
- No detecta sismos por su cuenta: depende de que el IGP o el USGS los publiquen.
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

Las ocho, en orden, y qué tiene que verse en cada una:

| # | Pantalla | Qué demuestra | Texto sugerido encima |
|---|---|---|---|
| 1 | Home en modo alerta, con el sismo arriba y la red debajo | El producto en el momento para el que existe | «Tembló. ¿Están todos bien?» |
| 2 | Red con estados mezclados: dos en verde, uno en ámbar, uno sin confirmar | El valor real: ver quién falta | «Ves quién respondió y quién no» |
| 3 | **Grupos**, con el desglose «Casa 4/5 · Familia 8/11» y el chat del grupo debajo | Que la red no es una bolsa plana. Contesta la pregunta que deja la captura 2: *«¿y si tengo treinta contactos?»* | «Faltan dos de tu casa, no doce conocidos» |
| 4 | Los cuatro estados / «Estoy bien» | Lo que hace el usuario | «Un toque, y tu gente lo sabe» |
| 5 | Detalle de contacto con el mini mapa | La ubicación, con su límite | «Su ubicación después del sismo. No antes, no siempre» |
| 6 | Ajustes de radio y magnitud | Control del usuario | «Tú eliges qué te despierta» |
| 7 | Simulacro, **con la franja amarilla visible** | Que se puede probar sin un terremoto, y que no se confunde con uno | «Practica antes de necesitarlo» |
| 8 | Noticias, con la lista de sismos de Perú y la del mundo | Que hay contenido todos los días, no solo cuando tiembla fuerte | «Los sismos del IGP, y los del mundo» |

**Por qué los grupos entran como captura y no como línea de la descripción.** Es la función más
nueva (migraciones 0031-0034) y la única que **no se entiende leyéndola**: «subconjuntos con
nombre de tu red» suena a organización de contactos, que es aburrido y además no es el punto. El
punto es el desglose durante un sismo, y eso se ve en un segundo y no se explica en un párrafo.

> ⚠️ **La franja amarilla del simulacro tiene que salir en la captura 7.** Es la prueba en imagen
> de que la app no puede hacerle creer a nadie que tembló de verdad — el §4 de los términos lo
> prohíbe y App Review lo mira. Una captura de simulacro sin la franja parece una alerta falsa.

**Por qué la lista de sismos va última y no antes.** Es la pantalla que contesta «¿y qué
hago con esta app un martes cualquiera?», y eso importa: sin ella la app parece algo que se
abre una vez al año. Pero **no es la promesa** — un catálogo de sismos lo tienen el IGP y una
docena de apps gratis. Ponerla arriba invita a compararnos con ellas, que es la comparación
que perdemos. Va al final, como razón para no desinstalar.

> El texto dice **«los sismos del IGP»** y no «alerta de sismos» a propósito: nombrar la
> fuente es exacto y además es la palabra que la gente busca en Perú. Ver §8 de
> `QUE-PROMETE-LA-APP.md` para por qué «alerta» a secas está prohibida en la ficha.

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
