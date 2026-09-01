# Guía de suscripciones: App Store Connect y RevenueCat

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

**Los tres dan exactamente el mismo entitlement**, que en RevenueCat se llama `premium` —
así lo lee el cliente (`src/lib/purchases.ts`) y así lo resuelve el webhook. Si el
identificador del entitlement cambiara, hay que tocar `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT`.

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

**Lo que hay que cambiar de fondo:** hoy vende «el mundo» (los sismos globales). El argumento
pasó a ser **Guardián**, que es lo que ya cuentan la landing y la ficha.

### Título

```
Sabe de los tuyos, en el momento
```

### Subtítulo

```
Te avisamos apenas tiembla cerca de alguien de tu red, estés donde estés, y otra vez cuando reporta que está bien.
```

### Lista de beneficios

```
Guardián: te avisamos apenas tiembla cerca de un contacto, con su nombre y a cuántos kilómetros

El aviso de cierre: «ya reportó que está bien», que es el que de verdad esperabas

Sismos de todo el mundo, para los tuyos que viven lejos

Hasta 5 planes de acción con nombre, uno por situación

Simulacros ilimitados
```

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
