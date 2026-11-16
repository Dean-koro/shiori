# Shiori

Lector de escritorio para novelas en PDF pensado para un problema concreto: dejar una lectura pausada durante meses y, al volver, saber exactamente en qué página te quedaste y qué estaba pasando en la historia.

El nombre viene de *shiori* (栞), marcapáginas en japonés. Funciona 100% offline y guarda tus libros, portadas y notas de forma local.

## Descarga

Los instaladores para Windows, Linux y macOS están disponibles en la sección de [Releases](https://github.com/dean-koro/shiori/releases/latest):

- **Windows:** `.exe` o `.msi`
- **Linux:** `.AppImage` o `.deb`
- **macOS:** `.dmg` (Universal para Apple Silicon e Intel)

Una vez instalada, la aplicación busca actualizaciones automáticamente al abrirse y permite instalarlas con un clic sin perder tu biblioteca ni tus notas.

> **Nota en Linux:** Si usas el `.AppImage`, dale permisos de ejecución antes de abrirlo (`chmod +x Shiori_*.AppImage`).

## Funcionalidades

- **Biblioteca por sagas y volúmenes:** Importa archivos PDF (se guarda una copia interna para evitar enlaces rotos si mueves los originales), extrae sus portadas automáticamente y permite agrupar tomos bajo una misma serie, incluyendo volúmenes especiales (ej. `1.5`).
- **Visor flexible:** Lectura en página única, doble página o scroll continuo virtualizado. Incluye temas *Original*, *Sepia* y *Modo Noche*, ajuste al ancho de pantalla e historial de saltos para regresar al punto anterior si fuiste a revisar otra página.
- **Recordatorio al retomar lectura:** Si abres un libro tras más de 14 días sin leerlo, aparece un resumen con tu última sesión, tus apuntes recientes y un **vistazo rápido** de las dos páginas anteriores sin mover tu marcador principal.
- **Bitácora, notas y glosario:**
  - *Bitácora de trama:* Un espacio fijo por volumen para resumir en qué punto dejaste la historia.
  - *Apuntes y marcadores:* Notas vinculadas a páginas con categorías de color y marcadores rápidos.
  - *Glosario por saga:* Registro de personajes, lugares o términos que se comparte automáticamente entre todos los volúmenes de una misma serie.
  - *Exportación:* Descarga tus notas, bitácora y glosario de cualquier volumen en un archivo `.md`.
- **Búsqueda interna:** Localiza menciones de personajes o palabras clave dentro de todo el PDF con vista previa del contexto.

## Atajos de teclado

| Atajo | Acción |
| :--- | :--- |
| `Flecha Izquierda` / `Derecha` | Avanzar o retroceder página (en vista única o doble) |
| `B` | Agregar o quitar marcador en la página actual |
| `Ctrl + F` | Abrir el buscador interno del documento |

## Stack

- **Core y empaquetado:** Tauri v2 (Rust)
- **Interfaz:** React + TypeScript
- **Renderizado PDF:** PDF.js
- **Base de datos local:** SQLite (`@tauri-apps/plugin-sql`)

## Desarrollo local

Requisitos previos: Node.js 20+, Rust (`rustup`) y las dependencias de sistema de Tauri v2 (en Arch Linux: `webkit2gtk-4.1`, `librsvg`, `base-devel`).

```bash
git clone [https://github.com/dean-koro/shiori.git](https://github.com/dean-koro/shiori.git)
cd shiori
npm install
npm run tauri dev
```
## Licencia

Distribuido bajo la licencia [MIT](LICENSE).