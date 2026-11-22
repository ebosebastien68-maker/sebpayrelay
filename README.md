# SebPay Relay

Relais sécurisé entre Supabase et l'API SebPay. Il tourne sur un VPS à IPv4 fixe (la seule IP déclarée chez SebPay).

## Principe

- `POST /relay` : point d'entrée unique pour Supabase. Corps : `{ "route": "...", "action": "...", "data": {...} }`. En-tête obligatoire : `x-relay-secret`.
- `POST /webhook/sebpay` : entrée de SebPay, protégée par la signature HMAC-SHA256 (`X-SebPay-Signature`).
- `GET /health` : santé.
- Le webhook et le retour du client ne sont que des **signaux**. La preuve d'un paiement est la lecture de la session chez SebPay avec `transaction_status = approved`.

## Actions

| Route | Action | Rôle |
| --- | --- | --- |
| `payments` | `createSession` | Crée la session Checkout hébergé, renvoie `checkout_url` |
| `transactions` | `getSession` | Lit une session chez SebPay (id ou `external_reference`) |
| `transactions` | `verifyPayment` | Lit la session et compare avec montant / devise / référence attendus |

Exemple d'appel depuis Supabase :

```json
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
```

Réponse : `{ "ok": true, "data": { ... } }` ou `{ "ok": false, "error": { "code", "message", "details" } }`.

## Ce que le relais envoie à Supabase après un webhook

`POST SUPABASE_WEBHOOK_URL` avec l'en-tête `x-relay-secret: SUPABASE_WEBHOOK_SECRET` :

```json
{
  "type": "sebpay.payment_checked",
  "checked_at": "2026-11-22T10:00:00.000Z",
  "signal": { "transaction_id": "...", "webhook_status": "approved" },
  "session": {
    "id": "...", "status": "completed",
    "transaction_status": "approved", "paid": true,
    "external_reference": "ORDER-8822",
    "amount": 5000, "currency": "XOF"
  }
}
```

Côté Supabase : comparer `amount` et `currency` avec la commande, puis passer la commande à `paid` **uniquement si elle est encore `pending`** (mise à jour atomique), et dédupliquer sur `transaction_id`.

## Déploiement sur le VPS

1. Cloner le dépôt dans `/opt/sebpay-relay` (deploy key en lecture seule).
2. `cp .env.example .env`, remplir les valeurs, puis `chmod 600 .env`.
3. `npm ci` (ou `npm install` la première fois, pour générer `package-lock.json`), puis `npm run build`.
4. Nginx : insérer `deploy/nginx.conf` dans le bloc `server` de `/etc/nginx/sites-available/webdock`, avant `#EOWDSLBLK`, puis `sudo nginx -t && sudo systemctl reload nginx`.
5. Service : `which node` (adapter `ExecStart` si besoin), puis
   `sudo cp deploy/sebpay-relay.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now sebpay-relay`.
6. Test : `curl https://sebpayrelay1.vps.webdock.cloud/health`.

## Mise à jour

```bash
cd /opt/sebpay-relay && git pull && npm ci && npm run build && sudo systemctl restart sebpay-relay
```

## Journaux

`sudo journalctl -u sebpay-relay -f`
