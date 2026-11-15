# Statistiques privées Victor-Hugo

Version préparée, non activée en production.

## Accès

La page `/statistiques/` affiche un formulaire de connexion ; toutes les données sont protégées par une vérification côté serveur. Aucun lien secret ne remplace cette authentification.

## Configuration préalable

Dans Netlify, Project configuration > Environment variables, définir deux variables secrètes disponibles dans les Functions :

- `VH_STATS_PASSWORD` : choisir un mot de passe long et unique.
- `VH_STATS_KEY` : générer une clé aléatoire de 32 octets minimum, par exemple avec un gestionnaire de mots de passe.

Le connecteur Netlify a retourné `Failed to fetch API: 403` lors de la création de ces variables. Leur création n’est donc pas confirmée. Aucun secret n’est enregistré dans ce dépôt. Sans les deux valeurs, l’API refuse toute collecte et toute lecture.

## Déploiement

Le projet utilise `@netlify/database` et une migration SQL ; Netlify doit autoriser Database sur l’offre du compte. Vérifier les quotas et éventuels coûts avant d’activer cette ressource. Le fichier netlify.toml génère un dossier public contenant seulement les pages et assets publics, sans exposer le code des fonctions ni les migrations.

Après configuration, déployer cette branche en prévisualisation et vérifier l’API, la migration et l’accès protégé avant fusion vers main. La collecte est désactivée hors production. Tester la base sur la branche de prévisualisation, sans créer de données de test en production.

## Mesures

Visiteurs reconnus par un identifiant aléatoire de navigateur valable 90 jours, visites après 30 minutes d’inactivité, pages, provenance, campagnes email, pays et ville approximative fournis par Netlify. Aucun nom/email/IP brute stocké dans la base. Le suivi démarre après consentement ; refus et acceptation disposent de boutons identiques. La conservation est de 90 jours, purgée quotidiennement. Les comptes ne couvrent que les navigateurs consentants et ne sont donc pas comparables aux statistiques serveur Netlify.

Le bouton Exclure ce navigateur mémorise le choix dans ce navigateur. Répéter sur les autres appareils. L’authentification admin exclut aussi les événements du navigateur pendant la connexion. L’historique antérieur n’est pas réécrit.

## Validation

`npm test` : authentification, origine des requêtes, validation, consentement, identifiants transformés, géolocalisation, exclusion et collecte hors production.
`npm run build` : copie des fichiers publics.

L’exécution réelle de Database, la géolocalisation et les cookies sur Netlify restent à vérifier lors d’un déploiement de prévisualisation autorisé.
