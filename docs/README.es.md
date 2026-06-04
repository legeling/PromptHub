<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="128" height="128" />

  # PromptHub

  Un espacio de trabajo local-first para prompts, skills y assets de codificación con IA.

  <br/>

  [![GitHub Stars](https://img.shields.io/github/stars/legeling/PromptHub?style=for-the-badge&logo=github&color=yellow)](https://github.com/legeling/PromptHub/stargazers)
  [![Downloads](https://img.shields.io/github/downloads/legeling/PromptHub/total?style=for-the-badge&logo=github&color=blue)](https://github.com/legeling/PromptHub/releases)
  [![Version](https://img.shields.io/badge/release-v0.5.8_stable-22C55E?style=for-the-badge)](https://github.com/legeling/PromptHub/releases/latest)
  [![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=for-the-badge)](../LICENSE)

  <br/>

  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
  ![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
  ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
  ![TailwindCSS](https://img.shields.io/badge/Tailwind-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)
  ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)

  <br/>

  ![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)
  ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)
  ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)

  <br/>

  [简体中文](../README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [Français](./README.fr.md)

  <br/>

  <a href="https://github.com/legeling/PromptHub/releases/latest">
    <img src="https://img.shields.io/badge/📥_Descargar-Releases-blue?style=for-the-badge&logo=github" alt="Descargar"/>
  </a>
</div>

<br/>

PromptHub mantiene tus prompts, archivos SKILL.md y assets de codificación con IA a nivel proyecto en un único espacio de trabajo local. Permite instalar el mismo Skill en Claude Code, Cursor, Codex, Windsurf, Gemini CLI y una docena de herramientas más, ofrece historial de versiones y pruebas multi-modelo para los prompts, y sincroniza con otros dispositivos vía WebDAV o una instancia Web auto-hospedada.

Tus datos se quedan en tu máquina.

---

## Contenido

- [Descarga](#install)
- [Capturas](#screenshots)
- [Funcionalidades](#features)
- [Inicio rápido](#quick-start)
- [Web auto-hospedado](#self-hosted-web)
- [CLI](#cli)
- [Registro de cambios](#changelog)
- [Hoja de ruta](#roadmap)
- [Desde el código fuente](#dev)
- [Estructura del repositorio](#project-structure)
- [Contribuir y docs](#contributing)
- [Licencia / créditos / comunidad](#meta)

---

<div id="install"></div>

## 📥 Descarga

Última estable: **v0.5.8**. Cada plataforma tiene dos rutas:

- **Descarga directa** — nombres de archivo fijos, el enlace no cambia entre versiones. Útil para marcadores duraderos o scripts. (Las versiones estables ya usan el mirror CDN.)
- **GitHub Releases** — página oficial con archivo histórico, firmas y notas de versión completas.

| Plataforma | Descarga directa | GitHub Releases |
| ---------- | ---------------- | --------------- |
| Windows    | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-arm64.exe) | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-arm64.exe) |
| macOS      | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-x64.dmg) | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-x64.dmg) |
| Linux      | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-amd64.deb) | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-amd64.deb) |
| Vista previa | [![Preview Channel](https://img.shields.io/badge/Preview-Channel-8B5CF6?style=for-the-badge&logo=github&logoColor=white)](https://github.com/legeling/PromptHub/releases) | No hay una compilación preview separada por ahora. Activa el canal preview en *Ajustes → Acerca de* si quieres probar builds tempranas. |

> **Apple Silicon o Intel?** M1/M2/M3/M4 → `arm64`. Macs Intel → `x64`.
> **Windows arch?** La mayoría → `x64`. Solo en hardware ARM tipo Surface Pro X → `arm64`.

### macOS via Homebrew

```bash
brew tap legeling/tap
brew install --cask prompthub
```

Para actualizar usa `brew upgrade --cask prompthub`. No mezcles Homebrew con el actualizador interno o la versión registrada por Homebrew dejará de coincidir con la realmente instalada.

### Aviso al primer arranque en macOS

La app no está notarizada, así que el primer arranque puede mostrar «PromptHub está dañado» o «no se puede verificar al desarrollador». Desde la terminal:

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

Vuelve a abrir la app. Sustituye la ruta si la instalaste en otro sitio.

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="Aviso de instalación macOS"/>
</div>

### Canal de vista previa

¿Quieres probar la próxima versión preliminar? Abre *Ajustes → Acerca de* y activa el canal de vista previa. La app consultará entonces los Prereleases de GitHub. Al desactivarlo vuelve a la estable; PromptHub no degrada automáticamente de una preview más nueva a una estable más antigua.

<div id="screenshots"></div>

## Capturas

> Las siguientes capturas muestran las superficies principales de la v0.5.8.

<div align="center">
  <p><strong>Home en dos columnas</strong></p>
  <img src="./imgs/1-index.png" width="80%" alt="Vista principal"/>
  <br/><br/>
  <p><strong>Skill store</strong></p>
  <img src="./imgs/10-skill-store.png" width="80%" alt="Skill store"/>
  <br/><br/>
  <p><strong>Detalle de Skill con instalación a plataformas con un clic</strong></p>
  <img src="./imgs/11-skill-platform-install.png" width="80%" alt="Instalación de Skill en plataforma"/>
  <br/><br/>
  <p><strong>Espacio Rules</strong></p>
  <img src="./imgs/13-rules-workspace.png" width="80%" alt="Espacio Rules"/>
  <br/><br/>
  <p><strong>Espacio de Skills por proyecto</strong></p>
  <img src="./imgs/14-skill-projects.png" width="80%" alt="Espacio de Skills por proyecto"/>
  <br/><br/>
  <p><strong>Quick Add (manual / análisis / generación IA)</strong></p>
  <img src="./imgs/15-quick-add-ai.png" width="80%" alt="Quick Add"/>
  <br/><br/>
  <p><strong>Apariencia y preferencias de motion</strong></p>
  <img src="./imgs/17-appearance-motion.png" width="80%" alt="Ajustes de apariencia"/>
</div>

<div id="features"></div>

## Funcionalidades

### 📝 Gestión de prompts

- Carpetas, etiquetas y favoritos con reordenación por arrastre; CRUD completo
- Plantillas con `{{variable}}`; copiar / probar / distribuir abre un formulario para los valores
- Búsqueda de texto completo (FTS5), renderizado Markdown con resaltado de código, adjuntos y vista previa multimedia
- La vista de tarjeta del escritorio admite edición inline con doble clic para el prompt de usuario y el de sistema

### 🧩 Skill store y distribución con un clic

- **Skill store** con 20+ skills curados (Anthropic, OpenAI, etc.) y fuentes personalizadas acumulables (repo GitHub / skills.sh / carpeta local)
- **Instalación con un clic** en Claude Code, Cursor, Windsurf, Codex, Kiro, Kilo Code, Gemini CLI, Qoder, QoderWork, CodeBuddy, Trae, OpenCode y 15+ más
- **Escaneo local** detecta los SKILL.md existentes para no copiar y pegar entre directorios de herramientas
- **Modos Symlink / Copy** — symlink para edición compartida, copy para copias independientes por plataforma
- **Sobrescritura del directorio Skills por plataforma** mantiene escaneo e instalación en la misma ruta
- **Traducción y revisión por IA** a nivel de SKILL.md completo con almacenamiento sidecar, modo lado a lado y traducción integral
- **Escaneo de seguridad** con pipeline de revisión IA antes de instalar; las fuentes restringidas se bloquean
- **Token de GitHub** para imports del store y de repos, reduce los fallos por límite de tasa anónimo
- **Filtrado por etiqueta** para skills instalados y para navegar el store

### 📐 Rules (reglas de codificación con IA)

- Un único lugar para gestionar `.cursor/rules`, `.claude/CLAUDE.md`, AGENTS.md y similares
- Reglas de proyecto añadidas manualmente, agrupadas por directorio
- Integradas con exportación ZIP, WebDAV, sync auto-hospedada e importación/exportación Web

### 🤖 Espacio de proyectos y assets de agente

- Escanea ubicaciones habituales del proyecto: `.claude/skills`, `.agents/skills`, `skills`, `.gemini`, etc.
- Espacios de Skills por proyecto que aíslan el contexto del proyecto de la biblioteca global
- Biblioteca personal, repo local y assets de proyecto en un mismo selector — sin saltar entre directorios de herramientas
- Gestión global de etiquetas de prompt: buscar, renombrar, fusionar y borrar etiquetas con sincronización entre la base de datos y los archivos del workspace

### 🧪 Pruebas y generación con IA

- Pruebas de IA integradas con los principales proveedores globales y chinos (OpenAI, Anthropic, Gemini, Azure, endpoints personalizados)
- Lanza el mismo prompt en múltiples modelos en paralelo, modelos de texto y de imagen
- Generación y mejora de Skills por IA, Quick Add ahora genera borradores estructurados directamente
- Gestión unificada de endpoints y pruebas de conexión; mensajes de error precisos para 504 / timeout / no configurado

### 🕒 Versionado e historial

- Cada guardado de prompt crea automáticamente una versión con resaltado de diferencias y rollback con un clic
- Los Skills mantienen su propio historial con versiones nombradas, diff por versión y rollback por versión
- El historial de snapshots de Rules puede previsualizarse y restaurarse a un borrador
- Los Skills instalados desde el store guardan un hash de contenido para detectar cambios remotos en SKILL.md y proteger contra conflictos con ediciones locales

### 💾 Datos, sincronización y copia de seguridad

- Local-first: por defecto tus datos viven en tu máquina
- Backup / restauración completa en formato comprimido `.phub.gz`
- Sincronización WebDAV (Jianguoyun, Nextcloud, etc.)
- Una instancia PromptHub Web auto-hospedada sirve como destino adicional de sync / backup
- Pull al iniciar y sincronización en segundo plano programada; sólo una fuente activa de sync evita conflictos multi-escritor

### 🔐 Privacidad y seguridad

- Contraseña maestra para acceder a la app, cifrado AES-256-GCM
- Carpetas privadas cifradas en reposo (Beta)
- Multiplataforma y apto para uso offline: macOS / Windows / Linux
- 7 idiomas de interfaz: 简体中文, 繁體中文, English, 日本語, Deutsch, Español, Français

<div id="quick-start"></div>

## Inicio rápido

1. **Crea tu primer prompt.** Pulsa **+ Nuevo**, completa título, descripción, prompt de sistema y prompt de usuario. `{{nombre}}` crea una variable; copiar o probar abrirá un formulario.

2. **Trae Skills.** Abre la pestaña Skills. Elige algunos del store o pulsa *Escanear local* para localizar SKILL.md ya presentes.

3. **Instala en herramientas IA.** Desde el detalle del Skill, elige la plataforma destino. PromptHub instalará el SKILL.md en el directorio esperado por la plataforma, como symlink (edición compartida) o copia independiente.

4. **Sincronización (opcional).** *Ajustes → Datos* configura WebDAV, o auto-hospeda PromptHub Web como destino de sync.

<div id="self-hosted-web"></div>

## Web auto-hospedado

PromptHub Web es un compañero ligero orientado a navegador que puedes ejecutar con Docker en un NAS, VPS o máquina LAN. **No** es un servicio cloud gestionado. Útil para:

- Acceder a tus datos PromptHub desde un navegador
- Tener un destino de sync alternativo a WebDAV para la versión escritorio
- Mantener los datos en tu propia red

```bash
cd apps/web
cp .env.example .env
docker compose up -d --build
```

En `.env`, como mínimo:

- `JWT_SECRET`: ≥ 32 caracteres aleatorios
- `ALLOW_REGISTRATION=false`: déjalo desactivado tras crear el primer admin
- `DATA_ROOT`: raíz de datos; debajo se crearán `data/`, `config/`, `logs/`, `backups/`

Por defecto: `http://localhost:3871`. La primera visita lleva a `/setup`; el primer usuario será administrador.

Para conectar el escritorio: *Ajustes → Datos → Self-Hosted PromptHub*. Prueba la conexión, sube el workspace local, baja desde Web, activa pull al iniciar o push en segundo plano.

Notas detalladas de despliegue / actualización / backup / imagen GHCR / desarrollo en [`web-self-hosted.md`](./web-self-hosted.md).

<div id="cli"></div>

## CLI

La CLI sirve para scripts, importación/exportación masiva y automatización. La app de escritorio **no** instala automáticamente el comando `prompthub`; empaquétalo e instálalo desde el repo:

```bash
pnpm pack:cli
pnpm add -g ./apps/cli/prompthub-cli-*.tgz
prompthub --help
```

O ejecútalo desde el código fuente sin instalar:

```bash
pnpm --filter @prompthub/cli dev -- prompt list
pnpm --filter @prompthub/cli dev -- skill scan
```

Comandos por recurso (cada comando admite `--help`):

```text
prompt    list / get / create / update / delete / duplicate / search
          versions / create-version / delete-version / diff / rollback
          use / copy
          list-tags / rename-tag / delete-tag

folder    list / get / create / update / delete / reorder

rules     list / scan / read / save / rewrite
          versions / version-read / version-restore / version-delete
          add-project / remove-project
          export / import

skill     list / get / install / delete / remove
          versions / create-version / rollback / delete-version
          export / scan / scan-safety / sync-from-repo
          platforms / platform-status / install-md / uninstall-md
          repo-files / repo-read / repo-write / repo-delete / repo-mkdir / repo-rename

ai        providers / provider-add / provider-delete
          models / model-add / model-delete
          routes / route-set / route-clear

workspace export / import
```

Flags globales habituales:

- `--output json|table` — formato de salida
- `--data-dir <path>` — sobrescribe el directorio `userData` de PromptHub
- `--app-data-dir <path>` — sobrescribe la raíz de datos de la app
- `--version|-v` — imprime la versión de la CLI

<div id="changelog"></div>

## Registro de cambios

Changelog completo: **[CHANGELOG.md](../CHANGELOG.md)**

### v0.5.8 (2026-06-04)

- Nuevo flujo dedicado para invertir prompts de imagen con modelos de visión, vista previa/copia antes de guardar y referencia de imagen opcional
- Configuración de modelos de IA reorganizada por proveedores, capacidades del modelo y rutas de negocio
- Soporte para tiendas ClawHub y skill.sh con búsqueda remota, categorías, paginación/carga, caché e instalación completa de paquetes Skill
- Ciclo de vida de Skills reforzado en My Skills, Project Skills, Agent Skills, plataformas, copy / symlink, Skills integradas y symlinks externos
- Comprobaciones de actualización más precisas para GitHub, Gitea y Git autoalojado, ignorando archivos de caché comunes

### v0.5.8-beta.3 (2026-06-02, vista previa)

- Las vistas de archivos Skill ahora usan un editor de codigo ligero con resaltado de sintaxis, numeros de linea, ajuste de linea e iconos de archivo mas precisos
- Los Skills importados desde GitHub a My Skills pueden comprobar actualizaciones de origen desde el detalle y crear un snapshot antes de aplicarlas
- Se reforzaron los estados de Cherry Studio, Agent Skill, Project Skill, copy / symlink, Skills integrados y symlinks externos
- Los dialogos de historial de versiones de Prompt / Skill ahora usan una presentacion tipo tabla mas facil de revisar

### v0.5.7 (2026-05-29)

- La edición rápida con IA para Prompt ahora usa un único diálogo compartido entre detalle, modal y menú contextual
- Las variantes de Skill con el mismo nombre ya se tratan como identidades coexistentes de primera clase
- Se reforzaron la restauración desde copias, el escaneo remoto Git y la persistencia del estado verificado en AI Workbench

### v0.5.7-beta.2 (2026-05-28, vista previa)

- Las fuentes Git del store ahora admiten `branch / directory`, sugerencias de ramas remotas y repos GitHub / SSH / autoalojados
- La importación de Skills de proyecto ahora admite modos avanzados `copy / symlink` con memoria de preferencias por proyecto
- La gestión de agentes y la instalación a plataformas ahora incluyen `Kilo Code` integrado en lugar de `Roo Code`

### v0.5.7-beta.1 (2026-05-26, vista previa)

- Modelo unificado de configuración completa para agentes built-in y custom, con overrides directos de `root / skills / rules / agents / commands / config`
- Nuevos presets built-in `Cline` y `Trae CN`, y refresco inmediato del workspace Rules cuando cambia la configuración de agentes
- Despliegue directo de Skills a carpetas locales de agentes dentro del proyecto, con `.agents/skills` por defecto y selección multiobjetivo
- Cuando una instalación symlink cae a copy, PromptHub ahora muestra warnings explícitos en lugar de parecer un éxito normal
- La edición inline del detalle del Prompt abre exactamente el campo sobre el que haces doble clic y mantiene una apariencia más cercana al layout normal

### v0.5.6 (2026-05-12)

**Funcionalidades**

- 🧭 **Espacio Rules.** Una página Rules dedicada en el escritorio que gestiona reglas globales y reglas de proyecto añadidas manualmente — búsqueda, vista previa de snapshots, restaurar a borrador, exportación ZIP / WebDAV / sync auto-hospedada / import-export Web.
- 📁 **Espacio Skill por proyecto.** Espacios de Skills por proyecto, escaneo automático de las ubicaciones habituales y previsualización / importación / distribución en contexto de proyecto.
- 🤖 **Quick Add genera prompts con IA.** Además de analizar un prompt existente, Quick Add ahora puede generar borradores estructurados a partir de objetivos y restricciones.
- 🏷️ **Gestión global de etiquetas de prompt.** Búsqueda / renombrado / fusión / borrado centralizados en la zona de etiquetas de la barra lateral, sincronizados con la base y los archivos del workspace.
- 🔐 **Token de GitHub para el Skill Store.** Cuota autenticada de GitHub para reducir los fallos por límite de tasa anónimo durante imports del store y de repos.

**Correcciones**

- ✍️ El detalle de tarjeta admite edición con doble clic para los prompts de usuario y de sistema
- 🪟 Parpadeo del diálogo de actualización, botón de descarga inestable y `minimizeOnLaunch` que no respetaba el inicio automático
- ↔️ Regresiones de redimensionado en tres columnas de Skills, doble clic para reset, ajuste de títulos y búsqueda en el store
- 🔁 Consistencia de Rules / extras de Skill / copias gestionadas entre exportación ZIP, WebDAV, sync auto-hospedada e import/export Web
- 🖼️ Inicio de sesión en Web auto-hospedado migrado a desafíos CAPTCHA de imagen de un solo uso

**Mejoras**

- 🏠 La home de dos columnas admite de forma estable visibilidad de módulos, ordenación por arrastre y un toggle de fondo independiente
- ☁️ Sólo una fuente de sync activa controla la sincronización automática, evitando conflictos de escritura entre proveedores
- ✨ Sistema de motion completo en el renderer de escritorio (tokens de duration / easing / scale, cuatro componentes de intención `<Reveal>` `<Collapsible>` `<ViewTransition>` `<Pressable>`, tres niveles de usuario). framer-motion fue reemplazado por `tailwindcss-animate`; el chunk `ui-vendor` pasó de 54 KB a 16 KB gzip.
- 🪶 Las listas largas (lista de Skills / galería de Prompts / kanban / lista de prompts inline) usan ahora `@tanstack/react-virtual`, retirando el render por chunks basado en `setTimeout`.

<div id="roadmap"></div>

## Hoja de ruta

### v0.5.8 ← estable actual

- Prompts inversos de imagen, configuración de proveedores/capacidades/rutas y pruebas de imagen ya son estables
- Ciclo de vida de Skills consolidado para tiendas, Git, agentes, proyectos, plataformas, copy / symlink y Skills integradas
- Tiendas ClawHub / skill.sh, comprobaciones de actualización, vista de código, iconos de archivo e historial de versiones refinados

### v0.5.7

- Prompt AI quick edit, variantes Skill con el mismo nombre, escaneo Git remoto y verificación de AI Workbench fueron reforzados

### v0.5.6

Ver el changelog arriba.

### v0.5.5

- La instalación de Skills desde el store guarda un hash de contenido; detección de cambios remotos en SKILL.md con protección frente a conflictos locales
- Traducción IA del documento completo persistida como sidecar, con traducción integral y modo lado a lado inmersivo
- El cambio de ruta de datos se aplica con un relaunch real
- Mensajes de error de prueba / traducción IA más claros (504 / timeout / no configurado)
- Corrección de subida de medios en Web/Docker; `local-image://` / `local-video://` se resuelven automáticamente
- Línea de actualización de la canal de vista previa reforzada
- Los formularios de Issues sincronizan automáticamente etiquetas `version: x.y.z`

### v0.4.x

- Workbench IA con gestión de modelos, edición de endpoints, pruebas de conexión y modelos por defecto por escenario
- Integración con el store comunitario skills.sh: rankings, instalaciones y stars
- Desmenuzado de la god-class skill-installer, protección SSRF, validación de protocolos URL
- Instalación de Skills con un clic en una docena de plataformas (Claude Code, Cursor, Windsurf, Codex, etc.)
- Traducción IA, generación de Skills por IA, escaneo local en lote

### En estudio / planificado

- [ ] Extensión de navegador que invoque PromptHub dentro de ChatGPT / Claude
- [ ] Compañero móvil: ver, buscar, edición ligera y sincronización
- [ ] Superficie de plugin para modelos locales (Ollama) y proveedores IA personalizados
- [ ] Prompt Store: reutilizar prompts validados por la comunidad
- [ ] Tipos de variable más ricos: selectores, fechas dinámicas
- [ ] Skills subidos por usuarios

<div id="dev"></div>

## Desde el código fuente

Requiere Node.js ≥ 24 y pnpm 9.

```bash
git clone https://github.com/legeling/PromptHub.git
cd PromptHub
pnpm install

# desarrollo desktop
pnpm electron:dev

# build desktop
pnpm build

# build Web auto-hospedado
pnpm build:web
```

`pnpm build` solo compila la app de escritorio. El bundle Web requiere `pnpm build:web`.

| Comando | Uso |
| ------- | --- |
| `pnpm electron:dev` | Entorno de desarrollo Vite + Electron |
| `pnpm dev:web` | Servidor de desarrollo Web |
| `pnpm lint` / `pnpm lint:web` | Lint |
| `pnpm typecheck` / `pnpm typecheck:web` | Comprobaciones de TypeScript |
| `pnpm test -- --run` | Tests unitarios + integración del escritorio |
| `pnpm test:e2e` | Playwright e2e |
| `pnpm verify:web` | Web lint + typecheck + test + build |
| `pnpm test:release` | Compuerta previa a release del escritorio |
| `pnpm --filter @prompthub/desktop bundle:budget` | Verificación de presupuesto del bundle de escritorio |

<div id="project-structure"></div>

## Estructura del repositorio

```text
PromptHub/
├── apps/
│   ├── desktop/   # app de escritorio Electron
│   ├── cli/       # CLI independiente (sobre packages/core)
│   └── web/       # Web auto-hospedado
├── packages/
│   ├── core/      # lógica compartida CLI y desktop
│   ├── db/        # capa de datos compartida (esquema SQLite, queries)
│   └── shared/    # tipos compartidos, constantes IPC, definiciones de protocolo
├── docs/          # documentación pública
├── spec/          # SSD interna / spec de diseño
├── website/       # sitio de marketing
├── README.md
├── CONTRIBUTING.md
└── package.json
```

<div id="contributing"></div>

## Contribuir y docs

- Punto de entrada: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Guía completa: [`docs/contributing.md`](./contributing.md)
- Índice de docs públicas: [`docs/README.md`](./README.md)
- SSD / specs internas: [`spec/README.md`](../spec/README.md)

Para cambios no triviales, crea una carpeta de cambio en `spec/changes/active/<change-key>/` (`proposal.md` / `specs/<domain>/spec.md` / `design.md` / `tasks.md` / `implementation.md`). Tras el lanzamiento, sincroniza lo perdurable a `spec/workflow/*`, `spec/knowledge/*`, `spec/releases/` o `spec/adr/`, y actualiza `docs/` o el `README.md` raíz si cambian los contratos hacia el usuario.

<div id="meta"></div>

## Licencia

[AGPL-3.0](../LICENSE)

## Comentarios

- Issues: [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- Ideas: [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## Construido con

[Electron](https://www.electronjs.org/) · [React](https://react.dev/) · [TailwindCSS](https://tailwindcss.com/) · [Zustand](https://zustand-demo.pmnd.rs/) · [Lucide](https://lucide.dev/) · [@tanstack/react-virtual](https://tanstack.com/virtual) · [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate)

## Colaboradores

Gracias a todas las personas que han contribuido a PromptHub.

<a href="https://github.com/legeling/PromptHub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=legeling/PromptHub" alt="Contributors" />
</a>

## Historial de stars

<a href="https://star-history.com/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <img alt="Historial de stars" src="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## Comunidad

Únete a la comunidad de PromptHub para soporte, comentarios, novedades de release y vistas previas tempranas.

<div align="center">
  <a href="https://discord.gg/zmfWguWFB">
    <img src="https://img.shields.io/badge/Discord-Join%20PromptHub%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join PromptHub Discord Community" />
  </a>
  <p><strong>Discord es el canal recomendado: anuncios, soporte, novedades de release.</strong></p>
</div>

<br/>

### Grupo QQ (chino)

Si prefieres QQ, el grupo QQ de PromptHub también está abierto:

- ID del grupo: `704298939`

<div align="center">
  <img src="./imgs/qq-group.jpg" width="320" alt="QR del grupo QQ de PromptHub"/>
  <p><strong>Escanea para unirte al grupo QQ de PromptHub</strong></p>
</div>

## Patrocinar

Si PromptHub te resulta útil, invita un café al autor.

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="./imgs/donate/wechat.png" width="200" alt="WeChat Pay"/>
        <br/>
        <b>WeChat Pay</b>
      </td>
      <td align="center">
        <img src="./imgs/donate/alipay.jpg" width="200" alt="Alipay"/>
        <br/>
        <b>Alipay</b>
      </td>
      <td align="center">
        <a href="https://www.buymeacoffee.com/legeling" target="_blank">
          <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
        </a>
        <br/>
        <b>Buy Me A Coffee</b>
      </td>
    </tr>
  </table>
</div>

Contacto: legeling567@gmail.com

Los patrocinadores anteriores están archivados en [`docs/sponsors.md`](./sponsors.md).

---

<div align="center">
  <p>Si PromptHub te resulta útil, una ⭐ siempre se agradece.</p>
</div>
