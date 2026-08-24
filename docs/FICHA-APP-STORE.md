# Ficha de App Store — texto listo para pegar

Todo lo que pide App Store Connect en **App Information** y en **iOS App → Version
Information**, escrito y contado. Escrito el **2026-08-24**.

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
sismo,terremoto,temblor,IGP,familia,emergencia,contactos,ubicacion,simulacro,Peru,aviso,circulo
```

95 / 100. Tres decisiones detrás:

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

```
Todos Bien no es una alarma sísmica. Es la app para los minutos después del sismo.

El aviso llega unos minutos después de que tiembla, cuando el Instituto Geofísico del Perú publica el evento. No te avisa antes de que tiemble: para eso está el SASPe, con sirenas. Lo que hace esta app es lo que hace falta cuando ya tembló y las líneas están saturadas.

CON UN TOQUE, TU GENTE SABE QUE ESTÁS BIEN
Después de un sismo todos llaman a la vez y la red se cae. Un toque en la app pesa unos bytes y pasa cuando una llamada no pasa. Eliges entre estoy bien, necesito ayuda o estoy en camino, y tu círculo lo ve.

VES QUIÉN RESPONDIÓ Y QUIÉN NO
Tu círculo aparece en una sola pantalla con el estado de cada persona. Quien todavía no contestó se ve distinto de quien dijo que está bien: es la diferencia entre quedarte tranquilo y saber a quién llamar primero.

TU UBICACIÓN, SOLO CUANDO IMPORTA
La app toma tu ubicación una vez al configurarla y otra vez después de cada sismo que te afecta, aunque esté cerrada. Nada más. No registra tu recorrido, no guarda un historial y no te sigue el resto del tiempo. La ven únicamente los contactos que aceptaste, y si no la tenemos, lo decimos: nunca mostramos una posición vieja como si fuera de ahora.

AVISOS SEGÚN TU ZONA
Eliges el radio y la magnitud mínima. Seguimos el catálogo del IGP y del USGS todo el día, y te avisamos cuando un sismo entra en tus criterios, con la app cerrada.

CHAT CON TU CÍRCULO
Para lo que no cabe en un estado: dónde estás, qué necesitas, dónde se ven.

SIMULACROS
Tres simulacros guiados, gratis, para que la primera vez que uses la app de verdad no sea durante un terremoto.

TIPS DE PREPARACIÓN
Con la fuente citada en cada uno: INDECI, Cruz Roja Peruana e Instituto Geofísico del Perú.

PREMIUM (opcional)
La app funciona completa sin pagar. Premium agrega avisos de sismos fuertes en cualquier parte del mundo, simulacros ilimitados y varios planes de acción, uno por situación: casa, trabajo, colegio.

LO QUE NO HACE, DICHO ANTES DE QUE LO PREGUNTES
- No avisa antes del sismo. No es alerta temprana.
- No detecta sismos por su cuenta: depende de que el IGP o el USGS los publiquen.
- Sin internet no llega ningún aviso.
- No garantiza la entrega: Apple entrega las notificaciones con el mejor esfuerzo.
- No reemplaza llamar a emergencias. No contacta bomberos, PNP ni INDECI.
- No comparte tu ubicación con nadie fuera de tu círculo, ni la usa para publicidad.

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

> ⚠️ **Esto es trabajo de código que todavía no existe.** El chat es solo entre contactos
> que ambos aceptaron y cualquiera puede eliminar la conexión, lo cual es un argumento
> razonable —bloquear existe, se llama «eliminar contacto»—, pero no hay **denunciar**. Ver
> `QUE-FALTA.md`; hay que decidirlo antes de enviar, no durante la revisión.

Clasificación esperada: **4+**.

---

## 5 · Capturas de pantalla

Apple exige, como mínimo, el juego del iPhone más grande; los tamaños menores se derivan de
ese si no se suben aparte. **Confirmar los tamaños vigentes en App Store Connect al subir**,
que cambian con cada generación de iPhone.

Las seis, en orden, y qué tiene que verse en cada una:

| # | Pantalla | Qué demuestra | Texto sugerido encima |
|---|---|---|---|
| 1 | Home en modo alerta, con el sismo arriba y el círculo debajo | El producto en el momento para el que existe | «Tembló. ¿Están todos bien?» |
| 2 | Círculo con estados mezclados: dos en verde, uno en ámbar, uno sin confirmar | El valor real: ver quién falta | «Ves quién respondió y quién no» |
| 3 | Los cuatro estados / «Estoy bien» | Lo que hace el usuario | «Un toque, y tu gente lo sabe» |
| 4 | Detalle de contacto con el mini mapa | La ubicación, con su límite | «Su ubicación después del sismo. No antes, no siempre» |
| 5 | Ajustes de radio y magnitud | Control del usuario | «Tú eliges qué te despierta» |
| 6 | Simulacro | Que se puede probar sin un terremoto | «Practica antes de necesitarlo» |

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
| Keywords | `earthquake,quake,tremor,family,safety,check in,emergency,location,drill,USGS,alert,circle` | 89 / 100 |

> `alert` sí puede ir en inglés: no arrastra el significado de alerta temprana que «alerta
> sísmica» tiene en Perú. Lo que **no** puede aparecer en ningún idioma es *early warning*.

---

## 7 · Antes de dar «Submit»

- [ ] La descripción no dice «durante el sismo» en ninguna parte
- [ ] La descripción no dice «alerta sísmica» ni «alerta temprana» como algo que la app haga
- [ ] Los precios que se ven en el sitio coinciden con los productos de App Store Connect
- [ ] Las capturas no muestran datos de personas reales
- [ ] Está resuelto el punto de moderación de §4
