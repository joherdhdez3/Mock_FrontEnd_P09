# Frontend universal de pruebas WebSocket

Interfaz web ligera para **comprobar notificaciones de productos en tiempo real** durante la Práctica 9 de Sistemas Distribuidos. Permite conectar un navegador a un servidor WebSocket, observar eventos de creación y actualización de productos y conservar un historial visual durante la sesión.

El frontend está desarrollado con **HTML, CSS y JavaScript**, sin dependencias de frameworks de interfaz. Puede utilizarse con backends implementados en **Django, NestJS, Spring Boot, FastAPI, ASP.NET Core** u otras tecnologías, siempre que respeten el contrato de comunicación descrito abajo.

> **Importante:** esta herramienta es un **cliente de pruebas**. No incluye servidor WebSocket, autenticación, API REST, GraphQL ni base de datos. Cada alumno debe ejecutar primero su propio backend.

## Estructura

```text
frontend-websocket/
├── index.html
├── styles.css
├── app.js
└── README.md
```

## Requisitos

- Navegador moderno con soporte para WebSocket.
- Python 3, únicamente para servir los archivos web localmente (también puede utilizarse otro servidor HTTP estático).
- Backend propio en ejecución que ofrezca un endpoint WebSocket compatible.
- Token JWT válido, si la conexión del backend requiere autenticación.

## Ejecución local

1. Descarga o clona este repositorio y abre una terminal en la carpeta que contiene `index.html`.
2. Inicia un servidor HTTP local:

   ```bash
   python3 -m http.server 5500
   ```

3. Abre en tu navegador:

   **http://localhost:5500/**

4. En el campo **URL WebSocket**, introduce la dirección de tu propio backend. Por ejemplo, para la implementación con Django y Nginx de referencia:

   ```text
   ws://localhost/ws/notificaciones
   ```

5. Introduce tu **access token JWT** vigente y selecciona **Conectar**. Si tu backend permite conexiones anónimas, puedes dejar el campo vacío.
6. Confirma que el panel muestre el estado **Conectado**.

La terminal donde se ejecuta `http.server` debe permanecer abierta mientras utilices el frontend. Para detener el servidor, presiona `Ctrl+C`.

### Ejemplos de URL

| Implementación | Ejemplo de dirección |
| --- | --- |
| Django + Nginx | `ws://localhost/ws/notificaciones` |
| NestJS | `ws://localhost:3000/ws/notificaciones` |
| Spring Boot | `ws://localhost:8080/ws/notificaciones` |
| FastAPI | `ws://localhost:8000/ws/notificaciones` |
| Servidor con TLS | `wss://tu-servidor.example/ws/notificaciones` |

**Los puertos y las rutas son ilustrativos:** utiliza los definidos en la documentación de tu propio backend. `localhost` se refiere a la computadora donde se abre el navegador.

## Contrato de comunicación

La implementación actual utiliza **WebSocket estándar** y espera recibir mensajes **JSON** con la siguiente estructura:

```json
{
  "evento": "producto_creado",
  "datos": {
    "id": "uuid-del-producto",
    "name": "Teclado",
    "price": "450.00"
  }
}
```

Los eventos contemplados son:

| Evento | Significado |
| --- | --- |
| `producto_creado` | Se registró un producto. |
| `producto_actualizado` | Se modificó un producto existente. |

Ejemplo de actualización:

```json
{
  "evento": "producto_actualizado",
  "datos": {
    "id": "uuid-del-producto",
    "name": "Teclado actualizado",
    "price": "500.00"
  }
}
```

El campo `id` permite asociar notificaciones al mismo producto en la tabla visual. El frontend también reconoce los nombres alternativos `event`, `nombre` y `precio` en el procesamiento de mensajes. Los mensajes que no son JSON o no corresponden a los dos eventos previstos se muestran como eventos no reconocidos.

### Autenticación

El frontend agrega el token indicado por el alumno como parámetro de consulta al iniciar la conexión:

```text
ws://localhost/ws/notificaciones?token=ACCESS_TOKEN
```

Por tanto, para utilizar la autenticación JWT de esta interfaz **el backend debe aceptar el token mediante el parámetro `token` durante la conexión WebSocket**. Si tu servidor utiliza cookies, Socket.IO, STOMP o un mecanismo de autenticación diferente, necesitará compatibilidad adicional; compartir el mismo formato JSON no garantiza por sí solo la compatibilidad del transporte.

## Pruebas sugeridas

Con el frontend **conectado**:

1. Crea un producto mediante la API REST de tu proyecto (`POST`) o una mutation GraphQL equivalente.
2. Comprueba que se reciba `producto_creado` y que aparezca el producto en el panel.
3. Actualiza el mismo producto mediante REST (`PATCH`/`PUT`) o GraphQL.
4. Comprueba que se reciba `producto_actualizado`, que el identificador coincida y que los valores mostrados reflejen la actualización.
5. Captura como evidencia la operación realizada en REST/GraphQL y la notificación recibida en el frontend.

**El frontend no realiza operaciones CRUD:** únicamente escucha y muestra los eventos generados por el backend.

## Funciones de la interfaz

- Conexión y desconexión manual del WebSocket.
- Indicador del estado de conexión.
- Contadores separados para productos creados, actualizados y otros mensajes.
- Historial de eventos recibidos.
- Tabla de productos observados mediante notificaciones.
- Limpieza de la información visual de la sesión.
- Recuperación de la última URL utilizada mediante almacenamiento local del navegador.

## Solución de problemas

| Problema | Qué revisar |
| --- | --- |
| No conecta | Confirma que el backend esté levantado, la URL sea correcta y el puerto esté accesible. |
| La conexión se cierra por autenticación | Genera un JWT vigente y verifica que el servidor admita el parámetro `token`. |
| Conecta, pero no llegan eventos | Revisa que se estén realizando operaciones sobre productos y que el backend emita las notificaciones correspondientes. |
| Llega un evento no reconocido | Revisa los nombres `producto_creado` / `producto_actualizado` y la estructura JSON del mensaje. |
| La URL sigue mostrando un valor anterior | Modifica manualmente el campo; el navegador recuerda la última URL utilizada. |
| Funciona localmente, pero falla desde HTTPS | Utiliza un endpoint `wss://` con TLS válido y revisa las políticas del navegador. |

## Seguridad

- Utiliza **usuarios y tokens de prueba**, preferentemente de corta duración.
- No publiques JWT, contraseñas, claves privadas ni archivos `.env` en el repositorio o en capturas.
- El frontend **no guarda el JWT en `localStorage`**; sí conserva la URL ingresada.
- Al autenticarse con `?token=`, el JWT forma parte de la URL de conexión y puede quedar expuesto en registros del servidor o herramientas de diagnóstico. Evita compartir esa URL completa.
- En despliegues públicos utiliza `wss://` y configura adecuadamente TLS.

## Alcance

Este repositorio proporciona una **herramienta común de verificación visual**, independiente del lenguaje con el que cada equipo implemente su backend. Para replicar una práctica completa, consulta además la documentación y las instrucciones de ejecución del backend correspondiente.
