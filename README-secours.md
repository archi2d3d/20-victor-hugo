# Copie statique de secours

Cette version conserve les sept pages publiques, les photos, la carte, les galeries et les liens de contact. Elle ne charge ni les fonctions, ni la base de statistiques Netlify. La page privée et les données restent sur le site principal ; elles ne sont jamais incluses dans cette copie.

Construire et vérifier : `node scripts/build-secours.mjs`.

Cloudflare Pages : branche `secours-cloudflare`, commande `node scripts/build-secours.mjs`, dossier publié `secours-public`. Le dossier est aussi utilisable pour un dépôt direct dans Cloudflare Pages. Aucun secret ni abonnement payant n'est nécessaire pour construire les fichiers.

Le déploiement nécessite une connexion au compte Cloudflare de son propriétaire. L'adresse pages.dev est attribuée lors de la création ; aucune adresse de secours n'est réservée par ce dépôt.

Le site principal et ses statistiques restent inchangés. Cette sauvegarde ne réduit pas leur consommation de crédits.
