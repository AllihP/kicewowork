#!/usr/bin/env bash
set -o errexit

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  KICEKO ProjectHub — Build Render"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Naviguer dans le bon dossier
cd kiceko_hub

echo "📦 Installation des dépendances..."
pip install -r requirements.txt

echo "🗂  Collecte des fichiers statiques..."
python manage.py collectstatic --no-input

echo "🗄  Migrations..."
python manage.py migrate --no-input

echo "👑 Création du compte admin..."
python manage.py shell << 'PYTHON'
import os
from django.contrib.auth.models import User
from core.models import UserProfile

password = os.environ.get('ADMIN_PASSWORD', 'Kiceko@2025!')

admin, created = User.objects.get_or_create(
    username='admin',
    defaults={
        'first_name': 'Hilla Prince',
        'last_name':  'BAMBÉ',
        'email':      'admin@kiceko.td',
        'is_superuser': True,
        'is_staff':     True,
    }
)
admin.set_password(password)
admin.is_superuser = True
admin.is_staff = True
admin.save()

profile, _ = UserProfile.objects.get_or_create(user=admin)
profile.role = 'admin'
profile.save()
print(f"✅ Admin prêt → admin / {password}")
PYTHON

python manage.py setup_roles || echo "⚠️ setup_roles ignoré"

echo "✅ Build terminé !"