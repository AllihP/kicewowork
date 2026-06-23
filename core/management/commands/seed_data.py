"""
Management command : python manage.py create_initial_data
Charge les données initiales KICEKO (projets, membres, tickets, AO, sprints).
Exécuté automatiquement par build.sh sur Render.
"""
import datetime
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from core.models import Member, Project, WorkItem, Tender, Sprint


class Command(BaseCommand):
    help = 'Crée les données initiales KICEKO si la base est vide'

    def handle(self, *args, **kwargs):
        if Member.objects.exists():
            self.stdout.write(self.style.WARNING('Données déjà présentes — skip'))
            return

        self.stdout.write('Création des données initiales…')

        # ── Superuser admin ────────────────────────────────────
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@kiceko.td', 'kiceko2025!')
            self.stdout.write('  ✔ Superuser admin créé (admin / kiceko2025!)')

        # ── Membres ────────────────────────────────────────────
        members_data = [
            dict(name='Hilla Prince Bambé', role='Tech Director / Ingénieur IT',  initials='HP', color='#e8a020'),
            dict(name='BABOGUEL ALAYE',      role='SEO & Communication',            initials='BA', color='#a855f7'),
            dict(name='LAGMET HORTENSE',     role='Responsable Admin & Finance',    initials='LH', color='#3b82f6'),
            dict(name='KEMKONGDI SIMÉON',    role='Pôle Investissement',            initials='KS', color='#22c55e'),
            dict(name='Aïcha Mahamat',       role='Dev Full-Stack',                 initials='AM', color='#ec4899'),
        ]
        members = [Member.objects.create(**m) for m in members_data]
        hp, ba, lh, ks, am = members
        self.stdout.write(f'  ✔ {len(members)} membres créés')

        # ── Projets ────────────────────────────────────────────
        p1 = Project.objects.create(
            name='ANLA Surveillance Acridienne', status='En cours', progress=72,
            category='IT / Dev', deadline=datetime.date(2025, 6, 30),
            description='Serveur GIS temps réel pour la surveillance des criquets au Tchad. Dell R750xs + PostgreSQL/PostGIS + GeoServer + OpenLayers.',
        )
        p1.members.set([hp, lh])

        p2 = Project.objects.create(
            name='Plateforme e-Voucher LWF', status='En cours', progress=45,
            category='Humanitaire', deadline=datetime.date(2025, 7, 15),
            description='Système de bons électroniques pour Lutheran World Federation — React/Django + API REST.',
        )
        p2.members.set([hp, ks])

        p3 = Project.objects.create(
            name='SDAN — Plan Directeur Digital', status='Terminé', progress=100,
            category='Infrastructure', deadline=datetime.date(2025, 3, 1),
            description='Consortium KICEKO-KIAMA — Plan National Infrastructure Numérique, financé Banque Mondiale.',
        )
        p3.members.set([hp, lh])

        p4 = Project.objects.create(
            name='Système Queue Hospitalière', status='Planifié', progress=8,
            category='Santé', deadline=datetime.date(2025, 10, 20),
            description='Application React/Django WebSockets de gestion des files d\'attente hospitalières pour UNDP.',
        )
        p4.members.set([ba, ks, am])

        p5 = Project.objects.create(
            name='Dashboard Communication UNDP', status='En attente', progress=20,
            category='Communication', deadline=datetime.date(2025, 8, 10),
            description='Outil de reporting pour PRECOM/PILIER UNDP — murals scolaires.',
        )
        p5.members.set([ks, ba])

        p6 = Project.objects.create(
            name='CBI Tchad — ERP Bancaire', status='Planifié', progress=5,
            category='IT / Dev', deadline=datetime.date(2025, 12, 1),
            description='Système ERP complet pour Coris Bank International Tchad — modules RH, comptabilité, reporting.',
        )
        p6.members.set([hp, am])

        self.stdout.write('  ✔ 6 projets créés')

        # ── Sprints ────────────────────────────────────────────
        s1 = Sprint.objects.create(name='Sprint 4 — ANLA', project=p1, start=datetime.date(2025,1,3),  end=datetime.date(2025,1,17), status='En cours', pts_total=40, pts_done=28)
        s2 = Sprint.objects.create(name='Sprint 2 — LWF',  project=p2, start=datetime.date(2025,1,10), end=datetime.date(2025,1,24), status='En cours', pts_total=34, pts_done=12)
        s3 = Sprint.objects.create(name='Sprint 1 — Queue', project=p4, start=datetime.date(2025,2,1), end=datetime.date(2025,2,14), status='Planifié', pts_total=24, pts_done=0)
        self.stdout.write('  ✔ 3 sprints créés')

        # ── Work Items ─────────────────────────────────────────
        work_items = [
            dict(title='Configurer GeoServer 2.24.1 sur Ubuntu',         type='task',    status='Terminé',  priority='Haute',   project=p1, assignee=hp, pts=3,  due=datetime.date(2025,5,1),  sprint=s1),
            dict(title='Script auto import Excel → PostGIS via ogr2ogr', type='task',    status='En cours', priority='Haute',   project=p1, assignee=hp, pts=5,  due=datetime.date(2025,5,20), sprint=s1),
            dict(title='Dashboard temps réel OpenLayers auto-refresh',   type='story',   status='En cours', priority='Haute',   project=p1, assignee=hp, pts=8,  due=datetime.date(2025,6,1),  sprint=s1),
            dict(title='API REST Flask saisie observations terrain GPS',  type='feature', status='Review',   priority='Haute',   project=p1, assignee=am, pts=8,  due=datetime.date(2025,5,25), sprint=s1),
            dict(title='Bug : Carte absente sur mobile Safari',           type='bug',     status='A faire',  priority='Haute',   project=p1, assignee=hp, pts=2,  due=datetime.date(2025,5,10), sprint=s1),
            dict(title='Formation QGIS agents terrain ANLA (×12)',        type='task',    status='Backlog',  priority='Basse',   project=p1, assignee=hp, pts=3,  due=datetime.date(2025,6,15)),
            dict(title='Module Auth JWT + permissions RBAC',              type='feature', status='Terminé',  priority='Haute',   project=p2, assignee=am, pts=8,  due=datetime.date(2025,4,30), sprint=s2),
            dict(title='Interface mobile e-Voucher React Native',         type='story',   status='En cours', priority='Haute',   project=p2, assignee=ks, pts=13, due=datetime.date(2025,6,10), sprint=s2),
            dict(title='Bug : Import CSV erreur encodage UTF-8',          type='bug',     status='Review',   priority='Moyenne', project=p1, assignee=am, pts=2,  due=datetime.date(2025,5,12), sprint=s1),
            dict(title='Intégration WebSockets tickets hospitaliers',     type='feature', status='Backlog',  priority='Haute',   project=p4, assignee=am, pts=8,  due=datetime.date(2025,7,10)),
            dict(title='Schéma PostgreSQL files d\'attente',              type='task',    status='A faire',  priority='Moyenne', project=p4, assignee=hp, pts=3,  due=datetime.date(2025,6,20), sprint=s3),
            dict(title='Epic : KICEKO ProjectHub — application complète', type='epic',   status='En cours', priority='Haute',   project=p6, assignee=hp, pts=21, due=datetime.date(2025,12,1)),
            dict(title='Wireframes dashboard UNDP PRECOM',                type='story',   status='A faire',  priority='Moyenne', project=p5, assignee=ba, pts=5,  due=datetime.date(2025,6,20)),
            dict(title='Modèle PostGIS GisMission (PointField)',          type='task',    status='Terminé',  priority='Haute',   project=p1, assignee=lh, pts=3,  due=datetime.date(2025,4,15), sprint=s1),
            dict(title='Feature : Notifications temps réel WebSocket',    type='feature', status='Backlog',  priority='Moyenne', project=p6, assignee=am, pts=8,  due=datetime.date(2025,11,1)),
            dict(title='Recette & tests fonctionnels Queue Hospitalière',  type='story',  status='Backlog',  priority='Basse',   project=p4, assignee=ks, pts=5,  due=datetime.date(2025,9,1)),
        ]
        for wi in work_items:
            WorkItem.objects.create(**wi)
        self.stdout.write(f'  ✔ {len(work_items)} work items créés')

        # ── Appels d'offres ────────────────────────────────────
        tenders = [
            dict(title='Système e-Voucher LWF — Tchad',       org='LWF',            amount=45_000_000,  deadline=datetime.date(2025,5,25), status='Préparation',  lead=hp),
            dict(title='Infrastructure Numérique SDAN/PATN',  org='Banque Mondiale', amount=120_000_000, deadline=datetime.date(2025,7,15), status='Qualification', lead=hp),
            dict(title='Cartographie Scolaire — Carte Éduc.', org='UNICEF',          amount=28_500_000,  deadline=datetime.date(2025,12,1), status='Détection',    lead=ks),
            dict(title='SIG Surveillance Acridienne ANLA',    org='ANLA / FAO',      amount=18_000_000,  deadline=datetime.date(2025,8,1),  status='Gagné',        lead=hp),
            dict(title='ERP Bancaire Coris Bank International',org='CBI Tchad',      amount=52_000_000,  deadline=datetime.date(2025,12,1), status='Qualification', lead=am),
            dict(title='Projet STARS — Résilience CRS',       org='CRS',             amount=35_000_000,  deadline=datetime.date(2025,9,15), status='Détection',    lead=hp),
            dict(title='PNSN — Santé Numérique Tchad',        org='OMS',             amount=40_000_000,  deadline=datetime.date(2025,10,1), status='Soumis',       lead=hp),
        ]
        for t in tenders:
            Tender.objects.create(**t)
        self.stdout.write(f'  ✔ {len(tenders)} appels d\'offres créés')

        self.stdout.write(self.style.SUCCESS('\n✅ Données initiales KICEKO chargées avec succès !'))
        self.stdout.write(self.style.SUCCESS('   Admin : http://localhost:8000/admin/  (admin / kiceko2025!)'))
