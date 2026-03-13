<<<<<<< HEAD
# 🚀 KICEKO ProjectHub — Django Backend

Application de gestion de projets pour KICEKO CONSULTANT.
**Django REST API + PostgreSQL + Frontend HTML/CSS/JS**

---

## 📦 Stack technique

| Composant      | Technologie                     |
|----------------|---------------------------------|
| Backend        | Django 4.2 + Django REST Framework |
| Base de données| PostgreSQL (Render) / SQLite (local) |
| Auth           | JWT (SimpleJWT)                 |
| Fichiers statiques | WhiteNoise                  |
| Déploiement    | Render.com                      |

---

## ⚡ Installation locale

```bash
# 1. Cloner le projet
git clone https://github.com/ton-compte/kiceko-hub.git
cd kiceko-hub

# 2. Créer un virtualenv
python -m venv .venv
source .venv/bin/activate          # Linux/Mac
# .venv\Scripts\activate           # Windows

# 3. Installer les dépendances
pip install -r requirements.txt

# 4. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec tes valeurs

# 5. Migrations et données initiales
python manage.py migrate
python manage.py seed_data

# 6. Lancer le serveur
python manage.py runserver
```

→ Ouvrir http://localhost:8000
→ Login : **admin** / **kiceko2025!**
→ Admin Django : http://localhost:8000/admin/

---

## 🌐 Déploiement sur Render

### Étape 1 — Créer la base PostgreSQL
1. Dashboard Render → **New → PostgreSQL**
2. Nom : `kiceko-db`
3. Copier la `DATABASE_URL`

### Étape 2 — Créer le Web Service
1. Dashboard Render → **New → Web Service**
2. Connecter ton repo GitHub
3. Configurer :
   - **Build Command :** `chmod +x build.sh && ./build.sh`
   - **Start Command :** `gunicorn kiceko_hub.wsgi --log-file -`
   - **Python Version :** 3.11

### Étape 3 — Variables d'environnement
Dans Render → Settings → Environment Variables :

| Variable       | Valeur                          |
|----------------|---------------------------------|
| `DATABASE_URL` | (fournie par Render PostgreSQL) |
| `SECRET_KEY`   | (générer une clé aléatoire)     |
| `DEBUG`        | `False`                         |
| `ALLOWED_HOSTS`| `ton-app.onrender.com`          |

### Étape 4 — Données initiales
Après le premier déploiement, dans le shell Render :
```bash
python manage.py seed_data
```

---

## 📚 API Endpoints

### Authentification
```
POST   /api/auth/login/       → { access, refresh, user }
POST   /api/auth/refresh/     → { access }
POST   /api/auth/register/    → créer un compte
GET    /api/auth/me/          → profil connecté
```

### Ressources (CRUD complet)
```
/api/projects/     → Projets
/api/workitems/    → Tickets (Epic/Story/Task/Bug/AO)
/api/members/      → Membres équipe
/api/tenders/      → Appels d'offres
/api/sprints/      → Sprints agiles
```

### Endpoints spéciaux
```
GET /api/dashboard/                   → Stats agrégées
GET /api/projects/{id}/kanban/        → Tickets par colonne
GET /api/workitems/board/?project=1   → Vue Kanban filtrée
GET /api/tenders/pipeline/            → Stats pipeline AO
GET /api/members/{id}/workload/       → Charge de travail
```

### Filtres disponibles
```
/api/workitems/?project=1&status=En cours&type=bug
/api/tenders/?status=Qualification
/api/sprints/?project=1&status=En cours
```

---

## 🔐 Authentification JWT

```javascript
// Login
const res  = await fetch('/api/auth/login/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'kiceko2025!' })
});
const { access, refresh, user } = await res.json();

// Appel authentifié
const projects = await fetch('/api/projects/', {
  headers: { 'Authorization': `Bearer ${access}` }
}).then(r => r.json());
```

---

## 🗄 Modèles de données

```
Member      → Membres de l'équipe
Project     → Projets (status: Planifié/En cours/Terminé)
WorkItem    → Tickets (epic/feature/story/task/bug/ao)
Sprint      → Sprints agiles
Tender      → Appels d'offres (pipeline: Détection→Gagné)
```

---

## 📁 Structure du projet

```
kiceko_hub/
├── kiceko_hub/        ← Configuration Django
│   ├── settings.py    ← Config principale
│   ├── urls.py        ← Routes URL
│   └── wsgi.py        ← Point d'entrée WSGI
├── core/              ← Modèles de données
│   ├── models.py
│   ├── admin.py
│   └── management/commands/seed_data.py
├── api/               ← API REST
│   ├── views.py       ← Endpoints
│   ├── serializers.py ← Conversion JSON
│   └── urls.py        ← Routes API
├── templates/
│   └── index.html     ← Frontend SPA
├── static/
│   ├── css/style.css  ← Styles
│   └── js/app.js      ← JavaScript
├── requirements.txt
├── Procfile
├── build.sh
└── .env.example
```

---

## 🛠 Commandes utiles

```bash
# Créer les migrations après modification des modèles
python manage.py makemigrations
python manage.py migrate

# Recréer les données initiales
python manage.py seed_data

# Collecter les fichiers statiques (production)
python manage.py collectstatic

# Créer un superuser manuellement
python manage.py createsuperuser

# Shell Django interactif
python manage.py shell
```

---

## 👤 Comptes par défaut (après seed_data)

| Utilisateur | Mot de passe  | Rôle        |
|-------------|---------------|-------------|
| admin       | kiceko2025!   | Superadmin  |

> ⚠️ **Changer le mot de passe en production !**

---

*KICEKO CONSULTANT · N'Djaména, Tchad*
=======
# kicewowork
Espace de coworking
>>>>>>> f98d2bb91a8b1e8baa2750e006fa9782b5c8e9c2
