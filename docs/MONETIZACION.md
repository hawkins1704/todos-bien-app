# Monetización: qué se cobra, por qué, y a quién

Escrito el **2026-08-25**. Es la decisión de producto detrás de Premium.

> 🔴 **Revisado a fondo el 2026-09-08, y el cambio es de tesis, no de detalle.** El documento
> estaba construido sobre la diáspora —el comprador vivía en Madrid o Miami— y **el foco pasó a
> ser el mercado peruano**. Lo que se movió: §2 (quién paga), §3.1 (el escenario que sostiene
> el precio), §6 (de «multipaís» a «Perú primero»), y §10 ítem 6, descartado.
>
> Se agregó §7 con la decisión sobre **mochilas de emergencia**, que empezó como «qué le
> regalamos a los Premium» y terminó en lo contrario: no se regala, se vende.
>
> **Nada de esto tocó código.** Los precios, el corte gratis/Premium y las migraciones siguen
> igual — lo que cambió es a quién se le vende y con qué argumento.

`QUE-PROMETE-LA-APP.md` §7 dice qué se puede **afirmar** sobre Premium en público; este
archivo dice **por qué está cortado así**. Si cambia el corte, cambia primero acá y después
allá.

---

## 1 · La regla, en una línea

> **Gratis es que me avisen a mí y yo pueda avisar. Premium es enterarme de lo que le pasa
> a los míos.**

Ninguna persona queda menos segura por no pagar: la que está en el sismo recibe exactamente
la misma alerta y reporta su estado igual. Lo que se compra es **información sobre otro**,
que no es la seguridad de nadie.

**Prueba para cualquier función futura:** *si esta función no existiera para alguien que no
paga, ¿estaría esa persona en más peligro?* Si la respuesta es sí, va en gratis. Sin
excepciones, aunque sea la que mejor convertiría.

---

## 2 · El error que hay que no repetir: el que paga no es el que está protegido

El adolescente no paga. El padre de 70 años no paga. La que paga es **la que se queda
mirando el teléfono**: la madre, **el hijo que se mudó a Lima**, la que armó el grupo familiar.

> **Revisado el 2026-09-08.** Este párrafo decía «el hijo que vive afuera» y con eso el
> documento entero se fue detrás de la diáspora. El comprador de verdad está **dentro del
> Perú**: es el que se vino a Lima y dejó a sus papás en Arequipa, Cusco, Piura o Trujillo.
> Es el mismo dolor —no enterarte de que tembló donde está tu gente— pero el mercado es de
> otro tamaño, y no exige que la app se venda en nueve tiendas para funcionar. Ver §6.

Esa persona **ya tiene la necesidad** antes de que le vendas nada. No hay que fabricársela —
y en una app de seguridad, fabricar necesidad es fabricar miedo, que se paga con
desinstalaciones y con reseñas que no se borran.

La app ya estaba construida para esa persona sin haberlo cobrado: `notify_silent_contacts`
(`0015_social_notifications.sql`) le avisa **a la red del que se quedó callado**. El
producto ya servía al que se preocupa; faltaba ponerle precio.

### 2.1 · Un modelo que se descartó, y por qué

Se evaluó **«comprás Premium y lo tiene tu red entera»**. Se cae solo: un pago equipa a
50 personas, y cada una puede ser el centro de otra red de 50.

El diagnóstico importa más que el descarte: ese modelo hacía que el valor de Premium
**bajara** cuando la red crecía. Tiene que ser al revés — **mientras más gente te
importa, más razones tenés para pagar**. Cualquier idea futura se mide con eso.

La corrección es que **nada se propaga**: Premium es individual, y lo que compra son
funciones que operan **sobre** tus contactos sin que tus contactos necesiten nada. Agregás
50 contactos y ninguno recibe Premium; vos tenés 50 razones más para pagarlo.

---

## 3 · El corte

### Gratis — el núcleo completo, sin recortes

| Función | Por qué es gratis |
|---|---|
| Alerta cuando tiembla cerca tuyo | Es la razón de existir de la app |
| Los 4 estados y el tablero de la red | Avisar que estás bien no se cobra |
| Captura automática de ubicación | Es la promesa central |
| Chat individual **ilimitado**, con cualquiera de tu red | Cobrarlo sería cobrar la coordinación, que es la app entera |
| Red **ilimitada** | Prometido en la landing, y cobrarlo sería cobrar seguridad |
| **«María no responde»** a los 20 min, **si el sismo también te llegó a ti** | **La señal de que algo salió mal es gratis.** Este corte es lo que hace legítimo todo lo demás |
| **«María está bien»** cuando reporta, **si el sismo también te llegó a ti** | La contraparte de la anterior, y faltaba (migración 0027). Dentro de tu propio sismo la app te mandaba **solo malas noticias** |
| 1 plan de acción · 3 simulacros · noticias del país | |

### Premium — todo es «vigilar a los míos»

| Función | Estado |
|---|---|
| **Guardián** · «María está bien» y «María no responde» **cuando el sismo NO te alcanzó a ti** | ✅ existe (migración 0030) |
| Avisos y feed de sismos en el mundo | ✅ existe |
| **Simulacros ilimitados**, solos o con un grupo | ✅ existe (migración 0035) |
| Hasta 5 planes de acción con nombre | ✅ existe (migración 0024) |
| **Grupos ilimitados** — gratis son 2 | ✅ existe (migraciones 0031 y 0034) |
| SMS al que no responde | ⏳ más adelante, y es el mejor candidato — ver §3.3 |

**Guardián es el único que importa.** Los otros eran relleno de lista, y esa frase envejeció a
medias: **el simulacro grupal dejó de serlo** (0035). Ver §3.2.2.

> **Los grupos son la excepción parcial, y por eso el tope está donde está.** Cumplen la
> prueba de §2.1 mejor que cualquier otra función: **mientras más gente te importa, más grupos
> necesitas**. Con 6 contactos, dos alcanzan y sobran; con 30 repartidos entre casa, familia y
> trabajo, dos es exactamente donde empieza a molestar. El tope no recorta nada de seguridad —la
> red sigue siendo ilimitada y todos los avisos son idénticos—, solo la comodidad de leer el
> tablero ordenado en un sismo y de tener un chat por frente.

##### La objeción a este tope, y por qué se aceptó igual (2026-09-01)

Desde la 0034 un grupo **tiene chat**, y la app promete en el propio botón de Premium que *«el
chat no depende de Premium»*. Limitar los grupos roza esa frase: con el cupo lleno, lo que no
puedes abrir es un chat grupal más.

Se evaluó mover el gancho al **simulacro grupal** —«ensaya con tu familia entera, no solo
contigo»— y dejar los grupos libres. Se decidió no elegir entre los dos: el simulacro grupal se
construyó ese mismo día (0035) y **quedó con los 3 gratis**, por el motivo de §3.2.2. Así que el
tope de grupos sigue siendo el gancho, y el simulacro grupal es lo que hace que alguien quiera
llegar a él.

**Cómo se sostiene la frase sin mentir**, y es lo que hay que escribir en la venta:

- el chat **individual** es ilimitado y gratis, con cualquiera de tu red;
- puedes estar en **todos** los grupos que quieras — el tope cuenta los que **creas**;
- y los 2 gratis cubren de sobra el caso que la app existe para resolver: la casa y el trabajo.

Lo que Premium compra no es «hablar con más gente», es **coordinar más frentes a la vez**. Si
alguna vez hay que elegir entre este tope y la frase, gana la frase.

#### 3.2.1 · Dónde se ofrece Premium, y por qué ahí

**En el momento en que la persona intenta hacer algo, no antes.** Los dos topes con función
gratuita —grupos y planes de acción— muestran su botón de crear **siempre**, con el cupo
lleno o vacío, y es al tocarlo cuando aparece el paywall.

Hasta el 2026-09-01 hacían lo contrario: al llegar al tope el botón desaparecía y en su lugar
salía una tarjeta explicando el límite. Suena razonable y es peor por dos motivos:

1. **Una función que no se ve no la compra nadie.** La tarjeta explica el límite a alguien que
   ya dejó de intentar.
2. **Un botón que desaparece no se lee como un límite, se lee como un bug.** Es la reacción que
   tuvo la primera persona que lo probó, y esa reacción no vende, desconfía.

Con el botón puesto, la secuencia es la que convierte: **intento → obstáculo → oferta → y al
comprar, la app termina lo que estabas haciendo** (abre el formulario del grupo, o el editor
del plan). La oferta llega cuando el deseo ya existe y está medido por la propia persona.

Es el mismo criterio que la pestaña **Global** de Sismos, que se muestra con candado en vez de
esconderse. Mecánica en `src/hooks/use-paywall.ts`; el porqué, en `ESTADO-DEL-PROYECTO.md`
§1.9.1.0.

#### 3.2.2 · El simulacro grupal, y por qué NO se cobra desde el primero

Se evaluó hacerlo Premium de entrada —«ensaya con tu familia entera, no solo contigo» es la
mejor frase de venta que tiene el producto— y se descartó. El motivo:

> **El simulacro grupal es la mejor demostración que tiene la app de sí misma.** Es el momento
> en que una familia entera *siente* para qué sirve: llegan los avisos, cada uno reporta, y en
> la pantalla se ve a los cuatro cambiando de color. Cobrarlo desde el primero significa que
> quien pagaría **nunca llega a verlo**.

Así que los **3 gratis sirven para individuales o grupales, indistintamente**. Que lo corran
tres veces y después choquen con el muro es exactamente cuándo se paga, y encaja con la regla
de §2.1: quien tiene un grupo familiar y quiere practicar cada trimestre paga en el cuarto.

**Dos reglas del cupo, y las dos tienen el mismo motivo de fondo:**

- **Cuenta lo que CONVOCAS.** Participar es gratis e ilimitado. Si gastara cupo, quien arma el
  grupo estaría gastando el de los demás: corre tres y su familia se queda en cero sin haber
  decidido nada, y choca con un paywall que no disparó. Es la misma forma del problema que ya
  resolvió el tope de grupos de la 0034.
- **Se descuenta al INICIAR, no al terminar.** Antes se contaba al completar, así que se podía
  empezar y abandonar sin gastar nada — con grupales, un agujero. Una regla sola, sin letra
  chica, y el botón la dice: *«Vas a usar 1 de tus 3 simulacros»*.


### 3.3 · Qué se le quitó a Guardián el 2026-08-31, y por qué

Guardián incluía además **«Tembló cerca de María»**: un aviso al minuto 0, con nombre y
distancia, para quien estaba fuera de la zona. Se retiró (migración 0030) por dos razones:

1. **No se podía explicar.** Su valor dependía de una condición que el usuario **no puede ver
   ni verificar** —¿este sismo también me alcanzó a mí?—, que a su vez depende del radio, la
   magnitud mínima, la magnitud nacional y el `country_code`. Enunciarlo bien exigía leer
   cuatro migraciones. **Un beneficio que no entra en una frase no se vende**, y peor: se
   recibe sin entender por qué llegó.
2. **Quedó redundante.** Desde que la noticia nacional llega a todos sin importar dónde esté
   la persona, cualquiera se entera de que hubo un M4,5+ en el Perú. «Tembló cerca de María»
   pasó a ser una versión más precisa de algo que ya llegaba gratis.

**Lo que quedó es lo único que no se sustituye con nada**, porque hace falta saber quién es tu
gente: enterarte de que **reportaron, o de que no reportaron**, aunque a ti el sismo no te
haya tocado. Ninguna noticia ni ningún catálogo puede darlo.

> **La condición que lo hace posible:** sin el aviso de apertura, un «María está bien» a quien
> nunca supo que tembló sería un sobresalto. Por eso **cada aviso hacia fuera de la zona nombra
> el sismo** (magnitud y lugar). Si alguna vez se agrega un tercer aviso de esta familia, esa
> regla no es opcional.

**Lo que esto deja pendiente, dicho sin adornos:** Premium quedó más chico. El candidato para
darle peso es el **SMS/llamada al que no responde** — una frase, ningún tipo de notificación
nuevo, y con costo marginal real, que es la clase de Premium que nadie discute. Se construye
con usuarios adentro, no antes.

### ⚠️ El corte real es más filoso de lo que decía este documento

Verificado en el código el **2026-08-27**, probando con dos teléfonos. `notify_silent_contacts`
manda «X no responde» **solo a quien tiene entrega de alerta de ESE mismo sismo**
(restricción que puso la migración 0020, §1.13.5 de ESTADO). O sea:

| | Contacto **cerca** de ti | Contacto **lejos** de ti |
|---|---|---|
| **Gratis** | Alerta propia, «no responde» a los 20 min, y «está bien» cuando reporta | **Nada** |
| **Premium** | Igual | «Está bien» y «no responde» — **los mismos dos avisos, cruzando la zona** |

Este documento afirmaba antes que el aviso de los 20 minutos llegaba siempre. **Para el
escenario que abre §3.1 —Lima mirando a Arequipa— es falso: no llega nada.**

> 🔴 **Esta tabla se contradecía con §3.3 desde el 2026-08-31, y se corrigió el 2026-09-08.**
> La celda de abajo a la derecha decía **«Aviso al minuto 0 y el cierre»**, o sea prometía el
> aviso *«tembló cerca de María»* — que la migración **0030 eliminó**, y que §3.3 de este mismo
> documento explica largamente por qué se quitó.
>
> **Cómo pasó:** la tabla se escribió el 2026-08-27 verificando el código, y la 0030 llegó
> cuatro días después. Nadie volvió a esta celda. Es la trampa exacta que ya cuesta caro en este
> archivo: **una tabla verificada con fecha envejece igual que una sin verificar**, y la fecha
> de arriba («Verificado el 2026-08-27») la hacía parecer confiable.
>
> Lo bueno: `QUE-PROMETE-LA-APP.md` §7 —que es lo que manda en público— **nunca lo prometió**.
> El error vivió solo acá.

#### Inventario exacto de notificaciones, verificado en la base el 2026-09-08

Leído de los cuerpos de las funciones vivas, no de estos documentos. **Premium agrega
exactamente tres cosas**, y ninguna es un tipo de aviso nuevo:

| Notificación | ¿Premium? | Condición real |
|---|---|---|
| La **alerta del sismo** (modo emergencia) | Gratis | `quake_applies`: tu país + M ≥ umbral nacional, **o** dentro de tu radio + M ≥ tu mínima |
| «X **necesita ayuda**» | Gratis, **sin condición** | Red entera. No mira zona ni plan (`on_status_needs_help`) |
| «X **está bien**» · `contact_reported` | Gratis | Solo a quien recibió la alerta de **ese** sismo |
| 🔒 «X **está bien**» · `contact_is_safe` | **Premium** | Solo a quien **NO** la recibió, y `is_premium` |
| «X **no responde**» (20 min) | **Las dos** | Gratis si recibiste esa alerta · Premium si no (`notify_silent_contacts`) |
| Noticia **nacional** M ≥ 4,5 | Gratis | Tu país, si no te alertó ya |
| 🔒 Noticia **mundial** M ≥ 6,0 | **Premium** | `is_premium` + país distinto |
| Chat, solicitudes, «te sumaron a un grupo», simulacros | Gratis | — |

**La forma del corte, en una línea:** los dos avisos de estado existen en gratis y en Premium
con el mismo texto. Lo que se compra es que **crucen la frontera de la zona del sismo**. Por eso
en la base son dos tipos distintos con dos interruptores distintos.

> **Cuidado con confundir la alerta con la noticia** — comparten la palabra «mundial» y no son
> lo mismo:
>
> - **La alerta** (`quake_applies`) enciende el modo emergencia: tembló cerca de ti o fuerte en
>   tu país. Es **idéntica** en gratis y en Premium, a propósito, y es la promesa central de la
>   app. Premium no la toca.
> - **La noticia** (`notify_quake_news`) es enterarte de un sismo que **no** te tocó. Tu país
>   gratis; el resto del mundo, **Premium**.
>
> El aviso mundial pasa por **dos llaves en serie**: `is_premium` dentro de `notify_quake_news`,
> y el interruptor «Sismos en el mundo» de Ajustes, que es `notification_preferences.
> quake_worldwide` y lo aplica `enqueue_notifications`. Las dos existen y funcionan. La columna
> `user_settings.alert_worldwide_enabled` **no es ninguna de las dos**: está huérfana y no la lee
> nadie (deuda 1.17 de `QUE-FALTA.md`).

**Y lo que Premium NO hace, por si alguna vez tienta prometerlo:** no hay ningún aviso al minuto
0. `notify_guardians` **ya no existe en la base** — se comprobó buscándola. Premium avisa
**cuando la persona reporta**, no cuando tiembla.

> ⚠️ **`contact_is_safe` tiene cero filas en `notification_deliveries`, y eso NO es un
> problema.** Los datos de la verificación del 2026-09-01 se borraron el 2026-09-06 con la
> limpieza de sismos sembrados. La prueba de que funciona es `VERIFICACION-EN-DISPOSITIVO.md`
> **7b.4** —vista en dos teléfonos— más 7b.7 y 7b.9, que cierran el corte por los dos lados.
> **Contar filas de esa tabla no sirve para saber si un aviso funciona**; el detalle está allá.

> **La casilla de arriba a la izquierda se completó el 2026-08-28** (migración 0027), y hasta
> entonces le faltaba la mitad buena. Con el sismo alcanzándote a ti, «X no responde» llegaba
> y «X está bien» **no llegaba nunca**, ni pagando: el segundo colgaba de haber recibido la
> apertura de Guardián, que por diseño solo reciben los que están **fuera** de la zona. El
> efecto neto era que la app te mandaba solo malas noticias justo cuando estabas adentro del
> terremoto.
>
> Se arregló **del lado gratis a propósito**. Cobrarlo habría sido la salida obvia —es
> exactamente la clase de tranquilidad por la que alguien paga— y habría vuelto falsa la
> frase que este proyecto acababa de corregir en cuatro lugares públicos: *«cuando el sismo te
> toca a ti, todo es gratis»*. El precio no se sostiene sobre lo que le sacas a alguien que
> está en una emergencia; se sostiene sobre el escenario de la distancia (§3.1), que sigue
> intacto.

Las consecuencias son dos, y van en direcciones opuestas:

1. **A favor del precio.** Guardián no es «una notificación más»: es el **único canal que
   existe** para enterarte de un sismo que a ti no te alcanzó. Eso sostiene los S/ 79,90.
2. **En contra de la promesa pública.** La frase «la señal de que algo salió mal siempre es
   gratis» hay que decirla completa: es gratis **entre quienes compartieron el sismo**.
   Escribirla sin esa condición es venderle a quien está lejos —en Lima o en Miami, da igual—
   exactamente lo que no va a recibir. Ya se corrigió en `QUE-PROMETE-LA-APP.md` §7, que es la
   fuente de las afirmaciones públicas.

### 3.1 · El hueco de 20 minutos, que es el producto entero

El reparto de alertas se dispara **solo por la posición propia** (`0010_alert_fanout.sql`,
`private.quake_applies`). Consecuencia hoy:

> Son las 3 AM. Vives en Lima. Tiembla M6,8 en **Arequipa**, y tu mamá está ahí.
> **No recibes absolutamente nada** hasta el minuto 20, y solo si ella no reporta.

Gratis te dice cuando algo salió mal. Premium te deja **acompañar el evento** desde el
minuto 0. Nadie puede acusar al producto de esconder lo importante detrás del pago.

> **El escenario se reescribió el 2026-09-08, y el cambio no es cosmético.** Antes abría con
> *«son las 3 AM en Madrid»*. Es el mismo mecanismo —mil kilómetros son mil kilómetros, y un
> sismo en Arequipa no llega a Lima igual que no llega a Madrid— pero **Lima↔provincia es el
> mercado y Madrid es el caso raro**, no al revés.
>
> Importa porque este párrafo es el que sostiene el precio: si el único comprador imaginable
> vive afuera, Premium depende de vender en nueve tiendas y de que la diáspora encuentre la
> app. Con la versión doméstica, el mismo producto se vende **en el Perú, en español, a quien
> ya vive acá**. No cambió una línea de código: cambió a quién describe.
>
> **Dónde quedó el escenario viejo.** `0022_guardian_alerts.sql` y `0027_reportes_en_zona.sql`
> ya se reformularon (solo el ejemplo del comentario; ninguna toca comportamiento). Las
> entradas de la bitácora de `ESTADO-DEL-PROYECTO.md` anteriores al 2026-09-08 **se dejan
> hablando de Madrid a propósito**: eran ciertas cuando se escribieron y reescribir un
> registro con fecha es falsearlo. El cambio está anotado en la bitácora del 2026-09-08.

### 3.2 · Dos límites que van escritos en el paywall, no escondidos

- **Si tu contacto nunca dio permiso de ubicación, no hay Guardián para él.** Es el mismo
  callejón de ESTADO §1.6.3.1. Decirlo antes es más barato que un reembolso.
- **El aviso de cierre no es opcional.** Vender solo la mala noticia («tembló cerca de
  María») sin la buena («María dice que está bien») fabrica ansiedad y se desinstala. Hoy
  **solo `contact_needs_help` notifica** (`0015:328`); «estoy bien» no manda nada a nadie.
  Los dos van juntos o no va ninguno.

---

## 4 · Precio

Fijados el **2026-08-25** con los tramos que ofrece App Store Connect:

| | Antes | Ahora | Por qué |
|---|---|---|---|
| Mensual | S/ 5 | **S/ 9,90** | Es el señuelo que hace obvio el vitalicio |
| Anual | — | **S/ 59,90** | La mitad que pagar mes a mes (12 × 9,90 = 118,80). **No es una promoción**: es aritmética, y no hay meses de regalo en ningún plan |
| **De por vida** | S/ 29 | **S/ 79,90** | **El héroe.** S/29 eran ~8 dólares por cuidar a tu familia para siempre: estaba regalado |

En una app que se abre tres veces al mes, **el vitalicio es el producto**. Un mensual barato
se lo come: cualquiera hace la cuenta de que en seis meses le convenía el otro.

### 4.1 · Por qué 79,90 y no 99,90

Los dos tramos estaban disponibles y se eligió el bajo, por una razón que conviene tener
escrita porque dentro de un año va a parecer plata dejada sobre la mesa:

**A 79,90 el anual deja de tener sentido, y eso es exactamente lo que se busca.** Son 1,33
años de la suscripción anual: quien está considerando pagar S/59,90 todos los años elige el
pago único casi siempre. A 99,90 la distancia es de 1,67 años y el anual se vuelve una
alternativa real — y el anual es **peor negocio** acá, porque en una app de uso bajo la
renovación no se puede dar por hecha.

El otro motivo es que se lanza **sin una sola reseña**. Los primeros cien compradores apuestan
a una app desconocida, y S/79,90 baja esa apuesta más de lo que parece la diferencia de S/20.
Subir el precio después es fácil —quien compró el vitalicio lo conserva—; bajarlo tras el
lanzamiento se lee como que el producto no funcionó.

**El anual se deja igual**, aunque convenga menos: es el señuelo que hace que el vitalicio se
vea obvio, y recoge a quien no le compra «para siempre» a una app que recién conoce.

**Small Business Program de Apple:** con menos de un millón de dólares al año, la comisión
baja del 30 % al 15 %. Es un formulario y duplica el margen sin tocar código.

---

## 5 · Dónde se vende

**Nunca durante la emergencia.** Además de indecente, es el momento exacto en que alguien
escribe la reseña de una estrella que define la app para siempre.

Los dos momentos limpios:

1. **Cuando la alerta cierra y todos respondieron.** Alivio, con el susto todavía fresco:
   *«Todos respondieron. La próxima, ¿te avisamos apenas tiemble donde está tu gente?»* Es
   la conversión más alta que la app va a tener.
2. **7 días de Premium regalados** a quien estuvo en el radio de un sismo real. Nadie prueba
   Premium en una semana tranquila porque no pasa nada; en la semana de las réplicas lo usa
   todos los días. Es una prueba atada a un motivo verdadero, no un truco.

Y lo que conviene tener presente al decidir cuánto recortar el plan gratuito: **cada sismo
real es una demostración en vivo de la app funcionando.** El plan gratuito no es el costo de
adquirir usuarios — **es el marketing**.

---

## 6 · Perú primero — y qué queda del multipaís

> 🔴 **Reescrito el 2026-09-08.** Este capítulo se llamaba «Multipaís sí, multilenguaje no» y
> ponía a la diáspora en el centro. **El foco es el mercado peruano**, y la diáspora pasa de
> tesis a rendimiento extra.
>
> **Por qué importa más de lo que parece un cambio de énfasis:** con la diáspora de tesis, el
> negocio dependía de nueve fichas de tienda, de que un peruano en Miami buscara «sismos Perú»
> en inglés, y de una adquisición que este proyecto no sabe hacer ni tiene con qué pagar. Con
> Perú de tesis, el canal es un país donde **cada sismo real es la campaña** (§5) y donde el
> boca a boca ocurre entre gente que se ve.
>
> **Lo que NO cambia, y conviene decirlo para no romper nada:** la disponibilidad territorial
> de §6.2 se queda como está —estar publicado en nueve tiendas no cuesta nada y no hay razón
> para retirarse—, y el español sigue siendo el único idioma. Lo que se cae de la lista de
> pendientes es **escribir fichas distintas para las tiendas de afuera** (§10, ítem 6): eso era
> trabajo al servicio de la tesis vieja.
>
> **Y una consecuencia técnica que ya estaba tomada:** `0045_en_peru_manda_el_igp.sql` cita
> este §6 para justificar que Perú **siga visible en el feed Global**. La decisión no cambia
> —para el usuario en Perú es redundante pero inofensivo, y para el que sí está afuera es lo
> único que le muestra su país— así que **no hay código que tocar**. Se anota acá para que
> nadie «limpie» esa migración leyendo el §6 nuevo.

**El que paga es peruano y vive en el Perú.** Está en Lima y su gente está en provincia, o al
revés. Lee español y no necesita ninguna traducción.

Traducir al inglés sirve para un mercado distinto —venderle a japoneses o estadounidenses
una app de sismos locales— y hoy eso no se puede cumplir (ver abajo). Son dos apuestas
distintas y no hay que mezclarlas. **v1 sale solo en español.** Esto revisa lo que decía
`ALCANCE-Y-IDIOMAS.md`.

### 6.1 · El límite honesto: el IGP solo cubre Perú

Fuera de Perú la alerta propia depende del USGS, que este proyecto ya midió: **3 sismos
detectados contra 23** del IGP, y publicados **16-18 minutos** tarde (ESTADO §1.6.3).

> **Esta medición es, además, el mejor argumento a favor de Perú primero.** La app es
> excelente en un solo país y mediocre en todos los demás, porque su ventaja es una fuente de
> datos nacional que nadie más integra. Enfocarse en el Perú no es replegarse: es dejar de
> vender fuera del único sitio donde el producto es claramente el mejor.

Por eso la app **no se abre «al mundo»**. Si un español la instala esperando una app de sismos
para España, recibe un producto malo y deja una reseña que no se borra.

> **La ficha aparte para las tiendas de afuera quedó descartada el 2026-09-08** (§10, ítem 6).
> Se guarda acá el texto que se había escrito, por si alguna vez se retoma — pero escribirlo y
> mantenerlo era trabajo al servicio de la tesis de la diáspora, y las tiendas de afuera hoy
> muestran la misma ficha peruana:
>
> > *Para peruanos en el exterior. Entérate cuando tiemble donde está tu familia en Perú, en el
> > momento, y mira quién ya respondió.*
>
> El riesgo que esto deja abierto es real y se acepta a sabiendas: un usuario fuera del Perú lee
> una ficha que le habla de sismos en el Perú y puede esperar cobertura local. Lo acota que la
> app está **solo en español** y que su nombre y su copy hablan del Perú.

### 6.2 · Disponibilidad territorial

| Ahora | Después |
|---|---|
| **Perú**, **EE.UU.** (la diáspora más grande), Chile, Argentina, Bolivia, Ecuador, Colombia, México, Brasil, **Japón** | **España e Italia** |

España queda para después por una razón concreta: **distribuir en la Unión Europea exige
declarar «trader status»**, y Apple publica nombre, dirección y teléfono del desarrollador
en la ficha pública. El RUC 10730426548 es de persona natural sin domicilio fiscal, así que
entrar a la UE hoy significa publicar una dirección particular.

> ⚠️ Verificarlo en App Store Connect antes de decidir: estas reglas cambian seguido.

Es una pena porque España es el segundo destino de la diáspora, pero EE.UU. solo cubre el
pedazo más grande y no tiene ninguna de estas fricciones. Sumar la UE después es una
casilla, no un release.

---

## 7 · La mochila de emergencia: qué conviene y qué no

Evaluado el **2026-09-08**, con una cotización real de **S/ 40** por pack (mochila + botiquín).
La idea original era regalarlo a los suscriptores Premium, quizá a cambio de referidos.

### 7.1 · El número que decide todo

Lo que entra por una venta **no es el precio de lista**. Descontando IGV y comisión de tienda
con Small Business Program (§4):

| | Cliente paga | −IGV 18 % | −Comisión 15 % | **Entra** |
|---|---|---|---|---|
| Mensual | S/ 9,90 | 1,51 | 1,26 | **S/ 7,13** |
| Anual | S/ 59,90 | 9,14 | 7,61 | **S/ 43,15** |
| **De por vida** | S/ 79,90 | 12,19 | 10,16 | **S/ 57,55** |

Y lo que sale **no son S/40**, porque el pack tiene que llegar a una puerta:

| | Lima | Provincia |
|---|---|---|
| Mochila + botiquín | 40 | 40 |
| Envío (motorizado / Shalom · Olva) | 14 | 22 |
| Empaque y etiqueta | 3 | 3 |
| **Costo puesto en la puerta** | **S/ 57** | **S/ 65** |

> ### 🔴 El pack cuesta lo mismo que gana la venta más cara del catálogo
>
> **S/57–65 de costo contra S/57,55 de ingreso neto por vitalicio.** Regalar un pack por
> suscriptor no es margen bajo: es margen **cero o negativo**, y encima con trabajo de
> logística encima. El anual (S/43,15) no alcanza ni para pagar el pack.
>
> Esto no se arregla negociando el pack a S/35. Se arregla **no regalándolo**.

⚠️ **Verificar el supuesto del IGV antes de decidir precios finales.** El cálculo asume que el
precio de tienda incluye el IGV peruano del 18 % y que la tienda lo remite. La cifra exacta
está en la columna **Proceeds** de App Store Connect: si ahí dice otra cosa, toda esta tabla se
recalcula. El orden de magnitud —el pack cuesta cerca del 100 % del ingreso— no cambia.

### 7.2 · Las cinco formas de hacerlo mal

| | Por qué no |
|---|---|
| **Incluirlo en un plan** | §7.1. Y rompe §1: un botiquín **es** equipo de seguridad, así que ponerlo detrás del pago es exactamente lo que este documento prohíbe en su primera línea |
| **Regalarlo por 1 referido** | 2 vitalicios dejan S/115,10 y el pack se lleva S/57: **la mitad del negocio** por una venta que quizá igual ocurría |
| **Prometerlo dentro del vitalicio** | Es una obligación de entrega **sin fecha de vencimiento**. 500 vitalicios vendidos con mochila incluida son 500 reclamos el día que no puedas despachar, y en el Perú eso llega a Indecopi |
| **Venderlo por compra in-app** | Apple 3.1.5(a) prohíbe bienes físicos por IAP. Tiene que ser checkout web — que además está permitido enlazar desde la app |
| **Ponerlo en el paywall como razón para suscribirse** | Apple puede leer la suscripción como compra parcial de un bien físico, y te crea deber de entrega frente a **todos** los que compren |

### 7.3 · Lo que sí conviene, en el orden en que conviene

**Ahora — sorteo mensual entre suscriptores Premium.** Cero código.

Una mochila al mes. El costo es **fijo en S/57–65 mensuales tengas 50 o 50 000 suscriptores**,
que es exactamente lo contrario de un beneficio por suscriptor. Se paga con **una sola venta
vitalicia extra al mes** (57,55 ≈ el costo de un pack).

Lo que de verdad compra no es conversión, es **prueba social**: §4.1 dice que la app se lanza
*«sin una sola reseña»*, y una foto al mes de alguien real recibiendo su mochila es el
contenido que hoy no existe. El ganador sale de la base a mano y la dirección se pide por
correo — **no hace falta ni la pantalla de reclamo**.

**Después — venderla, con descuento Premium.** Cuando haya volumen que justifique inventario.

| | Precio | Costo | Margen |
|---|---|---|---|
| Público | S/ 129 | 57 | **S/ 72** |
| **Premium** | S/ 89 | 57 | **S/ 32** |

*(Provincias +S/10, que cubre la diferencia de envío.)*

El argumento de venta es aritmético, que es como se argumenta en este proyecto: **Premium
cuesta S/79,90 una sola vez y el descuento del pack es S/40. Con dos mochilas, Premium ya se
pagó solo.**

Y pasa la prueba de §2.1 —la que descartó el modelo de red compartida— mejor que cualquier
función: **mientras más gente te importa, más packs necesitas**. Uno para tu mamá en Arequipa,
otro para tu hermana en Trujillo. El beneficio **escala con el tamaño de tu red**, en vez de
ser un premio fijo que se cobra una vez y deja de motivar.

**Al final — referidos, y nunca por menos de dos.**

| Requisito | Ventas | Ingreso | −pack | Margen |
|---|---|---|---|---|
| 1 referido | 2 vitalicios | S/ 115,10 | 57 | S/ 58 (50 %) |
| **2 referidos** | 3 vitalicios | S/ 172,65 | 57 | **S/ 116 (67 %)** |
| 3 referidos | 4 vitalicios | S/ 230,20 | 57 | S/ 173 (75 %) |

El fraude no es el problema: para cobrarte un pack de S/57 alguien tendría que pagar dos
vitalicios de verdad, así que el esquema se protege solo. **El problema es la participación.**
En una app que se abre tres veces al mes, un programa de referidos lo completa el 1-3 %:
construir códigos, atribución, pantalla de reclamo y logística son semanas de trabajo para
mover del orden de quince ventas al año. Es la pieza más cara y la que menos mueve, y por eso
va última — cuando haya datos que digan si esta gente invita.

### 7.4 · Por qué el pack encaja con Perú primero

Con la tesis vieja (§6) el comprador estaba en Miami y mandarle una mochila era absurdo. Con
el foco doméstico, **el que paga y el que la recibe están los dos en el Perú**, y el regalo
tiene la misma forma que el producto:

> **Tú estás en Lima. La mochila llega a la casa de tu mamá, en Arequipa.**

Es lo único tangible que el que se fue puede mandarle a los que se quedaron, y ataca el mismo
dolor que vende Guardián: la culpa de estar lejos. Por eso se **vende** bien y se **regala**
mal — la gente paga con gusto un regalo para su madre, y no valora lo que le cae encima por
suscribirse.

> ⚠️ **El pack es la marca hecha objeto.** Un kit de S/40 que se ve barato le hace más daño a
> una app de seguridad que no tener kit. Antes de comprometer nada en público: arma uno,
> déjalo un mes en tu casa, y ábrelo como si acabara de temblar.

---

## 8 · Lo que NO se va a hacer

| | Por qué |
|---|---|
| **Limitar la red gratis** | Es la jugada obvia de la categoría (Life360 la hace) y acá es literalmente cobrar seguridad. Además la landing ya promete red ilimitada |
| **Anuncios** | Ver §9 |
| **Alertas más rápidas para Premium** | Ni es posible ni sería decente |
| **Paywall durante la emergencia** | Ver §5 |
| **Mochila incluida en Premium** | Ver §7.1 — cuesta más de lo que deja la venta |

---

## 9 · Anuncios: evaluados y descartados el 2026-08-25

**El argumento que manda es aritmético, no moral.** Esta app es de uso deliberadamente bajo:
se abre cuando tiembla. La publicidad monetiza tiempo de atención, y acá casi no hay. Con
eCPMs de banner en Perú (orden de magnitud: 0,20 a 1 dólar por mil impresiones), un usuario
que genera diez impresiones al mes deja **fracciones de un centavo**.

Lo que costaba, a cambio de eso:

- **Cinco textos publicados dejarían de ser ciertos:** `QUE-PROMETE-LA-APP.md` §5.7,
  `index.html`, y tres afirmaciones de `privacidad/index.html` — incluida la tabla del
  Nutrition Label, que declara «Datos de uso, publicidad, diagnóstico → **No**», y
  `REVISION-APPLE.md` §3 («No hay SDK de publicidad ni rastreo»).
- Cualquier SDK de anuncios recolecta identificador de dispositivo y datos de uso **incluso
  sin personalizar**, así que el Nutrition Label pasaría a declarar *Identifiers* y *Usage
  Data* con finalidad *Third-Party Advertising*. Declararlo mal es rechazo rápido, y es un
  rechazo **por decir algo falso** — el peor posible para una app cuya propuesta es la
  honestidad.
- Con anuncios personalizados entra ATT, y en la región de lanzamiento la aceptación ronda
  el 20-30 %: el eCPM alto que justificaría todo esto casi nunca aparece.
- **Y desactiva el mejor argumento de venta que tiene el producto.** §8 de
  `QUE-PROMETE-LA-APP.md` dice, en público, *«podríamos saber siempre dónde estás. Elegimos
  no hacerlo.»* Un banner debajo de esa frase la anula.

Además, «Premium quita los anuncios» convierte a Premium de *«te da el mundo»* a *«dejá de
molestarme»*. En una app que se abre tres veces al mes la molestia nunca se acumula lo
suficiente como para pagar por quitarla: el anuncio compite con la suscripción y pierden las
dos.

---

## 10 · Trabajo pendiente

| # | Qué | Estado |
|---|---|---|
| 1 | **`country_code` de verdad** — se detecta al capturar la primera ubicación | ✅ 2026-08-25 |
| 2 | **Guardián** — reparto a la red, aviso de cierre, interruptor, textos | ✅ 2026-08-25. Migración `0022` aplicada, **12/12 aserciones** contra la base real. Falta el recorrido en teléfono: `VERIFICACION-EN-DISPOSITIVO.md` §7.b |
| 3 | **Planes de acción múltiples** — tabla propia, tope en el servidor | ✅ 2026-08-25. Migración `0024`, **15/15 aserciones**. Recorrido: `VERIFICACION-EN-DISPOSITIVO.md` §9.c |
| 4 | Precios nuevos + Small Business Program + Términos/Privacidad en el paywall | ⚙️ |
| 5 | Disponibilidad territorial (§6.2) | ⚙️ |
| ~~6~~ | ~~Ficha distinta para las tiendas de afuera (§6.1)~~ | ❌ **Descartado el 2026-09-08.** Era trabajo al servicio de la tesis de la diáspora. Ver §6 |
| 7 | Landing: sacar «planes familiares con cupos», poner Guardián de titular | ✍️ |
| 8 | **Confirmar el neto real por venta** en la columna *Proceeds* de App Store Connect — toda la aritmética de §7 se apoya en un supuesto de IGV | ✍️ |
| 9 | **Armar un pack de muestra** y vivir con él un mes antes de prometerlo en público (§7.4) | ✍️ |
| 10 | **Bases legales del sorteo** — en el Perú una promoción con sorteo las pide publicadas. Confirmar el trámite ante Indecopi antes de anunciar el primero | ✍️ |

**Fuera de alcance de v1:** inglés, RTL, formatos de moneda, husos horarios.
</content>
</invoke>
