#!/usr/bin/env bash
set -o errexit

echo "==> KICEKO Build start"

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input

python manage.py shell << 'PYTHON'
import os
from django.contrib.auth.models import User
from core.models import Member, UserProfile
 
# ── Créer les profils manquants pour tous les Users ──
for user in User.objects.all():
    profile, created = UserProfile.objects.get_or_create(user=user)
    if user.is_superuser and profile.role != 'admin':
        profile.role = 'admin'
        profile.save()
    if created:
        print(f"  Profil créé : {user.username} ({profile.role})")


echo "==> Seed données initiales si base vide..."
python manage.py shell << 'PYTHON'
from core.models import Member

if Member.objects.count() == 0:
    print("Base vide — création des membres...")
    members = [
        {"name": "Hilla Prince BAMBÉ",  "initials": "HP", "color": "#0eb5cc", "role": "Directeur Technique"},
        {"name": "BABOGUEL",             "initials": "BA", "color": "#a855f7", "role": "Développeur"},
        {"name": "LAGMET",               "initials": "LH", "color": "#3b82f6", "role": "GIS Expert"},
        {"name": "KEMKONGDI",            "initials": "KS", "color": "#22c55e", "role": "Analyste"},
        {"name": "Aïcha",                "initials": "AM", "color": "#ec4899", "role": "Chargée de projet"},
    ]
    for m in members:
        Member.objects.get_or_create(
            initials=m["initials"],
            defaults=m
        )
    print(f"  ✅ {Member.objects.count()} membres créés")
else:
    print(f"  ✅ {Member.objects.count()} membres déjà en base")
PYTHON
 
# ── Vérifier que les membres sont bien en base ──
count = Member.objects.count()
print(f"  Membres en base : {count}")
if count == 0:
    print("  ⚠️  Aucun membre — lancer seed_data")
 
# ── Stats de vérification ──
from core.models import Project, WorkItem, Tender
print(f"  Projets : {Project.objects.count()}")
print(f"  Tickets : {WorkItem.objects.count()}")
print(f"  AO      : {Tender.objects.count()}")
print("  ✅ Vérification DB terminée")
PYTHON



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
admin.save()
if has_profile:
    p, _ = UserProfile.objects.get_or_create(user=admin)
    p.role = 'admin'
    p.save()
print('Admin OK:', password)
PYTHON

echo "==> Build OK"