# BestofBuilder

Application Windows qui transforme le dossier de clips de la semaine (replays OBS, clips Twitch) en best-of monté, prêt pour YouTube.

100 % local : aucune donnée ne quitte la machine (hormis, plus tard, la vérification des mises à jour sur GitHub).

## État d'avancement

| Jalon | Contenu                                                                 | État    |
| ----- | ----------------------------------------------------------------------- | ------- |
| M1    | Squelette, DA, choix du dossier, liste des clips (analyse + miniatures) | ✅      |
| M2    | Sélection, ordre, normalisation, assemblage, rendu avec progression     | ✅      |
| M3    | Découpe, transitions, intro/outro, filigrane, loudnorm, chapitres       | ✅      |
| M4    | Installeur, icône, mises à jour automatiques, publication GitHub        | à venir |
| M5    | Bandeau de titre, stinger, export Short                                 | à venir |

## Utilisation

1. **Choisir le dossier** des clips de la semaine. Ils sont listés par date de création.
2. Décoche les clips à écarter, réordonne-les en les **glissant par la poignée** ⋮⋮ (ou au clavier : Tab jusqu'à la poignée, Espace, flèches, Espace).
3. **✂ Éditer** un clip ouvre **DECOUPE.EXE** : place-toi dans la vidéo puis **Entrée ici (I)** / **Sortie ici (O)** (réglage fin ±0,1 s), **Lire la sélection** pour vérifier, et donne-lui un **titre** (il servira pour les chapitres YouTube).
4. **⚙ Réglages** ouvre **REGLAGES.EXE** : transition (fondu, pixelisation, flou horizontal, glissement ou aucune) et sa durée, intro et outro, filigrane PNG (taille, opacité), normalisation du volume. Tout est mémorisé.
5. Dans **RENDU.EXE**, choisis le préréglage, vérifie le nom du fichier et le dossier de sortie, puis clique sur **Générer**.
6. À la fin : **Ouvrir le dossier**, **Copier les chapitres** (à coller dans la description YouTube) ou **Voir le journal**.

« Actualiser » relit le dossier en gardant la sélection, l'ordre, les découpes et les titres ; les nouveaux clips arrivent en fin de liste.

Comment se passe le rendu :

- chaque élément (intro, clips, outro) est converti un par un en 1920×1080 (bandes noires si besoin), à 60 ou 30 ips, avec un son stéréo 48 kHz (une piste silencieuse est ajoutée aux clips muets), découpe et filigrane appliqués. Le filigrane n'est pas mis sur l'intro ni sur l'outro ;
- les transitions sont calculées uniquement sur les quelques images qui se chevauchent (le début et la fin de chaque clip sont gardés sans perte pour ça) ;
- le tout est assemblé sans réencoder l'image, puis le volume est normalisé à **-14 LUFS** en deux passes (mesure, puis correction) ;
- les chapitres sont placés au milieu de chaque transition. YouTube exige au moins 3 chapitres de 10 s minimum : l'appli prévient si ce n'est pas le cas ;
- l'encodage utilise la carte graphique (**NVENC**) si elle est disponible, sinon le processeur (x264, plus lent). La barre du bas indique lequel est utilisé ;
- un fichier existant n'est jamais écrasé : « (2) », « (3) »… sont ajoutés au nom ;
- **Annuler** arrête tout et supprime les fichiers temporaires. Fermer l'appli pendant un rendu demande confirmation ;
- Windows ne se met pas en veille pendant un rendu.

| Préréglage         | Image       | Usage                          |
| ------------------ | ----------- | ------------------------------ |
| YouTube 1080p60    | 1080p 60ips | par défaut, qualité maximale   |
| YouTube 1080p30    | 1080p 30ips | fichier plus léger             |
| Rapide (brouillon) | 1080p 30ips | vérifier le montage rapidement |

## Prérequis (une seule fois)

- **Node.js 24 LTS** (déjà installé sur ta machine). Pour vérifier, dans un terminal : `node -v`
- **Git**

Puis, dans le dossier du projet :

```
npm install
```

## Lancer l'appli en développement

```
npm run dev
```

La fenêtre s'ouvre ; toute modification de l'interface est rechargée automatiquement.

## Construire l'exécutable Windows

```
npm run dist
```

Les fichiers sont créés dans le dossier `dist/` :

- `BestofBuilder Setup X.Y.Z.exe` : l'installeur (raccourcis bureau et menu Démarrer) ;
- `BestofBuilder-X.Y.Z-portable.exe` : la version portable, sans installation.

L'installeur pèse environ 150 Mo : ffmpeg et ffprobe sont embarqués, rien d'autre à installer.

> L'appli n'est pas signée : Windows SmartScreen affichera « Windows a protégé votre ordinateur ». Clique sur **Informations complémentaires** puis **Exécuter quand même**. (Détails et procédure de publication complète au jalon M4.)

## Publier une mise à jour

Sera documenté au jalon M4 (tag `vX.Y.Z` → GitHub Actions construit et publie l'installeur).

## Icône de l'appli

Dépose ton image **PNG 1024 × 1024** ici : `build/icon.png`. electron-builder génère automatiquement l'`.ico` Windows au moment de la construction.

## Où sont mes données ?

| Quoi                            | Emplacement                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| Réglages (dossiers, préréglage) | `%APPDATA%\BestofBuilder\settings.json`                                     |
| Miniatures en cache             | `%TEMP%\BestofBuilder\thumbs` (menu Aide → Ouvrir le cache des miniatures)  |
| Aperçus des .mkv (découpe)      | `%TEMP%\BestofBuilder\previews` (supprimés après 7 jours)                   |
| Journaux de rendu               | `%APPDATA%\BestofBuilder\logs` (menu Aide → Ouvrir le dossier des journaux) |
| Best-of rendus                  | dossier Vidéos de Windows par défaut, modifiable dans RENDU.EXE             |

Les fichiers vidéo source ne sont **jamais** modifiés ni supprimés.

## Commandes utiles (développeur)

| Commande            | Rôle                                          |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | lance en développement                        |
| `npm test`          | tests unitaires (Vitest)                      |
| `npm run lint`      | vérification ESLint                           |
| `npm run typecheck` | vérification TypeScript                       |
| `npm run format`    | mise en forme Prettier                        |
| `npm run dist`      | construit l'installeur et la version portable |

## Architecture

```
src/
├─ shared/            types, contrat IPC, formatage, plan de montage et chapitres (partagés)
├─ main/              processus principal Electron (accès disque, ffmpeg)
│  ├─ index.ts        fenêtre, verrouillage sécurité
│  ├─ protocol.ts     protocoles internes bob-app:// (interface) et bob-media:// (miniatures, vidéos)
│  ├─ ipc.ts          réponses aux demandes de l'interface
│  ├─ settings.ts     réglages persistés (electron-store)
│  ├─ ffmpeg/         chemins des binaires, construction des commandes (testée), exécution
│  ├─ library/        lecture du dossier, analyse ffprobe, miniatures
│  ├─ assets.ts       intro, outro, filigrane choisis dans les réglages
│  └─ render/         rendu : préparation, transitions, volume, assemblage, journal
├─ preload/           pont minimal et typé exposé à l'interface (window.bob)
└─ renderer/          interface React (thème néo-rétro)
build/                ressources de construction (icône)
```

Sécurité : `contextIsolation`, `sandbox`, pas de `nodeIntegration`, aucune URL distante, navigation et nouvelles fenêtres bloquées, permissions refusées. L'interface ne manipule jamais de chemins de fichiers : elle n'accède aux vidéos et miniatures que par identifiant, via `bob-media://`.
