# Dónde se publica la app y en qué idiomas

Decidido el **2026-08-24**. Este documento existe porque la decisión no estaba escrita en
ningún lado y **la app asume Perú en cuatro lugares del código**, no solo en la copy.

- `QUE-PROMETE-LA-APP.md` manda sobre lo que se dice en público; acá va **a quiénes** se les
  dice y en qué idioma.
- El trabajo que sale de acá está indexado en `QUE-FALTA.md`.

---

## 1 · La decisión

| | |
|---|---|
| **Mercados** | Latinoamérica, Estados Unidos y países de Asia |
| **Idiomas** | Español e inglés. Nada más, por ahora |
| **Primer envío a App Store** | **Solo Perú** — ver §4, que es la parte importante |

---

## 2 · Por qué el primer envío va solo a Perú

No es una objeción a la decisión de arriba: es el orden. Publicar hoy en Estados Unidos o en
Asia entrega una app que **funciona a medias y no lo dice**, y eso se paga dos veces — con el
usuario que la instala y con la revisión de Apple, que evalúa la app en inglés y desde
Estados Unidos.

Cuatro cosas concretas, verificadas contra el código, no supuestas:

### 2.1 El aviso por «sismo fuerte en tu país» solo funciona en Perú

`private.quake_applies()` (migración 0010) tiene tres reglas. La segunda —la que avisa de un
sismo grande aunque haya ocurrido lejos de tu radio— es:

```sql
or (q_country_code = p_country_code and q_magnitude >= p_countrywide_magnitude)
```

y **el USGS no trae `country_code`**: viene NULL para todos sus eventos (ESTADO §1.6.4.2, el
mapa de procedencia se interpreta del texto `place` justamente por eso). O sea que fuera de
Perú esa regla no se evalúa nunca.

**Qué sí funciona fuera de Perú:** la regla del radio, que es la principal. El USGS se ingiere
sin filtro geográfico (`2.5_day` mundial cada 2 minutos), así que alguien en Tokio o en
California recibe los sismos dentro de su radio y sobre su umbral igual que alguien en Lima.
Y la regla mundial de Premium también, porque no mira el país.

**Qué se pierde:** un M7 a 400 km, fuera del radio configurado, que en Perú sí avisaría.

### 2.2 El teléfono se normaliza como peruano

`normalizeToE164(raw, defaultCountry = 'PE')` y el onboarding lo llama literalmente con
`'PE'` (`src/app/(onboarding)/profile.tsx`). `user_settings.country_code` existe y tiene
default `'PE'`, y *Mi cuenta* sí lo respeta — pero **nadie lo captura nunca**.

Consecuencia: alguien en Estados Unidos que escribe su número sin `+1` queda registrado con
un hash equivocado. Y el hash es la **única** vía de conexión desde que se quitaron los
códigos de invitación, así que no es un detalle cosmético: esa persona no aparece para nadie
y nadie aparece para ella. Falla en silencio, que es la peor forma.

### 2.3 El contenido es peruano

Los 12 tips citan a la **Cruz Roja Peruana**; los descargos nombran a **bomberos, PNP e
INDECI**; la latencia se explica con el **IGP**; y la comparación con el **SASPe** —el
argumento central de por qué esto no es alerta temprana— no significa nada fuera del Perú.
Traducir las palabras no arregla esto: hay que decidir el equivalente local o generalizar.

### 2.4 Los precios están en soles

`index.html` del sitio muestra S/ 5 y S/ 29. Las tiendas convierten solas el precio del
producto, pero el **sitio** no, y es lo que ve alguien en Estados Unidos antes de descargar.

---

## 3 · Qué hace falta para publicar fuera de Perú

| # | Trabajo | Dónde |
|---|---|---|
| A1 | **i18n en la app: español e inglés.** No hay librería de traducción; la copy está incrustada en los `.tsx`. Es el trabajo más grande de la lista | Todo `src/app` y `src/components` |
| A2 | **Capturar el país en el onboarding** y pasarlo a `normalizeAndHash` en vez de `'PE'` fijo | `src/app/(onboarding)/profile.tsx`, `src/lib/phone.ts` |
| A3 | **Textos de permiso en inglés.** Las purpose strings del `Info.plist` se localizan con `InfoPlist.strings`, no con el `app.json` | Config nativa |
| A4 | **Decidir la regla «país» fuera de Perú.** Lo más simple: derivar el país del evento del `place` del USGS, que ya se hace para el feed (`src/lib/geo.ts`), y guardarlo en `quake_events.country_code` al ingerir | `supabase/functions/ingest-quakes` |
| A5 | **Tips y descargos por país**, o una versión neutra que no nombre instituciones peruanas | Migración 0005, textos de la app |
| A6 | **Ficha de tienda en inglés** y precios que no sean solo soles en el sitio | `FICHA-APP-STORE.md`, sitio |
| A7 | **Páginas legales en inglés.** La URL de privacidad es una sola para todos los mercados y es la que abre el revisor | `../todos-bien-website` |

**Nada de esto bloquea el envío a Perú.** Todo bloquea el envío a los demás mercados.

---

## 4 · El orden recomendado

1. **Enviar a revisión con disponibilidad solo en Perú.** La app está completa para ese
   mercado y la ficha se escribe en español.
2. Con la app ya aprobada, hacer A1 a A7 como una versión 1.1.
3. **Ampliar la disponibilidad territorial es un cambio de ficha, no un envío nuevo**: se
   marca desde App Store Connect y no exige recompilar. Por eso ampliar después no cuesta
   nada, y publicar antes de tiempo sí.

> Si la decisión es publicar en todos los mercados desde el día uno, se puede: nada de lo de
> §2 es un rechazo de Apple. Lo que sí ocurre es que un usuario en Estados Unidos se
> encuentra con una app en español, que puede registrar mal su teléfono y que le habla del
> IGP. Es una decisión de producto, no técnica, y queda anotada acá para que sea explícita.

---

## 5 · Sobre el inglés: alcance mínimo aceptable

Cuando se haga, «traducir la app» significa como mínimo:

- Las **7 superficies que hacen una promesa** del inventario de `QUE-PROMETE-LA-APP.md` §10,
  más el `app.json`, que se sumó a ese inventario el 2026-08-24.
- El **texto del aviso de sismo**, que se arma en el servidor
  (`supabase/functions/send-alerts` → `buildMessage()`) y en Postgres para los avisos entre
  personas (migración 0015). Un aviso que llega en español a alguien que puso el teléfono en
  inglés es el recordatorio más visible de que la app no es para él.
- La **ficha de la tienda** y las **páginas legales**.

El paywall se traduce en el dashboard de RevenueCat, no en el código (ESTADO §1.9.1).
