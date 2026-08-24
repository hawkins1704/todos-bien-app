# Ícono y marca: qué exportar de Figma y dónde va

Escrito el **2026-08-24**, cuando se descubrió que la app seguía con el ícono de la
plantilla de Expo.

> ## ✅ Reemplazado el mismo día
>
> La marca nueva es un **globo con una onda sísmica** sobre azul, a sangre. Qué se hizo:
>
> | | |
> |---|---|
> | `assets/images/icon.png` | 1024×1024, **alfa removido** con `@expo/image-utils` —la misma librería que usa el prebuild—, así que el resultado es idéntico al que generaría Expo. Verificado: `hasAlpha: no` |
> | `assets/images/splash-icon.png` | 1024×1024 transparente, solo la marca |
> | `assets/images/favicon.png` | 48×48 |
> | `app.json` | `ios.icon` apunta al PNG; se borró `assets/expo.icon/`; el `imageWidth` del splash pasó de **76 a 200** |
> | `assets/images/android-icon-foreground.png` | **Generado**, no exportado: la marca escalada a 800 px sobre lienzo transparente de 1024, para que el globo quede en ~61 % y entre en el círculo seguro de Android |
> | Basura de la plantilla | Borrados `expo-logo`, `expo-badge*`, `react-logo@{1,2,3}x`, `tutorial-web`, `logo-glow`, y los dos PNG de Android que sobraban |
> | Sitio | `assets/icon.png` (512) y `assets/favicon.png` (48) reemplazados, y **las 11 apariciones del chevron** cambiadas por el ícono |
>
> **Falta uno solo: `android-icon-monochrome.png`** — ver §8. No bloquea iOS.
>
> ⚠️ **Nada de esto se ve todavía en la app.** El `ios/` de disco sigue con lo viejo hasta
> correr `npx expo prebuild -p ios --clean` (§6).

---

## 1 · Qué hay hoy, para que quede constancia

| Archivo | Qué es en realidad |
|---|---|
| `assets/expo.icon/` | Bundle de Icon Composer con **una sola capa, llamada `expo-symbol 2.svg`**, y relleno de gradiente automático `#007AFF` — el azul de Apple. Es el ícono de la plantilla |
| `assets/images/icon.png` | 1024×1024, **con canal alfa**. El chevron de Expo sobre azul con grilla |
| `assets/images/splash-icon.png` | **Byte por byte idéntico** a `assets/images/expo-logo.png` |
| Todo `assets/` | Sin tocar desde el 2026-08-17, el día que se creó el proyecto |

Sobra además basura de la plantilla que conviene borrar en la misma pasada:
`expo-badge.png`, `expo-badge-white.png`, `expo-logo.png`, `react-logo@{1,2,3}x.png`,
`tutorial-web.png`, `logo-glow.png`.

> **Nada del código de la app importa estas imágenes.** Las seis referencias salen todas de
> `app.json`. O sea que reemplazarlas es cambiar archivos y una línea de config, sin tocar
> componentes.

---

## 2 · Lo que necesito de Figma

Cuatro archivos alcanzan para iOS y el sitio. Los dos de Android se pueden exportar en la
misma sesión y guardar para cuando toque.

| # | Archivo | Tamaño | Fondo | Para qué |
|---|---|---|---|---|
| 1 | `icon-1024.png` | 1024 × 1024 | **Opaco**, a sangre | El ícono de iOS y el de la App Store |
| 2 | `marca.svg` | Cuadrado, cualquier tamaño | **Transparente** | Splash de la app y la marca del sitio |
| 3 | `favicon-48.png` | 48 × 48 | Opaco | Pestaña del navegador |
| 4 | `sitio-icon-512.png` | 512 × 512 | Opaco | `apple-touch-icon` y previsualización al compartir el link |
| 5 | `android-foreground.png` | 1024 × 1024 | **Transparente** | Android, más adelante |
| 6 | `android-monochrome.png` | 1024 × 1024 | **Transparente**, forma sólida de un color | Ícono monocromo de Android 13+ |

### Las cuatro reglas que rompen la revisión si se ignoran

1. **El ícono de iOS no puede tener transparencia.** Apple rechaza el binario en la
   validación, antes de que lo vea un humano. Figma exporta PNG con alfa siempre, así que en
   el frame tiene que haber un rectángulo de fondo que cubra los 1024 completos. *Si igual
   llega con alfa, lo aplano yo.*
2. **Sin esquinas redondeadas y sin sombra.** El sistema recorta la máscara y la agrega. Un
   ícono con las esquinas ya redondeadas se ve con doble redondeo.
3. **A sangre, pero sin nada crítico en el borde.** iOS recorta las esquinas: dejá al menos
   un ~10 % de margen alrededor de la forma principal.
4. **Nada de texto.** «Todos Bien» a 60 px en la pantalla de inicio no se lee. La marca sola.

### El detalle de Android que no es obvio

El ícono adaptativo se recorta con una máscara que cada fabricante elige —círculo,
*squircle*, gota—. De los 1024 px, **solo se garantiza el círculo central de ~682 px** (dos
tercios). Todo lo que quede fuera puede desaparecer. La forma tiene que caber ahí adentro,
no llenar el cuadrado.

El fondo puede ser un color plano: `app.json` ya tiene `backgroundColor: "#E6F4FE"` y además
un `backgroundImage`. **Recomendación: borrar la imagen de fondo y dejar solo el color de
marca**, que es una cosa menos que mantener.

---

## 3 · La decisión de iOS: PNG plano o Icon Composer

Hay dos formas y `app.json` está usando la segunda sin querer.

| | PNG de 1024 | Bundle `.icon` (Icon Composer) |
|---|---|---|
| Qué es | Una imagen | Capas separadas que iOS 26 compone con vidrio, brillo y sombra en vivo |
| Cómo se hace | Exportar de Figma | Se arma en **Icon Composer**, que viene con Xcode 26, importando las capas |
| Variantes claro/oscuro/*tinted* | Se declaran aparte | Salen solas |
| Trabajo | 5 minutos | Una tarde, y hay que tener Xcode 26 |

**Recomendación para el MVP: PNG plano.** Se cambia una línea, no depende de Xcode y no
tiene forma de salir mal. El look de vidrio de iOS 26 es una mejora visual, no un requisito
de la tienda, y se puede hacer después sin volver a enviar nada más que un build.

Si vamos por PNG, `ios.icon` pasa a apuntar al PNG y el directorio `assets/expo.icon/` se
borra. Opcionalmente, iOS 18+ acepta variantes:

```json
"ios": {
  "icon": {
    "light":  "./assets/images/icon.png",
    "dark":   "./assets/images/icon-dark.png",
    "tinted": "./assets/images/icon-tinted.png"
  }
}
```

La *tinted* es en escala de grises: el sistema le aplica el color. Si no se pasan, iOS usa
la clara para todo, que es perfectamente aceptable.

---

## 4 · Dónde va cada archivo

**En la app** — todo se resuelve en `app.json`:

| Clave | Archivo |
|---|---|
| `expo.icon` | `./assets/images/icon.png` |
| `expo.ios.icon` | el mismo PNG (y se borra `assets/expo.icon/`) |
| `expo.android.adaptiveIcon.foregroundImage` | `./assets/images/android-icon-foreground.png` |
| `expo.android.adaptiveIcon.monochromeImage` | `./assets/images/android-icon-monochrome.png` |
| `expo.web.favicon` | `./assets/images/favicon.png` |
| plugin `expo-splash-screen` → `image` | `./assets/images/splash-icon.png` (la marca sola, fondo transparente) |

> **El splash tiene otro problema:** `imageWidth` está en **76**, que es el valor de la
> plantilla y se ve diminuto sobre el azul. Con la marca nueva conviene subirlo a **160–200**
> y mirarlo en el dispositivo.

**En el sitio** (`../todos-bien-website`):

| Archivo | Qué es |
|---|---|
| `assets/favicon.png` | El de 48 |
| `assets/icon.png` | El de 512 |
| La marca **SVG en línea**, en el header y el footer | **11 apariciones en 6 archivos HTML** |

Esa última es la que se olvida. El chevron actual está escrito a mano dentro del HTML de
`index.html`, `privacidad/`, `terminos/`, `soporte/`, `eliminar-cuenta/` y `404.html`:

```html
<svg viewBox="0 0 24 24" fill="none">
  <path d="M4.5 17.5 12 6.8l7.5 10.7" stroke="#fff" stroke-width="3.4"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Si la marca nueva es otra forma, hay que reemplazar las 11. Por eso pido el `marca.svg`: de
ahí sale el `path`.

---

## 5 · Cuántos archivos, y qué genera Expo solo

**Uno por propósito.** No hay que exportar los veinte tamaños de antes: el `prebuild` toma
cada imagen de `app.json` y genera todas las densidades y variantes que pide cada
plataforma.

| Lo que entregás | Lo que Expo genera con eso |
|---|---|
| 1 PNG de 1024 | El *asset catalog* de iOS entero |
| 1 PNG transparente del splash | `image.png`, `@2x` y `@3x` |
| 1 foreground + 1 monochrome | Todos los *mipmaps* de Android, en sus cinco densidades |
| 1 favicon | El de web |

Así que para lanzar en iOS alcanza con **tres archivos**, y dos más para el sitio. Los dos de
Android se pueden dejar listos y usar después.

### Dónde va cada uno, con el nombre exacto

Si respetás estos nombres, `app.json` casi no cambia — los archivos se pisan y listo:

```
todos-bien/assets/images/
├── icon.png                       1024×1024 opaco          ← reemplaza el de la plantilla
├── splash-icon.png                1024×1024 transparente   ← hoy es el logo de Expo
├── favicon.png                    48×48
├── android-icon-foreground.png    1024×1024 transparente   (después)
└── android-icon-monochrome.png    1024×1024 transparente   (después)

todos-bien-website/assets/
├── icon.png                       512×512 opaco
└── favicon.png                    48×48
```

Más el `marca.svg` en cualquier lado: de ahí saco el `path` para las 11 apariciones del
sitio. No queda como archivo.

**Opcionales de iOS 18+**, si querés ícono claro/oscuro/*tinted*: `icon-dark.png` y
`icon-tinted.png`, los dos de 1024. Si no están, iOS usa el claro para todo, que es
perfectamente aceptable.

---

## 6 · 🔴 El ícono NO cambia hasta correr `prebuild`

Esto es específico de cómo se compila este proyecto: **el `.ipa` se arma local con Xcode** y
`eas submit` lo sube. Y la carpeta `ios/` existe en el disco —está en `.gitignore`, pero no
se regenera sola en cada build—.

Verificado el 2026-08-24 contra los archivos generados:

| Qué | Qué tiene el proyecto nativo de disco |
|---|---|
| `ios/TodosBien/Info.plist` | **Los textos de permiso viejos**, los que se corrigieron en `app.json` ese mismo día |
| `ios/TodosBien/expo.icon` | El bundle de la plantilla, copiado adentro |
| `AppIcon.appiconset/Contents.json` | Sin ninguna imagen: el ícono sale del `.icon` |
| `SplashScreenLogo.imageset/` | El logo de Expo, en sus tres densidades |

O sea que **archivar hoy desde Xcode produce un binario con el ícono de Expo y los textos de
permiso retirados**, por más que `app.json` diga otra cosa.

```bash
npx expo prebuild -p ios --clean
```

`--clean` borra `ios/` y lo regenera desde `app.json`. Es lo correcto acá porque no hay
código nativo escrito a mano — pero **si alguna vez tocaste algo dentro de Xcode que no esté
en `app.json` o en un config plugin, se pierde**.

> **De paso, un detalle del flujo local:** `app.json` no declara `ios.buildNumber`, así que
> cada `prebuild` deja `CFBundleVersion` en **1**. El `autoIncrement` de `eas.json` solo
> aplica a builds de EAS, no a los locales, y App Store Connect **rechaza un número de build
> repetido** para la misma versión. Conviene fijarlo en `app.json` y subirlo a mano en cada
> envío.

---

## 7 · Qué hago yo cuando lleguen los archivos

Dejalos en una carpeta y yo hago el resto:

1. Aplano el alfa del ícono de iOS si viene con transparencia, y verifico 1024×1024 exactos.
2. Los pongo en su lugar, actualizo `app.json` y borro `assets/expo.icon/` y la basura de la
   plantilla.
3. Ajusto `imageWidth` del splash.
4. Reemplazo las 11 apariciones del SVG en el sitio, más el favicon y el `apple-touch-icon`.
5. Verifico que ninguna imagen quede referenciada y rota.

Lo que **no** puedo verificar desde acá es cómo se ve en un teléfono. Eso se mira en el
build, junto con el splash.

---

## 8 · Lo único que falta: el ícono monocromo de Android

Es el que usa Android 13+ cuando la persona activa los «iconos temáticos»: el sistema toma
**la silueta** y la pinta con el color del fondo de pantalla. Por eso no se puede generar
automáticamente desde el globo a color — una silueta automática sería un círculo relleno, y
la onda sísmica, que es lo que identifica a la marca, desaparecería.

**Qué exportar de Figma**, cuando toque Android:

- 1024 × 1024, PNG, **fondo transparente**.
- La marca **en blanco puro sobre nada**: sin colores, sin degradados, sin sombras. Solo
  importa la forma; el color lo pone el sistema.
- La misma **zona segura**: la forma dentro del círculo central de ~660 px.
- Concretamente para esta marca: el contorno del globo y la onda sísmica como trazos
  blancos, sin los continentes rellenos —que a ese tamaño se convertirían en una mancha—.

Mientras no exista, `app.json` **no declara `monochromeImage`**, y eso es correcto: Android
usa el ícono adaptativo normal y no se ve nada roto. Declararlo apuntando al de la plantilla
sí sería un problema.
