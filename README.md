SebPay Relay

Relais sécurisé entre Supabase et l'API SebPay. Le service tourne sur un VPS disposant d'une IPv4 fixe, déclarée auprès de SebPay.

1. Fonctionnement général

Le relais expose trois points d'entrée HTTP :

Méthode| Chemin| Utilisation| Protection
"POST"| "/relay"| Reçoit les demandes de Supabase et exécute une action| En-tête "x-relay-secret"
"POST"| "/webhook/sebpay"| Reçoit les notifications de SebPay| Signature HMAC-SHA256 "X-SebPay-Signature"
"GET"| "/health"| Vérifie que le service répond| Aucune donnée sensible retournée

Le serveur Node.js écoute uniquement sur "127.0.0.1". Nginx assure l'accès HTTPS public et transmet les requêtes au serveur local.

Vérification d'un paiement

Le webhook SebPay et le retour du navigateur du client sont des signaux, pas une preuve de paiement.

Lorsqu'un webhook valide arrive :

1. Le relais vérifie la signature HMAC-SHA256 sur le corps brut reçu.
2. Il identifie la session avec "checkout_session_id" ou, à défaut, "external_reference".
3. Il relit la session directement auprès de l'API SebPay.
4. Il considère le paiement comme confirmé uniquement lorsque "transaction_status === "approved"".
5. Il transmet le résultat vérifié à Supabase en appelant la RPC PostgreSQL "sebpay_relay_apply_result".

Le relais ne transmet donc pas le contenu du webhook comme résultat de paiement faisant foi. Il utilise les données relues chez SebPay.

2. Actions disponibles

Toutes les actions métier passent par "POST /relay".

Route| Action| Fonction
"payments"| "createSession"| Crée une session Checkout SebPay, vérifie les champs essentiels et enregistre le lien dans Supabase avec "sebpay_relay_set_link".
"transactions"| "getSession"| Lit une session SebPay à partir de son identifiant ou de sa référence externe.
"transactions"| "verifyPayment"| Relit la session et compare le statut, le montant, la devise et, si fourni, la référence attendue.
"transactions"| "refreshPayment"| Relit la session à partir de "external_reference", vérifie que la référence correspond, puis transmet le résultat à Supabase avec "sebpay_relay_apply_result".

Format d'une requête

En-tête obligatoire :

Content-Type: application/json
x-relay-secret: VOTRE_SECRET_PARTAGE

Corps :

{
  "route": "payments",
  "action": "createSession",
  "data": {
    "amount": 5000,
    "currency": "XOF",
    "redirect_url": "https://monsite.com/retour",
    "external_reference": "ORDER-8822"
  }
}

Les champs obligatoires de création sont :

- "amount" : montant numérique strictement positif.
- "currency" : devise.
- "redirect_url" : URL HTTP ou HTTPS de retour du client.
- "external_reference" : référence unique de la demande de paiement.

Les champs facultatifs acceptés sont "cancel_url", "description", "customer_name", "customer_email", "customer_phone" et "metadata".

Réponse du relais

Succès :

{
  "ok": true,
  "data": {
    "session_id": "...",
    "status": "open",
    "checkout_url": "https://...",
    "amount": 5000,
    "currency": "XOF",
    "external_reference": "ORDER-8822",
    "expires_at": null,
    "idempotent_replay": false
  }
}

Erreur :

{
  "ok": false,
  "error": {
    "code": "CODE_ERREUR",
    "message": "Description de l'erreur",
    "details": null
  }
}

Les codes HTTP et les détails exacts dépendent de l'erreur rencontrée. Une route ou une action inconnue renvoie une erreur 404. Un secret partagé absent ou incorrect renvoie une erreur 401.

Paramètres des actions de transaction

getSession

{
  "route": "transactions",
  "action": "getSession",
  "data": {
    "id_or_reference": "ORDER-8822"
  }
}

verifyPayment

{
  "route": "transactions",
  "action": "verifyPayment",
  "data": {
    "id_or_reference": "ORDER-8822",
    "expected_amount": 5000,
    "expected_currency": "XOF",
    "expected_reference": "ORDER-8822"
  }
}

"expected_reference" est facultatif. Le résultat contient "paid", "reason" et le résumé de la session. "paid" vaut vrai uniquement si SebPay indique "transaction_status = "approved"" et si les comparaisons demandées correspondent.

refreshPayment

{
  "route": "transactions",
  "action": "refreshPayment",
  "data": {
    "external_reference": "ORDER-8822"
  }
}

Cette action relit la session chez SebPay avant d'appeler la RPC PostgreSQL. Elle ne se fie pas à un statut fourni par le client.

3. Communication avec Supabase

Le relais appelle directement les fonctions PostgreSQL exposées par l'API REST Supabase, sous la forme :

POST SUPABASE_URL/rest/v1/rpc/NOM_DE_LA_FONCTION

Les fonctions utilisées sont :

Fonction PostgreSQL| Utilisation
"sebpay_relay_set_link"| Enregistre l'identifiant de session, le lien Checkout et l'expiration après création.
"sebpay_relay_set_error"| Fonction disponible pour signaler une erreur liée à une demande de paiement.
"sebpay_relay_apply_result"| Transmet à PostgreSQL le résultat relu et vérifié auprès de SebPay.

Les appels RPC transmettent le secret "SEBPAY_CALLBACK_SECRET" dans le paramètre "p_secret". Le relais vérifie que la réponse JSON de chaque RPC est un objet contenant un booléen "ok". Une réponse "ok: false" est traitée comme un refus de l'opération.

Important : le code actuel appelle directement ces RPC. Il n'envoie pas de notification HTTP vers une variable "SUPABASE_WEBHOOK_URL". La décision finale de mise à jour d'une commande (état autorisé, contrôle du montant et de la devise, traitement des doublons) relève de la logique des fonctions PostgreSQL et de la base Supabase.

4. Variables d'environnement

Le fichier ".env" est créé sur le VPS à partir de ".env.example". Il ne doit jamais être publié sur GitHub.

Variables actuellement lues par "src/config.ts" :

Variable| Rôle
"PORT"| Port local du serveur ; valeur par défaut : "3000".
"HTTP_TIMEOUT_MS"| Délai maximal des appels HTTP sortants ; valeur par défaut : "10000" ms.
"SEBPAY_BASE_URL"| URL de base de l'API SebPay.
"SEBPAY_PUBLIC_KEY"| Clé publique SebPay.
"SEBPAY_SECRET_KEY"| Clé secrète SebPay ; utilisée aussi pour vérifier la signature HMAC du webhook.
"SEBPAY_CALLBACK_URL"| URL publique "/webhook/sebpay" transmise à SebPay lors de la création d'une session.
"RELAY_SHARED_SECRET"| Secret attendu dans l'en-tête "x-relay-secret" sur "/relay".
"SUPABASE_URL"| URL du projet Supabase.
"SUPABASE_ANON_KEY"| Clé utilisée dans les en-têtes "apikey" et "Authorization" des appels RPC.
"SEBPAY_CALLBACK_SECRET"| Secret transmis aux RPC PostgreSQL dans le paramètre "p_secret".

Le serveur refuse de démarrer si une variable obligatoire est absente. "PORT" et "HTTP_TIMEOUT_MS" disposent de valeurs par défaut.

5. Déploiement sur le VPS

Les chemins ci-dessous correspondent à la configuration de déploiement du dépôt.

1. Cloner le dépôt dans "/opt/sebpay-relay" avec une deploy key GitHub en lecture seule.

2. Créer le fichier d'environnement et le protéger :
   
   cd /opt/sebpay-relay
cp .env.example .env
nano .env
chmod 600 .env
   
   Renseigner toutes les variables effectivement requises, listées dans la section précédente.

3. Installer les dépendances et compiler :
   
   npm ci
npm run build

4. Ajouter le contenu de "deploy/nginx.conf" dans le bloc "server" du site Nginx indiqué par votre configuration Webdock, avant le marqueur de fin Webdock, puis vérifier et recharger Nginx :
   
   sudo nginx -t
sudo systemctl reload nginx

5. Vérifier le chemin de Node.js avec "which node". Si nécessaire, adapter "ExecStart" dans "deploy/sebpay-relay.service", puis installer et activer le service :
   
   sudo cp deploy/sebpay-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sebpay-relay

6. Vérifier la santé du relais :
   
   curl https://sebpayrelay1.vps.webdock.cloud/health

Réponse attendue :

{ "ok": true }

6. Mise à jour

Après récupération des changements depuis GitHub :

cd /opt/sebpay-relay
git pull
npm ci
npm run build
sudo systemctl restart sebpay-relay

7. Journaux et diagnostic

Suivre les journaux en direct :

sudo journalctl -u sebpay-relay -f

Consulter l'état du service :

sudo systemctl status sebpay-relay

Le relais écoute sur "127.0.0.1", et Nginx relaie les chemins publics vers le port local "3000". Le port Node.js n'a donc pas vocation à être exposé directement sur Internet.
