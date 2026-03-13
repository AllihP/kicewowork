#!/usr/bin/env bash
set -o errexit

echo "==> KICEKO ProjectHub Build"

# Aller dans le dossier contenant manage.py et requirements.txt
cd kiceko_hub

echo "==> Installation dependances..."
pip install -r requirements.txt

echo "==> Fichiers statiques..."
python manage.py collectstatic --no-input

echo "==> Migrations..."
python manage.py migrate --no-input

echo "==> Creation admin..."
python manage.py shell << 'PYTHON'
import os
from django.contrib.auth.models import User
try:
    from core.models import UserProfile
    has_profile = True
except:
    has_profile = False

password = os.environ.get('ADMIN_PASSWORD', 'Kiceko@2025!')
admin, _ = User.objects.get_or_create(username='admin')
admin.set_password(password)
admin.is_superuser = True
admin.is_staff = True
admin.is_active = True
admin.first_name = 'Hilla Prince'
admin.last_name = 'BAMBE'
admin.save()
if has_profile:
    p, _ = UserProfile.objects.get_or_create(user=admin)
    p.role = 'admin'
    p.save()
print('Admin OK: admin /' , password)
PYTHON

echo "==> Build termine !"