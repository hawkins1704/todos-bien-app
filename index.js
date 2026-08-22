/**
 * Punto de entrada de la app.
 *
 * Existe por una sola razón, y es la que hace que la promesa central del
 * producto sea posible: **la tarea de fondo tiene que estar definida antes que
 * cualquier otra cosa.**
 *
 * Cuando llega un push silencioso con la app cerrada, iOS levanta el bundle de
 * JS en modo *headless*: no monta ninguna pantalla, no arranca la navegación,
 * solo ejecuta el código y busca la tarea ya registrada. La documentación de
 * expo-notifications lo pide explícitamente:
 *
 *   "Make sure you define and register the task in the module scope of a JS
 *    module which is **required early** by your app (e.g. in the index.ts file)"
 *
 * 🔴 **Estaba en `src/app/_layout.tsx`**, que es una pantalla del router. En un
 * arranque normal se evalúa y todo funciona; en un arranque headless puede no
 * evaluarse nunca, porque expo-router carga las rutas al renderizar y ahí no se
 * renderiza nada. O sea que la tarea existía justo cuando no hacía falta y
 * faltaba justo cuando sí.
 *
 * Encontrado el 2026-08-21, después de que una prueba controlada con un sismo
 * simulado no capturara la ubicación en 7 minutos, con el push entregado y
 * aceptado por APNs.
 *
 * El orden de los imports importa: `background-alert` va **antes** de
 * `expo-router/entry`, que es quien registra el componente raíz.
 */
import { registerBackgroundAlertTask } from './src/lib/background-alert';
import 'expo-router/entry';

void registerBackgroundAlertTask();
