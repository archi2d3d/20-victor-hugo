# Statistiques privées Victor-Hugo — mesure serveur

La page `/statistiques/` est protégée côté serveur par un cookie d’authentification signé. Les secrets `VH_STATS_PASSWORD` et `VH_STATS_KEY` restent dans Netlify, jamais dans le dépôt.

## Collecte

L’Edge Function `audience` intervient uniquement sur les sept pages publiques, après une réponse HTML 200. Elle envoie un événement signé au collecteur interne, sans script de collecte ni cookie de mesure. Le collecteur refuse les événements non signés et périmés. La page reste disponible même si la mesure échoue.

Aucun nom/email, IP brute, préfixe IP, navigateur complet, GPS, identifiant de campagne/UTM ou URL référente complète n’est stocké. Le préfixe réseau (IPv4 /24 ou IPv6 /48) et la seule famille de navigateur permettent une estimation, transformée par HMAC avec le domaine et la date. Les marqueurs changent chaque jour. Le collecteur enregistre des dimensions indépendantes, sans journal d’événements ni parcours individuel.

Les pages vues, pays, villes et domaines d’origine sont des compteurs. Les visiteurs sont estimés par jour et cumulés sur plusieurs jours ; des personnes peuvent être regroupées. Les visites sont des créneaux fixes de trente minutes, pas une durée d’inactivité mesurée. Les connexions mobiles et VPN réduisent la fiabilité géographique.

## Choix et confidentialité

Un lien de confidentialité donne accès à un bouton d’opposition. Son cookie est une préférence, pas un identifiant de mesure. GPC et DNT sont respectés. Les cookies d’authentification et d’exclusion propriétaire sont distincts et fonctionnels. Le script `analytics.js` ne fait plus de requête de mesure ; il gère uniquement le choix et la suppression des anciens identifiants. Les anciens refus sont repris à la prochaine exécution du script.

Les compteurs sont conservés 90 jours et les marqueurs de dédoublonnage jusqu’à la purge suivant le changement de jour. Les données issues de l’ancienne collecte avec consentement sont conservées selon leur durée initiale puis purgées, mais ne sont plus mélangées aux résultats.

Cette architecture supprime les écritures/lectures de traceurs de mesure sur le terminal. Cela ne constitue pas une certification CNIL ni une validation générale du RGPD : l’information, l’opposition, la base légale, le contrat de sous-traitance Netlify et ses transferts restent du ressort de l’éditeur. Ne pas présenter l’absence de cookies comme suffisante à elle seule pour garantir la conformité de toute mesure serveur.

## Validation

`npm test` : accès privé, signatures, collecte agrégée, absence d’IP et d’URL complètes, respect des exclusions, absence de beacon et de création d’identifiants clients.

`npm run build` génère `public/` en excluant fonctions, secrets et migrations. Déploiement par Git sur Netlify ; migrations appliquées automatiquement. Aucun abonnement supplémentaire n’est créé par le code ; les ressources utilisent les quotas du compte Netlify.
