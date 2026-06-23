"""
KICEKO ProjectHub — settings.py
"""
import os
from pathlib import Path
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

# Charger le fichier .env si présent (dev local)
env_path = BASE_DIR / '.env'
if env_path.exists():
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

# ── Sécurité ──────────────────────────────────────────
DEBUG      = os.environ.get('DEBUG', 'False') == 'True'
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'dev-key-change-in-production-xxx-yyy-zzz'
    else:
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured("La variable d'environnement SECRET_KEY doit être définie en production.")

ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '.onrender.com',
]
if env_hosts := os.environ.get('ALLOWED_HOSTS'):
    for h in env_hosts.split(','):
        if h.strip() and h.strip() not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(h.strip())
if host := os.environ.get('RENDER_EXTERNAL_HOSTNAME'):
    if host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)

# ── Applications ──────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party,
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    # Local,
    'core',
    'api',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'kiceko_hub.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'kiceko_hub.wsgi.application'

# ── Base de données ────────────────────────────────────
# LOCAL  : SQLite (auto si DATABASE_URL absent)
# RENDER : PostgreSQL (via variable DATABASE_URL)
DATABASES = {
    'default': dj_database_url.config(
        default=f'sqlite:///{BASE_DIR / "db.sqlite3"}',
        conn_max_age=60,          # ✅ Réduit à 60s pour Render Free (évite les connexions périmées)
        conn_health_checks=True,  # ✅ Vérifie la connexion avant chaque requête
        ssl_require=False,        # SSL géré par dj_database_url si DATABASE_URL contient sslmode
    )
}

# Cache en mémoire (évite les requêtes répétées pour les sessions)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

# ── Validation mots de passe ───────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ── Internationalisation ───────────────────────────────
LANGUAGE_CODE = 'fr-fr'
TIME_ZONE     = 'Africa/Ndjamena'
USE_I18N      = True
USE_TZ        = True

# ── Fichiers statiques ─────────────────────────────────
STATIC_URL       = '/static/'
STATIC_ROOT      = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── CORS — ajouter pour Render ──────────────────────────────
CORS_ALLOW_ALL_ORIGINS = DEBUG  # True en dev, False en prod pour restreindre les origines
if not DEBUG:
    CORS_ALLOWED_ORIGINS = []
    if host := os.environ.get('RENDER_EXTERNAL_HOSTNAME'):
        CORS_ALLOWED_ORIGINS.append(f'https://{host}')
    if env_origins := os.environ.get('CORS_ALLOWED_ORIGINS'):
        for o in env_origins.split(','):
            if o.strip() and o.strip() not in CORS_ALLOWED_ORIGINS:
                CORS_ALLOWED_ORIGINS.append(o.strip())

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept', 'accept-encoding', 'authorization',
    'content-type', 'dnt', 'origin', 'user-agent',
    'x-csrftoken', 'x-requested-with',
]
 

# ── Django REST Framework ──────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        #'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
}

# ── JWT ────────────────────────────────────────────────
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(days=36500), # 100 ans, supprime la limite de durée d'identification
    'REFRESH_TOKEN_LIFETIME': timedelta(days=36500), # 100 ans
    'ROTATE_REFRESH_TOKENS':  False,                 # Pas de rotation requise pour des jetons permanents
}

CSRF_TRUSTED_ORIGINS = ['http://localhost:8000', 'http://127.0.0.1:8000']
if host := os.environ.get('RENDER_EXTERNAL_HOSTNAME'):
    CSRF_TRUSTED_ORIGINS.append(f'https://{host}')

# Exempter tous les endpoints /api/ du CSRF
CSRF_COOKIE_HTTPONLY = False