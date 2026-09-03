# Guía de suscripciones: App Store Connect, Google Play y RevenueCat

Todo el contenido para dejar Premium configurado, listo para copiar y pegar. Escrito el
**2026-08-25**.

El **porqué** de estos precios y de este corte está en `MONETIZACION.md`. Acá va solo el
*qué escribir dónde*.

> ⚠️ **Los productos ya existen** en App Store Connect y en RevenueCat: la compra, la
> restauración y la transferencia se probaron en su momento. **No crees productos nuevos** —
> el identificador de un producto no se puede cambiar ni reutilizar nunca más. Lo que hay
> que hacer es **actualizar el precio y la localización de los que ya están**.

---

## 1 · Los tres productos

| | Mensual | Anual | De por vida |
|---|---|---|---|
| **Tipo** | Suscripción auto-renovable | Suscripción auto-renovable | **No consumible** |
| **Duración** | 1 mes | 1 año | — |
| **Precio (Perú)** | S/ 9,90 | S/ 59,90 | S/ 79,90 |
| **Grupo** | Todos Bien Premium | Todos Bien Premium | *(fuera del grupo: no es suscripción)* |

**Los tres dan exactamente el mismo entitlement**, que en RevenueCat se llama `premium`. Y los de
Play van al **mismo** entitlement: es lo único que las dos tiendas comparten (§8).

> ⚠️ **Esta línea y el `.env` no dicen lo mismo, y conviene saberlo antes de confiar en ninguno
> de los dos.** Acá dice `premium`; `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT` dice
> `Todos Bien Premium`, que es el *display name*. **Hoy da igual porque el valor no se usa** —
> `PREMIUM_ENTITLEMENT` se exporta y nunca se indexa contra `entitlements.active`
> (`purchases.ts:102`), y el webhook decide por tipo de evento, no por entitlement. Antes de
> apoyarse en cualquiera de las dos afirmaciones hay que **mirar el identifier real en el panel**
> y corregir la que esté mal. Ver §7.

> El plan de por vida es **no consumible**, no una suscripción. RevenueCat manda
> `NON_RENEWING_PURCHASE` y el webhook ya lo trata como concesión de acceso
> (`GRANT_EVENTS` en `supabase/functions/revenuecat-webhook/index.ts`). No hay que tocar nada.

**Al cambiar el precio de una suscripción que ya existe**, App Store Connect pregunta si se
conserva el precio anterior para los suscriptores actuales. Da igual qué se responda: hoy
solo hay compras de sandbox.

---

## 2 · Localización (español)

Idioma: **Español (México)** o **Español (Latinoamérica)**, el que ya use la ficha. Es el
único idioma de la v1 (`MONETIZACION.md` §6).

> **Límites de Apple:** *Display Name* 30 caracteres, *Description* 45. Los textos de abajo
> ya entran, con el conteo al lado. Si la consola muestra otro límite, gana la consola.

### Grupo de suscripción

| Campo | Valor |
|---|---|
| Reference Name (interno, no se muestra) | `Todos Bien Premium` |
| **Display Name** | `Todos Bien Premium` *(18)* |

### Mensual

| Campo | Valor |
|---|---|
| **Display Name** | `Premium mensual` *(15)* |
| **Description** | `Guardián y todo Premium. Renovación mensual.` *(44)* |

### Anual

| Campo | Valor |
|---|---|
| **Display Name** | `Premium anual` *(13)* |
| **Description** | `Guardián y todo Premium. Renovación anual.` *(42)* |

### De por vida

| Campo | Valor |
|---|---|
| **Display Name** | `Premium de por vida` *(19)* |
| **Description** | `Guardián y todo Premium. Un solo pago.` *(38)* |

**Por qué las tres descripciones empiezan igual:** los tres productos entregan lo mismo, y
lo único que cambia es cómo se paga. Esta descripción es la que la persona ve meses después
en Ajustes → Suscripciones, cuando ya no se acuerda qué contrató: ahí lo que necesita es
reconocer **qué le da** y **cada cuánto le cobran**, en ese orden.

**Por qué no aparece el precio en ninguna descripción:** el precio cambia por país y lo
muestra la tienda sola. Escribirlo en el texto es garantizar que quede desactualizado o
equivocado en la mitad de los mercados.

---

## 3 · Disponibilidad

Se configura en **App Store Connect → tu app → Precios y disponibilidad**. La
disponibilidad de las compras integradas hereda la de la app: dejala en «todos los países
donde la app está disponible» y no la toques aparte.

### Los que van

| País | Por qué |
|---|---|
| **Perú** | El mercado |
| **Estados Unidos** | La diáspora peruana más grande, y con ingreso en dólares |
| **Chile, Argentina, Bolivia, Ecuador, Colombia, Venezuela** | Los destinos vecinos |
| **México, Brasil, Canadá** | El resto de América con comunidad peruana |
| **Japón** | Comunidad peruana históricamente grande |

La razón de abrir fuera de Perú es **Guardián**: se le vende a quien tiene familia allá y
vive afuera. Restringir a Perú dejaría fuera justamente a quien paga.

### Los que NO van todavía

**España e Italia**, que son el segundo y el quinto destino de la diáspora. Distribuir en la
Unión Europea exige declarar *trader status*, y Apple publica **nombre, dirección y teléfono**
del desarrollador en la ficha pública. El RUC 10730426548 es de persona natural sin domicilio
fiscal, así que hoy eso significa publicar una dirección particular.

> ⚠️ **Verificalo en App Store Connect antes de descartarlo**: estas reglas cambian seguido
> y puede que el requisito ya sea otro.

**El resto del mundo tampoco**, y no por descuido: fuera de Perú la alerta propia depende del
USGS, que este proyecto midió como **3 sismos detectados contra 23** del IGP y publicados
16-18 minutos tarde. Si alguien instala la app esperando una app de sismos para su país,
recibe un producto malo y deja una reseña que no se borra.

Ampliar después es una casilla, no un envío nuevo.

---

## 4 · El paywall en RevenueCat

**El argumento es Guardián**, no «el mundo» (los sismos globales), que es lo que vendía la
versión original de esta sección.

> ⚠️ **Distinguir dos paywalls, porque solo uno de ellos está pendiente.** El que ve el usuario
> dentro de la app se compila desde `src/` y ya está correcto desde el 2026-08-28. Lo de acá es
> la copia del **panel de RevenueCat**, que todavía no se pegó. Mientras no se pegue, este
> archivo es un borrador: no describe nada publicado.

### Título

```
Sabe de los tuyos, en el momento
```

### Subtítulo

```
Te avisamos cuando alguien de tu red reporta que está bien, y también si no reporta, aunque a ti ese sismo no te haya tocado.
```

### Lista de beneficios

```
Guardián: «María está bien», con la magnitud y el lugar del sismo para que se entienda solo

Y la otra mitad: «María no responde», a los veinte minutos de la alerta

Sismos de todo el mundo, para los tuyos que viven lejos

Grupos ilimitados, cada uno con su chat

Hasta 5 planes de acción con nombre, uno por situación

Simulacros ilimitados
```

> 🔴 **Las dos primeras líneas se reescribieron el 2026-09-03 y antes eran falsas.** Decían
> *«te avisamos apenas tiembla cerca de un contacto, con su nombre y a cuántos kilómetros»* —
> el aviso del minuto 0 que la migración **0030** retiró el 2026-08-31. Guardián son **dos**
> avisos y los dos son sobre el **estado** de una persona, no sobre el sismo: que reportó, o
> que no reportó. **No volver a prometer el tercero.**
>
> Que esta copia todavía no esté pegada en RevenueCat es la única razón por la que no se
> publicó el error. El paywall que se compila en la app **sí** está correcto: se reescribió el
> 2026-08-28 (`QUE-FALTA.md` 2.6.c) y se verificó en `src/` el 2026-09-03, donde las únicas
> menciones al aviso retirado son comentarios que explican que se fue.

### Debajo de los planes, antes del botón

```
Tu familia no paga nada ni necesita enterarse. Premium es tuyo, y sirve para saber de ellos.
```

Esa línea desarma la objeción más común antes de que aparezca, y es la que evita el modelo
que ya se descartó por insostenible (`MONETIZACION.md` §2.1).

### La línea que no se saca

```
Cuando el sismo te toca a ti, todo es gratis y siempre lo va a ser: tu alerta, tu red y el aviso de que alguien no respondió. Premium es para los sismos que NO te tocan a ti.
```

Va **en el paywall**, no solo en la landing. Dos razones: es cierto y es el argumento de
venta más fuerte que tiene el producto; y es lo que le deja claro a un revisor de Apple que
**la seguridad no está detrás del muro de pago**.

> ⚠️ **Corregida el 2026-08-27, y el cambio no es cosmético.** Decía: *«La alerta de un sismo
> que te toca a ti, y el aviso de que alguien de tu red no respondió, son gratis y siempre
> lo van a ser»*. La segunda mitad era **falsa** para el caso que más importa:
> `notify_silent_contacts` manda «X no responde» solo a quien tiene entrega de alerta de ese
> mismo sismo (migración 0020), así que quien está en Madrid nunca lo recibe.
>
> La versión nueva dice lo mismo sin mentir, y encima **explica qué se compra** en la misma
> frase: gratis cubre entero el sismo que te toca; Premium es para el que no. Prometer en el
> paywall un aviso gratuito que no llega sería, además de deshonesto, justo el tipo de
> afirmación que Apple revisa.

### Botón

```
Obtener Premium
```

### Letra chica obligatoria

Apple exige que el paywall muestre el nombre, la duración y el precio de cada plan —eso lo
resuelven los componentes de RevenueCat— **más** la explicación de la renovación:

```
La suscripción se renueva automáticamente al mismo precio, salvo que la canceles al menos 24 horas antes de que termine el período. Puedes gestionarla o cancelarla cuando quieras desde los Ajustes de tu Apple ID. El plan de por vida es un pago único: no se renueva ni se vuelve a cobrar.
```

---

## 5 · Los enlaces del pie

🔴 **Es el rechazo más probable que queda** (`QUE-FALTA.md` 2.6). Guideline 3.1.2: una app de
suscripción sin estos enlaces en el paywall se rechaza casi automáticamente.

En **RevenueCat → Paywalls → Footer**, los tres:

| Qué | URL |
|---|---|
| **Términos de uso** | `https://todosbien.app/terminos` |
| **Política de privacidad** | `https://todosbien.app/privacidad` |
| **Restaurar compras** | *(componente de RevenueCat, no es una URL)* |

Las dos URL están verificadas en producción y responden 200.

> **Restaurar compras tiene que estar visible**, no escondido en Ajustes: Apple lo pide en la
> misma pantalla donde se compra. En la app además existe aparte, en el gestor de suscripción
> (`src/components/subscription-manager.tsx`).

---

## 6 · Antes de dar por cerrada la configuración

- [ ] Los tres productos con el precio nuevo, **sobre los identificadores que ya existían**
- [ ] Los tres con Display Name y Description en español
- [ ] Grupo de suscripción con su nombre localizado
- [ ] Disponibilidad: los países de §3, sin la UE
- [ ] **Captura de revisión** para cada producto — Apple la exige por producto, y sin ella
      quedan «Missing Metadata» y no se pueden enviar
- [ ] Paywall reescrito alrededor de Guardián
- [ ] 🔴 Términos, Privacidad y Restaurar compras en el pie del paywall
- [ ] **Small Business Program** solicitado (comisión del 30 % al 15 %)
- [ ] Los precios de la landing coinciden con los de la tienda: **9,90 · 59,90 · 79,90**
- [ ] Una compra de sandbox de punta a punta, mirando que `user_settings.is_premium` pase a
      `true` sola en segundos — es el webhook (`VERIFICACION-EN-DISPOSITIVO.md` §8)

---

## 7 · De sandbox a producción: no hay nada que cambiar

Escrito el **2026-09-03**, porque es la pregunta que aparece sola al ver el panel: si ahora
funciona «en modo prueba», ¿qué se cambia al publicar?

**Nada.** Y conviene entender por qué, porque la intuición dice lo contrario.

Las claves `appl_…` y `goog_…` **no tienen versión de prueba y de producción**. Son las mismas
antes y después de publicar. No hay interruptor en RevenueCat ni variable que cambiar en `.env`.

Lo que decide el entorno es **la compra**, no la configuración:

| Plataforma | Sale como prueba cuando… | Sale como producción cuando… |
|---|---|---|
| iOS | La compra la hace un Apple ID de **sandbox**, o el build vino de **TestFlight** | La compra se hace sobre la app publicada en la App Store |
| Android | La cuenta está declarada **license tester** en Play Console, o el build vino de un **track de prueba** | La compra se hace sobre la app publicada en Play |

RevenueCat lo detecta del propio recibo o token de compra y etiqueta la transacción. En el panel
las dos poblaciones se separan con el filtro **Sandbox / Production**, que es lo que hace parecer
que hay «un modo»: no lo hay, hay una vista filtrada.

**Lo único que sí es otro entorno es la clave `test_…`** del Test Store de RevenueCat, que sirve
para dibujar el paywall sin conectar ninguna tienda y **no cobra nada**. Ese es el bloque *Test
configuration · Configure sandbox access* del panel. Publicar con esa clave sería el error real —
y hoy no está en `.env`: las dos que hay son las de tienda.

**Lo que sí hay que revisar antes de cobrar de verdad**, que es distinto de cambiar de modo:

| | Por qué |
|---|---|
| Los tres productos **activos y aprobados** en cada tienda | Un producto en «Missing Metadata» no aparece en el paywall, y el SDK devuelve una oferta vacía sin decir por qué |
| **Real-time developer notifications** de Play apuntando al tema de RevenueCat | Sin eso, una renovación o una cancelación en Android tarda en llegar al webhook, y `is_premium` queda desactualizado |
| El webhook responde a los dos | Ya es agnóstico de tienda: decide por el **tipo de evento** y ata la compra por `app_user_id`, y guarda el campo `store` que distingue `APP_STORE` de `PLAY_STORE`. No hace falta tocarlo para Android |

> ⚠️ **`EXPO_PUBLIC_REVENUECAT_ENTITLEMENT` tiene el display name, no el identifier.** Dice
> `Todos Bien Premium`, y tanto el comentario del `.env` como el de `purchases.ts:48` advierten
> que ahí va el *identifier*. **Hoy es inofensivo porque el valor no se usa**: `PREMIUM_ENTITLEMENT`
> se exporta y nunca se indexa contra `entitlements.active` —`purchases.ts:102` explica que se
> pregunta por «algún entitlement»—, y el webhook decide por tipo de evento. Queda anotado
> porque el día que alguien lo use para una comprobación local, va a fallar en silencio y con el
> `.env` diciendo que está bien.

---

## 8 · Los mismos tres productos en Google Play

Escrito el **2026-09-03**, después de conectar Play Console con RevenueCat. Verificado contra la
documentación de RevenueCat el mismo día.

⚠️ **Los productos de Play son nuevos: no se «migran» los de Apple.** Cada tienda tiene su propio
catálogo. Lo único que se comparte es el **entitlement** de RevenueCat, que es lo que hace que una
compra en cualquiera de las dos otorgue lo mismo.

### 8.1 · El modelo de Play no es el de Apple, y es la causa de casi todos los tropiezos

En App Store Connect un producto es una cosa: un identificador con un precio. En Play hay **dos
niveles** y un tipo distinto según el producto:

| Nuestro plan | Qué es en Play | Dónde se crea |
|---|---|---|
| Mensual | **Suscripción** → con un **plan base** de periodo `P1M` | Monetizar → Productos → **Suscripciones** |
| Anual | **Suscripción** → con un **plan base** de periodo `P1Y` | Monetizar → Productos → **Suscripciones** |
| De por vida | **Producto único** → con una **opción de compra** de tipo *Buy* | Monetizar → Productos → **Productos únicos** |

**Lo que de verdad se compra es el plan base, no la suscripción.** La suscripción es apenas el
contenedor. Esto importa porque es exactamente lo que RevenueCat mapea, y explica el formato raro
de identificador de §8.4.

**Y desde el modelo nuevo, el producto único funciona igual**: es un contenedor con una o más
**opciones de compra**, y lo que se compra es la opción. Por eso Play pide dos identificadores
donde uno esperaría uno solo. La regla mental que sirve para los tres: *en Play el catálogo tiene
dos niveles siempre, y el de abajo es el que se cobra.*

**No creamos ofertas.** Una *oferta* en Play es una promoción sobre un plan base —prueba gratis,
precio de entrada— y `MONETIZACION.md` es explícito: **no hay meses de regalo en ningún plan**. Un
plan base sin oferta es válido y es lo que queremos.

### 8.2 · Los identificadores, que no se pueden cambiar nunca

Igual que en Apple: un ID de producto en Play **no se puede editar ni reutilizar** después de
crearlo, ni siquiera borrándolo. Se escriben una vez y se escriben bien. Solo minúsculas, números,
guion bajo y punto, empezando por letra o número.

| | ID de producto | ID del plan base |
|---|---|---|
| Mensual | `premium_monthly` | `monthly` |
| Anual | `premium_annual` | `annual` |
| De por vida | `premium_lifetime` | *(no lleva: es producto único)* |

> **No tienen por qué coincidir con los de App Store Connect** y probablemente no coincidan. Lo que
> los une es el entitlement, no el nombre. **Anotá los de Apple acá cuando los mires**, porque hoy
> no están escritos en ningún documento del proyecto y eso es una deuda: el día que haya que
> depurar un webhook, el `product_id` del evento no le va a decir nada a nadie.

### 8.3 · Pasos en Play Console

Requisito previo: la app tiene que existir en Play Console con el paquete
`com.renzoarroyo.todosbien` y **tener un build subido a algún track**. Sin build, la sección de
monetización no deja activar nada.

**Para cada suscripción (mensual y anual):**

1. **Monetizar → Productos → Suscripciones → Crear suscripción**
2. **ID del producto**: `premium_monthly` — *irreversible*
3. **Nombre**: `Premium mensual` (es interno y para la ficha, no lo ve el comprador en el paywall,
   que lo dibuja la app)
4. Guardar, y dentro de la suscripción: **Agregar plan base**
   - **ID del plan base**: `monthly` — *irreversible*
   - **Tipo**: renovación automática
   - **Periodo de facturación**: 1 mes (anual: 1 año)
5. **Precios**: `S/ 9,90` en Perú. Los países son los de §3 de este documento, sin la UE
6. **Activar** el plan base. Un plan base en borrador **no se puede comprar y no aparece en el
   paywall**, sin ningún mensaje de error

**Para el de por vida:**

⚠️ **Corregido el 2026-09-03, al llegar a la pantalla de verdad.** Este paso decía «ID, precio,
activar», y es más que eso: desde el modelo nuevo de **productos únicos**, un producto único
también tiene **dos niveles**, igual que las suscripciones. Lo que se compra es una **opción de
compra**, no el producto.

1. **Monetizar → Productos → Productos únicos → Crear producto**
2. **ID del producto**: `premium_lifetime` — *irreversible*
3. Dentro del producto, crear la **opción de compra**:

   | Campo | Valor | Por qué |
   |---|---|---|
   | **ID de la opción de compra** | `lifetime` | Es irreversible igual que el del producto. Máximo 63 caracteres |
   | **Tipo de compra** | **Buy** (comprar) | *Buy* otorga el derecho **permanente**, que es exactamente el plan de por vida. *Rent* es alquiler con vencimiento —48 h, 72 h, 30 o 60 días— y no tiene nada que ver |
   | **Etiquetas** | vacío | Sirven para agrupar productos en la API de Play. No las usamos |
   | **Permitir comprar más de uno en una transacción** | **desmarcado** | Nadie compra dos Premium de por vida a la vez |
   | **Clasificación** | **Contenido digital** | Es una licencia perpetua a funciones de software, que es el ejemplo que da Google para esa categoría. *Servicio* es para marketplaces, streaming y «la mayoría de las suscripciones» |

4. **Precio**: `S/ 79,90`, en los países de §3
5. **Activar**

> ✅ **La primera opción de compra de tipo *Buy* queda marcada como «compatible con versiones
> anteriores» automáticamente**, y eso es justo lo que queremos: es la que ven las versiones 7 y
> anteriores de la Play Billing Library, y por lo tanto la que resuelve cuando algo pide el
> producto por su ID a secas. Como creamos **una sola**, no hay nada que elegir — pero si algún día
> se agrega una segunda, hay que saber que la marca no se mueve sola.

> **Sobre «Contenido digital» vs «Servicio»:** la clasificación existe para reglas de impuestos y
> de protección al consumidor **en el Espacio Económico Europeo**, que es donde hoy no
> distribuimos (§3: España e Italia quedaron afuera). O sea que hoy la respuesta no tiene efecto
> práctico. Se elige *Contenido digital* igual, porque es la correcta y porque el día que se abra
> la UE nadie va a volver a mirar esta pantalla.

### 8.4 · Pasos en RevenueCat

1. **Products → New → Import Products**, eligiendo la app de **Play Store** (`app81b5d0c59d`).

   🔴 **Importar, no teclear.** RevenueCat consulta la cuenta de Play conectada y **lista los
   productos que la tienda expone de verdad**, con el identificador ya en el formato que le sirve.
   Teclearlo a mano es la forma más común de terminar con un producto que RevenueCat no encuentra
   y un paywall vacío sin ningún error.

   Lo que hay que esperar en la lista:

   | Producto | Identificador |
   |---|---|
   | Mensual | `premium_monthly:monthly` |
   | Anual | `premium_annual:annual` |
   | De por vida | `premium_lifetime`, posiblemente con `:lifetime` |

   **El formato de una suscripción de Play es `<id_producto>:<id_plan_base>`**, porque RevenueCat
   mapea **planes base**: son lo que la persona compra. (El formato sin dos puntos solo aplica a
   suscripciones creadas antes de febrero del 2023, que no es nuestro caso.)

   ⚠️ **Para el producto único no está documentado, y por eso se importa en vez de adivinar.** La
   documentación de RevenueCat todavía describe el modelo viejo —«créalo en *In-app products* como
   no consumible»— y no menciona las **opciones de compra** que Play ya pide (§8.3). Como la única
   opción de compra queda marcada compatible con versiones anteriores, lo más probable es que
   aparezca como `premium_lifetime` a secas; **lo que valga es lo que muestre el importador**.
   Si el producto único no aparece en la lista, no es un error de configuración: es una limitación
   conocida de la que hay reportes, y ahí sí toca agregarlo a mano con el ID que muestre Play.

2. 🔴 **Marcar `premium_lifetime` como NO CONSUMIBLE en RevenueCat.** Es el paso que más caro sale
   olvidar: **si no se marca, RevenueCat consume la compra automáticamente y la persona puede
   volver a comprar el plan de por vida**, pagándolo dos veces. Necesita el SDK de Android 7.11.0 o
   superior; nosotros vamos en `react-native-purchases` 10.7.1, así que está cubierto.

   > En Apple este problema no existe porque el tipo *no consumible* se declara en la propia tienda.
   > En Play todos los productos únicos son «gestionados» y **quien decide si se consume es el
   > cliente** — acá, RevenueCat.

3. **Attachar los tres al entitlement**, el mismo que ya usan los de iOS. Sin esto la compra se
   registra y **no otorga nada**.

4. **Offerings → el offering por defecto → agregar los tres como paquetes**, usando los tipos
   estándar `$rc_monthly`, `$rc_annual` y `$rc_lifetime`. **El paywall lee el offering**, no el
   catálogo: un producto importado y attachado al entitlement pero fuera del offering **no se
   muestra**.

### 8.5 · Si el paywall sale vacío en Android

En orden de probabilidad, y ninguna de las cinco tira un error legible:

| # | Causa | Cómo se ve |
|---|---|---|
| 1 | El build no llegó por Play | «El artículo que solicitaste no está disponible». Play Billing **no responde a un APK instalado a mano**: hay que subirlo a un track de internal testing y comprar con una cuenta *license tester* |
| 2 | El plan base quedó en borrador | Offering vacío, sin mensaje |
| 3 | El identificador se cargó sin `:<plan_base>` | RevenueCat no encuentra el producto |
| 4 | Los productos no están en el offering | El SDK devuelve un offering sin paquetes |
| 5 | La clave `goog_…` mal copiada | El SDK no configura y `purchasesEnabled` queda en `false`: el botón de Premium sale deshabilitado |

**Lo primero que hay que mirar siempre es el punto 1**, porque es el único que no se arregla en
ningún panel y es el que más tiempo hace perder buscando en el lado equivocado.

### 8.6 · Lo que NO hay que tocar

El **webhook** ya es agnóstico de tienda. Decide por **tipo de evento**, ata la compra por
`app_user_id` —el UUID de Supabase que manda `Purchases.logIn()`— y guarda el campo `store` que
distingue `APP_STORE` de `PLAY_STORE`. Una compra de Android va a poner `is_premium = true` por el
mismo camino que una de iOS, sin una línea nueva.

Lo que sí hay que configurar del lado de Play, y es fácil de pasar por alto porque no está en
RevenueCat: las **notificaciones para desarrolladores en tiempo real** de Play Console apuntando al
tema de Pub/Sub que indica RevenueCat. Sin ellas la compra inicial llega igual, pero **las
renovaciones y las cancelaciones tardan**, y `is_premium` se queda desactualizado.
