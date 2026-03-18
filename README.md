# Minecraft Isométrico — PMDM · DAM2

> Videojuego 3D estilo Minecraft con vista isométrica desarrollado con **Three.js + WebGL** y backend **Flask + SQLite**.
> Proyecto de la asignatura _Programación Multimedia y Dispositivos Móviles_ (Unidad: Crear un videojuego).

---

## 🎮 Qué incluye

| Capa                    | Tecnología                     | Descripción                                  |
| ----------------------- | ------------------------------ | -------------------------------------------- |
| **Motor 3D**            | Three.js r128 + WebGL          | Renderizado 3D, iluminación y sombras        |
| **Vista Isométrica**    | Cámara rotable 360°            | Ángulo de 45°, zoom y rotación con Q/E      |
| **Mundo Procedural**    | Perlin Noise (4 octavas)       | Terreno de 32x32 bloques con biomas          |
| **Física**              | Gravedad + Colisiones          | Salto, detección de bloques, inventario      |
| **Construcción**        | Raycast + 3 tipos de bloques   | Colocar/Destruir bloques, sistema de items   |
| **Backend**             | Flask 3.0 + SQLite             | API REST, sesiones, estadísticas             |
| **Persistencia**        | SQLite3                        | Jugadores, sesiones, eventos, leaderboard    |

---

## 🚀 Instalación y Ejecución

### Requisitos previos
- Python 3.10 o superior
- pip (gestor de paquetes de Python)

### Pasos

1. **Clonar o descargar el proyecto**
   ```bash
   cd Minecraft-Isomereico
   ```

2. **Crear entorno virtual** (recomendado)
   ```bash
   python -m venv .venv
   ```

3. **Activar entorno virtual**
   - Windows:
     ```bash
     .venv\Scripts\activate
     ```
   - Linux/Mac:
     ```bash
     source .venv/bin/activate
     ```

4. **Instalar dependencias**
   ```bash
   pip install -r requirements.txt
   ```

5. **Ejecutar el servidor**
   ```bash
   python app.py
   ```

6. **Abrir en el navegador**
   ```
   http://127.0.0.1:5090
   ```

---

## 🎯 Controles del Juego

| Tecla / Acción     | Función                          |
| ------------------ | -------------------------------- |
| `W` `A` `S` `D`    | Mover personaje                  |
| `Espacio`          | Saltar                           |
| `Click Izquierdo`  | Destruir bloque (genera item)    |
| `Click Derecho`    | Colocar bloque seleccionado      |
| `1` `2` `3`        | Seleccionar tipo de bloque       |
| `Q` / `E`          | Rotar cámara                     |
| `Rueda del ratón`  | Zoom in/out                      |

---

## 🌍 Características del Mundo

### Generación Procedural
- **Tamaño**: 32x32 bloques (mundo ampliado)
- **Algoritmo**: Perlin Noise con 4 octavas
- **Biomas**: 3 tipos
  - **Montañas** (altura 4-8 bloques)
  - **Colinas** (altura 2-5 bloques)
  - **Llanuras** (altura 0-2 bloques)
- **Semilla aleatoria**: Cada partida genera un mundo único
- **Suavizado**: Transiciones naturales entre biomas

### Tipos de Bloques
1. **Grass** (Césped) - Verde `#4CAF50`
   - Capa superior en terrenos elevados
2. **Dirt** (Tierra) - Marrón `#795548`
   - Subcapa de 2-3 bloques de profundidad
3. **Stone** (Piedra) - Gris `#9E9E9E`
   - Capas profundas del terreno

### Sistema de Items
- Destruir un bloque genera un **item flotante**
- Los items rotan y flotan con animación
- Recolección automática al acercarse (1.5 bloques)
- El inventario se actualiza en tiempo real

---

## 📡 API REST

El backend Flask proporciona los siguientes endpoints:

| Método | Ruta                       | Descripción                        |
| ------ | -------------------------- | ---------------------------------- |
| `GET`  | `/`                        | Página principal del juego         |
| `GET`  | `/api/health`              | Health check del servidor          |
| `POST` | `/api/player/register`     | Registrar/recuperar jugador        |
| `POST` | `/api/session/start`       | Iniciar sesión de juego            |
| `POST` | `/api/session/event`       | Registrar evento de telemetría     |
| `POST` | `/api/session/end`         | Finalizar sesión con métricas      |
| `GET`  | `/api/leaderboard`         | Top partidas (bloques colocados)   |
| `GET`  | `/api/player/<id>/history` | Historial del jugador              |
| `GET`  | `/api/stats`               | Estadísticas globales              |

### Ejemplo de uso

**Registrar jugador:**
```bash
curl -X POST http://127.0.0.1:5090/api/player/register \
  -H "Content-Type: application/json" \
  -d '{"name": "PlayerOne"}'
```

**Iniciar sesión:**
```bash
curl -X POST http://127.0.0.1:5090/api/session/start \
  -H "Content-Type: application/json" \
  -d '{"player_id": 1, "mode": "creative", "world_seed": 12345}'
```

---

## 📁 Estructura del Proyecto

```
Minecraft-Isomereico/
├── app.py                    # Backend Flask con API REST
├── requirements.txt          # Dependencias Python
├── .gitignore                # Archivos ignorados por Git
├── README.md                 # Este archivo
├── minecraft_isometrico.sqlite3  # Base de datos (generada automáticamente)
│
├── static/
│   ├── game.js               # Lógica del juego Three.js
│   └── styles.css            # Estilos CSS
│
├── templates/
│   └── index.html            # Plantilla HTML principal
│
└── docs/
    └── Actividad.md          # Documentación de la actividad
```

---

## 🗃️ Base de Datos

### Tablas

1. **players**
   - Almacena información de jugadores
   - Campos: `id`, `name`, `created_at`, `last_seen`

2. **game_sessions**
   - Registra sesiones de juego
   - Campos: `id`, `player_id`, `mode`, `started_at`, `ended_at`, `result`, 
     `blocks_placed`, `blocks_destroyed`, `playtime_seconds`, `world_seed`

3. **game_events**
   - Eventos de telemetría durante partidas
   - Campos: `id`, `session_id`, `event_type`, `event_value`, `payload_json`, `created_at`

---

## 🎨 Características Técnicas

### Frontend
- **Three.js r128**: Renderizado WebGL
- **Raycasting**: Detección precisa de bloques
- **Sistema de partículas**: Items flotantes con animación
- **Física simple**: Gravedad, colisiones, salto de 1 bloque
- **Cámara dinámica**: Sigue al jugador, rotación 360°

### Backend
- **Flask 3.0**: Framework web ligero
- **SQLite3**: Base de datos embebida
- **API RESTful**: Endpoints JSON
- **CORS habilitado**: Para desarrollo local

---

## 🛠️ Desarrollo

### Mejoras futuras
- [ ] Modo multijugador (WebSockets)
- [ ] Más tipos de bloques (madera, agua, lava)
- [ ] Mobs y enemigos
- [ ] Modo supervivencia con salud y hambre
- [ ] Crafteo de items
- [ ] Guardado/carga de mundos
- [ ] Texturas avanzadas
- [ ] Sonidos y música

---

## 📝 Licencia

Proyecto educativo desarrollado para la asignatura **Programación Multimedia y Dispositivos Móviles** - DAM2.

---

## 👤 Autor

Proyecto creado como parte de la evaluación de la unidad "Crear un videojuego".

**Tecnologías utilizadas:**
- Three.js (Motor 3D)
- Flask (Backend)
- SQLite (Base de datos)
- HTML5/CSS3/JavaScript (Frontend)

---

## 🔗 Enlaces útiles

- [Documentación Three.js](https://threejs.org/docs/)
- [Documentación Flask](https://flask.palletsprojects.com/)
- [Perlin Noise](https://en.wikipedia.org/wiki/Perlin_noise)

---

**¡Disfruta construyendo en tu mundo isométrico!** 🎮✨
