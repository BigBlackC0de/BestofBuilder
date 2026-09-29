# BestofBuilder

Application Windows qui transforme le dossier de clips de la semaine (replays OBS, clips Twitch) en best-of monté, prêt pour YouTube.

100 % local : aucune donnée ne quitte la machine (hormis la vérification des mises à jour sur GitHub).

## État d'avancement

| Jalon | Contenu                                                                 | État    |
| ----- | ----------------------------------------------------------------------- | ------- |
| M1    | Squelette, DA, choix du dossier, liste des clips (analyse + miniatures) | ✅      |
| M2    | Sélection, ordre, normalisation, assemblage, rendu avec progression     | ✅      |
| M3    | Découpe, transitions, intro/outro, filigrane, loudnorm, chapitres       | ✅      |
| M4    | Installeur, icône, mises à jour automatiques, publication GitHub        | ✅      |
| M5    | Bandeau de titre, stinger, export Short                                 | à venir |

## Utilisation

1. **Choisir le dossier** des clips de la semaine. Ils sont listés par date de création.
2. Décoche les clips à écarter, réordonne-les en les **glissant par la poignée** ⋮⋮ (ou au clavier : Tab jusqu'à la poignée, Espace, flèches, Espace).
3. **✂ Éditer** un clip ouvre **DECOUPE.EXE** : place-toi dans la vidéo puis **Entrée ici (I)** / **Sortie ici (O)** (réglage fin ±0,1 s), **Lire la sélection** pour vérifier, et donne-lui un **titre** (il servira pour les chapitres YouTube).
4. **⚙ Réglages** ouvre **REGLAGES.EXE** : transition (fondu, **neige TV avec souffle**, pixelisation, flou horizontal, glissement ou aucune) et sa durée, intro et outro, filigrane PNG (taille, opacité), normalisation du volume. Tout est mémorisé.
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

## Installer l'appli

Télécharge `BestofBuilder-Setup-X.Y.Z.exe` dans les [Releases du projet](https://github.com/BigBlackC0de/BestofBuilder/releases) et lance-le. L'installeur crée un raccourci sur le bureau et dans le menu Démarrer.

Il existe aussi `BestofBuilder-X.Y.Z-portable.exe`, qui se lance sans installation, depuis une clé USB par exemple. **La version portable ne se met pas à jour toute seule.**

### Avertissement Windows SmartScreen

L'appli n'est pas signée numériquement (un certificat coûte plusieurs centaines d'euros par an). Au premier lancement, Windows affiche « Windows a protégé votre ordinateur » :

1. clique sur **Informations complémentaires** ;
2. puis sur **Exécuter quand même**.

Ça n'arrive qu'une fois par version téléchargée. Les mises à jour automatiques, elles, s'installent sans cet avertissement.

## Mises à jour automatiques

- Quelques secondes après le démarrage, l'appli regarde s'il existe une version plus récente dans les Releases GitHub. C'est sa **seule** connexion à internet.
- Si oui, elle la télécharge en arrière-plan (bandeau en haut de la fenêtre), puis affiche **Redémarrer pour mettre à jour**. Sinon, elle s'installe toute seule à la fermeture de l'appli.
- Pendant un rendu, le redémarrage est bloqué pour ne pas perdre le travail en cours.
- Menu **Aide → Vérifier les mises à jour…** pour vérifier à la main.

## Publier une nouvelle version

Tout se fait depuis le terminal de VS Code, dans le dossier du projet, une fois les modifications commitées :

```
npm version patch
git push --follow-tags
```

- `npm version patch` passe par exemple de 0.4.0 à **0.4.1** (petite correction). Utilise `npm version minor` pour 0.5.0 (nouveautés) ou `npm version major` pour 1.0.0. La commande change le numéro dans `package.json`, crée le commit et le tag `v0.4.1`.
- `git push --follow-tags` envoie le tout sur GitHub.
- Le workflow **Publier une version** (onglet **Actions** du dépôt) prend alors le relais pendant environ 10 minutes : il vérifie le code, construit l'installeur et le publie dans une nouvelle Release. Si une étape échoue, la Release n'est pas créée et le détail est dans l'onglet Actions.
- Les applis déjà installées trouveront la mise à jour à leur prochain démarrage.

Tu peux ensuite modifier la Release sur GitHub pour décrire les nouveautés.

**Jeton GitHub :** aucun à créer. Le workflow utilise le jeton temporaire que GitHub fournit automatiquement à chaque exécution, et l'appli n'en contient aucun. Les mises à jour marchent sans jeton parce que le dépôt est **public**. S'il repassait en privé, elles ne marcheraient plus pour personne : il faudrait alors publier les installeurs dans un second dépôt public.

## Construire l'installeur sur ta machine (sans publier)

```
npm run dist
```

Les fichiers sont créés dans `dist/` : l'installeur `BestofBuilder-Setup-X.Y.Z.exe` et la version portable. Rien n'est envoyé sur GitHub.

## Icône de l'appli

L'icône vient de `build/icon.svg`, convertie en `build/icon.png` (1024 × 1024) par `npm run icon`. Tu peux aussi déposer directement ta propre image **PNG 1024 × 1024** à la place de `build/icon.png`. Le `.ico` Windows est généré automatiquement à la construction.

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
│  ├─ updater.ts      mises à jour automatiques (Releases GitHub)
│  └─ render/         rendu : préparation, transitions, volume, assemblage, journal
├─ preload/           pont minimal et typé exposé à l'interface (window.bob)
└─ renderer/          interface React (thème néo-rétro)
build/                icône (icon.svg → icon.png)
scripts/              outils (génération de l'icône)
.github/workflows/    vérifications et publication des versions
```

Sécurité : `contextIsolation`, `sandbox`, pas de `nodeIntegration`, aucune URL distante, navigation et nouvelles fenêtres bloquées, permissions refusées. L'interface ne manipule jamais de chemins de fichiers : elle n'accède aux vidéos et miniatures que par identifiant, via `bob-media://`.
