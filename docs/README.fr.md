<div align="center">
  <img src="./imgs/icon.png" alt="PromptHub Logo" width="128" height="128" />

  # PromptHub

  Un espace de travail local-first pour les prompts, les skills et les assets de codage IA.

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
    <img src="https://img.shields.io/badge/📥_Télécharger-Releases-blue?style=for-the-badge&logo=github" alt="Téléchargement"/>
  </a>
</div>

<br/>

PromptHub regroupe vos prompts, fichiers SKILL.md et assets de codage IA au niveau projet dans un espace de travail local. Il installe le même Skill dans Claude Code, Cursor, Codex, Windsurf, Gemini CLI et une douzaine d'autres outils, propose un historique de versions des prompts et des tests multi-modèles, et synchronise vers d'autres appareils via WebDAV ou une instance Web auto-hébergée.

Vos données restent sur votre machine.

---

## Sommaire

- [Téléchargement](#install)
- [Captures](#screenshots)
- [Fonctionnalités](#features)
- [Démarrage rapide](#quick-start)
- [Web auto-hébergé](#self-hosted-web)
- [CLI](#cli)
- [Journal des modifications](#changelog)
- [Feuille de route](#roadmap)
- [Depuis les sources](#dev)
- [Structure du dépôt](#project-structure)
- [Contribution & docs](#contributing)
- [Licence / crédits / communauté](#meta)

---

<div id="install"></div>

## 📥 Téléchargement

Dernière version stable : **v0.5.8**. Deux voies de téléchargement par plateforme :

- **Téléchargement direct** — noms de fichier fixes, le lien ne change pas d'une release à l'autre. Pratique pour les marque-pages durables ou les scripts. (Les releases stables passent désormais par le mirror CDN.)
- **GitHub Releases** — page de release officielle avec versions archivées, signatures et release notes complètes.

| Plateforme | Téléchargement direct | GitHub Releases |
| ---------- | --------------------- | --------------- |
| Windows    | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-Setup-arm64.exe) | [![Windows x64](https://img.shields.io/badge/Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-x64.exe) [![Windows arm64](https://img.shields.io/badge/Windows_arm64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.5.8-arm64.exe) |
| macOS      | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-x64.dmg) | [![macOS Apple Silicon](https://img.shields.io/badge/macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-arm64.dmg) [![macOS Intel](https://img.shields.io/badge/macOS_Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-x64.dmg) |
| Linux      | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev/latest/PromptHub-amd64.deb) | [![Linux AppImage](https://img.shields.io/badge/Linux_AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-x64.AppImage) [![Linux deb](https://img.shields.io/badge/Linux_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.5.8-amd64.deb) |
| Aperçu     | [![Preview Channel](https://img.shields.io/badge/Preview-Channel-8B5CF6?style=for-the-badge&logo=github&logoColor=white)](https://github.com/legeling/PromptHub/releases) | Aucune build aperçu séparée pour le moment. Activez le canal aperçu dans *Paramètres → À propos* pour tester les builds anticipées. |

> **Apple Silicon ou Intel ?** M1/M2/M3/M4 → `arm64`. Macs Intel → `x64`.
> **Windows arch ?** La plupart des PC → `x64`. Seules les machines ARM type Surface Pro X → `arm64`.

### macOS via Homebrew

```bash
brew tap legeling/tap
brew install --cask prompthub
```

Pour les mises à jour : `brew upgrade --cask prompthub`. Ne mélangez pas Homebrew avec la mise à jour intégrée, sous peine que la version enregistrée par Homebrew ne corresponde plus à celle effectivement installée.

### Avertissement au premier lancement sur macOS

L'application n'est pas notarisée, le premier lancement peut indiquer « PromptHub est endommagé » ou « le développeur ne peut pas être vérifié ». Depuis un terminal :

```bash
sudo xattr -rd com.apple.quarantine /Applications/PromptHub.app
```

Puis rouvrez l'application. Adaptez le chemin si vous l'avez installée ailleurs.

<div align="center">
  <img src="./imgs/install.png" width="60%" alt="Avertissement d'installation macOS"/>
</div>

### Canal Aperçu

Vous voulez tester la prochaine version d'aperçu ? Ouvrez *Paramètres → À propos* et activez le canal aperçu. L'application vérifiera alors les Prereleases GitHub. Désactivez-le pour revenir à la stable ; PromptHub ne fait pas de retour automatique d'une preview plus récente vers une stable plus ancienne.

<div id="screenshots"></div>

## Captures

> Les captures suivantes présentent les surfaces principales de la v0.5.8.

<div align="center">
  <p><strong>Home en deux colonnes</strong></p>
  <img src="./imgs/1-index.png" width="80%" alt="Vue principale"/>
  <br/><br/>
  <p><strong>Skill store</strong></p>
  <img src="./imgs/10-skill-store.png" width="80%" alt="Skill store"/>
  <br/><br/>
  <p><strong>Détail Skill avec installation plateforme en un clic</strong></p>
  <img src="./imgs/11-skill-platform-install.png" width="80%" alt="Installation Skill plateforme"/>
  <br/><br/>
  <p><strong>Espace Rules</strong></p>
  <img src="./imgs/13-rules-workspace.png" width="80%" alt="Espace Rules"/>
  <br/><br/>
  <p><strong>Espace Skills par projet</strong></p>
  <img src="./imgs/14-skill-projects.png" width="80%" alt="Espace Skills par projet"/>
  <br/><br/>
  <p><strong>Quick Add (manuel / analyse / génération IA)</strong></p>
  <img src="./imgs/15-quick-add-ai.png" width="80%" alt="Quick Add"/>
  <br/><br/>
  <p><strong>Apparence et préférences de motion</strong></p>
  <img src="./imgs/17-appearance-motion.png" width="80%" alt="Paramètres d'apparence"/>
</div>

<div id="features"></div>

## Fonctionnalités

### 📝 Gestion des prompts

- Dossiers, tags, favoris avec réorganisation par glisser-déposer ; CRUD complet
- Templating `{{variable}}` ; copier / tester / distribuer ouvre un formulaire pour les valeurs
- Recherche plein texte (FTS5), rendu Markdown avec coloration syntaxique, pièces jointes et aperçu média
- La vue carte sur le bureau permet l'édition inline du prompt utilisateur et système au double-clic

### 🧩 Skill store et distribution en un clic

- **Skill store** avec 20+ skills sélectionnés (Anthropic, OpenAI, etc.) et sources personnalisées cumulables (dépôt GitHub / skills.sh / dossier local)
- **Installation en un clic** vers Claude Code, Cursor, Windsurf, Codex, Kiro, Kilo Code, Gemini CLI, Qoder, QoderWork, CodeBuddy, Trae, OpenCode et 15+ autres
- **Scan local** détecte les fichiers SKILL.md existants pour ne plus copier-coller entre répertoires d'outils
- **Modes Symlink / Copy** — symlink pour partager les modifications, copy pour des copies indépendantes par plateforme
- **Surcharge du dossier Skills par plateforme** pour garder scan et installation cohérents
- **Traduction et révision IA** au niveau du SKILL.md complet, stockage en sidecar, mode côte à côte ou traduction intégrale
- **Scan de sécurité** : revue par pipeline IA avant installation, sources restreintes bloquées
- **Token GitHub** pour les imports store et dépôt afin de réduire les échecs liés au rate-limit anonyme
- **Filtrage par tag** pour les skills installés et pour la navigation dans le store

### 📐 Rules (règles de codage IA)

- Un seul endroit pour gérer `.cursor/rules`, `.claude/CLAUDE.md`, AGENTS.md et leurs cousins
- Règles de projet ajoutées manuellement, regroupées par dossier
- Intégrées à l'export ZIP, WebDAV, sync auto-hébergée et import/export Web

### 🤖 Espace projet & assets d'agent

- Scanne les emplacements habituels du projet : `.claude/skills`, `.agents/skills`, `skills`, `.gemini`, etc.
- Espaces Skills par projet pour isoler le contexte du projet de la bibliothèque globale
- Bibliothèque personnelle, dépôt local et assets de projet dans un même sélecteur — fini les allers-retours entre répertoires d'outils
- Gestion globale des tags de prompt : recherche, renommage, fusion, suppression synchronisés entre la base et les fichiers de l'espace de travail

### 🧪 Tests et génération IA

- Tests IA intégrés avec les principaux fournisseurs mondiaux et chinois (OpenAI, Anthropic, Gemini, Azure, endpoints personnalisés)
- Exécution du même prompt sur plusieurs modèles en parallèle, en texte et en image
- Génération et amélioration de Skills par IA, Quick Add génère désormais des brouillons de prompt structurés
- Gestion unifiée des endpoints et tests de connexion ; messages d'erreur précis (504 / timeout / non configuré)

### 🕒 Gestion de versions et historique

- Chaque enregistrement de prompt crée une version automatique avec diff et rollback en un clic
- Les Skills disposent de leur propre historique avec versions nommées, diff et rollback par version
- L'historique des snapshots Rules peut être prévisualisé et restauré dans un brouillon
- Les Skills installés depuis le store enregistrent un hash de contenu pour détecter les changements distants de SKILL.md avec protection contre les conflits locaux

### 💾 Données, synchronisation et sauvegarde

- Local-first : par défaut, vos données restent sur votre machine
- Sauvegarde / restauration complète au format compressé `.phub.gz`
- Synchronisation WebDAV (Jianguoyun, Nextcloud, etc.)
- Une instance PromptHub Web auto-hébergée sert de cible de sync / backup additionnelle
- Pull au lancement + sync planifiée en arrière-plan ; une seule source active de sync pour éviter les conflits multi-écriture

### 🔐 Confidentialité et sécurité

- Mot de passe maître protégeant l'accès à l'application, chiffrement AES-256-GCM
- Dossiers privés chiffrés au repos (Beta)
- Multiplateforme et utilisable hors-ligne : macOS / Windows / Linux
- 7 langues d'interface : 简体中文, 繁體中文, English, 日本語, Deutsch, Español, Français

<div id="quick-start"></div>

## Démarrage rapide

1. **Créez votre premier prompt.** Cliquez sur **+ Nouveau**, renseignez titre, description, system prompt et user prompt. `{{name}}` devient une variable ; copier ou tester ouvre un formulaire pour la saisir.

2. **Importez des Skills.** Ouvrez l'onglet Skills. Choisissez quelques skills depuis le store, ou cliquez sur *Scanner local* pour récupérer les SKILL.md déjà présents sur votre machine.

3. **Installez vers vos outils IA.** Depuis le détail d'un Skill, sélectionnez la plateforme cible. PromptHub installe le SKILL.md dans le dossier attendu par la plateforme, en symlink (édition partagée) ou en copie indépendante.

4. **Synchronisation (optionnelle).** *Paramètres → Données* configure WebDAV, ou auto-hébergez PromptHub Web comme cible de sync.

<div id="self-hosted-web"></div>

## Web auto-hébergé

PromptHub Web est un compagnon léger orienté navigateur, à exécuter sur un NAS, un VPS ou une machine LAN avec Docker. Ce **n'est pas** un service cloud managé. Utilisez-le pour :

- Accéder à vos données PromptHub depuis un navigateur
- Disposer d'une cible de sync autre que WebDAV pour la version desktop
- Garder vos données dans votre propre réseau

```bash
cd apps/web
cp .env.example .env
docker compose up -d --build
```

Dans `.env`, à minima :

- `JWT_SECRET` : ≥ 32 caractères aléatoires
- `ALLOW_REGISTRATION=false` : laisser désactivé après la création du premier admin
- `DATA_ROOT` : racine des données ; `data/`, `config/`, `logs/`, `backups/` y seront créés

Par défaut : `http://localhost:3871`. La première visite redirige vers `/setup` ; le premier utilisateur devient administrateur.

Pour connecter le desktop : *Paramètres → Données → Self-Hosted PromptHub*. Test de la connexion, push de l'espace local, pull depuis Web, pull au lancement ou push en arrière-plan.

Détails de déploiement / mise à jour / sauvegarde / image GHCR / notes de dev dans [`web-self-hosted.md`](./web-self-hosted.md).

<div id="cli"></div>

## CLI

La CLI sert au scripting, à l'import/export en masse et à l'automatisation. L'application desktop n'**installe pas** automatiquement la commande shell `prompthub` ; packagez-la et installez-la depuis le dépôt :

```bash
pnpm pack:cli
pnpm add -g ./apps/cli/prompthub-cli-*.tgz
prompthub --help
```

Ou exécutez depuis les sources sans installer :

```bash
pnpm --filter @prompthub/cli dev -- prompt list
pnpm --filter @prompthub/cli dev -- skill scan
```

Commandes par ressource (chaque commande accepte `--help`) :

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

Options globales courantes :

- `--output json|table` — format de sortie
- `--data-dir <path>` — surcharger le dossier `userData` de PromptHub
- `--app-data-dir <path>` — surcharger la racine des données applicatives
- `--version|-v` — afficher la version CLI

<div id="changelog"></div>

## Journal des modifications

Journal complet : **[CHANGELOG.md](../CHANGELOG.md)**

### v0.5.8 (2026-06-04)

- Nouveau flux dédié de reverse prompt d'image avec modèles vision, aperçu/copie avant sauvegarde et image de référence optionnelle
- Configuration des modèles IA réorganisée par fournisseurs, capacités de modèle et routes métier
- Prise en charge des boutiques ClawHub et skill.sh avec recherche distante, catégories, pagination/chargement, cache et installation complète des packages Skill
- Cycle de vie Skill renforcé pour My Skills, Project Skills, Agent Skills, plateformes, copy / symlink, Skills intégrés et symlinks externes
- Vérifications de mise à jour plus précises pour GitHub, Gitea et Git auto-hébergé, avec ignore des fichiers de cache courants

### v0.5.8-beta.3 (2026-06-02, aperçu)

- Les vues de fichiers Skill utilisent maintenant un éditeur de code léger avec coloration syntaxique, numéros de ligne, retour à la ligne et icônes de fichiers plus précises
- Les Skills importés depuis GitHub dans My Skills peuvent vérifier les mises à jour source depuis la page de détail et créer un snapshot avant application
- Les états Cherry Studio, Agent Skill, Project Skill, copy / symlink, Skill intégré et symlink externe ont encore été renforcés
- Les historiques de versions Prompt / Skill utilisent maintenant une présentation en tableau plus facile à parcourir

### v0.5.7 (2026-05-29)

- Le quick rewrite IA des Prompt utilise désormais une boîte de dialogue partagée entre page de détail, modal et menu contextuel
- Les variantes de Skill portant le même nom sont désormais gérées comme des identités de première classe pouvant coexister
- La restauration depuis sauvegarde, le scan Git distant et la persistance de l'état vérifié du workbench IA ont été renforcés

### v0.5.7-beta.2 (2026-05-28, aperçu)

- Les sources Git du store prennent désormais en charge `branch / directory`, les suggestions de branches distantes et les dépôts GitHub / SSH / auto-hébergés
- L'import de Skills de projet prend désormais en charge des modes avancés `copy / symlink` avec mémorisation des préférences par projet
- La gestion des agents et l'installation sur plateforme intègrent désormais `Kilo Code` à la place de `Roo Code`

### v0.5.7-beta.1 (2026-05-26, aperçu)

- Modèle unifié de configuration complète pour agents built-in et custom avec overrides directs de `root / skills / rules / agents / commands / config`
- Nouveaux presets built-in `Cline` et `Trae CN`, avec rafraîchissement immédiat du workspace Rules quand la configuration agent change
- Déploiement direct des Skills vers des dossiers d'agents locaux au projet, `.agents/skills` par défaut, avec sélection multi-cibles
- Quand une installation symlink retombe en copy, PromptHub affiche désormais un warning explicite au lieu de ressembler à un succès normal
- L'édition inline du détail Prompt ouvre désormais exactement le champ double-cliqué tout en restant plus proche de la mise en page normale

### v0.5.6 (2026-05-12)

**Fonctionnalités**

- 🧭 **Espace Rules.** Une page Rules dédiée sur le bureau, gérant règles globales et règles de projet ajoutées manuellement — recherche, prévisualisation des snapshots, restauration en brouillon, export ZIP / WebDAV / sync auto-hébergée / import-export Web.
- 📁 **Espace Skill par projet.** Espaces Skills par projet, scan automatique des emplacements habituels, prévisualisation / import / distribution dans le contexte du projet.
- 🤖 **Quick Add génère des prompts par IA.** En plus d'analyser un prompt existant, Quick Add peut désormais générer un brouillon de prompt structuré à partir d'objectifs et de contraintes.
- 🏷️ **Gestion globale des tags de prompt.** Recherche / renommage / fusion / suppression centralisés dans la zone tags de la barre latérale, synchronisés base et fichiers de l'espace de travail.
- 🔐 **Token GitHub pour le Skill Store.** Quota GitHub authentifié pour réduire les échecs liés au rate-limit anonyme lors des imports store et dépôts.

**Corrections**

- ✍️ Le détail de carte permet l'édition par double-clic des prompts utilisateur et système
- 🪟 Scintillement du dialogue de mise à jour, bouton de téléchargement instable, et `minimizeOnLaunch` ne respectant pas le démarrage automatique
- ↔️ Régression sur le redimensionnement trois colonnes des Skills, le double-clic de réinitialisation, le retour à la ligne des titres et la recherche dans le store
- 🔁 Cohérence Rules / extras de Skill / copies gérées entre export ZIP, WebDAV, sync auto-hébergée et import/export Web
- 🖼️ La connexion Web auto-hébergée utilise désormais des défis CAPTCHA image à usage unique

**Améliorations**

- 🏠 La home en deux colonnes prend en charge de manière stable l'affichage des modules, le tri par glisser-déposer et un toggle d'arrière-plan indépendant
- ☁️ Une seule source de sync active pilote la synchronisation automatique, évitant les conflits d'écriture multi-fournisseur
- ✨ Système de motion complet sur le rendu desktop (tokens duration / easing / scale, quatre composants d'intention `<Reveal>` `<Collapsible>` `<ViewTransition>` `<Pressable>`, trois niveaux utilisateur). framer-motion remplacé par `tailwindcss-animate` ; le chunk `ui-vendor` passe de 54 KB à 16 KB gzippé.
- 🪶 Les listes longues (liste Skill / galerie Prompt / kanban / liste de prompts inline) utilisent désormais `@tanstack/react-virtual`, retirant l'ancien rendu par chunks basé sur `setTimeout`.

<div id="roadmap"></div>

## Feuille de route

### v0.5.8 ← stable actuelle

- Reverse prompt d'image, configuration fournisseurs/capacités/routes et tests d'image sont stabilisés
- Cycle de vie Skill consolidé pour boutiques, Git, agents, projets, plateformes, copy / symlink et Skills intégrés
- Boutiques ClawHub / skill.sh, vérifications de source, vue code, icônes de fichiers et historique de versions améliorés

### v0.5.7

- Prompt AI quick edit, variantes Skill de même nom, scan Git distant et vérification AI Workbench ont été renforcés

### v0.5.6

Voir le journal ci-dessus.

### v0.5.5

- L'installation de Skill depuis le store enregistre un hash de contenu ; détection de changement distant SKILL.md avec protection contre les conflits locaux
- Traduction IA persistée en sidecar pour le document complet, modes traduction intégrale et côte à côte immersif
- Le changement de chemin de données s'applique via un véritable relaunch
- Messages d'erreur de test / traduction IA plus clairs (504 / timeout / non configuré)
- Correctif d'upload média Web/Docker ; `local-image://` / `local-video://` résolus automatiquement
- Renforcement du couloir de mise à jour aperçu
- Synchronisation auto des labels `version: x.y.z` sur les formulaires Issues

### v0.4.x

- Workbench IA avec gestion des modèles, édition d'endpoints, tests de connexion, modèles par défaut par scénario
- Intégration du store communautaire skills.sh avec classements, compteurs d'install et stars
- Découpage de la god-class skill-installer, protection SSRF, validation des protocoles d'URL
- Installation Skill en un clic vers une douzaine de plateformes (Claude Code, Cursor, Windsurf, Codex, etc.)
- Traduction IA, génération de Skill par IA, scan local en lot

### Pistes / planifié

- [ ] Extension navigateur qui interroge PromptHub depuis ChatGPT / Claude
- [ ] Compagnon mobile : visualisation, recherche, édition légère et synchronisation
- [ ] Surface plugin pour modèles locaux (Ollama) et fournisseurs IA personnalisés
- [ ] Prompt Store : réutilisation de prompts validés par la communauté
- [ ] Types de variables plus riches : listes déroulantes, dates dynamiques
- [ ] Skills uploadés par les utilisateurs

<div id="dev"></div>

## Depuis les sources

Node.js ≥ 24 et pnpm 9 requis.

```bash
git clone https://github.com/legeling/PromptHub.git
cd PromptHub
pnpm install

# dev desktop
pnpm electron:dev

# build desktop
pnpm build

# build Web auto-hébergé
pnpm build:web
```

`pnpm build` ne compile que l'application desktop. Le bundle Web requiert `pnpm build:web`.

| Commande | Usage |
| -------- | ----- |
| `pnpm electron:dev` | Environnement dev Vite + Electron |
| `pnpm dev:web` | Serveur dev Web |
| `pnpm lint` / `pnpm lint:web` | Lint |
| `pnpm typecheck` / `pnpm typecheck:web` | Vérifications TypeScript |
| `pnpm test -- --run` | Tests unitaires + intégration desktop |
| `pnpm test:e2e` | Playwright e2e |
| `pnpm verify:web` | Web lint + typecheck + test + build |
| `pnpm test:release` | Pré-vérification release desktop |
| `pnpm --filter @prompthub/desktop bundle:budget` | Vérification du budget bundle desktop |

<div id="project-structure"></div>

## Structure du dépôt

```text
PromptHub/
├── apps/
│   ├── desktop/   # application desktop Electron
│   ├── cli/       # CLI autonome (basée sur packages/core)
│   └── web/       # Web auto-hébergé
├── packages/
│   ├── core/      # logique partagée CLI / desktop
│   ├── db/        # couche données partagée (schéma SQLite, requêtes)
│   └── shared/    # types partagés, constantes IPC, définitions de protocole
├── docs/          # documentation publique
├── spec/          # SSD interne / spécifications de design
├── website/       # site marketing
├── README.md
├── CONTRIBUTING.md
└── package.json
```

<div id="contributing"></div>

## Contribution & docs

- Point d'entrée : [CONTRIBUTING.md](../CONTRIBUTING.md)
- Guide complet : [`docs/contributing.md`](./contributing.md)
- Index docs publiques : [`docs/README.md`](./README.md)
- SSD interne / specs : [`spec/README.md`](../spec/README.md)

Pour des changements non triviaux, créez un dossier de change dans `spec/changes/active/<change-key>/` (`proposal.md` / `specs/<domain>/spec.md` / `design.md` / `tasks.md` / `implementation.md`). Une fois livré, synchronisez les éléments durables vers `spec/workflow/*`, `spec/knowledge/*`, `spec/releases/` ou `spec/adr/`, et mettez à jour `docs/` ou `README.md` à la racine si les contrats utilisateur ont changé.

<div id="meta"></div>

## Licence

[AGPL-3.0](../LICENSE)

## Retour

- Issues : [GitHub Issues](https://github.com/legeling/PromptHub/issues)
- Idées : [GitHub Discussions](https://github.com/legeling/PromptHub/discussions)

## Construit avec

[Electron](https://www.electronjs.org/) · [React](https://react.dev/) · [TailwindCSS](https://tailwindcss.com/) · [Zustand](https://zustand-demo.pmnd.rs/) · [Lucide](https://lucide.dev/) · [@tanstack/react-virtual](https://tanstack.com/virtual) · [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate)

## Contributeurs

Merci à toutes celles et ceux qui ont contribué à PromptHub.

<a href="https://github.com/legeling/PromptHub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=legeling/PromptHub" alt="Contributors" />
</a>

## Star history

<a href="https://star-history.com/#legeling/PromptHub&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date&theme=dark" />
    <img alt="Star history" src="https://api.star-history.com/svg?repos=legeling/PromptHub&type=Date" />
  </picture>
</a>

## Communauté

Rejoignez la communauté PromptHub pour le support, les retours, les actualités de release et les aperçus en avant-première.

<div align="center">
  <a href="https://discord.gg/zmfWguWFB">
    <img src="https://img.shields.io/badge/Discord-Join%20PromptHub%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join PromptHub Discord Community" />
  </a>
  <p><strong>Discord est le canal recommandé : annonces, support, actualités de release.</strong></p>
</div>

<br/>

### Groupe QQ (chinois)

Si vous préférez QQ, le groupe QQ PromptHub est aussi ouvert :

- ID du groupe : `704298939`

<div align="center">
  <img src="./imgs/qq-group.jpg" width="320" alt="PromptHub QQ group QR"/>
  <p><strong>Scannez pour rejoindre le groupe QQ PromptHub</strong></p>
</div>

## Sponsoriser

Si PromptHub vous est utile, n'hésitez pas à offrir un café à l'auteur.

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

Contact : legeling567@gmail.com

Anciens sponsors archivés dans [`docs/sponsors.md`](./sponsors.md).

---

<div align="center">
  <p>Si PromptHub vous est utile, une ⭐ fait toujours plaisir.</p>
</div>
