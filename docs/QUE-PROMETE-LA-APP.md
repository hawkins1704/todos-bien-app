# Qué promete la app y qué no

**Este archivo es la fuente única de las afirmaciones sobre el producto.** La landing, la
ficha de App Store, los textos dentro de la app y cualquier cosa que se le diga a un usuario
salen de acá. Si algo cambia en el comportamiento, cambia primero acá y después en los demás
lugares — al revés se desincronizan en silencio, que es exactamente cómo se rompe una
revisión de tienda.

Los otros documentos son distintos: `ESTADO-DEL-PROYECTO.md` explica *cómo* funciona y *por
qué* se decidió así; `QUE-FALTA.md` es el índice de trabajo pendiente. **Acá solo va lo que
se puede afirmar en público, y con qué palabras.**

Última revisión: **2026-09-10** — Centro de Preparación (migraciones 0048-0053).

---

## 1 · En una frase

> **Todos Bien no es una alarma sísmica. Es la app que prepara a tu casa antes, y coordina a
> tu gente después.**

Toda la honestidad del producto sale de entender esa diferencia. Una alarma te avisa *antes de
que tiemble* para que reacciones. Esta app **no hace eso y nunca lo va a hacer**: te prepara
con semanas de anticipación, y te avisa unos minutos después para que tu gente sepa de ti.

Confundir las dos es el único error de comunicación que puede hundir el producto, porque es
el que un usuario descubre en el peor momento posible.

### 1.1 · Las tres fases, y cuál de ellas hace la app

Desde el **2026-09-10** la app cubre las tres. Pero no las cubre de la misma manera, y la
diferencia es exactamente lo que separa una promesa defendible de una denuncia:

| Fase | Qué hace la app | Desde |
|---|---|---|
| **Antes** | Centro de Preparación: la mochila del hogar, el punto de encuentro, quién hace qué, el minicurso y los simulacros | 2026-09-10 |
| **Durante** | 🔴 **Nada, y no puede.** Lo que hace es **haberte enseñado y hecho practicar** para esos segundos | — |
| **Después** | El aviso del sismo, los estados, la ubicación, el chat, Guardián | desde siempre |

> 🔴 **«Cubrimos el durante» es la frase más peligrosa de todo este documento, y hay que
> escribirla con cuidado.**
>
> La app no detecta el sismo mientras ocurre, no registra dónde estabas, no hace **nada** en
> esos segundos. El aviso llega ~8 minutos después (§2), y §6 existe entera porque prometer
> «durante» ya fue vender humo una vez.
>
> Lo que sí es cierto, y es más fuerte: **el «durante» lo resuelve la persona, no la app, y la
> app es lo que la entrenó**. Los 12 consejos del minicurso están repartidos en *Antes*,
> *Durante* y *Después*, y el simulacro es literalmente ensayar el durante. Vender el
> conocimiento y la práctica es cierto; vender una capacidad técnica en esos segundos, no.
>
> **Regla para escribir:** *«qué hacer durante»* ✅ · *«te acompaña durante»* ✅ ·
> *«te protege durante»* ❌ · *«sabemos qué pasa durante»* ❌.

---

## 2 · Los tres números que mandan

| | |
|---|---|
| **~8-9 minutos** | Desde que tiembla hasta que llega el aviso. **7 m 45 s son del IGP**, medido con el M7,2 de Coracora del 2026-08-20 — el 79 % del total. Nuestro tramo es ~1 minuto |
| **14 segundos** | Lo que tarda la onda destructiva en llegar desde un epicentro típico. Ninguna notificación push puede ganarle. Por eso la alerta temprana la hace el **SASPe** con sirenas, no una app |
| **30 minutos** | Lo que vive el aviso antes de descartarse. Es a propósito: una ubicación capturada 40 minutos tarde no es una versión peor de la verdad, es mentira |

**Por qué el IGP tarda y no se puede arreglar comprando otra fuente:** son minutos de física
—esperar que la onda llegue a suficientes estaciones para calcular epicentro y magnitud—, no
de ingeniería. Se comparó contra el USGS: en 7 días detectó **3 sismos en Perú contra 23**
del IGP, y los que sí detectó los publicó **16-18 minutos** después. Cambiar de fuente sería
más lento y con menos cobertura.

---

## 3 · Lo que se puede prometer sin asterisco

Esto funciona en **todos** los estados de la app — abierta, en segundo plano, cerrada por el
sistema, e incluso cerrada a mano por el usuario desde el multitarea.

1. **«Te avisamos cuando tiembla cerca tuyo.»**
   Con el radio y la magnitud que la persona elige. Único requisito: permiso de
   notificaciones, teléfono encendido y con internet.

2. **«Avisá a tu red que estás bien con un toque.»**

3. **«Vas a ver quién de tu gente ya respondió y quién todavía no.»**

4. **«Podés escribirte con tu red dentro de la app.»**

5. **«No te seguimos.»**
   La app toma tu ubicación **una vez** al configurarla, y después **solo** cuando hay un
   sismo que te aplica. No hay seguimiento continuo, y esto es una decisión de diseño que se
   sostuvo incluso cuando habría resuelto un problema técnico (ver §8).

6. **«Si no sabemos dónde estás, lo decimos.»**
   La app nunca muestra una ubicación vieja como si fuera de ahora. Muestra «sin ubicación».
   Esto vale más que una garantía: una red que ve «sin ubicación» sabe que tiene que
   llamar.

---

## 4 · Lo que se puede prometer diciendo la letra chica

> **«Tu red puede ver dónde estás después del sismo, sin que tengas que hacer nada.»**

Esto es lo que diferencia a la app, y funciona — está **probado en un dispositivo real**:
con la app en segundo plano, se despertó sola y guardó la ubicación **1,2 segundos** después
de que saliera el aviso.

Pero depende de condiciones que el usuario controla, y **hay que decirlo**:

| Necesita | Si falta |
|---|---|
| Permiso de ubicación | No hay captura, ni automática ni manual |
| Permiso de notificaciones | No llega ningún aviso |
| **Actualización en segundo plano** encendida | El aviso llega, la captura no |
| **Modo de bajo consumo** apagado | El aviso llega, la captura no |
| La app **no** cerrada a mano desde el multitarea | El aviso llega, la captura no |
| La app abierta al menos una vez desde que se reinició el teléfono | El aviso llega, la captura no |

**La red de seguridad, que conviene decir junto con lo anterior:** cuando la captura
automática no ocurre, **el aviso visible igual llega**. La persona lo toca, la app se abre, y
ahí se guarda la ubicación. Tocar el aviso además le devuelve a la app el permiso de
despertarse sola, así que quien responde a la alerta se auto-repara.

---

## 5 · Lo que la app NO hace — decirlo antes de que lo pregunten

1. **No avisa antes del sismo.** No es alerta temprana. Para eso está el SASPe.

2. **No registra dónde estabas *durante* el sismo.** Registra dónde estás **unos minutos
   después**. Ver §6, porque esto suena peor de lo que es.

3. **Sin internet no llega ningún aviso**, y tu red no ve tu reporte hasta que vuelva la
   señal. Lo que sí funciona sin conexión: seguís viendo la última copia de tu red, y lo
   que reportes queda guardado y se manda solo cuando hay red.

4. **No garantiza que el aviso llegue.** Apple y Google entregan «con el mejor esfuerzo». Un
   teléfono apagado, sin señal más de 30 minutos, o con las notificaciones desactivadas, no
   recibe nada.

5. **No detecta sismos por su cuenta.** Depende de que el IGP los publique. Si el IGP no lo
   publica, la app no lo sabe.

6. **No reemplaza llamar a emergencias.** No contacta bomberos, policía ni ambulancias.

7. **No comparte tu ubicación con nadie fuera de tu red**, ni la usa para publicidad.

---

## 6 · El punto delicado: «durante el sismo» era vender humo

**La promesa vieja era:** *«guardamos dónde estabas cuando tembló».*

No es cierta, y hay que retirarla. El aviso llega ~8 minutos después, así que lo que se
guarda es dónde estás **~8 minutos después** de que tembló.

**La promesa nueva:**

> *«Minutos después del sismo, tu gente ve dónde estás — sin que toques nada.»*

**Y esto no es una versión degradada. Para lo que la app existe, es mejor.** Nadie necesita
una reconstrucción forense de dónde estabas hace ocho minutos. Lo que una madre necesita
saber es **dónde estás ahora** para poder ir a buscarte. Si evacuaste a la calle, la
ubicación de la calle es la útil; la de tu departamento sería la equivocada.

El único caso donde importaría la posición exacta del momento es alguien atrapado que no
puede responder — y esa persona, ocho minutos después, sigue en el mismo lugar.

**Regla práctica para escribir:** cada vez que aparezca la palabra *«durante»* o
*«en el momento del sismo»*, reemplazarla por *«después del sismo»*. No pierde fuerza.

---

## 7 · Qué compra Premium, y sobre todo qué NO compra

> **Premium no compra seguridad. La alerta de sismo es idéntica en gratis y en Premium.**

Esto hay que decirlo así de fuerte, y es un argumento de venta, no una renuncia: nadie tiene
que pagar para que le avisen que tembló donde está. Vender eso sería vender el miedo.

| | Gratis | Premium |
|---|---|---|
| **Alerta** — tembló cerca tuyo, o fuerte en tu país | ✅ | ✅ **igual** |
| Captura automática de ubicación, red, chat, simulacros | ✅ | ✅ **igual** |
| **«María no responde»** a los 20 minutos, **si ese sismo también te alcanzó a ti** | ✅ | ✅ **igual** |
| **«María está bien»** cuando reporta, **si ese sismo también te alcanzó a ti** | ✅ | ✅ **igual** |
| **Los dos avisos de arriba cuando el sismo NO te alcanzó a ti** — es todo Guardián | ❌ | ✅ |
| El aro de estado en la red de un contacto que está en un sismo vivo | ✅ | ✅ **igual** |
| **Noticias** de sismos en tu país | ✅ | ✅ |
| **Noticias** de sismos en el resto del mundo | ❌ | ✅ |
| Feed global de sismos | ❌ | ✅ |
| **Planes de acción** | 1 | **hasta 5**, cada uno con su nombre |
| **Grupos** — Casa, Familia, Trabajo, cada uno con su chat | 2 | **ilimitados** |
| Simulacros — solo o con un grupo | 3 | ilimitados |
| **Centro de Preparación** — el hogar, la mochila, el punto de encuentro, las tareas y el minicurso | ❌ | ✅ **la casa entera** |
| El consejo del día en Inicio, con su fuente | ✅ | ✅ **igual** |
| El estado de preparación en Inicio — plan, red, simulacros | ✅ | ✅ **igual** |

**Sobre los simulacros, y lo que hay que decir para no asustar a nadie.** Un simulacro enciende
la app entera como si acabara de temblar: aparece la alerta, reportas tu estado, ves a los tuyos
y tu ubicación, con una guía paso a paso. **El sismo es lo único falso**, y existe solo dentro
del teléfono — la app nunca inventa un sismo en sus registros.

- **El individual es privado.** Nadie de tu red se entera ni recibe nada.
- **El grupal lo convoca quien creó el grupo.** A los integrantes les llega un aviso que dice con
  todas las letras que es un simulacro, nunca el texto de una alerta real.
- **Cada uno puede salirse cuando quiera**, y quien lo convocó puede cerrarlo para todos. Si no
  lo cierra nadie, **termina solo en una hora**.
- **Se puede apagar del todo**, desde Ajustes → Notificaciones. Apagado, nadie te puede sumar a
  un simulacro.
- **Mientras dura, hay una franja amarilla arriba en todas las pantallas** que dice SIMULACRO y
  dónde se sale. No se puede confundir con un sismo real.
- **Y si tiembla de verdad durante un simulacro, el simulacro se cierra solo.** Lo que se ve es
  la alerta.

**El cupo de 3 cuenta los que convocas tú.** Practicar en el simulacro de otra persona es gratis
e ilimitado: quien arma el grupo no gasta el cupo de los demás.

**Sobre los grupos, y esto hay que decirlo en la app y no solo acá.** Un grupo es **gente + un
chat**: una sola cosa. Se comparte — todos los que están adentro ven el nombre y a los demás — y
es de quien lo creó: solo él suma, saca y renombra; cualquiera puede irse.

Tres cosas que la app dice en pantalla porque no se adivinan:

- **Solo puedes sumar gente de tu propia red.** Es lo que impide que un tercero meta en tu grupo
  a alguien que no conoces.
- **Quien entra puede leer todo lo que se habló antes.** Es una decisión, no un descuido: para un
  grupo chico de gente que se conoce, el historial compartido es lo esperable. Pero se avisa
  justo al lado del botón de agregar, que es el momento en que se decide.
- **El tope de 2 cuenta los grupos que CREAS**, no en cuántos estás. Los grupos donde te metieron
  no ocupan cupo, o cualquiera podría dejarte sin poder armar los tuyos.

**🔴 Y lo que un grupo NO hace, que es lo más importante de esta página.** Estar juntos en un
grupo **no los conecta**. Si Renzo arma FAMILIA con su mamá, su hermana y su abuela, y la mamá
solo está conectada con Renzo:

| | La mamá |
|---|---|
| ve el grupo y los tres nombres | ✅ |
| les escribe en el chat del grupo | ✅ |
| ve el estado y la ubicación de las otras dos en un sismo | ❌ |

Las conexiones **siguen siendo de a dos y no se contagian**. Un grupo es una presentación, no una
conexión: te deja hablar con alguien, no ver dónde está. Para eso hay que agregarlo a la red, y la
app lo ofrece ahí mismo con un toque — *«Ana no está en tu red · no vas a ver cómo está»*.

Si esto se contara al revés —«arma un grupo y ve cómo está toda tu familia»— sería vender humo:
alguien podría meterte en un grupo y darle tu ubicación a un desconocido sin que aceptes nada. La
app no lo hace y la promesa no lo dice.

> ⚠️ **Hasta el 2026-09-01 esto se llamaba «círculos» y era otra cosa**: etiquetas privadas que
> solo veía quien las creaba. Se cambió porque convivían con las «conversaciones grupales» y eran
> dos objetos que todo el mundo llamaba igual. **Si la landing o la ficha de la tienda todavía
> dicen «círculo», están describiendo un producto que ya no existe.**

**Y si se vence el Premium con siete grupos armados, los siete siguen ahí.** Lo único que no se
puede es crear otro. Misma regla que los planes de acción, y por el mismo motivo: quitarle a
alguien algo que ya organizó porque se le venció una suscripción es exactamente lo que este
producto promete no hacer.

**Sobre «eliminar un chat»: es de este teléfono, no del otro.** Se borran los mensajes de tu
dispositivo y no vuelven nunca — ni al refrescar, ni cuando la conversación reaparezca. En el
teléfono de la otra persona siguen ahí, porque el chat es de dos. Si te vuelve a escribir, la
conversación aparece de nuevo con los mensajes nuevos y **solo** esos. La app lo dice con esas
palabras antes de borrar nada.

> **Lo que NO se puede hacer, y es a propósito: salir de un chat individual.** No es una función
> que falte, está prohibida en la base. Sin fila de miembro dejarías de recibir los avisos de esa
> persona **para siempre**, sin saberlo y sin forma de volver, en una app cuyo propósito es que
> te enteres. Por eso «eliminar» borra tu copia y no te saca de la conversación. En un grupo sí
> se puede salir, y ahí se dice lo que se pierde.

**Sobre los planes, lo que se puede afirmar y lo que no:** si se vence el Premium, **los cinco
planes siguen ahí y la red los sigue viendo**. Lo único que no se puede es agregar otro.
Borrar o esconder información de seguridad de alguien porque se le venció una suscripción
sería exactamente lo que este producto promete no hacer, y decirlo en la venta es un
argumento, no una concesión.

> ⚠️ **La migración 0030 (2026-08-31) quitó «Tembló cerca de María».** Existía como aviso
> propio, al minuto 0 y con distancia, y se retiró por dos razones: no se podía enunciar en
> una frase —su valor dependía de una condición que el usuario no puede ver— y quedó
> redundante desde que la noticia nacional llega a todos, esté la persona donde esté.
>
> **Guardián no desapareció: se redujo a lo único que ninguna noticia puede dar**, porque hace
> falta saber quién es tu gente — enterarte de que reportaron, o de que no reportaron, aunque a
> ti el sismo no te haya tocado. Y como ya no hay aviso de apertura que dé contexto, **cada uno
> de esos avisos nombra el sismo** (magnitud y lugar): sin eso sería un sobresalto en vez de
> una tranquilidad.

### 7.1 · El Centro de Preparación — qué se puede afirmar

**Qué es, en una línea:** la pestaña donde una casa arma su mochila de emergencia, escribe su
punto de encuentro, se reparte quién hace qué, aprende qué hacer y practica un simulacro —
todos viendo lo mismo y sumando al mismo porcentaje.

**Lo que se puede prometer sin asterisco:**

1. **«Paga una persona y entra tu casa completa.»** Cierto y verificado en la base el
   2026-09-10. Basta con que **uno cualquiera** de los integrantes tenga Premium (migración
   0053) — no tiene que ser quien creó el hogar.
2. **«Sin límite de personas.»** Cierto. Hay un tope técnico de 20 contra abuso automatizado,
   pero no es un límite de producto y no se anuncia como una cifra de plan.
3. **«Lo que marca uno lo ven todos.»** Cierto: el progreso es del hogar, no de cada quien.
4. **«El contenido es del INDECI, la Cruz Roja Peruana y el IGP.»** Cierto, y **cada consejo
   lleva el enlace a su fuente dentro de la app**. No hay una sola línea de consejo escrita
   por nosotros.

**Lo que hay que decir con la letra chica:**

| Afirmación | La condición |
|---|---|
| «Tu casa entera» | Una persona pertenece a **un solo hogar**. No se puede estar en dos, ni prestarle el hogar a otra familia |
| «Todos ven lo mismo» | Solo los integrantes del hogar. No es tu red entera: el hogar es un grupo aparte, el que marcas como tal |
| «El minicurso» | Son los **12 consejos que ya existían** en Inicio, ordenados por fase y con avance por persona. No es material nuevo escrito por un especialista |

**🔴 Lo que NO se puede prometer, y es la excepción a la regla de todo este documento:**

> **Si se vence el Premium, el Centro se cierra.** Los datos siguen guardados y no se borra
> nada — vuelve a Premium y aparece todo tal como estaba— pero **mientras tanto no se ven**.

Esto **contradice** lo que este mismo documento afirma de los planes de acción y de los grupos
(«si se vence, los cinco siguen ahí y la red los sigue viendo»), y la contradicción es
deliberada, no un descuido. Hay que saber decir la diferencia:

- Los planes y los grupos son **información de tu red**, y esconderlos degradaría la seguridad
  de terceros que no eligieron nada.
- El Centro es **preparación previa**, que se compró como un producto entero. Cerrarlo no deja
  a nadie peor de lo que estaba antes de comprarlo: la alerta, los estados, la ubicación, el
  chat y el consejo del día siguen exactamente igual.

**Y hay un filo que conviene tener escrito antes de que lo escriba una reseña:** entre lo que
se cierra está **el punto de encuentro del hogar**. Si tiembla el día que se venció la tarjeta,
esa familia no puede leerlo en la app. Se asumió a sabiendas el 2026-09-10 — la decisión es que
la presión comercial vale ese riesgo. **Si aparecen reseñas por esto, el primer ajuste es dejar
el punto de encuentro legible bajo el candado**, que es un cambio chico y no toca el resto.

> ⚠️ **Y una que no se puede decir de ninguna manera:** que el Centro te avise cuando algo de
> la mochila vence. No existe. El agua se rota cada seis meses y las medicinas caducan, y la
> app **no lo controla** — está en `QUE-FALTA.md` como el primer candidato de la v2. Cualquier
> texto que sugiera «te avisamos cuando haya que renovar» es falso hoy.

---

**El corte que hay que saber defender**, dicho con precisión (verificado en el código el
2026-08-31, no deducido de la intención):

> **Si el sismo te alcanzó a ti**, gratis tienes todo: tu alerta, tu red, «X no responde»
> a los 20 minutos, y el aviso cuando esa persona reporta que está bien.
>
> **Si el sismo NO te alcanzó**, gratis tienes que acordarte de abrir la app. Premium te
> avisa.

> ✅ **La segunda mitad de la línea de arriba es de la migración 0027 (2026-08-28), y antes
> era falsa en la dirección contraria.** Dentro de tu propio sismo el «está bien» de un
> contacto **no llegaba nunca**, ni pagando: colgaba de haber recibido la apertura de Guardián,
> que solo reciben los que están **fuera** de la zona. El resultado era al revés de lo que
> cualquiera esperaría —alguien **fuera de la zona** con Premium recibía «María está bien», y
> quien estaba en el mismo terremoto que María, no—, y dejaba a la persona que más lo necesita
> recibiendo
> **solo malas noticias**: «necesita ayuda» sí es gratis e incondicional desde siempre.
>
> **Y va gratis, no en Premium, por una razón que conviene tener escrita:** ponerlo detrás del
> muro volvería falsa la frase «cuando el sismo te toca a ti, todo es gratis», que está
> publicada en el paywall, en la landing, en la ficha de la tienda y en la FAQ. Guardián no
> pierde nada — sigue siendo el único canal para el sismo que **no** te tocó, que es lo que se
> vende.

La frase corta —«la señal de que algo salió mal siempre es gratis»— **es cierta solo entre
quienes compartieron el sismo**. `notify_silent_contacts` manda «X no responde» únicamente a
quien tiene entrega de alerta de ese mismo sismo, así que **quien está fuera de la zona no
recibe nada** por el canal gratuito. Decir la frase sin esa condición es prometerle justo lo
que no va a llegarle a quien está lejos — en Lima mirando a Arequipa, o en Miami mirando a
Lima: la condición no es geográfica, es **haber recibido la alerta de ese sismo**.

**Lo que sí es gratis para el que está lejos**, y conviene decirlo porque suena a Premium y no
lo es: al abrir la app, un contacto que está dentro de un sismo vivo aparece con **su aro de
estado** en la red, sin pagar nada. El estado siempre se vio entrando a su ficha; cobrar
por el aro sería cobrar una comodidad visual de un dato que ya se regala. **Lo que se cobra es
la interrupción**: que te avisen sin que se te ocurra mirar.

**Y una limitación que se dice en voz alta, no en letra chica:** Guardián solo alcanza a los
contactos que tienen ubicación guardada. De quien nunca dio el permiso no se sabe si el
sismo le tocó cerca —solo que está en el país—, y decir «tembló cerca de María» sin ese dato
sería exactamente la clase de afirmación que este documento existe para impedir.

El detalle de por qué está cortado así vive en `MONETIZACION.md`.

**La distinción que ordena todo esto** —y que hasta el 2026-08-22 no existía en el código—
es entre **alerta** y **noticia**:

- **Alerta:** «tembló cerca tuyo». Pone la app en modo emergencia, dispara la captura de
  ubicación y activa el contador de tu red. Se dispara por cercanía o por magnitud
  nacional. **No tiene interruptor**, porque no es una preferencia: es la razón por la que la
  app existe.
- **Noticia:** «hubo un sismo». Informativa, no activa nada, y **se puede apagar sin miedo**.

Lo destapó un M6,7 en el mar de Scotia, a 5.887 km de Lima, que puso la app de un usuario
Premium en modo emergencia (ESTADO §1.13.5). Estaban mezcladas en una sola tubería.

**Para la landing:** *«Premium no te da alertas más rápidas ni más alertas. Te deja saber qué
pasa con los tuyos: que reportaron, o que no reportaron, aunque a ti ese sismo no te haya
tocado. Lo que te protege es gratis.»*

> 🔴 **Hasta el 2026-09-03 esta frase decía «enterarte apenas tiembla donde está tu gente».**
> Era el aviso del minuto 0 que la migración 0030 retiró, y de acá se copió a la ficha de App
> Store y al paywall de `GUIA-SUSCRIPCIONES.md`. **Es el segundo párrafo de este documento que
> sobrevive a la función que describe**, y el patrón es siempre el mismo: se corrige el código,
> se corrige la tabla de §7, y las frases «para pegar» quedan intactas porque nadie las lee al
> revisar. Al retirar una función, buscar también las frases listas para copiar.

---

## 8 · Un límite que se eligió, no que se sufrió

Existe una forma técnica de que la app capture la ubicación **siempre**, incluso con la app
cerrada a mano: suscribirse a los cambios significativos de ubicación del sistema, que iOS sí
relanza en todos los casos.

**Se descartó a propósito.** Significa recibir la ubicación de la persona de forma continua
— exactamente lo que la app promete no hacer.

Vale la pena decirlo en público, no esconderlo: *«podríamos saber siempre dónde estás.
Elegimos no hacerlo.»* Es un argumento de venta, no una limitación.

---

## 9 · Traducción para la landing

| ❌ No digas | ✅ Decí |
|---|---|
| «Alerta sísmica» | «Aviso de sismo» — en Perú «alerta sísmica» significa SASPe, o sea alerta temprana |
| «Te alertamos apenas empieza a temblar» | «Te avisamos en cuanto el IGP publica el sismo» |
| «Guardamos dónde estabas durante el sismo» | «Minutos después del sismo, tu gente ve dónde estás» |
| «Tu familia siempre sabe dónde estás» | «Tu familia ve dónde estás cuando hay un sismo cerca tuyo» |
| «Funciona siempre, incluso cerrada» | «El aviso llega siempre. La ubicación automática necesita los permisos activados» |
| «Nunca más te quedes incomunicado» | «Un toque para decir que estás bien, sin depender de que entre la llamada» |
| «Detectamos sismos en tiempo real» | «Seguimos el catálogo del IGP y del USGS» |
| «Te protegemos antes, durante y después» | «Te prepara antes, te acompaña después» — o, si se quiere nombrar las tres: «**Aprende** qué hacer antes, **sabe** qué hacer durante, **avisa** a tu gente después». El verbo de la fase del medio es de la persona, no de la app (§1.1) |
| «La app te acompaña durante el sismo» | «Practicaste para esos segundos» — la app no hace nada mientras tiembla |
| «Tu mochila de emergencia siempre lista» | «La lista del INDECI, marcada entre todos» — la app no controla vencimientos (§7.1) |
| «Toda tu familia con un solo pago» | ✅ se puede decir tal cual. Basta con que **una** persona del hogar tenga Premium |

**Una línea que conviene tener en la landing, textual:**

> *El aviso llega unos minutos después del sismo, cuando el IGP lo publica. Esta app no es
> alerta temprana: no te avisa antes de que tiemble.*

Ponerla arriba, no en el pie. Un usuario que se entera de esto en medio de un terremoto se
siente estafado; uno que lo leyó antes de instalar, entiende para qué sirve.

---

## 10 · El problema real que sí resuelve

Conviene tenerlo escrito, porque es lo que hay que vender cuando se dejan de vender las cosas
que no son ciertas:

> **Después de un sismo fuerte, las líneas telefónicas y de datos se saturan en minutos.
> Todo el mundo llama a la vez. Un toque en una app pesa unos bytes y pasa cuando una llamada
> no pasa.**

Eso sigue siendo cierto con los 8 minutos de retraso, porque la saturación dura horas. Y el
retraso del IGP no afecta el reporte: la persona puede abrir la app y avisar que está bien
**apenas deja de temblar**, sin esperar ningún aviso.

---

## 11 · Dónde vive cada afirmación dentro de la app

Inventario de los textos que hacen una promesa, para que revisarlos no exija barrer todo el
código otra vez. **Si se toca uno, se revisa contra este documento.**

| Dónde | Qué afirma |
|---|---|
| **`app.json`** → plugins `expo-location` y `expo-contacts` | **El texto del diálogo del sistema.** Es el primero de la lista por dos razones: es lo que Apple muestra en el momento del consentimiento y lo que declara el Nutrition Label, y **viaja dentro del binario**, así que corregirlo tarde obliga a un build nuevo. Se sumó acá el 2026-08-24, después de que la auditoría del 21/08 lo pasara por alto y quedara con las dos frases retiradas |
| `src/app/(auth)/welcome.tsx` | Las **4** diapositivas de valor y el descargo de emergencias. ⚠️ La cuarta (Centro de Preparación) **dice «Con Premium» con todas las letras** y va última a propósito: es la única de pago, y abrir la presentación de una app de seguridad con algo que se cobra contradice «lo que te protege es gratis» |
| `src/app/(onboarding)/permissions.tsx` | Qué hace la app con la ubicación y con las notificaciones — **el texto más sensible de todos**, porque es donde se pide el consentimiento |
| `src/app/settings.tsx` | La nota de privacidad de ubicación, el descargo legal, y el aviso de «sin posición guardada». ⚠️ **Se movió fuera de `(tabs)` el 2026-09-10**: Ajustes dejó de ser pestaña para hacerle sitio a Preparación, y se abre desde el engranaje de Inicio. La ruta `/settings` no cambió |
| `src/app/(tabs)/preparacion.tsx` | Qué es el Centro y qué incluye — el texto de venta de la pestaña |
| `src/components/centro-bloqueado.tsx` | **«Tus datos siguen aquí»**, con el Premium vencido. Es la afirmación más comprometida de la app nueva: promete que no se borró nada. Si algún día el borrado deja de ser cierto, este texto es mentira |
| `src/app/preparacion/curso.tsx` | Que los consejos son del INDECI, la Cruz Roja y el IGP, y que cada uno lleva su fuente |
| `src/components/daily-tip-card.tsx` | El consejo del día y su fuente |
| `src/components/permissions-checklist.tsx` | Qué se pierde con cada permiso que falta |
| `src/app/drill.tsx` | Cómo se vería una alerta real |
| `src/app/(onboarding)/ready.tsx` | Que el Centro existe y qué trae. **No vende**: no hay paywall al terminar el registro |
| `src/components/premium-cta.tsx` | Qué queda gratis |
| `supabase/functions/send-alerts/index.ts` → `buildMessage()` | El texto del aviso de sismo |

**Fuera del repositorio, y hay que auditarlas aparte:**

- **El paywall**, que vive en RevenueCat y no en el código.
- **La landing y las páginas legales**, en `../todos-bien-website`.
- **La tabla comparativa de la landing** (`#comparativa`, agregada el 2026-08-25). Es el
  texto más delicado del sitio después de la advertencia del hero, porque afirma cosas sobre
  **productos ajenos**. Dos reglas para tocarla:

  1. **Cada fila tiene que ser cierta de las tres columnas**, no solo de la nuestra.
  2. **Tiene que quedar al menos una fila que Todos Bien no gane.** Hoy es la de la red
     saturada, donde la mensajería también lleva ✅. Una tabla donde una columna gana todo
     se lee como publicidad y hace dudar del resto; una sola concesión honesta sostiene las
     seis afirmaciones de arriba.

  > Hubo una fila más —«llegar a alguien que no tiene la app»— que se quitó el 2026-08-25
  > por ambigua: que una app no alcance a quien no la tiene es una tautología, y como
  > concesión no se leía honesta sino de relleno. Si alguna vez se repone la idea, tiene que
  > ser con una limitación que el lector no dé por descontada.

- **El orden de las secciones de la landing**, reordenado el 2026-09-10. Queda anotado acá
  porque el orden *es* una afirmación: dice qué es la app antes de que nadie lea una línea.

  `hero` → franja de confianza → misión → **`#como-funciona`** → **`#preparacion`** →
  `#comparativa` → `#funciones` → modo tranquilo → `#privacidad` → lo que no hace →
  `#requisitos` → `#premium` → `#planes` → **`#descargar`** → **`#preguntas`**

  Tres decisiones dentro de ese orden:

  1. **`#preparacion` subió** desde el fondo hasta justo después de los pasos, porque es la
     sección que expande el paso 02. El argumento viejo —«va antes de `#premium` porque hace
     entendible el precio»— no se pierde: `#premium` sigue pegado a `#planes`, que es donde
     de verdad hace falta.
  2. **Los pasos pasaron de cuatro a cinco**, y el 02 es el Centro. Va segundo y no primero
     porque necesita que los tuyos ya estén en la app, y **dice «Premium» con todas las
     letras**: es el único paso que se cobra.
  3. **`#preguntas` bajó debajo del CTA de instalación**, y su título es ahora literalmente
     «Preguntas frecuentes». Quien ya decidió no las necesita; quien duda las encuentra con
     los botones de descarga todavía arriba.

- **Las tarjetas de `#funciones` bajaron de ocho a seis** el 2026-09-10. ⚠️ **Guardián dejó
  de tener tarjeta, pero no dejó de existir**: se cuenta entero en `#premium`, en la tabla de
  `#planes` y en la pregunta 11. Lo mismo el Centro, que ahora tiene su propia sección encima.
  La tercera baja fue una fusión: «escribe sin señal» y «ve tu red sin internet» eran la misma
  promesa partida en dos.
- **La ficha de App Store**: el texto ya está escrito y contado en `FICHA-APP-STORE.md`, con
  cada afirmación trazada a este documento. Falta pegarlo en App Store Connect.
- **Las capturas de pantalla.** El texto que va encima de una captura es una afirmación
  pública como cualquier otra, y se audita igual.

> **Auditado el 2026-08-21** contra este documento: se encontraron 7 textos que prometían de
> más y se corrigieron. El más grave no era de marketing sino de **privacidad**: la pantalla
> de permisos decía que la ubicación se toma «solo cuando ocurre un sismo», y omitía la
> lectura inicial que la propia pantalla dispara al conceder el permiso.

---

## 12 · De dónde salen los números de este documento

| Afirmación | Evidencia |
|---|---|
| 8-9 min de latencia; 7 m 45 s del IGP | Medido con el M7,2 de Coracora, 2026-08-20 (ESTADO §1.13.4) |
| 14 s hasta la onda destructiva | ESTADO §1.11 |
| USGS: 3 sismos vs 23, y 16-18 min | Comparación de 7 días de ambos catálogos (ESTADO §1.6.3) |
| Captura automática en 1,2 s con la app en segundo plano | Prueba controlada en dispositivo real, 2026-08-21 (ESTADO §3.8.1) |
| El aviso visible llega en los cuatro estados | Documentación de Apple + verificado en dispositivo (ESTADO §3.7) |
| Tras reiniciar el teléfono no hay captura hasta abrir la app | Dos pruebas controladas, 2026-08-21 (ESTADO §3.8.2) |
| 30 min de vida del aviso | `TTL_SECONDS` en `supabase/functions/send-alerts/index.ts` |
| «Basta con que uno de la casa tenga Premium» | `private.household_premium()` tras la migración 0053. Probado en transacción revertida el 2026-09-10 con el hogar real: dueño libre + otro integrante pagando ⇒ `true` |
| «Si se vence, los datos siguen ahí» | Probado el 2026-09-10 quitando el Premium a la cuenta real: la RPC sigue devolviendo el hogar, las 16 filas de la mochila y las 8 marcadas siguen existiendo; las escrituras devuelven 0 filas o `42501` |
| «Los 12 consejos son del INDECI, la Cruz Roja y el IGP» | Sembrados con su `source_name` y `source_url` en la migración 0005 — 6 del INDECI, 4 de la Cruz Roja, 2 del IGP |
