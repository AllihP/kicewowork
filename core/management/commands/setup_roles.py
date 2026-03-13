# core/management/commands/setup_roles.py
# Commande : python manage.py setup_roles
# 
# Crée les profils utilisateurs manquants et configure les 2 admins

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from core.models import UserProfile, Member


class Command(BaseCommand):
    help = 'Configure les rôles utilisateurs et crée les profils manquants'

    def handle(self, *args, **options):
        self.stdout.write('⚙️  Configuration des rôles...\n')

        # 1. Créer les profils manquants pour tous les users existants
        for user in User.objects.all():
            profile, created = UserProfile.objects.get_or_create(user=user)
            if created:
                self.stdout.write(f'  ✅ Profil créé pour {user.username}')

            # Les superusers sont automatiquement admins
            if user.is_superuser and profile.role != 'admin':
                profile.role = 'admin'
                profile.save()
                self.stdout.write(f'  👑 {user.username} → admin (superuser)')

        # 2. S'assurer que l'utilisateur "admin" existe et est admin
        admin_user, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'first_name': 'Hilla Prince',
                'last_name':  'BAMBÉ',
                'email':      'admin@kiceko.td',
                'is_superuser': True,
                'is_staff':   True,
            }
        )
        if created:
            admin_user.set_password('kiceko2025!')
            admin_user.save()
            self.stdout.write('  👑 Utilisateur admin créé → admin / kiceko2025!')

        admin_profile, _ = UserProfile.objects.get_or_create(user=admin_user)
        admin_profile.role = 'admin'

        # Lier au membre Hilla Prince si disponible
        hilla = Member.objects.filter(initials='HP').first()
        if hilla and not admin_profile.member:
            admin_profile.member = hilla
            self.stdout.write(f'  🔗 admin lié à {hilla.name}')
        admin_profile.save()

        # 3. Créer un deuxième compte admin si besoin
        admin2, created2 = User.objects.get_or_create(
            username='admin2',
            defaults={
                'first_name': 'Directeur',
                'last_name':  'KICEKO',
                'email':      'direction@kiceko.td',
                'is_staff':   True,
            }
        )
        if created2:
            admin2.set_password('kiceko2025!')
            admin2.save()
            self.stdout.write('  👑 Utilisateur admin2 créé → admin2 / kiceko2025!')

        profile2, _ = UserProfile.objects.get_or_create(user=admin2)
        profile2.role = 'admin'
        profile2.save()

        # 4. Créer les comptes membres pour chaque Member sans user lié
        members_without_user = Member.objects.filter(user_account=None)
        for member in members_without_user:
            # Générer un username depuis le nom
            username = member.name.lower().replace(' ', '.').replace("'", '')
            username = username[:20]

            user, ucreated = User.objects.get_or_create(
                username=username,
                defaults={
                    'first_name': member.name.split()[0] if ' ' in member.name else member.name,
                    'last_name':  member.name.split()[-1] if ' ' in member.name else '',
                }
            )
            if ucreated:
                user.set_password('kiceko2025!')
                user.save()

            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.role   = 'member'
            profile.member = member
            profile.save()

            if ucreated:
                self.stdout.write(f'  👤 {member.name} → user: {username} / kiceko2025!')

        # 5. Régénérer les SWOT pour tous les projets
        from core.models import Project, SWOTMatrix
        for project in Project.objects.all():
            swot, _ = SWOTMatrix.objects.get_or_create(project=project)
            swot.auto_generate()

        self.stdout.write(f'  🧠 SWOT généré pour {Project.objects.count()} projets')

        self.stdout.write('\n✅ Configuration terminée !\n')
        self.stdout.write('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        self.stdout.write('Comptes créés :')
        self.stdout.write('  👑 admin     / kiceko2025!  (Admin complet)')
        self.stdout.write('  👑 admin2    / kiceko2025!  (Admin complet)')
        self.stdout.write('  👤 [membres] / kiceko2025!  (Membres — espace limité)')
        self.stdout.write('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')