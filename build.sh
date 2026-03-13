#!/usr/bin/env bash
set -o errexit

echo "==> KICEKO Build start"

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input

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