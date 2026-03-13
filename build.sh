#!/usr/bin/env bash
# build.sh — KICEKO ProjectHub
# Déploiement automatique Render — aucun accès shell requis
set -o errexit

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  KICEKO ProjectHub — Build Render"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Dépendances
echo "📦 Installation des dépendances..."
pip install -r requirements.txt

# 2. Fichiers statiques
echo "🗂  Collecte des fichiers statiques..."
python manage.py collectstatic --no-input

# 3. Migrations
echo "🗄  Migrations base de données..."
python manage.py migrate --no-input

# 4. Création automatique de l'admin — SANS shell interactif
echo "👑 Création du compte admin..."
python manage.py shell << 'PYTHON'
import os
from django.contrib.auth.models import User
from core.models import UserProfile

# Récupère le mot de passe depuis les variables d'environnement
# (défini dans Render → Environment Variables)
password = os.environ.get('ADMIN_PASSWORD', 'Kiceko@2025!')
email    = os.environ.get('ADMIN_EMAIL', 'admin@kiceko.td')

# Compte admin principal
admin, created = User.objects.get_or_create(
    username='admin',
    defaults={
        'first_name':   'Hilla Prince',
        'last_name':    'BAMBÉ',
        'email':        email,
        'is_superuser': True,
        'is_staff':     True,
        'is_active':    True,
    }
)
if created:
    admin.set_password(password)
    admin.save()
    print(f"✅ Admin créé → login: admin / {password}")
else:
    # Mettre à jour le mot de passe si déjà existant
    admin.set_password(password)
    admin.is_superuser = True
    admin.is_staff     = True
    admin.save()
    print("✅ Admin mis à jour")

# Profil admin
profile, _ = UserProfile.objects.get_or_create(user=admin)
profile.role = 'admin'
profile.save()
print("✅ Profil admin configuré")

# Compte admin2 (deuxième administrateur)
admin2, created2 = User.objects.get_or_create(
    username='admin2',
    defaults={
        'first_name': 'Directeur',
        'last_name':  'KICEKO',
        'email':      'direction@kiceko.td',
        'is_staff':   True,
        'is_active':  True,
    }
)
if created2:
    admin2.set_password(password)
    admin2.save()
    print(f"✅ Admin2 créé → login: admin2 / {password}")

profile2, _ = UserProfile.objects.get_or_create(user=admin2)
profile2.role = 'admin'
profile2.save()
print("✅ Profil admin2 configuré")
PYTHON

# 5. Seed des données si la base est vide
echo "🌱 Vérification des données initiales..."
python manage.py shell << 'PYTHON'
from core.models import Member
if Member.objects.count() == 0:
    import subprocess
    import sys
    result = subprocess.run(
        [sys.executable, 'manage.py', 'seed_data'],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode == 0:
        print("✅ Données de démonstration créées")
    else:
        print("⚠️  seed_data non disponible, base vide")
else:
    print(f"✅ Base de données déjà remplie ({Member.objects.count()} membres)")
PYTHON

# 6. SWOT et rôles
echo "🧠 Configuration SWOT et rôles..."
python manage.py setup_roles || echo "⚠️  setup_roles ignoré (non bloquant)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Build terminé avec succès !"
echo "  🔑 Connexion : admin / \$ADMIN_PASSWORD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"