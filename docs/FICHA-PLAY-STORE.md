# Ficha de Google Play — texto listo para pegar

Lo que pide Play Console en **Crecimiento → Presencia en Play Store → Ficha principal**, más los
formularios de **Política → Contenido de la app** que bloquean la publicación. Escrito el
**2026-09-03**.

> **Cada afirmación de acá sale de `QUE-PROMETE-LA-APP.md`**, igual que la ficha de Apple. Si
> algo suena mejor pero no está respaldado ahí, no se cambia acá: se cambia primero allá.

Los largos están **contados**, no estimados, y verificados contra la documentación de Google del
2026-09-03.

---

## 0 · Lo que hay que saber antes de empezar, porque cambia el calendario

🔴 **Una cuenta de desarrollador *personal* creada después del 13 de noviembre del 2023 no puede
publicar en producción hasta correr una prueba cerrada con 12 testers, opted-in de forma continua
durante 14 días.** Recién ahí se puede *solicitar* acceso a producción, y la revisión tarda hasta
siete días más.

Esto **no** aplica a cuentas de organización. La política de privacidad declara a Renzo Arroyo
como **persona natural con RUC**, así que si la cuenta se abre a nombre de la persona, aplica.

**Consecuencia práctica: entre abrir la cuenta y estar en producción hay tres semanas como piso**,
y son de calendario, no de trabajo. Conviene abrir la cuenta y arrancar la prueba cerrada **ahora**,
en paralelo con lo de Apple, aunque la app todavía no esté terminada para Android. Los 14 días
corren igual.

| | |
|---|---|
| Costo de la cuenta | USD 25, pago único |
| Verificación de identidad | Hasta 48 h, y hay que tenerla antes de poder crear la app |
| Prueba cerrada | 12 testers × 14 días continuos |
| Solicitud de producción | Hasta 7 días de revisión |

---

## 1 · Campos cortos

| Campo | Valor | Largo |
|---|---|---|
| **Nombre de la app** | `Todos Bien` | 10 / 30 |
| **Descripción corta** | `Avisa a los tuyos que estás bien tras el sismo, y ve quién respondió.` | 69 / 80 |
| **Categoría** | Herramientas (*Tools*) | — |
| **Etiquetas** | Hasta 5, elegidas de la lista fija de Google. Las que aplican: *Utilidades*, *Seguridad*, *Comunicación* | — |
| **Correo de contacto** | `todosbienapp@gmail.com` | — |
| **Sitio web** | `https://todosbien.app` | — |
| **Política de privacidad** | `https://todosbien.app/privacidad` | — |

**Por qué el nombre se queda en «Todos Bien» y no en algo como «Todos Bien · Alerta de sismos».**
Play no tiene campo de subtítulo ni de keywords, así que tienta meter términos en el nombre. Dos
razones para no hacerlo: Google suspende apps por *«uso repetitivo o irrelevante de palabras clave
en el nombre»*, y la palabra «alerta» está prohibida en esta ficha por `QUE-PROMETE-LA-APP.md` §8 —
en Perú «alerta sísmica» significa SASPe, o sea alerta temprana, que es exactamente lo que la app
no hace.

**La descripción corta es el campo más importante de Play.** Es lo que se lee en los resultados de
búsqueda, antes de que nadie despliegue nada. Dice qué hace y qué se obtiene, en ese orden.

> **En Play no hay campo de keywords: el índice de búsqueda es la descripción completa.** Por eso
> los términos que en Apple viven en las 100 caracteres de keywords —sismo, terremoto, temblor,
> IGP, simulacro, familia, emergencia— tienen que aparecer **naturalmente** dentro del texto de §2.
> No hay que agregar una lista al final: eso es keyword stuffing y se penaliza.
>
> 🔧 **Al comprobarlo el 2026-09-03 faltaba «temblor»**, que es de las búsquedas más comunes en
> Perú. El texto solo traía las formas verbales («tiembla», «tembló») y no el sustantivo. Se
> arregló cambiando **una palabra** en la fuente única —*«cuando un sismo entra en tus criterios»*
> → *«cuando un temblor entra en tus criterios»*—, que suma el término sin gastar caracteres ni
> quitarle nada a la ficha de Apple, donde «temblor» ya vivía en las keywords.
>
> Se comprueba con el mismo script de abajo; los siete términos tienen que dar `True`.

---

## 2 · Descripción completa (4000)

**No se copia acá.** El texto es **el mismo de `FICHA-APP-STORE.md` §2**, con las sustituciones de
abajo y nada más.

**Y esto es una decisión, no pereza.** Dos descripciones de 4000 caracteres en dos archivos
distintos se desincronizan — es literalmente lo que pasó con el párrafo de Premium, que sobrevivió
tres semanas a la función que describía y estaba a la vez en la ficha, en el paywall y en la
landing. Una sola fuente y una lista corta de diferencias se puede **verificar**; dos copias solo
se pueden comparar a ojo.

| Dónde | En la ficha de Apple dice | En Play va |
|---|---|---|
| Viñeta de «LO QUE NO HACE» | `No garantiza la entrega: Apple entrega las notificaciones con el mejor esfuerzo.` | `No garantiza la entrega: Google entrega las notificaciones con el mejor esfuerzo.` |

Una sola sustitución. **3964 / 4000** caracteres resultantes.

Para generarla:

```bash
python3 - <<'PY'
import re
t = open('docs/FICHA-APP-STORE.md', encoding='utf-8').read()
i = t.index('## 2 · Description')
d = re.search(r'```\n(.*?)\n```', t[i:], re.S).group(1)
d = d.replace('Apple entrega las notificaciones', 'Google entrega las notificaciones')
assert 'Apple' not in d, 'quedó una mención a Apple sin traducir'
print(d)
print('\n---', len(d), '/ 4000', file=__import__('sys').stderr)
PY
```

> ⚠️ El `assert` está a propósito: si algún día la descripción de Apple suma otra mención a Apple,
> el script **falla** en vez de publicar en Play un texto que habla de la tienda equivocada.

---

## 3 · Gráficos

Verificado contra la documentación de Google el 2026-09-03.

| Recurso | Especificación | ¿Obligatorio? |
|---|---|---|
| **Ícono** | PNG de 32 bits (con alfa), **512 × 512**, máximo 1024 KB | Sí |
| **Gráfico destacado** | JPEG o PNG de 24 bits (**sin alfa**), **1024 × 500** | **Sí** |
| **Capturas de teléfono** | Mínimo **2**, máximo 8. Lado menor ≥ 320 px, lado mayor ≤ 3840 px, y el mayor no puede pasar del doble del menor. Relación 16:9 apaisado o **9:16 vertical**. JPEG o PNG de 24 bits sin alfa | Sí |

🔴 **El gráfico destacado no existe en Apple y es obligatorio en Play.** Es la pieza que más se
olvida: sin ella no se puede publicar, y es la portada de la app en las colecciones promocionales.
Es un lienzo de 1024 × 500 **sin transparencia** — hay que diseñarla, no recortarla de una captura.

**Las capturas son las mismas ocho de `FICHA-APP-STORE.md` §5**, reencuadradas a 9:16. Google
recomienda al menos **cuatro** de 1080 px o más para entrar en las secciones de recomendación de
formato grande, así que las ocho ya cumplen de sobra.

Valen las tres reglas de la ficha de Apple, y la tercera con más razón acá: ningún dato real de
nadie, nada de rojo urgente sin alerta real, y ninguna palabra que diga «alerta» a secas.

---

## 4 · Seguridad de los datos (*Data safety*)

Es el equivalente de las Nutrition Labels, **con preguntas distintas**. La hoja de respuestas de
Apple está en `PRIVACIDAD-APP-STORE.md`; acá van solo las tres cosas que Google pregunta y Apple
no. Las dos declaraciones tienen que decir lo mismo, y las dos tienen que coincidir con
`../todos-bien-website/privacidad/index.html`, que es la URL que se declara arriba.

| Pregunta de Google | Respuesta | Por qué |
|---|---|---|
| ¿Los datos van **cifrados en tránsito**? | **Sí** | Todo pasa por HTTPS contra Supabase y por APNs/FCM |
| ¿El usuario puede **pedir que se borren** sus datos? | **Sí**, y hay que dar la URL: `https://todosbien.app/eliminar-cuenta` | La página existe justamente porque Google la exige y Apple no |
| ¿Los datos se **comparten** con terceros? | **No.** *Recopilar* y *compartir* son cosas distintas en este formulario: «compartir» es transferir a otra empresa para sus propios fines. Los proveedores de `privacidad/index.html` §8 tratan datos **por encargo**, que Google no cuenta como compartir | Marcar «sí» acá implicaría declarar destinatarios y fines que no existen |

**Los tipos de datos** salen de la misma tabla de `PRIVACIDAD-APP-STORE.md` §2. La traducción a
las categorías de Google:

| Categoría de Google | ¿Se recopila? | Finalidad |
|---|---|---|
| Ubicación aproximada y **precisa** | Sí, opcional | Funciones de la app |
| Información personal → Nombre, Correo, **Número de teléfono** | Sí (el teléfono, opcional) | Funciones de la app |
| Mensajes → **Otros mensajes en la app** | Sí — chat individual **y de grupo** | Funciones de la app |
| Contactos | **No.** La agenda se convierte en códigos irreversibles dentro del teléfono y no se guarda | — |
| ID de dispositivo o de otro tipo | Sí — el UUID de la cuenta y el token de notificaciones | Funciones de la app |
| Actividad en apps, Rendimiento, Publicidad, Salud, Finanzas, Historial de navegación | **No** | — |

> **Ojo con «Contactos» igual que en Apple**, y por el mismo motivo: se declara **No** y hay que
> poder sostenerlo. Lo que sale del teléfono son hashes, no la agenda. El matiz —que el
> `phone_hash` **propio** sí se guarda— ya está declarado como *Número de teléfono*.

---

## 5 · Clasificación de contenido (cuestionario IARC)

Se contesta una vez y Google emite la clasificación. Las tres preguntas que **no** son obvias y
que en esta app se contestan distinto a como uno esperaría:

| Pregunta | Respuesta | Por qué |
|---|---|---|
| ¿Permite a los usuarios **interactuar o intercambiar contenido**? | **Sí** | Hay chat individual y de grupo. Decir que no sería falso y es causal de reclasificación |
| ¿Permite a los usuarios **compartir su ubicación** con otros usuarios? | **Sí** | Es la función central. Google la pregunta explícitamente |
| ¿Tiene compras digitales? | **Sí** | Premium |

Decir «sí» a interacción **obliga a tener moderación**, igual que en Apple: denunciar, bloquear y
un compromiso de actuar. Los cuatro requisitos ya existen y están documentados en
`FICHA-APP-STORE.md` §4 y en los términos §5.1.

Clasificación esperada: **Everyone / Para todos**, o *Teen* por la interacción entre usuarios.

---

## 6 · Público objetivo y contenido

| Campo | Respuesta |
|---|---|
| **Grupos de edad objetivo** | **18 y más**. Opcionalmente 16-17 |
| ¿La app está **dirigida a niños**? | **No** |
| ¿Contiene **anuncios**? | **No**. La app no tiene ningún SDK de publicidad (`MONETIZACION.md`) |
| ¿Es una **app gubernamental**? | No |
| ¿Tiene **funciones financieras**? | No |
| **App de salud** | **No.** Declararla como app de salud activa un formulario y una política aparte, y esta app no diagnostica ni monitorea nada — mismo criterio que llevó a elegir *Utilidades* y no *Salud* en Apple |
| **Acceso a la app** | Requiere iniciar sesión → hay que dar credenciales de la cuenta demo, igual que a Apple (`REVISION-APPLE.md` §1) |

> ⚠️ **Marcar 13-15 activaría las políticas de Families**, que traen requisitos de diseño y de
> publicidad que no queremos. Y no hay contradicción con los términos, que piden **14 años**
> mínimos para tener cuenta: Google pregunta para quién está *diseñada* la app —adultos que
> coordinan a su familia—, no quién puede usarla. Son dos preguntas distintas y hay que
> contestarlas cada una en sus términos.

---

## 7 · Antes de dar «Enviar a revisión»

- [ ] Verificación de identidad de la cuenta completada
- [ ] **Gráfico destacado de 1024 × 500 diseñado** — es lo que falta con más frecuencia
- [ ] Ícono de 512 × 512 con alfa, y las capturas en 9:16
- [ ] La descripción completa se generó con el script de §2, y el `assert` pasó
- [ ] Data safety contestado, y **coincide con la política publicada** en todosbien.app/privacidad
- [ ] URL de eliminación de datos declarada: `https://todosbien.app/eliminar-cuenta`
- [ ] Cuestionario IARC con **sí** en interacción entre usuarios y en compartir ubicación
- [ ] Credenciales de la cuenta demo cargadas en *Acceso a la app*
- [ ] Los tres productos creados y **activos** (`GUIA-SUSCRIPCIONES.md` §8)
- [ ] La prueba cerrada de 12 testers lleva 14 días corridos
- [ ] La descripción no dice «alerta sísmica» ni «alerta temprana» como algo que la app haga
- [ ] Las capturas no muestran datos de personas reales
