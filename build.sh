#!/usr/bin/env bash
set -o errexit

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  KICEKO ProjectHub — Build Render"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "==> 1. Installation des dependances..."
pip install -r requirements.txt

echo "==> 2. Fichiers statiques..."
python manage.py collectstatic --no-input

echo "==> 3. Migrations..."
python manage.py migrate --no-input

echo "==> 4. Creation admin..."
python manage.py shell << 'PYTHON'
import os
from django.contrib.auth.models import User
try:
    from core.models import UserProfile
    has_profile = True
except Exception:
    has_profile = False

password = os.environ.get('ADMIN_PASSWORD', 'Kiceko@2025!')
admin, created = User.objects.get_or_create(username='admin')
admin.set_password(password)
admin.is_superuser = True
admin.is_staff     = True
admin.is_active    = True
admin.first_name   = 'Hilla Prince'
admin.last_name    = 'BAMBE'
admin.save()
if has_profile:
    p, _ = UserProfile.objects.get_or_create(user=admin)
    p.role = 'admin'
    p.save()
print('Admin OK ->', 'cree' if created else 'mis a jour', '/ password:', password)
PYTHON

echo "==> 5. Synchronisation profils..."
python manage.py shell << 'PYTHON'
from django.contrib.auth.models import User
try:
    from core.models import UserProfile
except Exception:
    print("UserProfile non disponible")
    exit()
for user in User.objects.all():
    profile, created = UserProfile.objects.get_or_create(user=user)
    if user.is_superuser and profile.role != 'admin':
        profile.role = 'admin'
        profile.save()
    if created:
        print('  Profil cree:', user.username)
print('Profils OK ->', User.objects.count(), 'utilisateurs')
PYTHON

echo "==> 6. Seed membres si base vide..."
python manage.py shell << 'PYTHON'
from core.models import Member
if Member.objects.count() == 0:
    print("Base vide - creation des membres...")
    membres = [
        {"name": "Hilla Prince BAMBE", "initials": "HP", "color": "#0eb5cc", "role": "Directeur Technique"},
        {"name": "BABOGUEL",           "initials": "BA", "color": "#a855f7", "role": "Developpeur"},
        {"name": "LAGMET",             "initials": "LH", "color": "#3b82f6", "role": "GIS Expert"},
        {"name": "KEMKONGDI",          "initials": "KS", "color": "#22c55e", "role": "Analyste"},
        {"name": "Simon",              "initials": "SI", "color": "#ec4899", "role": "Charge de projet"},
    ]
    for m in membres:
        Member.objects.get_or_create(initials=m["initials"], defaults=m)
    print('Membres crees ->', Member.objects.count())
else:
    print('Membres deja en base ->', Member.objects.count())
PYTHON

echo "==> 7. Verification finale..."
python manage.py shell << 'PYTHON'
from core.models import Member, Project, WorkItem, Tender
from django.contrib.auth.models import User
print('Utilisateurs :', User.objects.count())
print('Membres      :', Member.objects.count())
print('Projets      :', Project.objects.count())
print('Tickets      :', WorkItem.objects.count())
print('AO           :', Tender.objects.count())
PYTHON

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Build termine avec succes!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"