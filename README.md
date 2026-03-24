# Livesov - AI Visibility Tracker SaaS

Track where your brand appears in ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overviews.

---

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env
# Edit .env and set JWT_SECRET to a long random string

# 3. Start server
npm start
# Open http://localhost:3000
```

---

## Deploying to a VPS (DigitalOcean / Hetzner / Vultr)

### 1. Get a server
Any $6/mo VPS with Ubuntu 22.04 works fine.

### 2. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Upload your files
```bash
# From your local machine
scp -r trackly-saas/ root@YOUR_SERVER_IP:/var/www/livesov
```

### 4. Install PM2 (keeps server running)
```bash
npm install -g pm2
cd /var/www/livesov
npm install
cp .env.example .env
nano .env   # set JWT_SECRET and PORT=3000
pm2 start server.js --name livesov
pm2 save
pm2 startup
```

### 5. Set up Nginx as reverse proxy
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/livesov
```

Paste this config (replace yourdomain.com):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/livesov /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Add SSL (free with Certbot)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## Deploying to Railway (easiest, free tier available)

1. Push code to GitHub
2. Go to railway.app, create new project from GitHub repo
3. Set environment variables: JWT_SECRET, PORT=3000
4. Railway auto-deploys on every push

---

## Deploying to Render

1. Push to GitHub
2. New Web Service on render.com
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add env vars: JWT_SECRET

---

## Plan Limits (edit server.js to change)

| Plan   | Brands | Price suggestion |
|--------|--------|-----------------|
| free   | 1      | $0              |
| pro    | 5      | $29/mo          |
| agency | 20     | $99/mo          |

To upgrade a user manually:
```bash
# Hit this endpoint once to make the first registered user an admin
curl -X POST http://localhost:3000/api/admin/make-first-admin

# Then use the admin token to upgrade users
curl -X PUT http://localhost:3000/api/admin/users/USER_ID/plan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan":"pro"}'
```

---

## Data Storage

Data is stored in `data/db.json`. This is fine for hundreds of users.

For thousands of users, swap to PostgreSQL:
- Replace `readDB()` / `writeDB()` with `pg` queries
- Schema is straightforward: `users` and `brands` tables

---

## Each User's API Keys

Users enter their own AI platform API keys in the dashboard.
Keys are stored server-side in `db.json` and are NEVER sent back to the browser.
All AI queries run server-side through your Node.js server.

---

## File Structure

```
trackly-saas/
├── server.js          # Express server, all API routes, AI query logic
├── package.json
├── .env.example       # Copy to .env
├── data/
│   └── db.json        # Auto-created on first run
└── public/
    └── index.html     # Full SPA frontend
```
