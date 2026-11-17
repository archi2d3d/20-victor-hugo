# Préparation du remplacement PostgreSQL — PAS EN PRODUCTION

État au 17 novembre 2026 : code préparé et tests locaux sur données fictives.
Aucun export de la base réelle, aucune migration réelle ni publication.
Le backend par défaut reste PostgreSQL. Ne pas fusionner ou activer Blobs avant
la validation isolée avec une sauvegarde réelle. Le compte et les accès sécurisés
restent nécessaires pour les étapes ci-dessous.

## Stockage proposé

- `VH_STATS_STORAGE=blobs` active le nouvel adaptateur ; sans cette variable, le code existant reste actif.
- Blobs privés en `eu-central-1`, lecture forte, un espace de production distinct de chaque preview.
- Une clé immuable par unité de compteur et par dimension. Aucun compteur partagé lu puis réécrit.
- Chaque dimension utilise un identifiant HMAC différent : aucun identifiant d'événement commun, aucune IP, aucune URL complète, aucune campagne ni heure individuelle enregistrée dans les objets.
- Les marqueurs journaliers restent séparés. Le total des visiteurs est calculé par cardinalité des marqueurs, ajustée avec la référence importée. Pas de risque « marqueur créé mais incrément visiteur perdu ».
- Une consolidation quotidienne produit une synthèse immuable vérifiée AVANT d'effacer les unités et marqueurs du jour passé. Elle ne s'exécute pas avant 03:00 à Paris. Conservation des synthèses : 90 jours.
- L'intégralité des trois tables existantes est conservée dans une sauvegarde AES-256-GCM, séparée des données du rapport. Le mot de passe de sauvegarde ne doit pas être celui du tableau de bord.
- Les données historiques issues de l'ancienne mesure avec consentement ne sont pas réintroduites dans le rapport courant.
- `/statistiques/`, son cookie HttpOnly signé, les refus, GPC/DNT et exclusions propriétaire sont conservés.
- `VH_STATS_PAUSED=1` suspend collecte, rapports et purge sans solliciter PostgreSQL ; login/logout restent accessibles. Ce commutateur doit être disponible dans les environnements Functions ET Edge pour couper aussi les envois.

Les écritures de dimensions distinctes ne constituent pas une transaction : pendant une collecte en cours, un rapport peut voir momentanément des totaux différents. Les répétitions d'un même événement sont idempotentes, les écritures échouées sont retentées une fois et une panne persistante est signalée ; les pages publiques restent servies. Une panne durable du stockage peut produire une mesure partielle, comme une panne de collecte. Ne pas présenter cette solution comme une garantie de livraison réseau.

Blobs supprime les requêtes de collecte/purge vers PostgreSQL une fois activé. Le coût final des opérations Blobs et l'éventuelle consommation résiduelle de la base inactive doivent être mesurés sur le compte : aucune économie chiffrée n'a encore été vérifiée. La base source n'est jamais supprimée par ces outils.

## Vérifications locales

```
npm ci
npm test
npm run build
npm run check:functions
```

Les tests couvrent simultanéité (150 collectes), dédoublonnage et reprise idempotente,
import des références et marqueurs avec collecte concurrente, égalité avant/après
consolidation, panne d'archivage, rétention, chiffrement et altération de sauvegarde,
authentification, signatures, exclusions et absence d'accès PostgreSQL en mode Blobs
ou suspension. Ils utilisent des doubles en mémoire : ils ne prouvent pas l'accès au
service Blobs réel ni l'intégrité de la base de production.

## Sauvegarde réelle — lecture seule

Fournir `DATABASE_URL` et `VH_BACKUP_PASSWORD` par un canal sécurisé autorisé, sans
les écrire dans Git, les sorties de commande, le navigateur public ou un rapport.
Le script fait une transaction REPEATABLE READ READ ONLY. Les horodatages SQL sont
exportés sous forme de texte pour ne pas perdre les microsecondes.

```
node scripts/export-stats.mjs backups/initial.vh-backup
```

Le fichier est créé en mode 0600, jamais écrasé. Déchiffrement de contrôle et SHA-256
sont vérifiés avant succès. Conserver une copie durable chiffrée et le mot de passe
séparément ; le fichier local seul n'est pas une sauvegarde durable.

## Essai isolé OBLIGATOIRE avant publication

1. Copier la sauvegarde chiffrée dans un espace de test privé. Autoriser uniquement les accès nécessaires au site.
2. Fournir `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN`, `VH_STATS_KEY`, `VH_BACKUP_PASSWORD` et `VH_MIGRATION_STORE=vh-audience-v3-test-<identifiant>` via le canal sécurisé.
3. Exécuter `node scripts/import-stats.mjs backups/initial.vh-backup`. Le script sauvegarde les octets chiffrés à distance, relit leur empreinte, importe et relit références et marqueurs avant de déclarer la migration vérifiée.
4. Comparer les rapports 1/7/30/90 jours aux agrégats SQL du MÊME instantané. Comparer aussi le nombre et l'intégralité des lignes des trois tables après déchiffrement. Vérifier les anciennes données, les caractères accentués et les journées à cheval sur minuit.
5. Tester les vraies opérations Blobs simultanées, les reprises après erreur et la consolidation. Ne jamais utiliser l'espace de production pour ces tests.
6. Tester la fonction et la page avec `VH_STATS_STORAGE=blobs` dans une preview protégée. L'espace de la preview est `vh-audience-v3-preview-<deploy.id>` : y importer le même jeu d'essai chiffré. La collecte preview reste volontairement désactivée ; tester sa logique dans un harnais contrôlé isolé, sans contourner cette exclusion en production.
7. Vérifier le refus anonyme, mauvais mot de passe, mauvais Origin, faux cookie, signature invalide, cookies d'exclusion, GPC/DNT, absence de mesure pour les robots et les erreurs HTML, lecture authentifiée et déconnexion. Vérifier qu'aucun secret, export, script de migration ou module serveur ne figure dans `public/`.

## Bascule — seulement APRÈS ces validations

- Garder la sauvegarde initiale avant toute bascule.
- Déployer le code validé puis activer le backend Blobs dans le contexte de production ; ne jamais réactiver simultanément l'ancien collecteur. Les nouveaux événements sont alors enregistrés dans un espace neuf ; les rapports indiquent temporairement une migration non vérifiée.
- Vérifier l'arrêt de TOUTES les anciennes invocations SQL (collecteur ET purge), attendre au minimum la durée maximale d'exécution configurée plus une marge et vérifier les journaux. La durée ne doit pas être devinée. Une ancienne invocation ne doit plus pouvoir écrire après l'instantané final.
- Prendre une seconde sauvegarde finale de la source devenue stable. Importer CE SEUL instantané final dans `vh-audience-v3-production` avec `--production-after-drain`. Les marqueurs importés fusionnent avec ceux des nouveaux événements, sans écraser leurs unités ; les visiteurs présents de part et d'autre de la bascule ne sont pas doublés.
- Le rapport n'est disponible qu'après vérification de l'import complet. Le mot de passe et les cookies existants ne changent pas.
- Comparer tous les totaux importés et les nouvelles visites, vérifier la page privée et l'absence d'appels PostgreSQL, puis mesurer les crédits réellement consommés.
- Ne supprimer ni base, ni tables, ni sauvegarde sans confirmation explicite de l'utilisateur. Ne pas changer de backend pendant cette procédure sans nouvelle analyse des deux flux : cela risquerait de diviser l'historique.

## Blocages constatés

L'environnement local fonctionne. Le connecteur GitHub permet l'accès au dépôt.
L'interface Netlify du navigateur n'est pas connectée. La lecture globale des variables
Netlify a été refusée par le contrôle automatique pour risque d'exposition des secrets ;
elle n'a pas été contournée. Il manque un accès sécurisé et limité à l'export PostgreSQL,
à un espace Blobs de test et au contrôle du solde. Aucun solde récent n'est vérifié.
