# Guía: el correo de la app (Resend + Supabase)

Desde el 2026-08-20 el acceso es **correo + contraseña**, no código OTP. El correo dejó de
ser la puerta de entrada, pero sigue haciendo falta en dos momentos:

| Momento | Plantilla de Supabase | ¿Obligatoria? |
|---|---|---|
| Confirmar la cuenta recién creada | **Confirm signup** | Solo si *Confirm email* está prendido |
| Recuperar la contraseña | **Reset Password** | Siempre |

La plantilla **Magic Link** ya no se usa: era la del login por código, que se eliminó.

---

## Por qué hay SMTP propio y no el de Supabase

Dos razones, y las dos son bloqueantes:

1. **No se puede editar la plantilla con el SMTP por defecto.** Desde el 3 de junio de
   2026, los proyectos free *nuevos* de Supabase no pueden modificar las plantillas de
   correo si usan el SMTP incluido. La excepción oficial: *"Free-tier projects that
   configure their own SMTP provider can continue to customize templates freely."*
2. **El SMTP por defecto son 2 correos por hora** y Supabase aclara que *"no está pensado
   para producción"*. Con SMTP propio pasa a 30/hora.

Editar las plantillas importa porque las dos mandan **un código**, no un link. Un link
abriría el navegador del teléfono y habría que resolver el deep link de vuelta a la app
para nada; con `{{ .Token }}` el código se escribe dentro de la app y no hay redirect que
configurar.

---

## Configuración actual

Supabase → **Project Settings** → **Authentication** → **SMTP Settings**:

| Campo | Valor |
|---|---|
| Sender email | `hola@todosbien.app` |
| Sender name | `Todos Bien` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la API key de Resend (empieza con `re_`) |

El dominio `todosbien.app` está verificado en Resend (DKIM en
`resend._domainkey.todosbien.app`, SPF y MX en `send.todosbien.app`).

> ⚠️ **El error que costó un día entero.** Verificar el dominio en Resend **no alcanza**:
> hay que cambiar también el *Sender email* en Supabase. Con el dominio ya verificado pero
> el remitente todavía en `onboarding@resend.dev`, Resend seguía respondiendo:
>
> ```
> 550 You can only send testing emails to your own email address (renzoarroyo09@gmail.com)
> ```
>
> y Supabase lo devolvía a la app como **500 "Error sending confirmation email"**. El
> efecto era desconcertante: entrar con el correo del dueño funcionaba y con cualquier
> otro fallaba, que es exactamente lo que se reportó como bug de la app. Son dos ajustes
> en dos paneles distintos y hay que hacer los dos.

---

## Las plantillas

Supabase → **Authentication** → **Emails** → pestaña **Templates**.

### Confirm signup

Solo llega si *Confirm email* está prendido (Authentication → Sign In / Providers →
Email). Con la confirmación apagada, crear la cuenta devuelve sesión al instante y este
correo no se manda nunca.

```html
<h2>Confirma tu cuenta</h2>

<p>Escribe este código en la app para terminar de crear tu cuenta:</p>

<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;">
  {{ .Token }}
</p>

<p>Vence en una hora. Si no creaste ninguna cuenta, puedes ignorar este correo.</p>

<hr />
<p style="color:#6C6C70;font-size:12px;">
  Todos Bien no reemplaza a los canales oficiales de emergencia: bomberos, PNP e INDECI.
</p>
```

Subject: `Confirma tu cuenta de Todos Bien`

### Reset Password

```html
<h2>Recupera tu contraseña</h2>

<p>Escribe este código en la app para poner una contraseña nueva:</p>

<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;">
  {{ .Token }}
</p>

<p>Vence en una hora. Si no pediste cambiar tu contraseña, puedes ignorar este correo:
tu contraseña actual sigue funcionando.</p>

<hr />
<p style="color:#6C6C70;font-size:12px;">
  Todos Bien no reemplaza a los canales oficiales de emergencia: bomberos, PNP e INDECI.
</p>
```

Subject: `Tu código para cambiar la contraseña`

> ⚠️ La plantilla **Reset Password** viene de fábrica con `{{ .ConfirmationURL }}`. Si se
> deja así, la app pide un código de 8 dígitos y a la persona le llega un link: el flujo
> de recuperación queda inutilizable sin ningún error visible.

---

## Largo del código

Authentication → Sign In / Providers → Email → **Email OTP Length**: este proyecto lo
tiene en **8** (el default de Supabase es 6). El cliente lo lee de
`EXPO_PUBLIC_AUTH_CODE_LENGTH`, con 8 como valor por defecto en `src/lib/config.ts`.

Si se cambia en el dashboard hay que cambiarlo también en el `.env`, o el campo de la app
va a esperar más o menos dígitos de los que llegan.

---

## Probar

1. Crea una cuenta con un correo cualquiera (ya no hace falta que sea el de la cuenta de
   Resend).
2. Mira el log de envíos en Resend (**Emails** en el panel): ahí se ve si salió, rebotó o
   fue rechazado.
3. Si algo falla del lado de Supabase, el detalle del proveedor queda en los logs de Auth
   con `error_code: unexpected_failure`.

---

## Errores comunes

| Síntoma | Causa |
|---|---|
| `550 You can only send testing emails to your own email address` | El *Sender email* de Supabase sigue en `onboarding@resend.dev`. Verificar el dominio en Resend no cambia el remitente de Supabase |
| "Error sending confirmation email" en la app | Lo mismo de arriba visto desde el cliente. La app ahora lo traduce a un mensaje entendible (`src/lib/auth-errors.ts`), pero el arreglo es de configuración |
| Llega un link en vez del código | Falta poner `{{ .Token }}` en esa plantilla. La de *Reset Password* es la que más se olvida |
| "Email rate limit exceeded" | Se volvió a activar el SMTP por defecto: revisa que *Enable Custom SMTP* siga guardado |
| El código no es aceptado | Ya venció (1 hora) o ya se usó. Pide uno nuevo |
| El campo pide 8 dígitos y llegan 6 | *Email OTP Length* y `EXPO_PUBLIC_AUTH_CODE_LENGTH` no coinciden |
