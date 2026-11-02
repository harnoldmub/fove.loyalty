# Vidéos motion FOVE

Vidéos courtes au format Reel (9:16) pour Instagram et TikTok, avec voix off, musique et bruitages. L'image est **dessinée en HTML/CSS** aux couleurs de FOVE, capturée image par image dans Chrome puis encodée en MP4 avec ffmpeg. La voix off et la musique sont générées une fois par Higgsfield, puis versionnées dans `src/audio/`. Tout se régénère depuis ce dossier, et un texte se corrige en modifiant une ligne.

## Ce qui existe

| Vidéo | Durée | Scènes | Usage conseillé |
| --- | --- | --- | --- |
| `explainer` | 33 s | accroche, QR en caisse, Wallet, scan, récompense, fin | Reel de présentation complet |
| `inscription` | 18 s | QR en caisse, Wallet, fin | Reel côté client |
| `caisse` | 16,5 s | scan, récompense, fin | Reel côté commerçant |

Format par défaut : `9x16` (1080 × 1920), pour les Reels Instagram, TikTok et les Stories. Les formats `1x1` et `16x9` restent disponibles au besoin (`--all`).
Fichiers produits : `out/fove-<vidéo>-9x16.mp4` (H.264, 30 i/s, son AAC stéréo à -14 LUFS). Le dossier `out/` n'est pas versionné, et aucune vidéo ne doit être commitée.

Le QR code affiché dans les vidéos est un vrai QR qui mène à `https://fove.digital`.

## Régénérer

Prérequis : Node 22, ffmpeg (`brew install ffmpeg`) et Google Chrome installé dans `/Applications` (sinon, indiquer son chemin dans `CHROME_PATH`).

```bash
cd marketing/videos
npm install
npm run assets          # copie polices, logo, badges Wallet, génère le QR
npm run render          # les 3 vidéos en 9:16 avec le son (environ 9 min)
node scripts/render.mjs --mix-only               # refait seulement le son, en quelques secondes
node scripts/render.mjs explainer 9x16            # une seule vidéo, un seul format
node scripts/render.mjs caisse 9x16 --still 2.5,4 # images PNG fixes pour vérifier un instant
```

## Modifier

- **Aperçu en direct** : `npm run preview`, puis ouvrir `http://127.0.0.1:5300/?video=explainer&format=9x16`. La barre du bas permet de lire, mettre en pause et parcourir la vidéo, ainsi que de changer de vidéo ou de format.
- **Textes** : `src/index.html` (blocs `copy-block` pour les titres, carton de fin en bas du fichier).
- **Mouvement et timing** : `src/scenes.js`, une fonction par scène. Les temps sont en secondes depuis le début de la scène.
- **Montage** : `src/videos.js`. Une nouvelle vidéo se compose en listant des scènes existantes.
- **Mise en page par format** : `src/styles.css`, règles `body.f-9x16`, `body.f-1x1` et `body.f-16x9`.
- `src/engine.js` est le moteur de timeline : `render(t)` recalcule l'image à l'instant `t`, ce qui garantit un rendu identique à chaque passage.
- `src/plan.js` cale l'image sur la voix : une scène dont la phrase est plus longue que l'animation est légèrement ralentie, et le carton de fin est prolongé.

## Voix off, musique et bruitages

- **Texte de la voix off** : champ `voice` de chaque scène dans `src/scenes.js`. Après une modification, lancer `node scripts/voice.mjs` : seules les phrases modifiées sont régénérées (Higgsfield, voix Inworld « Hélène (fr) », 2 crédits par phrase). Ensuite, `npm run render`.
- **Changer de voix** : `VOICE="Mathieu (fr)" node scripts/voice.mjs --force` (voix françaises : Hélène, Alain, Mathieu, Étienne ; 12 crédits pour les 6 phrases). Les fichiers d'origine sont dans `src/audio/voice/raw/`, la version resserrée (silences raccourcis, débit +6 %) à côté, et `timings.json` donne leur durée.
- **Prononciation** : la marque est écrite « Fove » dans le texte lu, et le domaine « fove point digital ». Pour une autre prononciation, l'écrire phonétiquement dans `voice`.
- **Musique** : `src/audio/music.m4a`, 36 s générées par Higgsfield (Sonilo, environ 2 crédits ; prompt dans `music.json`). Elle baisse automatiquement quand la voix parle. Pour la remplacer, déposer un autre fichier au même nom, puis lancer `node scripts/render.mjs --mix-only`.
- **Bruitages** (tap, tampon, bip du scanner, carillon de notification) : synthétisés par ffmpeg dans `scripts/mix.mjs`, placés par le champ `sfx` des scènes.
- **Réglages du mixage** (volume de la musique, effacement sous la voix) : `scripts/mix.mjs`, puis `--mix-only`.
- L'aperçu dans le navigateur est muet ; le son n'existe que dans les MP4.

Le commerce (« Café Malebo ») et la cliente (« Grâce M. ») sont fictifs.

## Avant de publier

- Zones sûres : en 9:16, les éléments importants tiennent entre 200 px en haut et 360 px en bas, et à gauche de la colonne d'icônes de TikTok. Le bas de l'image reste libre pour la légende et les boutons d'Instagram et de TikTok. Vérifier avec `--still` après tout changement de texte.
- Beaucoup de spectateurs regardent sans le son : les titres à l'écran portent le message à eux seuls, la voix le double.
- Musique : générée par Higgsfield pour ce projet ; vérifier les conditions d'usage commercial de l'abonnement avant une campagne payante. Sur TikTok, on peut aussi couper cette musique et choisir un son de la bibliothèque de l'application.

## Pourquoi l'image n'est pas générée par IA (diagnostic du 2 novembre 2026)

- **Higgsfield** (`higgsfield`, v1.1.23) est installé et connecté, et ses dernières tâches ont abouti. En revanche, le compte est au forfait « lite » avec **30,88 crédits** : une vidéo Seedance coûte 22,5 crédits et une image GPT Image 2 en coûte 6,5. Il restait donc de quoi produire **une seule** vidéo IA (après la voix off et la musique, il reste environ 14,6 crédits), sans contrôle fiable des textes ni du logo. Les captures d'interface (carte Wallet, QR, écrans) sont plus justes dessinées en HTML.
- **ffmpeg** installé ici n'a pas `drawtext` (pas de freetype ni de libass) : il ne sait pas écrire de texte sur une vidéo. Le texte est donc rendu par Chrome.
- **ImageMagick** n'est pas installé. `rsvg-convert` est disponible pour convertir des SVG en PNG.
- Le logo officiel (`apps/web/public/brand/fove-logo.png`) a un fond transparent et de grandes marges ; il est recadré en CSS (classe `.logo`).
