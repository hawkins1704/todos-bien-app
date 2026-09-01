# Monetización: qué se cobra, por qué, y a quién

Escrito el **2026-08-25**. Es la decisión de producto detrás de Premium.

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
mirando el teléfono**: la madre, el hijo que vive afuera, la que armó el grupo familiar.

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
| Simulacros ilimitados | ✅ existe |
| Hasta 5 planes de acción con nombre | ✅ existe (migración 0024) |
| **Grupos ilimitados** — gratis son 2 | ✅ existe (migraciones 0031 y 0034) |
| SMS al que no responde | ⏳ más adelante, y es el mejor candidato — ver §3.3 |

**Guardián es el único que importa.** Los otros son relleno de lista: nadie paga por
simulacros ilimitados.

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
contigo»— y dejar los grupos libres. Es el argumento más limpio de los dos y sigue disponible
para más adelante. Se descartó por ahora porque el simulacro grupal **todavía no existe** y el
tope de grupos sí, y un plan Premium con una promesa a futuro es peor que uno con un límite
entendible.

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
| **Premium** | Igual | Aviso al minuto 0 y el cierre |

Este documento afirmaba antes que el aviso de los 20 minutos llegaba siempre. **Para el
escenario de Madrid —el que abre §3.1— es falso: no llega nada.**

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
> está en una emergencia; se sostiene sobre el escenario de Madrid, que sigue intacto.

Las consecuencias son dos, y van en direcciones opuestas:

1. **A favor del precio.** Guardián no es «una notificación más»: es el **único canal que
   existe** para enterarte de un sismo que a ti no te alcanzó. Eso sostiene los S/ 79,90.
2. **En contra de la promesa pública.** La frase «la señal de que algo salió mal siempre es
   gratis» hay que decirla completa: es gratis **entre quienes compartieron el sismo**.
   Escribirla sin esa condición es venderle a alguien de la diáspora exactamente lo que no va
   a recibir. Ya se corrigió en `QUE-PROMETE-LA-APP.md` §7, que es la fuente de las
   afirmaciones públicas.

### 3.1 · El hueco de 20 minutos, que es el producto entero

El reparto de alertas se dispara **solo por la posición propia** (`0010_alert_fanout.sql`,
`private.quake_applies`). Consecuencia hoy:

> Son las 3 AM en Madrid. Tiembla M6,8 en Lima. Tu mamá está ahí.
> **No recibís absolutamente nada** hasta el minuto 20, y solo si ella no reporta.

Gratis te dice cuando algo salió mal. Premium te deja **acompañar el evento** desde el
minuto 0. Nadie puede acusar al producto de esconder lo importante detrás del pago.

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

## 6 · Multipaís sí, multilenguaje no

**El que paga es peruano.** Vive en Madrid, Miami o Santiago, pero lee español. La diáspora
no necesita una línea traducida: necesita **poder instalar la app desde su tienda**.

Traducir al inglés sirve para un mercado distinto —venderle a japoneses o estadounidenses
una app de sismos locales— y hoy eso no se puede cumplir (ver abajo). Son dos apuestas
distintas y no hay que mezclarlas. **v1 sale solo en español.** Esto revisa lo que decía
`ALCANCE-Y-IDIOMAS.md`.

### 6.1 · El límite honesto: el IGP solo cubre Perú

Fuera de Perú la alerta propia depende del USGS, que este proyecto ya midió: **3 sismos
detectados contra 23** del IGP, y publicados **16-18 minutos** tarde (ESTADO §1.6.3).

Por eso la app **no se abre «al mundo»**. En las tiendas fuera de Perú la ficha vende lo que
la app de verdad hace ahí:

> **Para peruanos en el exterior.** Enterate cuando tiemble donde está tu familia en Perú,
> en el momento, y mirá quién ya respondió.

Si un español la instala esperando una app de sismos para España, recibe un producto malo y
deja una reseña que no se borra.

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

## 7 · Lo que NO se va a hacer

| | Por qué |
|---|---|
| **Limitar la red gratis** | Es la jugada obvia de la categoría (Life360 la hace) y acá es literalmente cobrar seguridad. Además la landing ya promete red ilimitada |
| **Anuncios** | Ver §8 |
| **Alertas más rápidas para Premium** | Ni es posible ni sería decente |
| **Paywall durante la emergencia** | Ver §5 |

---

## 8 · Anuncios: evaluados y descartados el 2026-08-25

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

## 9 · Trabajo pendiente

| # | Qué | Estado |
|---|---|---|
| 1 | **`country_code` de verdad** — se detecta al capturar la primera ubicación | ✅ 2026-08-25 |
| 2 | **Guardián** — reparto a la red, aviso de cierre, interruptor, textos | ✅ 2026-08-25. Migración `0022` aplicada, **12/12 aserciones** contra la base real. Falta el recorrido en teléfono: `VERIFICACION-EN-DISPOSITIVO.md` §7.b |
| 3 | **Planes de acción múltiples** — tabla propia, tope en el servidor | ✅ 2026-08-25. Migración `0024`, **15/15 aserciones**. Recorrido: `VERIFICACION-EN-DISPOSITIVO.md` §9.c |
| 4 | Precios nuevos + Small Business Program + Términos/Privacidad en el paywall | ⚙️ |
| 5 | Disponibilidad territorial (§6.2) | ⚙️ |
| 6 | Ficha distinta para las tiendas de afuera (§6.1) | ✍️ |
| 7 | Landing: sacar «planes familiares con cupos», poner Guardián de titular | ✍️ |

**Fuera de alcance de v1:** inglés, RTL, formatos de moneda, husos horarios.
</content>
</invoke>
