# Guía paso a paso: correo de login con Resend

Objetivo: que al pedir acceso llegue un **código de 6 dígitos** en vez de un link.

## Por qué hace falta esto

Dos razones, y las dos son bloqueantes:

1. **No se puede editar la plantilla con el SMTP por defecto.** Desde el 3 de junio de
   2026, los proyectos free *nuevos* de Supabase no pueden modificar las plantillas de
   correo si usan el SMTP incluido. La excepción oficial: *"Free-tier projects that
   configure their own SMTP provider can continue to customize templates freely."*
2. **El SMTP por defecto son 2 correos por hora** y Supabase aclara que *"no está pensado
   para producción"*. Con SMTP propio pasa a 30/hora.

Efecto secundario bueno: con `{{ .Token }}` el correo **no lleva ningún link**, así que
el problema del redirect a `localhost` desaparece sin tocar código.

---

## Paso 1 · Cuenta en Resend

1. Entra a `https://resend.com` y crea una cuenta.

> ⚠️ **Importante:** registrate con **el mismo correo con el que vas a probar el login**.
> Sin dominio verificado, Resend solo permite enviar a la dirección de tu propia cuenta:
> *"You can only send testing emails to your own email address."*
> Si te registrás con un correo y probás el login con otro, no va a llegar nada.

2. En el panel, andá a **API Keys** → **Create API Key**.
3. Permiso: **Sending access** alcanza.
4. Copiá la key (se muestra una sola vez). Empieza con `re_`.

---

## Paso 2 · Cargar el SMTP en Supabase

Supabase → tu proyecto → **Authentication** → **Emails** → pestaña **SMTP Settings**.

Activá **Enable Custom SMTP** y completá:

| Campo | Valor |
|---|---|
| Sender email | `onboarding@resend.dev` |
| Sender name | `Todos Bien` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | tu API key de Resend (la que empieza con `re_`) |

Guardá.

> El sender **tiene que ser** `onboarding@resend.dev` mientras no tengas dominio
> verificado. Cualquier otro remitente va a fallar con un 403.

---

## Paso 3 · Cambiar las plantillas para que manden el código

Supabase → **Authentication** → **Emails** → pestaña **Templates**.

Hay que editar **DOS plantillas**, no una sola:

- **Confirm signup** → la que recibe alguien que entra **por primera vez**
- **Magic Link** → la que recibe alguien que **ya tiene cuenta**

Si editás solo una, la mitad de los usuarios va a seguir recibiendo un link.

En **cada una** de las dos, reemplazá todo el cuerpo por esto:

```html
<h2>Tu código de acceso</h2>

<p>Usá este código para entrar a Todos Bien:</p>

<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;">
  {{ .Token }}
</p>

<p>Vence en una hora. Si no pediste este código, puedes ignorar este correo.</p>

<hr />
<p style="color:#6C6C70;font-size:12px;">
  Todos Bien no reemplaza a los canales oficiales de emergencia: bomberos, PNP e INDECI.
</p>
```

Y en el **Subject** de las dos poné algo como:

```
Tu código de acceso a Todos Bien
```

Guardá cada plantilla.

---

## Paso 4 · Probar

1. Abre la app y pide el código con **el correo de tu cuenta de Resend**.
2. Debería llegar un correo con un número de 6 dígitos y **sin ningún link**.
3. Escribilo en la pantalla de verificación y deberías entrar.

Si no llega, mirá el log de envíos en Resend (**Emails** en el panel): ahí se ve si el
correo salió, rebotó o fue rechazado.

---

## Errores comunes

| Síntoma | Causa |
|---|---|
| No llega nada, y Resend muestra un 403 | Estás probando con un correo distinto al de tu cuenta de Resend, o el sender no es `onboarding@resend.dev` |
| Llega un link en vez del código | Falta editar una de las dos plantillas (probablemente *Confirm signup*, la de usuarios nuevos) |
| "Email rate limit exceeded" | Todavía está activo el SMTP por defecto: revisa que *Enable Custom SMTP* haya quedado guardado |
| El código no es aceptado | Ya venció (1 hora) o ya se usó. Pedí uno nuevo |

---

## Pendiente antes de tener usuarios reales

Verificar un **dominio propio** en Resend y cambiar el sender a algo tipo
`hola@tudominio.com`. Sin eso, la app solo puede mandar correos a tu propia casilla.

Ese mismo dominio hace falta también para el link de invitación
(`INVITE_BASE_URL` en `src/lib/config.ts`). Ver `docs/ESTADO-DEL-PROYECTO.md`.
